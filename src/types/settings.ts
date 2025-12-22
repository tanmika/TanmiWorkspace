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
