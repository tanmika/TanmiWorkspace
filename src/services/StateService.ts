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
import { now } from "../utils/time.js";
import { formatHHmm } from "../utils/time.js";

/**
 * 状态转换规则表
 */
const TRANSITION_TABLE: Record<NodeStatus, Partial<Record<TransitionAction, NodeStatus>>> = {
  pending: { start: "implementing" },
  implementing: { submit: "validating", complete: "completed" },
  validating: { complete: "completed", fail: "failed" },
  failed: { retry: "implementing" },
  completed: {},
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
      throw new TanmiError(
        "INVALID_TRANSITION",
        `非法状态转换: ${currentStatus} --[${action}]--> ? (不允许)`
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
    const timestamp = formatHHmm();

    // 5. 更新 graph.json 中的节点状态和 conclusion
    nodeMeta.status = newStatus;
    nodeMeta.updatedAt = currentTime;
    if (conclusion) {
      nodeMeta.conclusion = conclusion;
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
    return {
      success: true,
      previousStatus: currentStatus,
      currentStatus: newStatus,
      conclusion: conclusion ?? null,
    };
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
    };

    let event = `${actionDescriptions[action]}: ${from} → ${to}`;
    if (reason) {
      event += ` (${reason})`;
    }
    return event;
  }
}
