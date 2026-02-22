// web/src/api/settings.ts
// 全局配置相关 API

import client from './client'

export interface GlobalSettings {
  version: '1.0'
  defaultDispatchMode: 'none' | 'enabled'
  tutorialVersion?: string  // 已创建的教程版本
  security?: {
    allowUnboundWrite?: boolean  // 允许未绑定会话执行写操作
  }
}

export interface SettingsGetResult {
  config: GlobalSettings
}

export interface SettingsUpdateResult {
  success: boolean
  config: GlobalSettings
}

export interface TutorialTriggerResult {
  created: boolean
  message: string
}

// 组件状态（组件级版本跟踪）
export interface ComponentStatus {
  installed: boolean
  version: string | null
  outdated: boolean
  supported: boolean  // 该平台是否支持此组件
}

// 平台组件状态
export interface PlatformComponents {
  mcp: ComponentStatus
  hooks?: ComponentStatus   // Claude Code / Cursor 用 hooks
  plugins?: ComponentStatus // OpenCode 用 plugins
  agents: ComponentStatus
  skills: ComponentStatus
}

// 平台安装状态
export interface PlatformStatus {
  name: string
  enabled: boolean
  components: PlatformComponents
}

// 安装状态响应（移除 codex）
export interface InstallationStatusResult {
  currentVersion: string
  platforms: {
    claudeCode: PlatformStatus
    cursor: PlatformStatus
    opencode: PlatformStatus
  }
  updateCommand: string
}

// 安装步骤结果
export interface InstallStep {
  name: string
  success: boolean
  message?: string
}

// 平台安装结果
export interface PlatformResult {
  platform: string
  steps: InstallStep[]
}

// 安装接口响应
export interface SetupInstallResponse {
  success: boolean
  results?: PlatformResult[]
  error?: string
}

export const settingsApi = {
  /**
   * 获取全局配置
   */
  async getSettings(): Promise<SettingsGetResult> {
    return client.get('/config')
  },

  /**
   * 更新全局配置
   */
  async updateSettings(params: {
    defaultDispatchMode?: 'none' | 'enabled'
    security?: {
      allowUnboundWrite?: boolean
    }
  }): Promise<SettingsUpdateResult> {
    return client.put('/config', params)
  },

  /**
   * 手动触发创建教程工作区
   */
  async triggerTutorial(): Promise<TutorialTriggerResult> {
    return client.post('/tutorial/trigger')
  },

  /**
   * 获取插件安装状态
   */
  async getInstallationStatus(): Promise<InstallationStatusResult> {
    return client.get('/installation-status')
  },

  /**
   * 执行平台安装
   * @param platforms 要安装的平台列表，如 ['claude-code', 'cursor', 'opencode']
   */
  async install(platforms: string[]): Promise<SetupInstallResponse> {
    return client.post('/setup/install', { platforms })
  },
}
