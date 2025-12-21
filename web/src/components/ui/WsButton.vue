<template>
  <button
    :class="buttonClass"
    :disabled="disabled"
    @click="handleClick"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger' | 'icon'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false
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
  color: var(--card-bg);
  padding: 8px 20px;
  border-radius: 4px;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.85;
}

.btn-primary:active:not(:disabled) {
  transform: translateY(1px);
}

/* Secondary - 白底黑边 */
.btn-secondary {
  background: var(--card-bg);
  color: var(--text-main);
  border: 1px solid var(--border-heavy);
  padding: 8px 20px;
  border-radius: 4px;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-color);
}

.btn-secondary:active:not(:disabled) {
  transform: translateY(1px);
}

/* Ghost - 透明底 */
.btn-ghost {
  background: transparent;
  color: var(--text-main);
  padding: 8px 20px;
  border-radius: 4px;
}

.btn-ghost:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
}

[data-theme="dark"] .btn-ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
}

.btn-ghost:active:not(:disabled) {
  transform: translateY(1px);
}

/* Accent - 红色 */
.btn-accent {
  background: transparent;
  color: var(--accent-red);
  padding: 8px 20px;
  border-radius: 4px;
  border: 1px solid var(--accent-red);
}

.btn-accent:hover:not(:disabled) {
  background: var(--accent-red);
  color: white;
}

.btn-accent:active:not(:disabled) {
  transform: translateY(1px);
}

/* Danger - 红底白字 */
.btn-danger {
  background: var(--accent-red);
  color: white;
  padding: 8px 20px;
  border-radius: 4px;
}

.btn-danger:hover:not(:disabled) {
  opacity: 0.85;
}

.btn-danger:active:not(:disabled) {
  transform: translateY(1px);
}

/* Icon - 方形图标按钮 32x32 */
.btn-icon {
  background: transparent;
  color: var(--text-main);
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
}

[data-theme="dark"] .btn-icon:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
}

.btn-icon:active:not(:disabled) {
  transform: scale(0.95);
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
