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
  TypedLogEntry,
  MemoReferenceItem,
  DocRef,
  ActiveNodeInfo,
} from "../types/context.js";
import { TanmiError } from "../types/errors.js";
import { now } from "../utils/time.js";
import { computeConclusionsHash } from "../utils/hash.js";
import { devLog } from "../utils/devLog.js";
import { GuidanceService } from "./GuidanceService.js";
import type { GuidanceContext } from "../types/guidance.js";
import type { InstallationService } from "./InstallationService.js";
import { eventService } from "./EventService.js";

// ========== 结论截取常量 ==========
const CONCLUSION_TRUNCATE_THRESHOLD = 600;  // 超过此长度才截取
const CONCLUSION_HEAD_LENGTH = 400;         // 保留头部字符数
const CONCLUSION_TAIL_LENGTH = 200;         // 保留尾部字符数

/**
 * 软截取结论：前 400 + 尾 200，中间用省略标记
 * 用于 childConclusions，避免超长老结论占用过多 token
 */
function truncateConclusion(conclusion: string): string {
  if (conclusion.length <= CONCLUSION_TRUNCATE_THRESHOLD) {
    return conclusion;
  }

  const head = conclusion.slice(0, CONCLUSION_HEAD_LENGTH);
  const tail = conclusion.slice(-CONCLUSION_TAIL_LENGTH);
  const omitted = conclusion.length - CONCLUSION_HEAD_LENGTH - CONCLUSION_TAIL_LENGTH;

  return `${head}\n\n...[已截取 ${omitted} 字符，完整内容请用 node_get 查看]...\n\n${tail}`;
}

// ========== 活跃状态定义 ==========
/**
 * 规划节点的活跃状态（非静止态）
 */
const PLANNING_ACTIVE_STATUSES = new Set(["planning", "monitoring"]);

/**
 * 执行节点的活跃状态（非静止态）
 */
const EXECUTION_ACTIVE_STATUSES = new Set(["implementing", "validating"]);


/**
 * 上下文服务
 * 处理上下文获取和焦点管理
 */
export class ContextService {
  private guidanceService: GuidanceService;
  private workspaceService?: any; // WorkspaceService - 避免循环依赖，通过 setter 注入
  private memoService?: any; // MemoService - 通过 setter 注入
  private installationService?: InstallationService;

  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {
    this.guidanceService = new GuidanceService();
  }

  /**
   * 设置 WorkspaceService 依赖（用于清除手动变更）
   */
  setWorkspaceService(workspaceService: any): void {
    this.workspaceService = workspaceService;
  }

  /**
   * 设置 MemoService 依赖（用于获取 memo 内容）
   */
  setMemoService(memoService: any): void {
    this.memoService = memoService;
  }

  /**
   * 设置 InstallationService 依赖（用于项目组件版本检查）
   */
  setInstallationService(service: InstallationService): void {
    this.installationService = service;
  }

  /**
   * 根据 workspaceId 获取工作区信息（包括归档状态和目录名）
   */
  private async resolveWorkspaceInfo(workspaceId: string): Promise<{ projectRoot: string; wsDirName: string; isArchived: boolean }> {
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    if (wsEntry.status === "error" && wsEntry.errorInfo) {
      throw new TanmiError("WORKSPACE_ERROR", `工作区 "${workspaceId}" 处于错误状态: ${wsEntry.errorInfo.message}`);
    }
    const isArchived = wsEntry.status === "archived";
    const wsDirName = wsEntry.dirName || wsEntry.id;  // 向后兼容
    if (isArchived) {
      devLog.archivePath(workspaceId, isArchived, this.fs.getWorkspaceBasePath(wsEntry.projectRoot, wsDirName, true));
    }
    return {
      projectRoot: wsEntry.projectRoot,
      wsDirName,
      isArchived,
    };
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

    // 1. 获取工作区信息（包括归档状态）
    const { projectRoot, wsDirName, isArchived } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName, isArchived);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    // 3. 读取工作区 Workspace.md，提取 rules/docs
    const workspaceData = await this.md.readWorkspaceMdFull(projectRoot, wsDirName, isArchived);

    // 3.1 从根节点读取 goal（requirement 字段）- goal 已统一到根节点
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName, isArchived);
    const rootNodeId = config.rootNodeId || "root";
    const rootNodeMeta = graph.nodes[rootNodeId];
    const rootNodeDirName = rootNodeMeta?.dirName || rootNodeId;
    const rootNodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, rootNodeDirName, isArchived);
    const goal = rootNodeInfo.requirement || "";

    // 4. 构建上下文链（从根到当前节点）
    const chain = await this.buildContextChain(projectRoot, wsDirName, nodeId, graph, {
      includeLog,
      maxLogEntries,
      includeProblem,
      reverseLog,
    }, isArchived, workspaceId);

    // 5. 收集跨节点引用和 memo 引用
    const nodeMeta = graph.nodes[nodeId];
    const references: ContextChainItem[] = [];
    const memoReferences: MemoReferenceItem[] = [];

    for (const ref of nodeMeta.references || []) {
      // 检查是否为 memo 引用
      if (ref.startsWith("memo://")) {
        const memoId = ref.substring(7); // 去掉 "memo://" 前缀
        try {
          if (this.memoService) {
            const memoResult = await this.memoService.get({
              workspaceId,
              memoId,
            });
            memoReferences.push({
              memoId: memoResult.memo.id,
              title: memoResult.memo.title,
              summary: memoResult.memo.summary,
              content: memoResult.memo.content,
              tags: memoResult.memo.tags,
            });
          }
        } catch (error) {
          // Memo 不存在或读取失败，跳过
          devLog.warn("获取 memo 失败", { memoId, error });
        }
      } else if (graph.nodes[ref]) {
        // 节点引用
        const refItem = await this.buildSingleContextItem(projectRoot, wsDirName, ref, graph, {
          includeLog,
          maxLogEntries,
          includeProblem,
          reverseLog,
        }, isArchived, workspaceId);
        references.push(refItem);
      }
    }

    // 6. 收集所有直接子节点信息
    // 内容数据以 Info.md 为权威来源
    // 对超长结论进行软截取（前 400 + 尾 200）
    const childConclusions: ChildConclusionItem[] = [];
    for (const childId of nodeMeta.children) {
      const childMeta = graph.nodes[childId];
      if (childMeta) {
        const childDirName = childMeta.dirName || childId;  // 向后兼容
        const childInfo = await this.md.readNodeInfo(projectRoot, wsDirName, childDirName, isArchived);
        childConclusions.push({
          nodeId: childId,
          title: childInfo.title,
          status: childMeta.status,
          conclusion: truncateConclusion(childInfo.conclusion || ""),
        });
      }
    }

    // 7. 生成工作流提示
    const hint = this.generateHint(nodeMeta, chain, childConclusions);

    // 8. 计算规则哈希
    const rulesHash = workspaceData.rules.length > 0
      ? crypto.createHash("md5").update(workspaceData.rules.join("\n")).digest("hex").substring(0, 8)
      : "";

    // 8.1 生成引导内容
    const guidanceContext: GuidanceContext = {
      toolName: "context_get",
      nodeType: nodeMeta.type,
      nodeStatus: nodeMeta.status,
      hasChildren: nodeMeta.children.length > 0,
      hasDocs: workspaceData.docs.length > 0,
    };
    const guidance = this.guidanceService.generateFromContext(guidanceContext, 0);

    // 9. 读取派发配置（如果存在）- config 已在前面读取
    const dispatch = config.dispatch?.enabled ? config.dispatch : undefined;

    // 10. 清除手动变更清单（AI 已获取上下文，无需再提醒历史变更）
    // 注意：只在非归档状态下清除，归档工作区为只读
    if (!isArchived && this.workspaceService) {
      try {
        await this.workspaceService.clearManualChanges(workspaceId);
      } catch (error) {
        // 清除失败不影响主流程
        devLog.warn("清除手动变更失败", { workspaceId, error });
      }
    }

    // 11. 计算 conclusionsHash（使用 graph.json 中的原始结论，与 node_transition 保持一致）
    // 注意：childConclusions 中的 conclusion 可能被截断，不能用于 hash 计算
    const conclusionsForHash = nodeMeta.children
      .map(childId => {
        const childMeta = graph.nodes[childId];
        return childMeta ? { nodeId: childId, conclusion: childMeta.conclusion || "" } : null;
      })
      .filter((c): c is { nodeId: string; conclusion: string } => c !== null && !!c.conclusion);
    const conclusionsHash = computeConclusionsHash(conclusionsForHash);

    // 12. 返回结果
    return {
      workspace: {
        goal,  // 从根节点 requirement 读取
        rules: workspaceData.rules,
        rulesHash,
        docs: workspaceData.docs,
        dispatch,
      },
      chain,
      references,
      memoReferences,
      childConclusions,
      conclusionsHash,
      hint,
      guidance: guidance.content,
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
          const completedCount = childConclusions.filter(c => c.status === "completed" || c.status === "failed").length;
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

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    // 3. 保存之前的焦点
    const previousFocus = graph.currentFocus;

    // 3.1 检查 conclusionStale 阻断
    if (previousFocus && previousFocus !== nodeId) {
      // 获取当前焦点的祖先链中所有 stale 节点
      const staleAncestors: string[] = [];
      let currentId: string | null = previousFocus;
      while (currentId) {
        const currentMeta: NodeMeta | undefined = graph.nodes[currentId];
        if (!currentMeta) break;
        if (currentMeta.conclusionStale) {
          staleAncestors.push(currentId);
        }
        currentId = currentMeta.parentId;
      }

      // 如果有 stale 祖先，检查目标节点是否在其子树内
      if (staleAncestors.length > 0) {
        // 获取目标节点的祖先链（包含自身）
        const targetAncestors = new Set<string>();
        let targetId: string | null = nodeId;
        while (targetId) {
          targetAncestors.add(targetId);
          const targetMeta: NodeMeta | undefined = graph.nodes[targetId];
          if (!targetMeta) break;
          targetId = targetMeta.parentId;
        }

        // 检查是否切换到了 stale 节点子树外
        // 如果目标节点的祖先链包含 stale 节点，则在子树内（允许）
        // 否则在子树外（阻断）
        for (const staleId of staleAncestors) {
          if (!targetAncestors.has(staleId)) {
            // 目标不在此 stale 节点的子树内，阻断
            return {
              success: false,
              previousFocus,
              currentFocus: previousFocus, // 焦点不变
              error: "CONCLUSION_STALE",
              staleNodeId: staleId,
              hint: "请先 context_get 获取上下文，再用精确替换模式更新结论",
            };
          }
        }
      }

      // 3.2 检查活跃节点拦截（切出子树时）
      // 判断是否是"切出子树"操作：
      // - 如果目标在 previousFocus 的祖先链中 → 向上走，不拦截
      // - 如果目标在 previousFocus 的子树中 → 向下走，不拦截
      // - 否则是切到另一个分支 → 检查被离开的子树中是否有活跃节点
      const prevAncestors = this.getAncestorSet(previousFocus, graph);
      const targetIsAncestor = prevAncestors.has(nodeId);
      const targetIsDescendant = this.isInSubtreeOf(nodeId, previousFocus, graph);

      if (!targetIsAncestor && !targetIsDescendant) {
        // 切到另一个分支，需要检查活跃节点
        const lca = this.findLCA(previousFocus, nodeId, graph);

        // 收集从 previousFocus 到 LCA（不含）这条路径上的活跃节点
        const activeNodes = await this.collectActiveNodesOnPathUp(
          previousFocus,
          lca,
          graph,
          projectRoot,
          wsDirName,
          nodeId
        );

        if (activeNodes.length > 0) {
          // 去重（同一个节点可能被多次添加）
          const uniqueActiveNodes = Array.from(
            new Map(activeNodes.map(n => [n.nodeId, n])).values()
          );

          return {
            success: false,
            previousFocus,
            currentFocus: previousFocus, // 焦点不变
            error: "ACTIVE_NODES_IN_SUBTREE",
            activeNodes: uniqueActiveNodes,
            hint: `当前分支有 ${uniqueActiveNodes.length} 个活跃节点，请先处理后再切换：${uniqueActiveNodes.map(n => `${n.nodeId}(${n.status})`).join(", ")}`,
          };
        }
      }
    }

    // 4. 更新 currentFocus
    graph.currentFocus = nodeId;

    // 5. 写入 graph.json
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 6. 更新工作区配置的 updatedAt
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);
    const currentTime = now();
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, wsDirName, config);

    // 7. 同步更新索引中的 updatedAt
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (wsEntry) {
      wsEntry.updatedAt = currentTime;
      await this.json.writeIndex(index);
    }

    // 8. 发送事件通知
    eventService.emitContextUpdate(workspaceId, nodeId);

    // 9. 返回结果
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
    wsDirName: string,
    nodeId: string,
    graph: NodeGraph,
    options: {
      includeLog: boolean;
      maxLogEntries: number;
      includeProblem: boolean;
      reverseLog: boolean;
    },
    isArchived: boolean = false,
    workspaceId?: string
  ): Promise<ContextChainItem[]> {
    const chain: ContextChainItem[] = [];
    let currentId: string | null = nodeId;

    while (currentId) {
      const nodeMeta: NodeMeta | undefined = graph.nodes[currentId];
      if (!nodeMeta) break;

      const item = await this.buildSingleContextItem(projectRoot, wsDirName, currentId, graph, options, isArchived, workspaceId);
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
    wsDirName: string,
    nodeId: string,
    graph: NodeGraph,
    options: {
      includeLog: boolean;
      maxLogEntries: number;
      includeProblem: boolean;
      reverseLog: boolean;
    },
    isArchived: boolean = false,
    workspaceId?: string
  ): Promise<ContextChainItem> {
    const nodeMeta = graph.nodes[nodeId];
    const nodeDirName = nodeMeta.dirName || nodeId;  // 向后兼容
    const info = await this.md.readNodeInfoFull(projectRoot, wsDirName, nodeDirName, isArchived);

    const item: ContextChainItem = {
      nodeId,
      title: info.title,
      requirement: info.requirement,
      docs: info.docs,
      note: info.notes,
      // 内容数据以 Info.md 为权威来源
      conclusion: info.conclusion || undefined,
      // 验收标准从 graph.json 获取
      acceptanceCriteria: nodeMeta.acceptanceCriteria,
    };

    // 包含日志
    if (options.includeLog) {
      const logContent = await this.md.readLogRaw(projectRoot, wsDirName, nodeDirName, isArchived);
      let logs = this.md.parseLogTable(logContent);
      logs = this.tailLogs(logs, options.maxLogEntries);
      if (options.reverseLog) {
        logs = logs.reverse();
      }
      item.logEntries = logs;
    }

    // 包含问题
    if (options.includeProblem) {
      const problem = await this.md.readProblem(projectRoot, wsDirName, nodeDirName, isArchived);
      if (problem.currentProblem && problem.currentProblem !== "（暂无）") {
        item.problem = problem.currentProblem;
      }
    }

    // 增强 docs 中的 memo:// 引用
    if (workspaceId) {
      item.docs = await this.enrichDocsWithMemoMeta(item.docs, workspaceId);
    }

    return item;
  }

  /**
   * 增强文档引用中的 memo:// 引用，填充 memoMeta 字段
   * 如果 memo 已被删除，标记 status 为 expired
   */
  private async enrichDocsWithMemoMeta(docs: DocRef[], workspaceId: string): Promise<DocRef[]> {
    if (!this.memoService) {
      return docs;
    }

    const enrichedDocs: DocRef[] = [];

    for (const doc of docs) {
      if (doc.path.startsWith("memo://")) {
        const memoId = doc.path.substring(7); // 去掉 "memo://" 前缀
        try {
          const memoResult = await this.memoService.get({
            workspaceId,
            memoId,
          });
          // 填充 memoMeta
          enrichedDocs.push({
            ...doc,
            memoMeta: {
              id: memoResult.memo.id,
              title: memoResult.memo.title,
              summary: memoResult.memo.summary,
              tags: memoResult.memo.tags,
            },
          });
        } catch (error) {
          // Memo 不存在（已删除），标记为 expired
          devLog.warn("Memo 引用已过期", { memoId, error });
          enrichedDocs.push({
            ...doc,
            status: "expired",
          });
        }
      } else {
        // 非 memo 引用，保持原样
        enrichedDocs.push(doc);
      }
    }

    return enrichedDocs;
  }

  /**
   * 日志截断（Tail-First）
   */
  private tailLogs(logs: TypedLogEntry[], max: number): TypedLogEntry[] {
    if (max <= 0) return [];
    if (logs.length <= max) return logs;
    return logs.slice(-max);
  }

  // ========== 子树切换拦截辅助方法 ==========

  /**
   * 获取节点的祖先集合（包含自身）
   */
  private getAncestorSet(nodeId: string, graph: NodeGraph): Set<string> {
    const ancestors = new Set<string>();
    let currentId: string | null = nodeId;
    while (currentId) {
      ancestors.add(currentId);
      const meta: NodeMeta | undefined = graph.nodes[currentId];
      if (!meta) break;
      currentId = meta.parentId;
    }
    return ancestors;
  }

  /**
   * 检查节点是否在目标节点的子树中（通过祖先链判断）
   */
  private isInSubtreeOf(nodeId: string, subtreeRootId: string, graph: NodeGraph): boolean {
    const ancestors = this.getAncestorSet(nodeId, graph);
    return ancestors.has(subtreeRootId);
  }

  /**
   * 找到两个节点的最近公共祖先 (LCA)
   */
  private findLCA(nodeA: string, nodeB: string, graph: NodeGraph): string | null {
    const ancestorsA = this.getAncestorSet(nodeA, graph);
    let currentId: string | null = nodeB;
    while (currentId) {
      if (ancestorsA.has(currentId)) {
        return currentId;
      }
      const meta: NodeMeta | undefined = graph.nodes[currentId];
      if (!meta) break;
      currentId = meta.parentId;
    }
    return null;
  }

  /**
   * 收集子树中的所有活跃节点（DFS 遍历）
   * @param subtreeRootId 子树根节点
   * @param graph 节点图
   * @param excludeBranch 排除某个分支（可选，用于排除目标节点所在分支）
   */
  private async collectActiveNodesInSubtree(
    subtreeRootId: string,
    graph: NodeGraph,
    projectRoot: string,
    wsDirName: string,
    excludeBranch?: string
  ): Promise<ActiveNodeInfo[]> {
    const activeNodes: ActiveNodeInfo[] = [];

    const dfs = async (nodeId: string) => {
      // 如果是要排除的分支，跳过
      if (nodeId === excludeBranch) return;

      const meta: NodeMeta | undefined = graph.nodes[nodeId];
      if (!meta) return;

      // 检查是否是活跃状态
      const isActive = meta.type === "planning"
        ? PLANNING_ACTIVE_STATUSES.has(meta.status)
        : EXECUTION_ACTIVE_STATUSES.has(meta.status);

      if (isActive) {
        // 读取节点标题
        const nodeDirName = meta.dirName || nodeId;
        const info = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName);
        activeNodes.push({
          nodeId,
          title: info.title,
          status: meta.status as any,
          type: meta.type,
        });
      }

      // 递归检查子节点
      for (const childId of meta.children) {
        if (childId !== excludeBranch) {
          await dfs(childId);
        }
      }
    };

    await dfs(subtreeRootId);
    return activeNodes;
  }

  /**
   * 从节点向上到祖先的路径上收集活跃节点
   * @param fromNodeId 起始节点
   * @param toAncestorId 终止祖先（不含）
   * @param graph 节点图
   * @param excludeDescendantOf 排除某个节点的后代分支（目标节点所在分支）
   */
  private async collectActiveNodesOnPathUp(
    fromNodeId: string,
    toAncestorId: string | null,
    graph: NodeGraph,
    projectRoot: string,
    wsDirName: string,
    excludeDescendantOf?: string
  ): Promise<ActiveNodeInfo[]> {
    const allActiveNodes: ActiveNodeInfo[] = [];
    let currentId: string | null = fromNodeId;

    // 找到目标节点到 LCA 的分支（需要排除）
    let excludeBranchAtLCA: string | null = null;
    if (excludeDescendantOf && toAncestorId) {
      let tid: string | null = excludeDescendantOf;
      while (tid) {
        const tidMeta: NodeMeta | undefined = graph.nodes[tid];
        if (!tidMeta) break;
        if (tidMeta.parentId === toAncestorId) {
          excludeBranchAtLCA = tid;
          break;
        }
        tid = tidMeta.parentId;
      }
    }

    while (currentId && currentId !== toAncestorId) {
      const meta: NodeMeta | undefined = graph.nodes[currentId];
      if (!meta) break;

      // 收集当前节点子树中的活跃节点
      // 如果当前节点就是 LCA 的直接子节点，排除目标所在分支
      const excludeBranch = (meta.parentId === toAncestorId) ? excludeBranchAtLCA : undefined;
      const activeInSubtree = await this.collectActiveNodesInSubtree(
        currentId,
        graph,
        projectRoot,
        wsDirName,
        excludeBranch || undefined
      );
      allActiveNodes.push(...activeInSubtree);

      currentId = meta.parentId;
    }

    return allActiveNodes;
  }
}
