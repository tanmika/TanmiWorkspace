<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const show = ref(props.visible)
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.visible,
  (newVal) => {
    show.value = newVal
    if (newVal) {
      // 5 秒后自动关闭
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        handleClose()
      }, 5000)
    }
  }
)

function handleClose() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  show.value = false
  emit('close')
}
</script>

<template>
  <Transition name="slide-up">
    <div v-if="show" class="manual-operation-toast">
      <div class="toast-content">
        <span class="toast-icon">!</span>
        <div class="toast-text">
          <div class="toast-title">操作已记录</div>
          <div class="toast-message">
            您刚刚进行了手动操作。AI 将在下次工具调用时收到通知。
          </div>
          <div class="toast-hint">如需 AI 立即响应，建议主动告知</div>
        </div>
        <button class="close-btn" @click="handleClose" title="关闭">✕</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.manual-operation-toast {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  max-width: 400px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  overflow: hidden;
}

.toast-content {
  background: white;
  border-left: 4px solid #409eff;
  padding: 16px 20px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.toast-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.toast-text {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
  margin-bottom: 4px;
}

.toast-message {
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
  margin-bottom: 4px;
}

.toast-hint {
  font-size: 12px;
  color: #909399;
  font-style: italic;
}

.close-btn {
  background: transparent;
  border: none;
  color: #909399;
  cursor: pointer;
  padding: 4px;
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.close-btn:hover {
  opacity: 1;
}

/* 动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
