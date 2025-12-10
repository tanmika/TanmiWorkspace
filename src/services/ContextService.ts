// src/services/ContextService.ts

import * as crypto from "node:crypto";
import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type { NodeGraph, NodeMeta } from "../types/node.js";
import type {
  ContextGetParams,
  ContextGetResult,
  ContextFocusParams,
  ContextFocusResult,
  ContextChainItem,
  ChildConclusionItem,
  DocRefWithStatus,
  TypedLogEntry,
} from "../types/context.js";
import { TanmiError } from "../types/errors.js";
import { now } from "../utils/time.js";

/**
 * 上下文服务
 * 处理上下文获取和焦点管理
 */
export class ContextService {
  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 根据 workspaceId 获取 projectRoot
   */
  private async resolveProjectRoot(workspaceId: string): Promise<string> {
    const projectRoot = await this.json.getProjectRoot(workspaceId);
    if (!projectRoot) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    return projectRoot;
  }

  /**
   * 获取聚焦上下文
   */
  async get(params: ContextGetParams): Promise<ContextGetResult> {
    const {
      workspaceId,
      nodeId,
      includeLog = true,
      maxLogEntries = 20,
      reverseLog = false,
      includeProblem = true,
    } = params;

    // 1. 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    // 3. 读取工作区 Workspace.md，提取 goal/rules/docs（仅 active）
    const workspaceData = await this.md.readWorkspaceMdWithStatus(projectRoot, workspaceId);
    const activeDocs = this.filterActiveRefs(workspaceData.docsWithStatus);

    // 4. 构建上下文链（从根到当前节点）
    const chain = await this.buildContextChain(projectRoot, workspaceId, nodeId, graph, {
      includeLog,
      maxLogEntries,
      includeProblem,
      reverseLog,
    });

    // 5. 收集跨节点引用
    const nodeMeta = graph.nodes[nodeId];
    const references: ContextChainItem[] = [];
    for (const refNodeId of nodeMeta.references) {
      if (graph.nodes[refNodeId]) {
        const refItem = await this.buildSingleContextItem(projectRoot, workspaceId, refNodeId, graph, {
          includeLog,
          maxLogEntries,
          includeProblem,
          reverseLog,
        });
        references.push(refItem);
      }
    }

    // 6. 收集子节点结论（completed/failed 状态的直接子节点）
    // 内容数据以 Info.md 为权威来源
    const childConclusions: ChildConclusionItem[] = [];
    for (const childId of nodeMeta.children) {
      const childMeta = graph.nodes[childId];
      if (childMeta && (childMeta.status === "completed" || childMeta.status === "failed")) {
        const childInfo = await this.md.readNodeInfo(projectRoot, workspaceId, childId);
        if (childInfo.conclusion) {
          childConclusions.push({
            nodeId: childId,
            title: childInfo.title,
            status: childMeta.status,
            conclusion: childInfo.conclusion,
          });
        }
      }
    }

    // 7. 生成工作流提示
    const hint = this.generateHint(nodeMeta, chain, childConclusions);

    // 8. 计算规则哈希
    const rulesHash = workspaceData.rules.length > 0
      ? crypto.createHash("md5").update(workspaceData.rules.join("\n")).digest("hex").substring(0, 8)
      : "";

    // 9. 返回结果
    return {
      workspace: {
        goal: workspaceData.goal,
        rules: workspaceData.rules,
        rulesHash,
        docs: activeDocs,
      },
      chain,
      references,
      childConclusions,
      hint,
    };
  }

  /**
   * 根据节点类型和状态生成工作流提示
   */
  private generateHint(
    nodeMeta: { status: string; type?: string; children: string[] },
    chain: ContextChainItem[],
    childConclusions: ChildConclusionItem[]
  ): string {
    const currentNode = chain[chain.length - 1];
    const logCount = currentNode?.logEntries?.length ?? 0;
    const docsCount = currentNode?.docs?.length ?? 0;
    const nodeType = nodeMeta.type;
    const childCount = nodeMeta.children.length;

    // 文档缺失提醒（仅在 pending/implementing/planning 状态提示）
    const needsDocsWarning = ["pending", "implementing", "planning"].includes(nodeMeta.status);
    const docsWarning = docsCount === 0 && needsDocsWarning
      ? " ⚠️ 当前节点无文档引用，如需参考文档请用 node_reference 添加，或确认父节点是否遗漏派发。"
      : "";

    // 规划节点特殊处理
    if (nodeType === "planning") {
      switch (nodeMeta.status) {
        case "pending":
          return "💡 规划节点待启动。请调用 node_transition(action=\"start\") 进入规划状态。" + docsWarning;
        case "planning":
          if (childCount === 0) {
            return "💡 规划节点已激活，尚无子节点。分析完需求后，使用 node_create 创建执行节点(type=\"execution\")或子规划节点(type=\"planning\")来分解任务。" + docsWarning;
          } else {
            return "💡 规划节点有子节点但仍在规划状态。如需继续添加子节点可继续创建，否则等待子节点 start 后进入 monitoring。" + docsWarning;
          }
        case "monitoring":
          const completedCount = childConclusions.length;
          const pendingChildren = childCount - completedCount;
          if (pendingChildren > 0) {
            return `💡 规划节点正在监控子节点。已完成 ${completedCount}/${childCount}，还有 ${pendingChildren} 个子节点待完成。`;
          } else {
            return "💡 所有子节点已完成。请调用 node_transition(action=\"complete\", conclusion=\"...\") 汇总结论。";
          }
        case "completed":
          return "💡 规划节点已完成。如需修改请 reopen，或切换到其他任务。";
        case "cancelled":
          return "💡 规划节点已取消。如需重新规划请 reopen。";
        default:
          return "";
      }
    }

    // 执行节点处理
    if (nodeType === "execution") {
      switch (nodeMeta.status) {
        case "pending":
          return "💡 执行节点待启动。请调用 node_transition(action=\"start\") 开始执行。" + docsWarning;
        case "implementing":
          if (logCount === 0) {
            return "💡 执行任务进行中，但尚未记录日志。请使用 log_append 记录执行过程。如果发现任务过于复杂，请 fail 回退到父规划节点分解。" + docsWarning;
          } else {
            return "💡 执行任务进行中。继续执行并记录日志，完成后调用 node_transition(action=\"complete\", conclusion=\"...\")。" + docsWarning;
          }
        case "validating":
          return "💡 执行任务验证中。验证通过请 complete，验证失败请 fail。";
        case "completed":
          return "💡 执行任务已完成。如需修改请 reopen，或切换到其他任务。";
        case "failed":
          return "💡 执行任务已失败。分析失败原因：如果任务过于复杂，回到父规划节点重新分解；如果是可修复的问题，retry 后重试。";
        default:
          return "";
      }
    }

    // 兼容旧节点（无 type）
    switch (nodeMeta.status) {
      case "pending":
        return "💡 节点待执行。请调用 node_transition(action=\"start\") 开始执行。" + docsWarning;
      case "implementing":
        return "💡 任务执行中。使用 log_append 记录进展，完成后调用 node_transition(action=\"complete\")。" + docsWarning;
      case "validating":
        return "💡 任务验证中。验证通过请 complete，验证失败请 fail。";
      case "completed":
        return "💡 任务已完成。如需修改请 reopen，或切换到其他任务。";
      case "failed":
        return "💡 任务已失败。分析原因后可 retry 重试。";
      default:
        return "";
    }
  }

  /**
   * 设置当前焦点
   */
  async focus(params: ContextFocusParams): Promise<ContextFocusResult> {
    const { workspaceId, nodeId } = params;

    // 1. 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    // 3. 保存之前的焦点
    const previousFocus = graph.currentFocus;

    // 4. 更新 currentFocus
    graph.currentFocus = nodeId;

    // 5. 写入 graph.json
    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 6. 更新工作区配置的 updatedAt
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    config.updatedAt = now();
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 7. 返回结果
    return {
      success: true,
      previousFocus,
      currentFocus: nodeId,
    };
  }

  /**
   * 构建上下文链
   */
  private async buildContextChain(
    projectRoot: string,
    workspaceId: string,
    nodeId: string,
    graph: NodeGraph,
    options: {
      includeLog: boolean;
      maxLogEntries: number;
      includeProblem: boolean;
      reverseLog: boolean;
    }
  ): Promise<ContextChainItem[]> {
    const chain: ContextChainItem[] = [];
    let currentId: string | null = nodeId;

    while (currentId) {
      const nodeMeta: NodeMeta | undefined = graph.nodes[currentId];
      if (!nodeMeta) break;

      const item = await this.buildSingleContextItem(projectRoot, workspaceId, currentId, graph, options);
      chain.unshift(item); // 从根开始

      // 检查隔离标记
      if (nodeMeta.isolate) break;

      currentId = nodeMeta.parentId;
    }

    return chain;
  }

  /**
   * 构建单个上下文项
   */
  private async buildSingleContextItem(
    projectRoot: string,
    workspaceId: string,
    nodeId: string,
    graph: NodeGraph,
    options: {
      includeLog: boolean;
      maxLogEntries: number;
      includeProblem: boolean;
      reverseLog: boolean;
    }
  ): Promise<ContextChainItem> {
    const nodeMeta = graph.nodes[nodeId];
    const info = await this.md.readNodeInfoWithStatus(projectRoot, workspaceId, nodeId);
    const docs = this.filterActiveRefs(info.docsWithStatus);

    const item: ContextChainItem = {
      nodeId,
      title: info.title,
      requirement: info.requirement,
      docs,
      note: info.notes,
      // 内容数据以 Info.md 为权威来源
      conclusion: info.conclusion || undefined,
    };

    // 包含日志
    if (options.includeLog) {
      const logContent = await this.md.readLogRaw(projectRoot, workspaceId, nodeId);
      let logs = this.md.parseLogTable(logContent);
      logs = this.tailLogs(logs, options.maxLogEntries);
      if (options.reverseLog) {
        logs = logs.reverse();
      }
      item.logEntries = logs;
    }

    // 包含问题
    if (options.includeProblem) {
      const problem = await this.md.readProblem(projectRoot, workspaceId, nodeId);
      if (problem.currentProblem && problem.currentProblem !== "（暂无）") {
        item.problem = problem.currentProblem;
      }
    }

    return item;
  }

  /**
   * 过滤活跃引用
   */
  private filterActiveRefs(docs: DocRefWithStatus[]): DocRefWithStatus[] {
    return docs.filter(d => d.status === "active");
  }

  /**
   * 日志截断（Tail-First）
   */
  private tailLogs(logs: TypedLogEntry[], max: number): TypedLogEntry[] {
    if (max <= 0) return [];
    if (logs.length <= max) return logs;
    return logs.slice(-max);
  }
}
