// 服务状态管理
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useServiceStore = defineStore('service', () => {
  // 服务是否可用
  const isAvailable = ref(true)
  // 上次检查时间
  const lastCheckTime = ref<number>(0)
  // 检查间隔（避免频繁检查）
  const CHECK_INTERVAL = 5000

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
        return true
      }
    } catch {
      // 网络错误或超时
    }
    markUnavailable()
    return false
  }

  return {
    isAvailable,
    lastCheckTime,
    markUnavailable,
    markAvailable,
    checkHealth,
  }
})
