// src/services/SessionService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type { SessionBindingStorage, SessionBinding } from "../storage/SessionBindingStorage.js";
import type { InstallationService } from "./InstallationService.js";
import type { InstallationWarning } from "../types/settings.js";
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
  installationWarnings?: InstallationWarning[];
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
 * get_pending_changes 参数
 */
export interface GetPendingChangesParams {
  sessionId: string;
  workspaceId?: string;
}

/**
 * get_pending_changes 返回值
 */
export interface GetPendingChangesResult {
  hasChanges: boolean;
  reminderText: string;
}

/**
 * 会话服务
 * 管理 Claude Code 会话与工作区的绑定关系
 */
export class SessionService {
  private installationService: InstallationService | null = null;

  constructor(
    private sessionStorage: SessionBindingStorage,
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 设置 InstallationService 依赖（延迟注入避免循环依赖）
   */
  setInstallationService(service: InstallationService): void {
    this.installationService = service;
  }

  /**
   * 绑定会话到工作区
   */
  async bind(params: SessionBindParams): Promise<SessionBindResult> {
    const { sessionId, workspaceId, nodeId } = params;

    // 验证工作区存在并获取位置信息
    const location = await this.json.getWorkspaceLocation(workspaceId);
    if (!location) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    const { projectRoot, dirName } = location;

    // 验证项目目录存在
    const workspacePath = this.fs.getWorkspacePath(projectRoot, dirName);
    if (!(await this.fs.exists(workspacePath))) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 的项目目录不存在`);
    }

    // 如果指定了节点，验证节点存在并同步到 graph.currentFocus
    if (nodeId) {
      const graph = await this.json.readGraph(projectRoot, dirName);
      if (!graph.nodes[nodeId]) {
        throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
      }
      // 同步聚焦节点到 graph.currentFocus，确保单一数据源
      if (graph.currentFocus !== nodeId) {
        graph.currentFocus = nodeId;
        await this.json.writeGraph(projectRoot, dirName, graph);
      }
    }

    // 获取工作区名称
    const config = await this.json.readWorkspaceConfig(projectRoot, dirName);

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
        const location = await this.json.getWorkspaceLocation(currentBinding.workspaceId);
        if (location) {
          const config = await this.json.readWorkspaceConfig(location.projectRoot, location.dirName);
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
    const location = await this.json.getWorkspaceLocation(binding.workspaceId);
    if (!location) {
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
    const { projectRoot, dirName } = location;

    // 获取工作区信息
    const config = await this.json.readWorkspaceConfig(projectRoot, dirName);
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, dirName);
    const graph = await this.json.readGraph(projectRoot, dirName);

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
      const nodeDirName = graph.nodes[focusNodeId].dirName || focusNodeId;
      const nodeInfo = await this.md.readNodeInfo(projectRoot, dirName, nodeDirName);
      result.focusedNode = {
        id: focusNodeId,
        title: nodeInfo.title,
        status: graph.nodes[focusNodeId].status,
        requirement: nodeInfo.requirement
      };
    }

    // 检查安装警告
    const warnings = await this.checkInstallationWarnings();
    if (warnings.length > 0) {
      result.installationWarnings = warnings;
    }

    return result;
  }

  /**
   * 检查安装版本警告
   */
  private async checkInstallationWarnings(): Promise<InstallationWarning[]> {
    if (!this.installationService) {
      return [];
    }

    const warnings: InstallationWarning[] = [];

    try {
      const meta = await this.installationService.read();
      const currentVersion = this.installationService.getPackageVersion();

      // 检查各平台版本
      for (const platform of ["claudeCode", "cursor", "codex"] as const) {
        const platformInfo = meta.global.platforms[platform];
        if (platformInfo?.enabled && platformInfo.version !== currentVersion) {
          // 版本不匹配，检查各组件
          if (platformInfo.components.hooks) {
            warnings.push({
              platform,
              component: "hooks",
              installedVersion: platformInfo.version,
              currentVersion,
              message: `${platform} Hook 版本过旧 (${platformInfo.version} → ${currentVersion})，建议更新`,
            });
          }
          if (platformInfo.components.mcp) {
            warnings.push({
              platform,
              component: "mcp",
              installedVersion: platformInfo.version,
              currentVersion,
              message: `${platform} MCP 版本过旧 (${platformInfo.version} → ${currentVersion})`,
            });
          }
        }
      }
    } catch {
      // 检查失败时静默，不影响主功能
    }

    return warnings;
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

  /**
   * 获取待处理的手动变更提醒（供 Hook 脚本调用）
   */
  async getPendingChanges(params: GetPendingChangesParams): Promise<GetPendingChangesResult> {
    const { sessionId, workspaceId: explicitWorkspaceId } = params;

    // 确定工作区 ID：优先使用显式传入的，否则从 session 绑定获取
    let workspaceId = explicitWorkspaceId;
    if (!workspaceId) {
      const binding = await this.sessionStorage.getBinding(sessionId);
      if (!binding) {
        // 未绑定且未提供工作区 ID，返回空结果
        return {
          hasChanges: false,
          reminderText: ""
        };
      }
      workspaceId = binding.workspaceId;
    }

    // 获取工作区位置信息
    const location = await this.json.getWorkspaceLocation(workspaceId);
    if (!location) {
      // 工作区不存在，返回空结果
      return {
        hasChanges: false,
        reminderText: ""
      };
    }
    const { projectRoot, dirName } = location;

    // 读取工作区配置
    try {
      const config = await this.json.readWorkspaceConfig(projectRoot, dirName);
      const manualChanges = config.pendingManualChanges || [];

      if (manualChanges.length === 0) {
        return {
          hasChanges: false,
          reminderText: ""
        };
      }

      // 导入 formatter 并格式化提醒文本
      const { formatManualChangeReminder } = await import("../utils/manualChangeFormatter.js");
      const reminderText = formatManualChangeReminder(manualChanges);

      return {
        hasChanges: true,
        reminderText
      };
    } catch {
      // 读取失败时返回空结果
      return {
        hasChanges: false,
        reminderText: ""
      };
    }
  }
}
