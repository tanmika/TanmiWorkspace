// src/types/settings.ts

/**
 * 全局配置接口
 * 存储在 ~/.tanmi-workspace/config.json
 */
export interface GlobalConfig {
  version: "1.0";
  defaultDispatchMode: "none" | "git" | "no-git";
  tutorialCreated?: boolean;  // 教程工作区是否已创建（只创建一次）
  tutorialVersion?: string;   // 上次运行的系统版本，版本变更时创建更新工作区
}

/**
 * 默认全局配置
 */
export const DEFAULT_CONFIG: GlobalConfig = {
  version: "1.0",
  defaultDispatchMode: "none",  // 默认不启用派发
};

/**
 * config_get 输出
 */
export interface ConfigGetResult {
  config: GlobalConfig;
}

/**
 * config_set 输入
 */
export interface ConfigSetParams {
  defaultDispatchMode?: "none" | "git" | "no-git";
}

/**
 * config_set 输出
 */
export interface ConfigSetResult {
  success: boolean;
  config: GlobalConfig;
}

// ============================================================================
// Installation Meta - 版本跟踪
// 存储在 ~/.tanmi-workspace/installation-meta.json
// ============================================================================

/**
 * 支持的平台类型
 */
export type PlatformType = "claudeCode" | "cursor" | "codex";

/**
 * 平台组件安装信息
 */
export interface PlatformInstallation {
  enabled: boolean;
  installedAt: string;  // ISO timestamp
  version: string;      // 安装时的包版本，如 "1.7.2"
  components: {
    hooks: boolean;
    mcp: boolean;
    agentsMd?: boolean;  // Codex 特有
    modes?: boolean;     // Cursor 特有
  };
}

/**
 * 项目组件安装信息
 */
export interface ProjectInstallation {
  installedAt: string;  // ISO timestamp
  version: string;      // 安装时的包版本
  agents: boolean;      // tanmi-executor + tanmi-tester agents
  skills: boolean;      // skills 是否已安装（预留）
}

/**
 * 安装元信息
 * 记录全局和项目级别的组件安装状态
 */
export interface InstallationMeta {
  schemaVersion: "1.0";
  global: {
    installedAt: string;     // 首次安装时间
    lastUpdatedAt: string;   // 最后更新时间
    packageVersion: string;  // 当前包版本
    platforms: {
      claudeCode?: PlatformInstallation;
      cursor?: PlatformInstallation;
      codex?: PlatformInstallation;
    };
  };
  projects?: {
    [projectPath: string]: ProjectInstallation;
  };
}

/**
 * 默认安装元信息
 */
export const DEFAULT_INSTALLATION_META: InstallationMeta = {
  schemaVersion: "1.0",
  global: {
    installedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    packageVersion: "0.0.0",
    platforms: {},
  },
};

/**
 * 组件类型
 */
export type ComponentType = "hooks" | "mcp" | "agents" | "skills";

/**
 * 安装警告
 */
export interface InstallationWarning {
  platform: PlatformType;
  component: ComponentType;
  installedVersion: string;
  currentVersion: string;
  message: string;
}
