<script setup lang="ts">
import { ref, watch } from 'vue'
import WsButton from './WsButton.vue'

interface Props {
  modelValue: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'info' | 'warning' | 'danger'
}

const props = withDefaults(defineProps<Props>(), {
  title: '确认',
  confirmText: '确定',
  cancelText: '取消',
  type: 'info',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

const show = ref(props.modelValue)

watch(
  () => props.modelValue,
  (val) => {
    show.value = val
  }
)

function handleConfirm() {
  emit('update:modelValue', false)
  emit('confirm')
}

function handleCancel() {
  emit('update:modelValue', false)
  emit('cancel')
}

function handleOverlayClick() {
  handleCancel()
}

// 按钮变体映射
const confirmVariant = {
  info: 'primary' as const,
  warning: 'accent' as const,
  danger: 'danger' as const,
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="dialog-overlay" @click="handleOverlayClick">
        <div class="dialog" @click.stop>
          <div class="dialog-header">
            <span class="dialog-title">{{ title }}</span>
            <button class="dialog-close" @click="handleCancel">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="dialog-body">
            {{ message }}
          </div>
          <div class="dialog-footer">
            <WsButton variant="secondary" size="sm" @click="handleCancel">
              {{ cancelText }}
            </WsButton>
            <WsButton :variant="confirmVariant[type]" size="sm" @click="handleConfirm">
              {{ confirmText }}
            </WsButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.dialog {
  background: var(--card-bg);
  border: 2px solid var(--border-heavy);
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.15);
  width: 400px;
  max-width: 90vw;
}

.dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}

.dialog-close {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-close:hover {
  color: var(--accent-red);
}

.dialog-body {
  padding: 20px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  background: var(--card-footer);
}

/* Transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-active .dialog,
.modal-fade-leave-active .dialog {
  transition: transform 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .dialog,
.modal-fade-leave-to .dialog {
  transform: scale(0.95);
}
</style>
