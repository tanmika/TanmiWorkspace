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
}
