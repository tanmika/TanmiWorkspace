// web/src/stores/settings.ts
// 全局配置状态管理

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { settingsApi, type GlobalSettings } from '@/api/settings'

export const useSettingsStore = defineStore('settings', () => {
  // 状态
  const settings = ref<GlobalSettings>({
    version: '1.0',
    defaultDispatchMode: 'none',
  })
  const loading = ref(false)

  // 加载配置
  async function loadSettings() {
    loading.value = true
    try {
      const result = await settingsApi.getSettings()
      settings.value = result.config
    } finally {
      loading.value = false
    }
  }

  // 更新配置
  async function updateSettings(params: {
    defaultDispatchMode?: 'none' | 'git' | 'no-git'
  }) {
    loading.value = true
    try {
      const result = await settingsApi.updateSettings(params)
      settings.value = result.config
    } finally {
      loading.value = false
    }
  }

  return {
    settings,
    loading,
    loadSettings,
    updateSettings,
  }
})
