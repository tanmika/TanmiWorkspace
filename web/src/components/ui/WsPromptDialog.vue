<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import WsButton from './WsButton.vue'

interface Props {
  modelValue: boolean
  title?: string
  message: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  inputType?: 'text' | 'textarea'
}

const props = withDefaults(defineProps<Props>(), {
  title: '输入',
  placeholder: '',
  confirmText: '确定',
  cancelText: '取消',
  inputType: 'textarea',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [value: string]
  cancel: []
}>()

const show = ref(props.modelValue)
const inputValue = ref('')
const inputRef = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

watch(
  () => props.modelValue,
  async (val) => {
    show.value = val
    if (val) {
      inputValue.value = ''
      await nextTick()
      inputRef.value?.focus()
    }
  }
)

function handleConfirm() {
  emit('update:modelValue', false)
  emit('confirm', inputValue.value)
}

function handleCancel() {
  emit('update:modelValue', false)
  emit('cancel')
}

function handleOverlayClick() {
  handleCancel()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    handleConfirm()
  }
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
            <div class="dialog-message">{{ message }}</div>
            <textarea
              v-if="inputType === 'textarea'"
              ref="inputRef"
              v-model="inputValue"
              class="dialog-textarea"
              :placeholder="placeholder"
              @keydown="handleKeydown"
            />
            <input
              v-else
              ref="inputRef"
              v-model="inputValue"
              type="text"
              class="dialog-input"
              :placeholder="placeholder"
              @keydown.enter="handleConfirm"
            />
            <div class="dialog-hint">Ctrl + Enter 快速确认</div>
          </div>
          <div class="dialog-footer">
            <WsButton variant="secondary" size="sm" @click="handleCancel">
              {{ cancelText }}
            </WsButton>
            <WsButton variant="primary" size="sm" @click="handleConfirm">
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
  width: 480px;
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
}

.dialog-message {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.dialog-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  font-size: 14px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-main);
  transition: border-color 0.15s;
}

.dialog-input:focus {
  outline: none;
  border-color: var(--border-heavy);
}

.dialog-textarea {
  width: 100%;
  min-height: 100px;
  padding: 12px;
  font-size: 14px;
  font-family: inherit;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-main);
  resize: vertical;
  transition: border-color 0.15s;
}

.dialog-textarea:focus {
  outline: none;
  border-color: var(--border-heavy);
}

.dialog-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 8px;
  font-family: var(--mono-font), monospace;
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
