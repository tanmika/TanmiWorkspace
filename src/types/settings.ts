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
 * 组件安装信息
 */
export interface ComponentInfo {
  installed: boolean;
  version?: string;  // 安装时的版本，未安装时为 undefined
}

/**
 * 平台组件安装信息
 */
export interface PlatformInstallation {
  enabled: boolean;
  installedAt: string;  // ISO timestamp
  components: {
    hooks: ComponentInfo;
    mcp: ComponentInfo;
    agents?: ComponentInfo;    // Claude Code 特有（dispatch agents）
    skills?: ComponentInfo;    // Claude Code 特有（skills 模板）
    agentsMd?: ComponentInfo;  // Codex 特有
    modes?: ComponentInfo;     // Cursor 特有
  };
}

/**
 * 安装元信息
 * 记录全局组件安装状态
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
