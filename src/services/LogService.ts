// src/services/LogService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type {
  LogAppendParams,
  LogAppendResult,
  ProblemUpdateParams,
  ProblemUpdateResult,
  ProblemClearParams,
  ProblemClearResult,
} from "../types/context.js";
import { TanmiError } from "../types/errors.js";
import { formatShort, now } from "../utils/time.js";
import { eventService } from "./EventService.js";

/**
 * 日志服务
 * 处理日志追加和问题管理
 */
export class LogService {
  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 根据 workspaceId 获取工作区信息
   */
  private async resolveWorkspaceInfo(workspaceId: string): Promise<{ projectRoot: string; wsDirName: string }> {
    const entry = await this.json.findWorkspaceEntry(workspaceId);
    if (!entry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    return {
      projectRoot: entry.projectRoot,
      wsDirName: entry.dirName || entry.id,  // 向后兼容
    };
  }

  /**
   * 追加日志
   */
  async append(params: LogAppendParams): Promise<LogAppendResult> {
    const { workspaceId, nodeId, operator, event } = params;

    // 参数验证（防止 AI 使用错误参数名）
    if (!operator) {
      throw new TanmiError("INVALID_PARAMS", "缺少必填参数 operator（操作者），请检查是否使用了正确的参数名");
    }
    if (!event) {
      throw new TanmiError("INVALID_PARAMS", "缺少必填参数 event（事件描述），请检查是否使用了正确的参数名（不是 content）");
    }

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 获取节点信息（用于生成 hint）
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    let hint: string | undefined;
    let nodeDirName: string | undefined;

    if (nodeId) {
      const nodeMeta = graph.nodes[nodeId];
      if (!nodeMeta) {
        throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
      }
      nodeDirName = nodeMeta.dirName || nodeId;  // 向后兼容
      // 根据节点类型和状态生成 hint
      hint = this.generateLogHint(nodeMeta.type, nodeMeta.status, nodeMeta.children.length, event);
    }

    // 3. 生成时间戳（完整格式：YYYY-MM-DD HH:mm:ss）
    const timestamp = formatShort(now());

    // 4. 构造日志条目并追加
    try {
      await this.md.appendTypedLogEntry(projectRoot, wsDirName, {
        timestamp,
        operator,
        event,
      }, nodeDirName);
    } catch (error) {
      throw new TanmiError("LOG_APPEND_FAILED", `日志追加失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 5. 推送 SSE 事件通知前端
    eventService.emitLogUpdate(workspaceId, nodeId || "workspace");

    // 6. 返回结果
    return {
      success: true,
      timestamp,
      hint,
    };
  }

  /**
   * 根据节点状态生成日志追加后的提示
   */
  private generateLogHint(
    nodeType: string | undefined,
    status: string,
    childCount: number,
    event: string | undefined
  ): string {
    // 防御性检查：如果 event 为空则跳过关键词检测
    if (!event) {
      return "";
    }

    // 检测是否是"方案确定"类的日志
    const planningKeywords = ["确定", "决定", "方案", "设计", "计划", "开始实现", "准备"];
    const isPlanningEvent = planningKeywords.some(kw => event.includes(kw));

    if (nodeType === "planning") {
      if (status === "planning" && childCount === 0 && isPlanningEvent) {
        return "💡 看起来方案已确定。规划节点的下一步是使用 node_create 创建子节点来分解任务。";
      }
      if (status === "monitoring") {
        return "💡 规划节点正在监控子节点执行。等待所有子节点完成后可以 complete 汇总结论。";
      }
    } else if (nodeType === "execution") {
      if (status === "implementing") {
        if (isPlanningEvent) {
          return "💡 执行节点应聚焦于具体执行而非规划。如果任务需要分解，请 fail 回退到父规划节点。";
        }
        return "💡 继续执行任务，完成后调用 node_transition(action=\"complete\", conclusion=\"...\")。";
      }
    }

    return "";
  }

  /**
   * 更新问题
   */
  async updateProblem(params: ProblemUpdateParams): Promise<ProblemUpdateResult> {
    const { workspaceId, nodeId, problem, nextStep } = params;

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 如果有 nodeId，验证节点存在并获取目录名
    let nodeDirName: string | undefined;
    if (nodeId) {
      const graph = await this.json.readGraph(projectRoot, wsDirName);
      const nodeMeta = graph.nodes[nodeId];
      if (!nodeMeta) {
        throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
      }
      nodeDirName = nodeMeta.dirName || nodeId;  // 向后兼容
    }

    // 3. 构造 Problem.md 内容
    const problemData = {
      currentProblem: problem,
      nextStep: nextStep || "（暂无）",
    };

    // 4. 写入对应的 Problem.md
    await this.md.writeProblem(projectRoot, wsDirName, problemData, nodeDirName);

    // 5. 追加日志
    const timestamp = formatShort(now());
    await this.md.appendTypedLogEntry(projectRoot, wsDirName, {
      timestamp,
      operator: "AI",
      event: `更新问题: ${problem.substring(0, 50)}${problem.length > 50 ? "..." : ""}`,
    }, nodeDirName);

    // 6. 推送 SSE 事件通知前端
    eventService.emitNodeUpdate(workspaceId, nodeId);

    // 7. 返回结果
    return {
      success: true,
      hint: "💡 问题已记录。如果问题复杂且当前是执行节点，考虑 fail 后回到父规划节点重新分解；如果问题已解决，使用 problem_clear 清空。",
    };
  }

  /**
   * 清空问题
   */
  async clearProblem(params: ProblemClearParams): Promise<ProblemClearResult> {
    const { workspaceId, nodeId } = params;

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 如果有 nodeId，验证节点存在并获取目录名
    let nodeDirName: string | undefined;
    if (nodeId) {
      const graph = await this.json.readGraph(projectRoot, wsDirName);
      const nodeMeta = graph.nodes[nodeId];
      if (!nodeMeta) {
        throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
      }
      nodeDirName = nodeMeta.dirName || nodeId;  // 向后兼容
    }

    // 3. 写入空模板到 Problem.md
    await this.md.writeProblem(projectRoot, wsDirName, {
      currentProblem: "（暂无）",
      nextStep: "（暂无）",
    }, nodeDirName);

    // 4. 追加日志
    const timestamp = formatShort(now());
    await this.md.appendTypedLogEntry(projectRoot, wsDirName, {
      timestamp,
      operator: "AI",
      event: "清空问题",
    }, nodeDirName);

    // 5. 推送 SSE 事件通知前端
    eventService.emitNodeUpdate(workspaceId, nodeId);

    // 6. 返回结果
    return {
      success: true,
    };
  }
}
