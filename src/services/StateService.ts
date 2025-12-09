// src/services/StateService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  NodeStatus,
  TransitionAction,
  NodeTransitionParams,
  NodeTransitionResult,
} from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { now, formatShort } from "../utils/time.js";

/**
 * 状态转换规则表
 */
const TRANSITION_TABLE: Record<NodeStatus, Partial<Record<TransitionAction, NodeStatus>>> = {
  pending: { start: "implementing" },
  implementing: { submit: "validating", complete: "completed" },
  validating: { complete: "completed", fail: "failed" },
  failed: { retry: "implementing" },
  completed: { reopen: "implementing" },  // 允许重新激活已完成的节点
};

/**
 * 需要 conclusion 的动作
 */
const CONCLUSION_REQUIRED_ACTIONS: TransitionAction[] = ["complete", "fail"];

/**
 * 状态服务
 * 处理节点状态转换
 */
export class StateService {
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
   * 执行状态转换
   */
  async transition(params: NodeTransitionParams): Promise<NodeTransitionResult> {
    const { workspaceId, nodeId, action, reason, conclusion } = params;

    // 1. 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    // 2. 验证节点存在并获取当前状态
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    const nodeMeta = graph.nodes[nodeId];
    const currentStatus = nodeMeta.status;

    // 3. 验证转换合法性
    const newStatus = this.validateTransition(currentStatus, action);
    if (!newStatus) {
      const suggestion = this.getTransitionSuggestion(currentStatus, action);
      throw new TanmiError(
        "INVALID_TRANSITION",
        `非法状态转换: ${currentStatus} --[${action}]--> ? (不允许)。${suggestion}`
      );
    }

    // 4. 验证 conclusion 要求
    if (CONCLUSION_REQUIRED_ACTIONS.includes(action) && !conclusion) {
      throw new TanmiError(
        "CONCLUSION_REQUIRED",
        `${action} 动作必须提供 conclusion 参数`
      );
    }

    const currentTime = now();
    const timestamp = formatShort(currentTime);

    // 5. 更新 graph.json 中的节点状态和 conclusion
    nodeMeta.status = newStatus;
    nodeMeta.updatedAt = currentTime;
    if (conclusion) {
      nodeMeta.conclusion = conclusion;
    }

    // 5.1 父节点状态级联
    const cascadeMessages: string[] = [];
    if (action === "start" || action === "reopen") {
      // 当子节点开始执行时，自动激活待处理的父节点链
      let parentId = nodeMeta.parentId;
      while (parentId && graph.nodes[parentId]) {
        const parent = graph.nodes[parentId];
        if (parent.status === "pending") {
          parent.status = "implementing";
          parent.updatedAt = currentTime;
          cascadeMessages.push(`父节点 ${parentId}: pending → implementing`);
          // 也更新父节点的 Info.md
          await this.md.updateNodeStatus(projectRoot, workspaceId, parentId, "implementing");
        } else if (parent.status === "completed" && action === "reopen") {
          // 如果父节点已完成但子节点需要重新激活，父节点也需要重新激活
          parent.status = "implementing";
          parent.updatedAt = currentTime;
          cascadeMessages.push(`父节点 ${parentId}: completed → implementing (级联重开)`);
          await this.md.updateNodeStatus(projectRoot, workspaceId, parentId, "implementing");
        } else {
          break; // 父节点已在执行中或其他状态，停止级联
        }
        parentId = parent.parentId;
      }
    }

    // 5.2 自动切换焦点到当前节点（start/reopen 时）
    if (action === "start" || action === "reopen") {
      graph.currentFocus = nodeId;
    }

    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 6. 更新 Info.md 的 frontmatter 和结论部分
    await this.md.updateNodeStatus(projectRoot, workspaceId, nodeId, newStatus);
    if (conclusion) {
      await this.md.updateConclusion(projectRoot, workspaceId, nodeId, conclusion);
    }

    // 7. 追加日志记录
    const logEvent = this.buildLogEvent(action, currentStatus, newStatus, reason);
    await this.md.appendTypedLogEntry(projectRoot, workspaceId, {
      timestamp,
      operator: "AI",
      event: logEvent,
    }, nodeId);

    // 8. 如果是 complete，清空 Problem.md
    if (action === "complete") {
      await this.md.writeProblem(projectRoot, workspaceId, {
        currentProblem: "（暂无）",
        nextStep: "（暂无）",
      }, nodeId);
    }

    // 9. 更新工作区配置的 updatedAt
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 10. 返回结果
    const result: NodeTransitionResult = {
      success: true,
      previousStatus: currentStatus,
      currentStatus: newStatus,
      conclusion: conclusion ?? null,
    };

    // 如果有级联更新，加入返回结果
    if (cascadeMessages.length > 0) {
      result.cascadeUpdates = cascadeMessages;
    }

    // 11. 添加工作流提示
    if (action === "start" || action === "reopen" || action === "retry") {
      result.hint = "💡 任务已开始。请使用 log_append 记录关键发现和分析过程，便于后续回溯。";
    } else if (action === "complete") {
      // 检查父节点是否还有未完成的子节点
      const parentId = nodeMeta.parentId;
      if (parentId && graph.nodes[parentId]) {
        const siblings = graph.nodes[parentId].children;
        const incompleteSiblings = siblings.filter(
          (sid) => graph.nodes[sid]?.status !== "completed"
        );
        if (incompleteSiblings.length === 0) {
          result.hint = `💡 所有子任务已完成。可以考虑完成父节点 ${parentId}，或使用 context_focus 切换到其他任务。`;
        } else {
          result.hint = `💡 任务已完成。父节点下还有 ${incompleteSiblings.length} 个未完成的子任务，请使用 context_focus 切换到下一个任务。`;
        }
      }
    }

    return result;
  }

  /**
   * 验证状态转换合法性
   */
  private validateTransition(
    currentStatus: NodeStatus,
    action: TransitionAction
  ): NodeStatus | null {
    return TRANSITION_TABLE[currentStatus]?.[action] ?? null;
  }

  /**
   * 生成状态转换错误的修复建议
   */
  private getTransitionSuggestion(
    currentStatus: NodeStatus,
    attemptedAction: TransitionAction
  ): string {
    // 常见错误场景的建议
    if (currentStatus === "pending" && attemptedAction === "complete") {
      return "请先调用 node_transition(action=\"start\") 开始执行节点，再进行 complete";
    }
    if (currentStatus === "pending" && attemptedAction === "submit") {
      return "请先调用 node_transition(action=\"start\") 开始执行节点";
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
    if (currentStatus === "validating" && attemptedAction === "start") {
      return "节点正在验证中，请使用 complete/fail 来结束验证";
    }
    if (currentStatus === "implementing" && attemptedAction === "start") {
      return "节点已在执行中，无需重复 start";
    }

    // 通用建议：显示当前状态可用的动作
    const availableActions = Object.keys(TRANSITION_TABLE[currentStatus] || {});
    if (availableActions.length > 0) {
      return `当前状态 ${currentStatus} 可用的动作: ${availableActions.join(", ")}`;
    }
    return `当前状态 ${currentStatus} 无可用转换`;
  }

  /**
   * 构建日志事件描述
   */
  private buildLogEvent(
    action: TransitionAction,
    from: NodeStatus,
    to: NodeStatus,
    reason?: string
  ): string {
    const actionDescriptions: Record<TransitionAction, string> = {
      start: "开始执行",
      submit: "提交验证",
      complete: "完成任务",
      fail: "标记失败",
      retry: "重新执行",
      reopen: "重新激活",
    };

    let event = `${actionDescriptions[action]}: ${from} → ${to}`;
    if (reason) {
      event += ` (${reason})`;
    }
    return event;
  }
}
