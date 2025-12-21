<template>
  <button
    :class="buttonClass"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="loading-spinner"></span>
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger' | 'icon' | 'cancel'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false
})

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const buttonClass = computed(() => {
  const classes = ['ws-button']

  // Variant class
  switch (props.variant) {
    case 'primary':
      classes.push('btn-primary')
      break
    case 'secondary':
      classes.push('btn-secondary')
      break
    case 'ghost':
      classes.push('btn-ghost')
      break
    case 'accent':
      classes.push('btn-accent')
      break
    case 'danger':
      classes.push('btn-danger')
      break
    case 'icon':
      classes.push('btn-icon')
      break
    case 'cancel':
      classes.push('btn-cancel')
      break
  }

  if (props.loading) {
    classes.push('is-loading')
  }

  // Size class
  classes.push(`btn-${props.size}`)

  return classes.join(' ')
})

const handleClick = (event: MouseEvent) => {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>

<style scoped>
.ws-button {
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-weight: 500;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.ws-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Primary - 黑底白字 */
.btn-primary {
  background: var(--border-heavy);
  color: #fff;
  border: 1px solid var(--border-heavy);
  padding: 8px 20px;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-red);
  border-color: var(--accent-red);
  transform: translateY(-1px);
  box-shadow: 2px 2px 0 #111;
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: none;
}

/* Secondary - 白底黑边 */
.btn-secondary {
  background: var(--card-bg);
  color: var(--text-main);
  border: 1px solid var(--border-heavy);
  padding: 8px 20px;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--path-bg);
  transform: translateY(-1px);
  box-shadow: 2px 2px 0 var(--border-heavy);
}

.btn-secondary:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: none;
}

/* Ghost - 透明底 */
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
  padding: 8px 20px;
}

.btn-ghost:hover:not(:disabled) {
  color: var(--text-main);
  background: var(--path-bg);
}

.btn-ghost:active:not(:disabled) {
  transform: translateY(0);
}

/* Accent - 红色文字 */
.btn-accent {
  background: transparent;
  color: var(--accent-red);
  border: 1px solid transparent;
  padding: 8px 20px;
}

.btn-accent:hover:not(:disabled) {
  background: #fff5f5;
}

[data-theme="dark"] .btn-accent:hover:not(:disabled) {
  background: rgba(217, 43, 43, 0.2);
}

.btn-accent:active:not(:disabled) {
  transform: translateY(0);
}

/* Danger - 透明底灰色文字，hover变红 */
.btn-danger {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
  padding: 8px 20px;
}

.btn-danger:hover:not(:disabled) {
  color: var(--accent-red);
  background: #fff5f5;
}

[data-theme="dark"] .btn-danger:hover:not(:disabled) {
  background: rgba(217, 43, 43, 0.2);
}

.btn-danger:active:not(:disabled) {
  transform: translateY(0);
}

/* Icon - 方形图标按钮 36x36 */
.btn-icon {
  background: var(--card-bg);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  width: 36px;
  height: 36px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover:not(:disabled) {
  border-color: var(--border-heavy);
  color: var(--accent-red);
}

.btn-icon:active:not(:disabled) {
  transform: scale(0.95);
}

/* Cancel - 白底灰边 */
.btn-cancel {
  background: var(--card-bg);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  padding: 8px 20px;
}

.btn-cancel:hover:not(:disabled) {
  border-color: var(--text-secondary);
  color: var(--text-main);
}

.btn-cancel:active:not(:disabled) {
  transform: translateY(0);
}

/* Loading State */
.is-loading {
  pointer-events: none;
  opacity: 0.7;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Dark Mode Overrides */
[data-theme="dark"] .btn-primary {
  background: #fff;
  border-color: #fff;
  color: #111;
}

[data-theme="dark"] .btn-primary:hover:not(:disabled) {
  background: var(--accent-red);
  border-color: var(--accent-red);
  color: #fff;
  box-shadow: 2px 2px 0 #fff;
}

/* Sizes */
.btn-sm {
  font-size: 13px;
}

.btn-sm:not(.btn-icon) {
  padding: 6px 16px;
}

.btn-md {
  font-size: 14px;
}

.btn-lg {
  font-size: 15px;
}

.btn-lg:not(.btn-icon) {
  padding: 10px 24px;
}
</style>
