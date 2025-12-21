<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

interface Props {
  visible: boolean
  type?: ToastType
  title: string
  message?: string
  duration?: number // 毫秒，0 表示不自动关闭
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  duration: 5000,
})

const emit = defineEmits<{
  close: []
}>()

const show = ref(props.visible)
const progress = ref(100)
let timer: ReturnType<typeof setTimeout> | null = null
let progressTimer: ReturnType<typeof setInterval> | null = null

// 类型配置
const typeConfig = {
  info: { badge: 'INFO', color: 'var(--accent-blue)' },
  success: { badge: 'DONE', color: 'var(--accent-green)' },
  warning: { badge: 'WARN', color: 'var(--accent-orange)' },
  error: { badge: 'ERR', color: 'var(--accent-red)' },
}

const config = typeConfig[props.type]

watch(
  () => props.visible,
  (newVal) => {
    show.value = newVal
    if (newVal && props.duration > 0) {
      startTimer()
    }
  },
  { immediate: true }
)

function startTimer() {
  clearTimers()
  progress.value = 100

  // 进度条动画
  const interval = 50
  const step = (100 * interval) / props.duration
  progressTimer = setInterval(() => {
    progress.value -= step
    if (progress.value <= 0) {
      progress.value = 0
    }
  }, interval)

  // 自动关闭
  timer = setTimeout(() => {
    handleClose()
  }, props.duration)
}

function clearTimers() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
}

function handleClose() {
  clearTimers()
  show.value = false
  emit('close')
}

onUnmounted(() => {
  clearTimers()
})
</script>

<template>
  <Transition name="slide-up">
    <div v-if="show" class="ws-toast" :class="type">
      <div class="toast-header">
        <div class="toast-title">
          <span class="toast-badge">{{ config.badge }}</span>
          {{ title }}
        </div>
        <button class="toast-close" @click="handleClose" title="关闭">×</button>
      </div>
      <div v-if="message" class="toast-body">{{ message }}</div>
      <div v-if="duration > 0" class="toast-progress">
        <div class="toast-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ws-toast {
  max-width: 380px;
  background: var(--card-bg);
  border: 2px solid var(--border-heavy);
  border-left: 6px solid var(--accent-blue);
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.1);
  padding: 16px 20px;
  position: relative;
}

.ws-toast.success {
  border-left-color: var(--accent-green);
}

.ws-toast.warning {
  border-left-color: var(--accent-orange);
}

.ws-toast.error {
  border-left-color: var(--accent-red);
}

.toast-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toast-title {
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-main);
}

.toast-badge {
  font-family: var(--mono-font), monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  background: var(--accent-blue);
  color: #fff;
  text-transform: uppercase;
}

.ws-toast.success .toast-badge {
  background: var(--accent-green);
}

.ws-toast.warning .toast-badge {
  background: var(--accent-orange);
  color: #000;
}

.ws-toast.error .toast-badge {
  background: var(--accent-red);
}

.toast-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0;
  line-height: 1;
}

.toast-close:hover {
  color: var(--text-main);
}

.toast-body {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 6px;
  right: 2px;
  height: 3px;
  background: var(--border-color);
}

.toast-progress-bar {
  height: 100%;
  background: var(--accent-blue);
  transition: width 0.05s linear;
}

.ws-toast.success .toast-progress-bar {
  background: var(--accent-green);
}

.ws-toast.warning .toast-progress-bar {
  background: var(--accent-orange);
}

.ws-toast.error .toast-progress-bar {
  background: var(--accent-red);
}

/* 动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from {
  transform: translateY(20px);
  opacity: 0;
}

.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
