// src/services/StateService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  NodeStatus,
  TransitionAction,
  NodeTransitionParams,
  NodeTransitionResult,
  NodeType,
  ExecutionStatus,
  PlanningStatus,
  ExecutionAction,
  PlanningAction,
  NodeMeta,
  NodeRole,
} from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { now, formatShort } from "../utils/time.js";
import { computeConclusionsHash, computeNodeHash } from "../utils/hash.js";
import { validateMultilineContent } from "../utils/contentValidation.js";
import type { DocRef } from "../types/workspace.js";
import { randomBytes } from "crypto";
import { GuidanceService } from "./GuidanceService.js";
import type { GuidanceContext } from "../types/guidance.js";
import { isGitRepo, getCurrentCommit } from "../utils/git.js";
import { eventService } from "./EventService.js";

/**
 * 结论最大长度（字符数）
 * 超过此长度时拒绝写入，要求 AI 创建 memo 记录详情后提交精简结论
 */
const CONCLUSION_MAX_LENGTH = 600;

/**
 * 待确认 Token 信息
 */
export interface PendingConfirmation {
  token: string;
  workspaceId: string;
  nodeId: string;
  actionType: string;
  createdAt: number;
  expiresAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * 执行节点状态转换规则表
 */
const EXECUTION_TRANSITION_TABLE: Record<ExecutionStatus, Partial<Record<ExecutionAction, ExecutionStatus>>> = {
  pending: { start: "implementing" },
  implementing: { submit: "validating", complete: "completed", fail: "failed" },
  validating: { complete: "completed", fail: "failed" },
  failed: { retry: "implementing" },
  completed: { reopen: "implementing" },
};

/**
 * 规划节点状态转换规则表
 */
const PLANNING_TRANSITION_TABLE: Record<PlanningStatus, Partial<Record<PlanningAction, PlanningStatus>>> = {
  pending: { start: "planning" },
  planning: { complete: "completed", cancel: "cancelled" },
  monitoring: { complete: "completed", cancel: "cancelled" },
  completed: { reopen: "planning" },
  cancelled: { reopen: "planning" },
};

/**
 * 需要 conclusion 的动作
 */
const CONCLUSION_REQUIRED_ACTIONS: TransitionAction[] = ["complete", "fail", "cancel"];

/**
 * 状态服务
 * 处理节点状态转换
 */
export class StateService {
  /**
   * Token 存储（内存中）
   * key: token, value: PendingConfirmation
   */
  private pendingConfirmations: Map<string, PendingConfirmation> = new Map();

  /**
   * Token 有效期（毫秒）
   */
  private readonly TOKEN_VALIDITY_MS = 30 * 60 * 1000; // 30 分钟

  /**
   * 引导服务
   */
  private guidanceService: GuidanceService;

  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {
    this.guidanceService = new GuidanceService();
  }

  /**
   * 根据 workspaceId 获取 projectRoot 和 wsDirName
   */
  private async resolveProjectRoot(workspaceId: string): Promise<{ projectRoot: string; wsDirName: string }> {
    const index = await this.json.readIndex();
    const entry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!entry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    if (entry.status === "error" && entry.errorInfo) {
      throw new TanmiError("WORKSPACE_ERROR", `工作区 "${workspaceId}" 处于错误状态: ${entry.errorInfo.message}`);
    }
    return {
      projectRoot: entry.projectRoot,
      wsDirName: entry.dirName || entry.id  // 向后兼容
    };
  }

  /**
   * 执行状态转换
   */
  async transition(params: NodeTransitionParams): Promise<NodeTransitionResult> {
    const { workspaceId, nodeId, action, nodeHash, reason, conclusion, confirmation, conclusionsHash } = params;

    // 1. 如果提供了 confirmation，验证 token
    if (confirmation) {
      const validatedConfirmation = this.validateConfirmation(confirmation.token);
      if (!validatedConfirmation) {
        throw new TanmiError(
          "INVALID_CONFIRMATION_TOKEN",
          "提供的 confirmation token 无效或已过期。请使用最新的 token 重新提交。"
        );
      }

      // 验证 token 对应的工作区和节点是否匹配
      if (validatedConfirmation.workspaceId !== workspaceId || validatedConfirmation.nodeId !== nodeId) {
        throw new TanmiError(
          "CONFIRMATION_MISMATCH",
          `confirmation token 对应的节点不匹配。Token 属于 ${validatedConfirmation.workspaceId}/${validatedConfirmation.nodeId}，但请求的是 ${workspaceId}/${nodeId}`
        );
      }

      // Token 验证通过，记录用户输入到日志
      const { projectRoot: pRoot, wsDirName: wDir } = await this.resolveProjectRoot(workspaceId);
      const timestamp = formatShort(now());
      await this.md.appendTypedLogEntry(pRoot, wDir, {
        timestamp,
        operator: "Human",
        event: `用户确认: ${confirmation.userInput}`,
      }, nodeId);  // 这里 nodeId 需要后续改为 nodeDirName
    }

    // 2. 获取 projectRoot 和 wsDirName
    const { projectRoot, wsDirName } = await this.resolveProjectRoot(workspaceId);

    // 3. 验证节点存在并获取当前状态
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    const nodeMeta = graph.nodes[nodeId];
    const nodeType = nodeMeta.type;
    const currentStatus = nodeMeta.status;
    const nodeDirName = nodeMeta.dirName || nodeId;  // 向后兼容

    // 3.1 验证 nodeHash（先读后写校验，MCP 调用时必填，内部调用可跳过）
    if (nodeHash) {
      const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName);
      const currentNodeHash = computeNodeHash({
        title: nodeInfo.title,
        requirement: nodeInfo.requirement,
        note: nodeInfo.notes,
        conclusion: nodeInfo.conclusion,
      });
      if (currentNodeHash !== nodeHash) {
        throw new TanmiError("CONTENT_CHANGED", "nodeHash 不匹配，节点内容已变更。请重新调用 node_get 获取最新内容。");
      }
    }

    // 4. 根据节点类型验证转换合法性
    const newStatus = this.validateTransition(nodeType, currentStatus, action);
    if (!newStatus) {
      const suggestion = this.getTransitionSuggestion(nodeType, currentStatus, action);
      throw new TanmiError(
        "INVALID_TRANSITION",
        `非法状态转换: ${currentStatus} --[${action}]--> ? (不允许)。${suggestion}`
      );
    }

    // 5. 验证 conclusion 要求
    if (CONCLUSION_REQUIRED_ACTIONS.includes(action) && !conclusion) {
      throw new TanmiError(
        "CONCLUSION_REQUIRED",
        `${action} 动作必须提供 conclusion 参数`
      );
    }

    // 5.0.1 验证 conclusion 格式（必须在状态更新前验证，否则会导致状态已更新但结论写入失败）
    if (conclusion) {
      validateMultilineContent(conclusion, "结论");
    }

    // 5.1 根节点 start 时检查信息收集节点状态（不阻止，但记录用于后续提醒）
    let infoCollectionWarning: string | null = null;
    if (nodeId === "root" && action === "start") {
      const infoCollectionCheck = this.checkInfoCollectionNode(graph.nodes, nodeMeta.children);
      if (!infoCollectionCheck.passed) {
        infoCollectionWarning = infoCollectionCheck.message;
      }
    }

    // 5.2 规划节点 complete 时验证子节点状态（所有子节点必须处于终态）
    if (nodeType === "planning" && action === "complete") {
      const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
      const childStatuses = nodeMeta.children.map(cid => graph.nodes[cid]?.status);
      const hasIncompleteChildren = childStatuses.some(
        s => s && !terminalStatuses.has(s)
      );
      if (hasIncompleteChildren) {
        throw new TanmiError(
          "INCOMPLETE_CHILDREN",
          "规划节点有未完成的子节点，无法直接完成。请先完成所有子节点（completed/failed/cancelled）。"
        );
      }

      // 5.2.1 规划节点 complete 时验证 conclusionsHash（有子节点时必填）
      if (nodeMeta.children.length > 0) {
        if (!conclusionsHash) {
          throw new TanmiError(
            "CONCLUSIONS_HASH_REQUIRED",
            "规划节点 complete 需要提供 conclusionsHash，请先调用 context_get 获取最新上下文。"
          );
        }

        // 计算当前 conclusionsHash 并验证
        const childConclusions = nodeMeta.children
          .map(cid => {
            const childMeta = graph.nodes[cid];
            return childMeta ? { nodeId: cid, conclusion: childMeta.conclusion || "" } : null;
          })
          .filter((c): c is { nodeId: string; conclusion: string } => c !== null && !!c.conclusion);

        const currentHash = computeConclusionsHash(childConclusions);

        if (conclusionsHash !== currentHash) {
          throw new TanmiError(
            "CONCLUSIONS_HASH_MISMATCH",
            "conclusionsHash 不匹配，子节点结论可能已变化。请重新调用 context_get 获取最新上下文后再完成。"
          );
        }
      }
    }

    // 4.3 派发模式下的权限检查
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);
    if (config.dispatch?.enabled && nodeType === "execution") {
      // 4.3.1 派发执行中（executing）时阻止状态变更（除非是系统内部调用）
      if (nodeMeta.dispatch?.status === "executing") {
        throw new TanmiError(
          "DISPATCH_IN_PROGRESS",
          `节点 ${nodeId} 正在派发执行中，请等待 subagent 完成后由系统更新状态。如需强制终止，请使用 dispatch_cleanup。`
        );
      }

      // 4.3.2 执行节点 start 时，检查是否需要通过 dispatch_node 派发
      // 派发子节点有 dispatch 字段且 status 为 pending，允许直接 start
      const isDispatchChild = nodeMeta.role === "dispatch_exec" || nodeMeta.role === "dispatch_spec" || nodeMeta.role === "dispatch_quality";
      const hasDispatchPending = nodeMeta.dispatch?.status === "pending";

      if (action === "start" && !isDispatchChild && !hasDispatchPending) {
        // 检查上级节点角色，info_collection/info_summary 节点的子节点允许直接 start
        const parent = nodeMeta.parentId ? graph.nodes[nodeMeta.parentId] : null;
        const isParentInfoNode = parent?.role === "info_collection" || parent?.role === "info_summary";

        if (!isParentInfoNode) {
          throw new TanmiError(
            "DISPATCH_REQUIRED",
            `派发模式已启用，执行节点必须通过 dispatch_node 派发执行，不能直接 start。请先调用 dispatch_node(workspaceId="${workspaceId}", nodeId="${nodeId}")。`
          );
        }
      }

      // 4.3.3 派发子节点 start 时，设置 dispatch.startMarker 和 status
      if (action === "start" && (isDispatchChild || hasDispatchPending)) {
        const useGit = config.dispatch.useGit ?? false;
        const startMarker = useGit ? await getCurrentCommit(projectRoot) : Date.now().toString();
        nodeMeta.dispatch = {
          ...nodeMeta.dispatch,
          startMarker,
          status: "executing",
        };
      }

      // 4.3.4 派发子节点 retry 时，重置 dispatch.status 为 pending
      if (action === "retry" && nodeMeta.dispatch?.status === "failed") {
        nodeMeta.dispatch = {
          ...nodeMeta.dispatch,
          status: "pending",
        };
      }

      // 4.3.5 派发子节点 reopen 时，重置 dispatch.status 为 pending
      if (action === "reopen" && nodeMeta.dispatch?.status === "passed") {
        nodeMeta.dispatch = {
          ...nodeMeta.dispatch,
          status: "pending",
        };
      }
    }

    // 4.4 执行节点 start 时检查同级节点并发（一次只能有一个执行中的节点）
    if (nodeType === "execution" && action === "start" && nodeMeta.parentId) {
      const parentNode = graph.nodes[nodeMeta.parentId];
      if (parentNode) {
        const activeStatuses = new Set(["implementing", "validating"]);
        const activeSiblings = parentNode.children
          .filter(sibId => sibId !== nodeId)
          .map(sibId => graph.nodes[sibId])
          .filter(sib => sib && sib.type === "execution" && activeStatuses.has(sib.status));

        if (activeSiblings.length > 0) {
          const activeIds = activeSiblings.map(s => `${s.id}(${s.status})`).join(", ");
          throw new TanmiError(
            "CONCURRENT_EXECUTION",
            `同级节点 ${activeIds} 正在执行中。请先完成或暂停当前任务，再开始新任务。遵循"一次一个节点"原则。`
          );
        }
      }
    }

    const currentTime = now();
    const timestamp = formatShort(currentTime);

    // 6. 验证 conclusion 格式（在任何写入操作之前验证，避免数据不一致）
    if (conclusion) {
      validateMultilineContent(conclusion, "结论");

      // 6.1 验证 conclusion 长度（仅 complete 时）
      if (action === "complete" && conclusion.length > CONCLUSION_MAX_LENGTH) {
        throw new TanmiError(
          "CONCLUSION_TOO_LONG",
          `结论过长(${conclusion.length}字符)，限制${CONCLUSION_MAX_LENGTH}字符。\n\n` +
          `请按以下步骤处理：\n\n` +
          `1. 创建 memo 记录完整信息:\n` +
          `   memo_create({ workspaceId, title, summary, content, tags })\n\n` +
          `2. 提交精简结论完成节点:\n` +
          `   node_transition({ action: "complete", conclusion: "精简结论" })\n\n` +
          `3. 添加 memo 引用（可在 WebUI 跳转查看）:\n` +
          `   node_reference({ nodeId, targetIdOrPath: "memo:memoId", action: "add" })`
        );
      }
    }

    // 7. 更新 graph.json 中的节点状态和 conclusion
    nodeMeta.status = newStatus;
    nodeMeta.updatedAt = currentTime;
    if (conclusion) {
      // 将字面量 \\n 转换为真正的换行符（MCP 工具调用时可能传入转义字符串）
      nodeMeta.conclusion = conclusion.replace(/\\n/g, "\n");
    }

    // 7.0.0.1 节点 complete 时，清除自己的 stale 标记
    if (action === "complete" && nodeMeta.conclusionStale) {
      nodeMeta.conclusionStale = undefined;
    }

    // 7.0.1 reopen 时，如果节点有 conclusion，设置 stale
    if (action === "reopen" && nodeMeta.conclusion) {
      nodeMeta.conclusionStale = true;
    }

    // 7.1 父节点状态级联（仅执行节点 start/reopen 时）
    const cascadeMessages: string[] = [];
    if (nodeType === "execution" && (action === "start" || action === "reopen")) {
      // 当执行节点开始时，确保父规划节点处于 monitoring 状态
      let parentId = nodeMeta.parentId;
      while (parentId && graph.nodes[parentId]) {
        const parent = graph.nodes[parentId];
        if (parent.type === "planning") {
          if (parent.status === "pending" || parent.status === "planning") {
            parent.status = "monitoring";
            parent.updatedAt = currentTime;
            cascadeMessages.push(`父节点 ${parentId}: ${parent.status} → monitoring`);
            const parentDirName = parent.dirName || parentId;  // 向后兼容
            await this.md.updateNodeStatus(projectRoot, wsDirName, parentDirName, "monitoring");
          } else if (parent.status === "completed" && action === "reopen") {
            parent.status = "monitoring";
            parent.updatedAt = currentTime;
            cascadeMessages.push(`父节点 ${parentId}: completed → monitoring (级联重开)`);
            const parentDirName = parent.dirName || parentId;
            await this.md.updateNodeStatus(projectRoot, wsDirName, parentDirName, "monitoring");
          } else if (parent.status === "cancelled" && action === "reopen") {
            parent.status = "monitoring";
            parent.updatedAt = currentTime;
            cascadeMessages.push(`父节点 ${parentId}: cancelled → monitoring (级联重开)`);
            const parentDirName = parent.dirName || parentId;
            await this.md.updateNodeStatus(projectRoot, wsDirName, parentDirName, "monitoring");
          }
        }
        parentId = parent.parentId;
      }
    }

    // 7.2 自动切换焦点到当前节点（start/reopen 时）
    if (action === "start" || action === "reopen") {
      graph.currentFocus = nodeId;
    }

    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 8. 更新 Info.md 的 frontmatter 和结论部分
    await this.md.updateNodeStatus(projectRoot, wsDirName, nodeDirName, newStatus);
    if (conclusion) {
      await this.md.updateConclusion(projectRoot, wsDirName, nodeDirName, conclusion);
    }

    // 9. 追加日志记录
    const logEvent = this.buildLogEvent(nodeType, action, currentStatus, newStatus, reason);
    await this.md.appendTypedLogEntry(projectRoot, wsDirName, {
      timestamp,
      operator: "AI",
      event: logEvent,
    }, nodeDirName);

    // 10. 如果是 complete/cancel，清空 Problem.md
    if (action === "complete" || action === "cancel") {
      await this.md.writeProblem(projectRoot, wsDirName, {
        currentProblem: "（暂无）",
        nextStep: "（暂无）",
      }, nodeDirName);
    }

    // 10.0.1 子节点 complete 时，设置父节点 stale
    if (action === "complete" && nodeMeta.parentId) {
      const parentMeta = graph.nodes[nodeMeta.parentId];
      const terminalStatuses = new Set(["completed", "cancelled"]);
      if (parentMeta && parentMeta.conclusion && !terminalStatuses.has(parentMeta.status)) {
        parentMeta.conclusionStale = true;
        await this.json.writeGraph(projectRoot, wsDirName, graph);
      }
    }

    // 10.1 信息收集节点 complete 时自动归档规则和文档
    let archiveResult: { rules: string[]; docs: DocRef[] } | null = null;
    if (nodeMeta.role === "info_collection" && action === "complete" && conclusion) {
      archiveResult = await this.archiveInfoCollection(projectRoot, wsDirName, conclusion);
    }

    // 10.2 complete 时获取节点的文档引用（用于提醒更新）
    let nodeDocRefs: DocRef[] = [];
    if (action === "complete") {
      const nodeInfo = await this.md.readNodeInfoFull(projectRoot, wsDirName, nodeDirName);
      nodeDocRefs = nodeInfo.docs;
    }

    // 11. 更新工作区配置的 updatedAt（使用前面已读取的 config）
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, wsDirName, config);

    // 12. 同步更新索引中的 updatedAt（确保 workspace_list 返回正确时间）
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (wsEntry) {
      wsEntry.updatedAt = currentTime;
      await this.json.writeIndex(index);
    }

    // 13. 计算变更后的 nodeHash（供后续操作复用，避免重复 node_get）
    const finalNodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName);
    const newNodeHash = computeNodeHash({
      title: finalNodeInfo.title,
      requirement: finalNodeInfo.requirement,
      note: finalNodeInfo.notes,
      conclusion: finalNodeInfo.conclusion,
    });

    // 13. 返回结果
    const result: NodeTransitionResult = {
      success: true,
      previousStatus: currentStatus,
      currentStatus: newStatus,
      conclusion: conclusion ?? null,
      nodeHash: newNodeHash,
    };

    // 如果有级联更新，加入返回结果
    if (cascadeMessages.length > 0) {
      result.cascadeUpdates = cascadeMessages;
    }

    // 13. 添加工作流提示（根据节点类型）
    result.hint = this.generateHint(nodeType, action, nodeMeta, graph, archiveResult, infoCollectionWarning, nodeDocRefs);

    // 13.1 生成引导内容
    const guidanceContext: GuidanceContext = {
      toolName: "node_transition",
      toolInput: { action },
      nodeType,
      nodeStatus: newStatus,
      nodeRole: nodeMeta.role,
      hasChildren: nodeMeta.children.length > 0,
      extra: {
        isRootNode: nodeId === "root",
      },
    };
    const guidance = this.guidanceService.generateFromContext(guidanceContext, 0);
    result.guidance = guidance.content;

    // 13.2 如果派发模式启用，追加派发相关提示
    if (config.dispatch?.enabled && nodeType === "execution") {
      if (action === "start") {
        result.hint += "\n\n🚀 **派发模式已启用**：请使用 dispatch_node 将任务派发给 subagent 执行，而非直接执行。派发后根据返回的 actionRequired 调用 Task tool。";
      }
      // 注：测试节点附属化后，测试节点作为兄弟节点存在，由父管理节点统一调度
    }

    // 14. 添加 actionRequired（执行节点完成且有文档引用时）
    if (nodeType === "execution" && action === "complete" && nodeDocRefs && nodeDocRefs.length > 0) {
      // 生成 confirmation token
      const confirmation = this.createPendingConfirmation(workspaceId, nodeId, "check_docs", {
        docs: nodeDocRefs,
      });

      result.actionRequired = {
        type: "check_docs",
        message: "执行任务已完成，请向用户确认引用的文档是否需要同步更新。",
        data: {
          docs: nodeDocRefs,
        },
        confirmationToken: confirmation.token,
      };
    }

    // 15. 添加 actionRequired（reopen 时，如果有子节点则需要先查看结构）
    if (action === "reopen" && nodeMeta.children.length > 0) {
      // 收集子节点概览信息
      const childrenOverview = nodeMeta.children.map(childId => {
        const child = graph.nodes[childId];
        return {
          nodeId: childId,
          status: child?.status || "unknown",
          type: child?.type || "unknown",
        };
      });

      // 生成 confirmation token
      const confirmation = this.createPendingConfirmation(workspaceId, nodeId, "review_structure", {
        childCount: nodeMeta.children.length,
        childrenOverview,
      });

      result.actionRequired = {
        type: "review_structure",
        message: "节点已重开，存在已有子节点。请先调用 node_list 查看现有结构，评估是否需要调整现有节点而非创建新节点。",
        data: {
          childCount: nodeMeta.children.length,
          childrenOverview,
        },
        confirmationToken: confirmation.token,
      };
    }

    // 15. 添加 actionRequired（ask_dispatch - 首次执行节点启动时询问是否启用派发）
    if (nodeType === "execution" && action === "start" && !result.actionRequired) {
      // 检查是否应该询问派发：
      // 1. 工作区尚未启用派发
      // 2. 这是第一个开始执行的非信息收集节点
      if (!config.dispatch?.enabled) {
        const isFirstExecution = this.isFirstNonInfoCollectionExecution(graph.nodes, nodeMeta, nodeId);
        if (isFirstExecution) {
          try {
            const isGit = await isGitRepo(projectRoot);
            // 无论是否 git 仓库都询问，但提示不同模式
            if (isGit) {
              result.actionRequired = {
                type: "ask_dispatch",
                message: "检测到项目是 Git 仓库，是否启用派发模式？\n\n派发模式允许将执行节点任务交给独立的 subagent 执行。提供两种模式：\n- **无 Git 模式**（默认，推荐）：仅更新元数据，不影响代码，安全\n- **Git 模式**（实验功能）：自动创建分支、提交、回滚，支持失败自动恢复，但有一定风险",
                data: {
                  projectRoot,
                  workspaceId,
                  isGitRepo: true,
                },
              };
            } else {
              result.actionRequired = {
                type: "ask_dispatch",
                message: "是否启用派发模式（无 Git 模式）？\n\n派发模式允许将执行节点任务交给独立的 subagent 执行。\n当前项目不是 git 仓库，将使用无 Git 模式（仅更新元数据，不影响代码）。",
                data: {
                  projectRoot,
                  workspaceId,
                  isGitRepo: false,
                },
              };
            }
          } catch {
            // 检测失败，按非 git 仓库处理
            result.actionRequired = {
              type: "ask_dispatch",
              message: "是否启用派发模式（无 Git 模式）？\n\n派发模式允许将执行节点任务交给独立的 subagent 执行。\n将使用无 Git 模式（仅更新元数据，不影响代码）。",
              data: {
                projectRoot,
                workspaceId,
                isGitRepo: false,
              },
            };
          }
        }
      }
    }

    // 推送 SSE 事件通知前端
    eventService.emitNodeUpdate(workspaceId, nodeId);

    return result;
  }

  /**
   * 检查是否是第一个非信息收集的执行节点启动
   */
  private isFirstNonInfoCollectionExecution(
    nodes: Record<string, NodeMeta>,
    currentNode: NodeMeta,
    currentNodeId: string
  ): boolean {
    // 如果当前节点有 info_collection 角色，不算
    if (currentNode.role === "info_collection") {
      return false;
    }

    // 检查是否有其他非信息收集的执行节点已经启动过
    for (const [nodeId, node] of Object.entries(nodes)) {
      if (nodeId === currentNodeId) continue;
      if (node.type !== "execution") continue;
      if (node.role === "info_collection") continue;
      // 如果有其他执行节点不是 pending 状态，说明已经开始过
      if (node.status !== "pending") {
        return false;
      }
    }

    return true;
  }

  /**
   * 生成工作流提示
   */
  private generateHint(
    nodeType: NodeType,
    action: TransitionAction,
    nodeMeta: { parentId: string | null; children: string[]; conclusion?: string | null; role?: NodeRole; id?: string },
    graph: { nodes: Record<string, { status: NodeStatus; type: NodeType }> },
    archiveResult?: { rules: string[]; docs: DocRef[] } | null,
    infoCollectionWarning?: string | null,
    nodeDocRefs?: DocRef[]
  ): string {
    // 根节点 start 时如果缺少信息收集节点，优先显示强提醒
    if (infoCollectionWarning) {
      return `⚠️ **重要提醒**\n\n${infoCollectionWarning}\n\n` +
        "这是开始任务前的必要步骤，信息收集的结果会自动归档到工作区规则和文档中，帮助后续任务更好地执行。";
    }
    // 信息收集节点完成时，显示归档结果
    if (nodeMeta.role === "info_collection" && action === "complete" && archiveResult) {
      const parts: string[] = ["💡 信息收集已完成，已自动归档到工作区："];
      if (archiveResult.rules.length > 0) {
        parts.push(`- 新增 ${archiveResult.rules.length} 条规则`);
      }
      if (archiveResult.docs.length > 0) {
        parts.push(`- 新增 ${archiveResult.docs.length} 个文档引用`);
      }
      if (archiveResult.rules.length === 0 && archiveResult.docs.length === 0) {
        parts[0] = "💡 信息收集已完成。未在 conclusion 中发现需要归档的规则或文档。";
      }
      parts.push("建议返回根节点继续规划执行任务。");
      return parts.join("\n");
    }

    if (nodeType === "execution") {
      // 执行节点提示
      if (action === "start" || action === "retry") {
        return "💡 执行任务已开始。请使用 log_append 记录执行过程，完成后调用 complete，如遇问题调用 fail。";
      } else if (action === "reopen") {
        const oldConclusion = nodeMeta.conclusion;
        if (oldConclusion) {
          return `💡 执行任务已重开。旧结论：「${oldConclusion}」\n如需修改需求描述，请使用 node_update({ requirement: "新需求" })。\n完成时请将新工作与旧结论合并。`;
        }
        return "💡 执行任务已重开。如需修改需求描述，请使用 node_update({ requirement: \"新需求\" })。";
      } else if (action === "complete") {
        const parentId = nodeMeta.parentId;
        let hint = "💡 执行任务已完成。";
        if (parentId && graph.nodes[parentId]) {
          hint = `💡 执行任务已完成。建议切换到父规划节点 ${parentId} 检查是否还有其他任务。`;
        }
        // 如果有文档引用，追加更新提醒
        if (nodeDocRefs && nodeDocRefs.length > 0) {
          hint += `\n\n📄 您在此任务中引用了 ${nodeDocRefs.length} 个文档，请确认是否需要同步更新：`;
          for (const doc of nodeDocRefs) {
            hint += `\n- ${doc.path}${doc.description ? ` (${doc.description})` : ""}`;
          }
          hint += `\n\n💡 提示：如果文档没有元文件(frontmatter)，建议添加 YAML 格式的元数据头(以 --- 开头和结尾)，便于文档管理和检索。`;
        }
        return hint;
      } else if (action === "fail") {
        return "💡 执行任务已标记失败。请切换到父规划节点，根据失败原因决定：重新派发、修改需求后重试、或取消任务。";
      }
    } else {
      // 规划节点提示
      if (action === "start") {
        return "💡 进入规划状态。请分析需求，使用 node_create 创建执行节点或子规划节点。";
      } else if (action === "reopen") {
        const oldConclusion = nodeMeta.conclusion;
        if (oldConclusion) {
          return `💡 规划节点已重开。旧结论：「${oldConclusion}」\n如需修改需求描述，请使用 node_update({ requirement: "新需求" })。\n完成时请将新工作与旧结论合并，确保结论完整反映所有已完成的工作。`;
        }
        return "💡 规划节点已重开。如需修改需求描述，请使用 node_update({ requirement: \"新需求\" })。";
      } else if (action === "complete") {
        const parentId = nodeMeta.parentId;
        let hint = "💡 规划节点已完成。工作区任务完成！";
        if (parentId && graph.nodes[parentId]) {
          hint = `💡 规划节点已完成汇总。建议切换到父节点 ${parentId} 继续。`;
        }
        // 如果有文档引用，追加更新提醒
        if (nodeDocRefs && nodeDocRefs.length > 0) {
          hint += `\n\n📄 您在此任务中引用了 ${nodeDocRefs.length} 个文档，请确认是否需要同步更新：`;
          for (const doc of nodeDocRefs) {
            hint += `\n- ${doc.path}${doc.description ? ` (${doc.description})` : ""}`;
          }
        }
        return hint;
      } else if (action === "cancel") {
        return "💡 规划节点已取消。如需重新规划请使用 reopen。";
      }
    }
    return "";
  }

  /**
   * 验证状态转换合法性
   */
  private validateTransition(
    nodeType: NodeType,
    currentStatus: NodeStatus,
    action: TransitionAction
  ): NodeStatus | null {
    if (nodeType === "execution") {
      return EXECUTION_TRANSITION_TABLE[currentStatus as ExecutionStatus]?.[action as ExecutionAction] ?? null;
    } else {
      return PLANNING_TRANSITION_TABLE[currentStatus as PlanningStatus]?.[action as PlanningAction] ?? null;
    }
  }

  /**
   * 生成状态转换错误的修复建议
   */
  private getTransitionSuggestion(
    nodeType: NodeType,
    currentStatus: NodeStatus,
    attemptedAction: TransitionAction
  ): string {
    if (nodeType === "execution") {
      // 执行节点错误建议
      if (currentStatus === "pending" && attemptedAction === "complete") {
        return "请先调用 node_transition(action=\"start\") 开始执行，再进行 complete";
      }
      if (currentStatus === "pending" && attemptedAction === "submit") {
        return "请先调用 node_transition(action=\"start\") 开始执行";
      }
      if (currentStatus === "completed" && attemptedAction === "complete") {
        return "节点已完成，无需重复完成";
      }
      if (currentStatus === "completed" && attemptedAction === "start") {
        return "节点已完成，如需重新执行请使用 node_transition(action=\"reopen\")";
      }
      if (currentStatus === "failed" && attemptedAction === "complete") {
        return "失败的节点无法直接完成，请先 retry 后重新执行";
      }
      if (currentStatus === "implementing" && attemptedAction === "start") {
        return "节点已在执行中，无需重复 start";
      }
      if (attemptedAction === "cancel") {
        return "执行节点不支持 cancel 动作，如需放弃请使用 fail";
      }

      const availableActions = Object.keys(EXECUTION_TRANSITION_TABLE[currentStatus as ExecutionStatus] || {});
      if (availableActions.length > 0) {
        return `执行节点当前状态 ${currentStatus} 可用的动作: ${availableActions.join(", ")}`;
      }
    } else {
      // 规划节点错误建议
      if (currentStatus === "pending" && attemptedAction === "complete") {
        return "请先调用 node_transition(action=\"start\") 进入规划状态";
      }
      if (currentStatus === "monitoring" && attemptedAction === "start") {
        return "节点已在监控子节点执行，如需重新规划请先 cancel 后 reopen";
      }
      if (currentStatus === "completed" && attemptedAction === "start") {
        return "节点已完成，如需重新规划请使用 node_transition(action=\"reopen\")";
      }
      if (currentStatus === "planning" && attemptedAction === "start") {
        return "节点已在规划中，无需重复 start";
      }
      if (attemptedAction === "fail") {
        return "规划节点不支持 fail 动作，如需放弃请使用 cancel";
      }
      if (attemptedAction === "submit") {
        return "规划节点不支持 submit 动作";
      }
      if (attemptedAction === "retry") {
        return "规划节点不支持 retry 动作，如需重新开始请使用 reopen";
      }

      const availableActions = Object.keys(PLANNING_TRANSITION_TABLE[currentStatus as PlanningStatus] || {});
      if (availableActions.length > 0) {
        return `规划节点当前状态 ${currentStatus} 可用的动作: ${availableActions.join(", ")}`;
      }
    }
    return `当前状态 ${currentStatus} 无可用转换`;
  }

  /**
   * 构建日志事件描述
   */
  private buildLogEvent(
    nodeType: NodeType,
    action: TransitionAction,
    from: NodeStatus,
    to: NodeStatus,
    reason?: string
  ): string {
    const executionDescriptions: Record<string, string> = {
      start: "开始执行",
      submit: "提交验证",
      complete: "完成执行",
      fail: "执行失败",
      retry: "重新执行",
      reopen: "重新激活",
    };

    const planningDescriptions: Record<string, string> = {
      start: "开始规划",
      complete: "完成汇总",
      cancel: "取消规划",
      reopen: "重新规划",
    };

    const descriptions = nodeType === "execution" ? executionDescriptions : planningDescriptions;
    let event = `${descriptions[action] || action}: ${from} → ${to}`;
    if (reason) {
      event += ` (${reason})`;
    }
    return event;
  }

  /**
   * 检查根节点是否有已完成的信息收集节点
   */
  private checkInfoCollectionNode(
    nodes: Record<string, NodeMeta>,
    childIds: string[]
  ): { passed: boolean; message: string } {
    // 查找信息收集节点
    const infoCollectionNodes = childIds
      .map(id => nodes[id])
      .filter(node => node?.role === "info_collection");

    if (infoCollectionNodes.length === 0) {
      return {
        passed: false,
        message: "根节点 start 前必须先创建信息收集节点（role: 'info_collection'）。\n" +
          "请先使用 node_create 创建一个 planning 类型、role 为 'info_collection' 的节点，" +
          "用于收集项目信息、环境配置、相关文档等，收集完成后信息会自动归档到工作区规则和文档中。",
      };
    }

    // 检查是否有已完成的信息收集节点
    const completedInfoCollection = infoCollectionNodes.find(
      node => node.status === "completed"
    );

    if (!completedInfoCollection) {
      const infoNode = infoCollectionNodes[0];
      return {
        passed: false,
        message: `信息收集节点 "${infoNode.id}" 尚未完成（当前状态: ${infoNode.status}）。\n` +
          "请先完成信息收集，系统会自动将收集的规则和文档归档到工作区，然后再开始根节点规划。",
      };
    }

    return { passed: true, message: "" };
  }

  /**
   * 归档信息收集节点的 conclusion 到工作区
   * 解析 ## 规则 和 ## 文档 部分
   */
  private async archiveInfoCollection(
    projectRoot: string,
    wsDirName: string,
    conclusion: string
  ): Promise<{ rules: string[]; docs: DocRef[] }> {
    const result: { rules: string[]; docs: DocRef[] } = { rules: [], docs: [] };

    // 解析 ## 规则 部分
    const rulesMatch = conclusion.match(/##\s*规则\s*\n([\s\S]*?)(?=\n##|\n*$)/i);
    if (rulesMatch) {
      const rulesSection = rulesMatch[1];
      // 解析列表项（支持 - 或 * 开头）
      const ruleLines = rulesSection.split("\n")
        .map(line => line.trim())
        .filter(line => line.match(/^[-*]\s+/))
        .map(line => line.replace(/^[-*]\s+/, "").trim())
        .filter(line => line.length > 0);
      result.rules = ruleLines;
    }

    // 解析 ## 文档 部分
    const docsMatch = conclusion.match(/##\s*文档\s*\n([\s\S]*?)(?=\n##|\n*$)/i);
    if (docsMatch) {
      const docsSection = docsMatch[1];
      // 解析列表项，格式：- path: description 或 - path（description 可选）
      const docLines = docsSection.split("\n")
        .map(line => line.trim())
        .filter(line => line.match(/^[-*]\s+/))
        .map(line => line.replace(/^[-*]\s+/, "").trim())
        .filter(line => line.length > 0);

      for (const line of docLines) {
        // 尝试匹配 "path: description" 格式
        const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
        if (colonMatch) {
          result.docs.push({
            path: colonMatch[1].trim(),
            description: colonMatch[2].trim(),
          });
        } else {
          // 没有描述，只有路径
          result.docs.push({
            path: line,
            description: "",
          });
        }
      }
    }

    // 如果有解析到内容，追加到工作区
    if (result.rules.length > 0 || result.docs.length > 0) {
      const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, wsDirName);

      // 追加规则（去重）
      const existingRules = new Set(workspaceMdData.rules);
      for (const rule of result.rules) {
        if (!existingRules.has(rule)) {
          workspaceMdData.rules.push(rule);
          existingRules.add(rule);
        }
      }

      // 追加文档（去重，按路径判断）
      const existingDocPaths = new Set(workspaceMdData.docs.map(d => d.path));
      for (const doc of result.docs) {
        if (!existingDocPaths.has(doc.path)) {
          workspaceMdData.docs.push(doc);
          existingDocPaths.add(doc.path);
        }
      }

      // 写回工作区
      await this.md.writeWorkspaceMd(projectRoot, wsDirName, workspaceMdData);
    }

    return result;
  }

  /**
   * 创建待确认 Token
   * @param workspaceId 工作区 ID
   * @param nodeId 节点 ID
   * @param actionType 动作类型（如 "check_docs"）
   * @param metadata 附加元数据
   * @returns PendingConfirmation 对象
   */
  createPendingConfirmation(
    workspaceId: string,
    nodeId: string,
    actionType: string,
    metadata?: Record<string, unknown>
  ): PendingConfirmation {
    // 生成随机 token（32 字节，hex 编码为 64 字符）
    const token = randomBytes(32).toString("hex");
    const currentTime = Date.now();
    const confirmation: PendingConfirmation = {
      token,
      workspaceId,
      nodeId,
      actionType,
      createdAt: currentTime,
      expiresAt: currentTime + this.TOKEN_VALIDITY_MS,
      metadata,
    };

    // 存储到内存
    this.pendingConfirmations.set(token, confirmation);

    // 清理过期 token（顺便执行）
    this.clearExpiredTokens();

    return confirmation;
  }

  /**
   * 验证 Token
   * @param token 待验证的 token
   * @returns 如果 token 有效，返回 PendingConfirmation 对象；否则返回 null
   */
  validateConfirmation(token: string): PendingConfirmation | null {
    const confirmation = this.pendingConfirmations.get(token);
    if (!confirmation) {
      return null;
    }

    // 检查是否过期
    const currentTime = Date.now();
    if (currentTime > confirmation.expiresAt) {
      // 过期，删除并返回 null
      this.pendingConfirmations.delete(token);
      return null;
    }

    // 验证成功，删除 token（一次性使用）
    this.pendingConfirmations.delete(token);
    return confirmation;
  }

  /**
   * 清理过期 Token
   * 遍历所有 token，删除已过期的
   */
  clearExpiredTokens(): void {
    const currentTime = Date.now();
    const toDelete: string[] = [];

    // 使用 Array.from 转换迭代器以兼容 ES5
    for (const [token, confirmation] of Array.from(this.pendingConfirmations.entries())) {
      if (currentTime > confirmation.expiresAt) {
        toDelete.push(token);
      }
    }

    for (const token of toDelete) {
      this.pendingConfirmations.delete(token);
    }
  }
}
