// src/services/SessionService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type { SessionBindingStorage, SessionBinding } from "../storage/SessionBindingStorage.js";
import { TanmiError } from "../types/errors.js";

/**
 * session_bind 参数
 */
export interface SessionBindParams {
  sessionId: string;
  workspaceId: string;
  nodeId?: string;
}

/**
 * session_bind 返回值
 */
export interface SessionBindResult {
  success: true;
  message: string;
  binding: SessionBinding;
}

/**
 * session_unbind 参数
 */
export interface SessionUnbindParams {
  sessionId: string;
}

/**
 * session_unbind 返回值
 */
export interface SessionUnbindResult {
  success: true;
  message: string;
}

/**
 * session_status 参数
 */
export interface SessionStatusParams {
  sessionId: string;
}

/**
 * session_status 返回值（已绑定）
 */
export interface SessionStatusBoundResult {
  bound: true;
  workspace: {
    id: string;
    name: string;
    goal: string;
  };
  focusedNode?: {
    id: string;
    title: string;
    status: string;
    requirement?: string;
  };
  rules: string[];
}

/**
 * session_status 返回值（未绑定）
 */
export interface SessionStatusUnboundResult {
  bound: false;
  availableWorkspaces: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

export type SessionStatusResult = SessionStatusBoundResult | SessionStatusUnboundResult;

/**
 * 会话服务
 * 管理 Claude Code 会话与工作区的绑定关系
 */
export class SessionService {
  constructor(
    private sessionStorage: SessionBindingStorage,
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 绑定会话到工作区
   */
  async bind(params: SessionBindParams): Promise<SessionBindResult> {
    const { sessionId, workspaceId, nodeId } = params;

    // 验证工作区存在
    const projectRoot = await this.json.getProjectRoot(workspaceId);
    if (!projectRoot) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    // 验证项目目录存在
    const workspacePath = this.fs.getWorkspacePath(projectRoot, workspaceId);
    if (!(await this.fs.exists(workspacePath))) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 的项目目录不存在`);
    }

    // 如果指定了节点，验证节点存在并同步到 graph.currentFocus
    if (nodeId) {
      const graph = await this.json.readGraph(projectRoot, workspaceId);
      if (!graph.nodes[nodeId]) {
        throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
      }
      // 同步聚焦节点到 graph.currentFocus，确保单一数据源
      if (graph.currentFocus !== nodeId) {
        graph.currentFocus = nodeId;
        await this.json.writeGraph(projectRoot, workspaceId, graph);
      }
    }

    // 获取工作区名称
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);

    // 执行绑定
    const binding = await this.sessionStorage.bind(sessionId, workspaceId, nodeId);

    return {
      success: true,
      message: `已绑定到工作区「${config.name}」`,
      binding
    };
  }

  /**
   * 解除会话绑定
   */
  async unbind(params: SessionUnbindParams): Promise<SessionUnbindResult> {
    const { sessionId } = params;

    // 获取当前绑定信息（用于消息提示）
    const currentBinding = await this.sessionStorage.getBinding(sessionId);

    // 执行解绑
    const success = await this.sessionStorage.unbind(sessionId);

    if (!success) {
      return {
        success: true,
        message: "当前会话未绑定任何工作区"
      };
    }

    // 尝试获取工作区名称（可能已删除）
    let workspaceName = "未知";
    if (currentBinding) {
      try {
        const projectRoot = await this.json.getProjectRoot(currentBinding.workspaceId);
        if (projectRoot) {
          const config = await this.json.readWorkspaceConfig(projectRoot, currentBinding.workspaceId);
          workspaceName = config.name;
        }
      } catch {
        // 忽略错误
      }
    }

    return {
      success: true,
      message: `已解除工作区「${workspaceName}」绑定，Hook 将不再注入上下文`
    };
  }

  /**
   * 查询会话状态
   */
  async status(params: SessionStatusParams): Promise<SessionStatusResult> {
    const { sessionId } = params;

    // 获取当前绑定
    const binding = await this.sessionStorage.getBinding(sessionId);

    if (!binding) {
      // 未绑定，返回可用工作区列表
      const index = await this.json.readIndex();
      const availableWorkspaces = index.workspaces
        .filter(ws => ws.status === "active")
        .map(ws => ({
          id: ws.id,
          name: ws.name,
          status: ws.status
        }));

      return {
        bound: false,
        availableWorkspaces
      };
    }

    // 已绑定，获取详细信息
    const projectRoot = await this.json.getProjectRoot(binding.workspaceId);
    if (!projectRoot) {
      // 工作区已删除，自动清理绑定
      await this.sessionStorage.unbind(sessionId);
      const index = await this.json.readIndex();
      return {
        bound: false,
        availableWorkspaces: index.workspaces
          .filter(ws => ws.status === "active")
          .map(ws => ({
            id: ws.id,
            name: ws.name,
            status: ws.status
          }))
      };
    }

    // 获取工作区信息
    const config = await this.json.readWorkspaceConfig(projectRoot, binding.workspaceId);
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, binding.workspaceId);
    const graph = await this.json.readGraph(projectRoot, binding.workspaceId);

    const result: SessionStatusBoundResult = {
      bound: true,
      workspace: {
        id: binding.workspaceId,
        name: config.name,
        goal: workspaceMdData.goal
      },
      rules: workspaceMdData.rules
    };

    // 获取聚焦节点信息（优先使用 graph.currentFocus 作为权威来源）
    const focusNodeId = graph.currentFocus || binding.focusedNodeId;
    if (focusNodeId && graph.nodes[focusNodeId]) {
      const nodeInfo = await this.md.readNodeInfo(projectRoot, binding.workspaceId, focusNodeId);
      result.focusedNode = {
        id: focusNodeId,
        title: nodeInfo.title,
        status: graph.nodes[focusNodeId].status,
        requirement: nodeInfo.requirement
      };
    }

    return result;
  }

  /**
   * 更新聚焦节点
   */
  async updateFocus(sessionId: string, nodeId: string): Promise<boolean> {
    return this.sessionStorage.updateFocus(sessionId, nodeId);
  }

  /**
   * 清理过期会话绑定
   */
  async cleanup(maxAgeMs?: number): Promise<string[]> {
    return this.sessionStorage.cleanup(maxAgeMs);
  }

  /**
   * 清理指定工作区的所有会话绑定
   */
  async cleanupByWorkspace(workspaceId: string): Promise<string[]> {
    return this.sessionStorage.cleanupByWorkspace(workspaceId);
  }
}
