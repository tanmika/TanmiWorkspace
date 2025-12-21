// Toast 通知状态管理
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastItem {
  id: number
  type: ToastType
  title: string
  message?: string
  duration: number
}

let toastId = 0

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<ToastItem[]>([])

  // 旧的手动操作提示兼容
  const showManualOperationToast = ref(false)

  /**
   * 显示 Toast
   * 默认时间：有 message 时 4000ms，仅标题时 2500ms
   */
  function show(type: ToastType, title: string, message?: string, duration?: number) {
    const id = ++toastId
    const defaultDuration = message ? 4000 : 2500
    toasts.value.push({ id, type, title, message, duration: duration ?? defaultDuration })
    return id
  }

  /**
   * 快捷方法
   */
  function info(title: string, message?: string, duration?: number) {
    return show('info', title, message, duration)
  }

  function success(title: string, message?: string, duration?: number) {
    return show('success', title, message, duration)
  }

  function warning(title: string, message?: string, duration?: number) {
    return show('warning', title, message, duration)
  }

  function error(title: string, message?: string, duration?: number) {
    return show('error', title, message, duration)
  }

  /**
   * 关闭指定 Toast
   */
  function close(id: number) {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }

  /**
   * 清空所有 Toast
   */
  function clearAll() {
    toasts.value = []
  }

  /**
   * 旧的手动操作提示兼容
   */
  function showToast() {
    showManualOperationToast.value = true
  }

  function closeToast() {
    showManualOperationToast.value = false
  }

  return {
    toasts,
    showManualOperationToast,
    show,
    info,
    success,
    warning,
    error,
    close,
    clearAll,
    showToast,
    closeToast,
  }
})
