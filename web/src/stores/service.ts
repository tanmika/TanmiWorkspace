// 服务状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 前端编译时注入的版本号
declare const __APP_VERSION__: string
const FRONTEND_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'

export const useServiceStore = defineStore('service', () => {
  // 服务是否可用
  const isAvailable = ref(true)
  // 上次检查时间
  const lastCheckTime = ref<number>(0)
  // 检查间隔（避免频繁检查）
  const CHECK_INTERVAL = 5000

  // 版本信息
  const backendVersion = ref<string | null>(null)
  const versionMismatch = computed(() => {
    if (!backendVersion.value || FRONTEND_VERSION === 'unknown') {
      return false
    }
    return backendVersion.value !== FRONTEND_VERSION
  })

  // 标记服务不可用
  function markUnavailable() {
    isAvailable.value = false
    lastCheckTime.value = Date.now()
  }

  // 标记服务可用
  function markAvailable() {
    isAvailable.value = true
    lastCheckTime.value = Date.now()
  }

  // 检查服务状态
  async function checkHealth(): Promise<boolean> {
    // 避免频繁检查
    if (Date.now() - lastCheckTime.value < CHECK_INTERVAL) {
      return isAvailable.value
    }

    try {
      const response = await fetch('/health', {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      })
      if (response.ok) {
        markAvailable()
        // 同时检查版本
        checkVersion()
        return true
      }
    } catch {
      // 网络错误或超时
    }
    markUnavailable()
    return false
  }

  // 检查后端版本
  async function checkVersion(): Promise<void> {
    try {
      const response = await fetch('/api/version', {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      })
      if (response.ok) {
        const data = await response.json()
        backendVersion.value = data.currentVersion || null
      }
    } catch {
      // 忽略错误
    }
  }

  return {
    isAvailable,
    lastCheckTime,
    backendVersion,
    frontendVersion: FRONTEND_VERSION,
    versionMismatch,
    markUnavailable,
    markAvailable,
    checkHealth,
    checkVersion,
  }
})
