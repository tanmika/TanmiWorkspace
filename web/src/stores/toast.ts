// Toast 通知状态管理
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useToastStore = defineStore('toast', () => {
  const showManualOperationToast = ref(false)

  /**
   * 显示手动操作提示
   */
  function showToast() {
    showManualOperationToast.value = true
  }

  /**
   * 关闭提示
   */
  function closeToast() {
    showManualOperationToast.value = false
  }

  return {
    showManualOperationToast,
    showToast,
    closeToast,
  }
})
