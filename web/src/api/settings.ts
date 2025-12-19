// web/src/api/settings.ts
// 全局配置相关 API

import client from './client'

export interface GlobalSettings {
  version: '1.0'
  defaultDispatchMode: 'none' | 'git' | 'no-git'
}

export interface SettingsGetResult {
  config: GlobalSettings
}

export interface SettingsUpdateResult {
  success: boolean
  config: GlobalSettings
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
}
