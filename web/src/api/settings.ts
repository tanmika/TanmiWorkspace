// web/src/api/settings.ts
// 全局配置相关 API

import client from './client'

export interface GlobalSettings {
  version: '1.0'
  defaultDispatchMode: 'none' | 'git' | 'no-git'
  tutorialVersion?: string  // 已创建的教程版本
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

// 平台组件状态
export interface PlatformComponents {
  hooks: boolean
  mcp: boolean
  agents: boolean
  skills: boolean
}

// 平台安装状态
export interface PlatformStatus {
  name: string
  enabled: boolean
  version: string | null
  needsUpdate: boolean
  components: PlatformComponents
}

// 安装状态响应
export interface InstallationStatusResult {
  currentVersion: string
  platforms: {
    claudeCode: PlatformStatus
    cursor: PlatformStatus
    codex: PlatformStatus
  }
  updateCommand: string
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
    defaultDispatchMode?: 'none' | 'git' | 'no-git'
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
}
