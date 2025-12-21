<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="modal-overlay" @click="handleOverlayClick">
        <div class="modal" :style="{ maxWidth: width }" @click.stop>
          <div class="modal-header">
            <slot name="header">
              {{ title }}
            </slot>
            <button class="modal-close" @click="close">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
interface Props {
  modelValue: boolean
  title?: string
  closeOnClickOutside?: boolean
  width?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  closeOnClickOutside: true,
  width: '560px'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'close'): void
}>()

const close = () => {
  emit('update:modelValue', false)
  emit('close')
}

const handleOverlayClick = () => {
  if (props.closeOnClickOutside) {
    close()
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  background: var(--card-bg);
  border: 2px solid var(--border-heavy);
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.15);
  max-width: 560px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
  font-size: 18px;
  font-weight: 800;
  color: var(--text-main);
  text-transform: uppercase;
  letter-spacing: -0.5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-close {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 24px;
  line-height: 1;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
}

.modal-close:hover {
  color: var(--accent-red);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  color: var(--text-main);
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  background: var(--card-footer);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* Transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-active .modal,
.modal-fade-leave-active .modal {
  transition: transform 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .modal,
.modal-fade-leave-to .modal {
  transform: scale(0.95);
}
</style>
