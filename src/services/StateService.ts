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
} from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { now, formatShort } from "../utils/time.js";

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
    const nodeType = nodeMeta.type;
    const currentStatus = nodeMeta.status;

    // 3. 根据节点类型验证转换合法性
    const newStatus = this.validateTransition(nodeType, currentStatus, action);
    if (!newStatus) {
      const suggestion = this.getTransitionSuggestion(nodeType, currentStatus, action);
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

    // 4.1 规划节点 complete 时验证子节点状态
    if (nodeType === "planning" && action === "complete") {
      const childStatuses = nodeMeta.children.map(cid => graph.nodes[cid]?.status);
      const hasIncompleteChildren = childStatuses.some(
        s => s && s !== "completed" && s !== "cancelled"
      );
      if (hasIncompleteChildren) {
        throw new TanmiError(
          "INCOMPLETE_CHILDREN",
          "规划节点有未完成的子节点，无法直接完成。请先完成所有子节点或取消未完成的子节点。"
        );
      }
    }

    const currentTime = now();
    const timestamp = formatShort(currentTime);

    // 5. 更新 graph.json 中的节点状态和 conclusion
    nodeMeta.status = newStatus;
    nodeMeta.updatedAt = currentTime;
    if (conclusion) {
      nodeMeta.conclusion = conclusion;
    }

    // 5.1 父节点状态级联（仅执行节点 start/reopen 时）
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
            await this.md.updateNodeStatus(projectRoot, workspaceId, parentId, "monitoring");
          } else if (parent.status === "completed" && action === "reopen") {
            parent.status = "monitoring";
            parent.updatedAt = currentTime;
            cascadeMessages.push(`父节点 ${parentId}: completed → monitoring (级联重开)`);
            await this.md.updateNodeStatus(projectRoot, workspaceId, parentId, "monitoring");
          } else if (parent.status === "cancelled" && action === "reopen") {
            parent.status = "monitoring";
            parent.updatedAt = currentTime;
            cascadeMessages.push(`父节点 ${parentId}: cancelled → monitoring (级联重开)`);
            await this.md.updateNodeStatus(projectRoot, workspaceId, parentId, "monitoring");
          }
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
    const logEvent = this.buildLogEvent(nodeType, action, currentStatus, newStatus, reason);
    await this.md.appendTypedLogEntry(projectRoot, workspaceId, {
      timestamp,
      operator: "AI",
      event: logEvent,
    }, nodeId);

    // 8. 如果是 complete/cancel，清空 Problem.md
    if (action === "complete" || action === "cancel") {
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

    // 11. 添加工作流提示（根据节点类型）
    result.hint = this.generateHint(nodeType, action, nodeMeta, graph);

    return result;
  }

  /**
   * 生成工作流提示
   */
  private generateHint(
    nodeType: NodeType,
    action: TransitionAction,
    nodeMeta: { parentId: string | null; children: string[] },
    graph: { nodes: Record<string, { status: NodeStatus; type: NodeType }> }
  ): string {
    if (nodeType === "execution") {
      // 执行节点提示
      if (action === "start" || action === "reopen" || action === "retry") {
        return "💡 执行任务已开始。请使用 log_append 记录执行过程，完成后调用 complete，如遇问题调用 fail。";
      } else if (action === "complete") {
        const parentId = nodeMeta.parentId;
        if (parentId && graph.nodes[parentId]) {
          return `💡 执行任务已完成。建议切换到父规划节点 ${parentId} 检查是否还有其他任务。`;
        }
        return "💡 执行任务已完成。";
      } else if (action === "fail") {
        return "💡 执行任务已标记失败。请切换到父规划节点，根据失败原因决定：重新派发、修改需求后重试、或取消任务。";
      }
    } else {
      // 规划节点提示
      if (action === "start" || action === "reopen") {
        return "💡 进入规划状态。请分析需求，使用 node_create 创建执行节点或子规划节点。";
      } else if (action === "complete") {
        const parentId = nodeMeta.parentId;
        if (parentId && graph.nodes[parentId]) {
          return `💡 规划节点已完成汇总。建议切换到父节点 ${parentId} 继续。`;
        }
        return "💡 规划节点已完成。工作区任务完成！";
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
}
