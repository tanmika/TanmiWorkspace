// src/services/ContextService.ts

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
    const hint = this.generateHint(nodeMeta, chain);

    // 8. 返回结果
    return {
      workspace: {
        goal: workspaceData.goal,
        rules: workspaceData.rules,
        docs: activeDocs,
      },
      chain,
      references,
      childConclusions,
      hint,
    };
  }

  /**
   * 根据节点状态生成工作流提示
   */
  private generateHint(nodeMeta: { status: string }, chain: ContextChainItem[]): string {
    const currentNode = chain[chain.length - 1];
    const logCount = currentNode?.logEntries?.length ?? 0;
    const docsCount = currentNode?.docs?.length ?? 0;

    // 文档缺失提醒（仅在 pending/implementing 状态提示）
    const docsWarning = docsCount === 0 && (nodeMeta.status === "pending" || nodeMeta.status === "implementing")
      ? " ⚠️ 当前节点无文档引用，如需参考文档请用 node_reference 添加，或确认父节点是否遗漏派发。"
      : "";

    switch (nodeMeta.status) {
      case "pending":
        return "💡 节点待执行。请调用 node_transition(action=\"start\") 开始执行。" + docsWarning;
      case "implementing":
        if (logCount === 0) {
          return "💡 任务执行中，但尚未记录日志。请使用 log_append 记录分析过程和关键发现。" + docsWarning;
        } else if (logCount < 3) {
          return "💡 任务执行中。继续使用 log_append 记录进展，完成后调用 node_transition(action=\"complete\")。" + docsWarning;
        } else {
          return "💡 任务执行中，日志已较多。执行节点准备 complete 完成；规划节点考虑是否需要创建更多子节点。" + docsWarning;
        }
      case "validating":
        return "💡 任务验证中。验证通过请 complete，验证失败请 fail。";
      case "completed":
        return "💡 任务已完成。如需修改请 reopen，或切换到其他任务。";
      case "failed":
        return "💡 任务已失败。分析原因后可 retry 重试。如因信息不足失败，请回到父节点补充文档后重新派发。";
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
