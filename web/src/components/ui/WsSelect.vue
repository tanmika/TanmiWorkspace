<template>
  <div class="custom-select" :class="{ 'is-open': isOpen, 'is-disabled': disabled }">
    <div class="select-trigger" @click="toggleDropdown">
      <span class="select-value">{{ selectedLabel || placeholder }}</span>
      <svg class="select-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 5L6 8L9 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <Transition name="dropdown">
      <div v-if="isOpen" class="select-dropdown">
        <div
          v-for="option in options"
          :key="option.value"
          class="select-option"
          :class="{ 'is-selected': option.value === modelValue }"
          @click="selectOption(option)"
        >
          {{ option.label }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

export interface SelectOption {
  label: string
  value: string | number
}

interface Props {
  modelValue: string | number
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
  (e: 'change', value: string | number): void
}>()

const isOpen = ref(false)

const selectedLabel = computed(() => {
  const option = props.options.find(opt => opt.value === props.modelValue)
  return option?.label || ''
})

const toggleDropdown = () => {
  if (!props.disabled) {
    isOpen.value = !isOpen.value
  }
}

const selectOption = (option: SelectOption) => {
  emit('update:modelValue', option.value)
  emit('change', option.value)
  isOpen.value = false
}

const closeDropdown = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (!target.closest('.custom-select')) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', closeDropdown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeDropdown)
})
</script>

<style scoped>
.custom-select {
  position: relative;
  width: 100%;
}

.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--card-bg);
  cursor: pointer;
  transition: border-color 0.2s ease;
  min-height: 38px;
}

.select-trigger:hover {
  border-color: var(--border-heavy);
}

.custom-select.is-open .select-trigger {
  border-color: var(--border-heavy);
}

.custom-select.is-disabled .select-trigger {
  opacity: 0.5;
  cursor: not-allowed;
}

.select-value {
  flex: 1;
  font-size: 14px;
  color: var(--text-main);
}

.select-value:empty::before {
  content: attr(data-placeholder);
  color: var(--text-muted);
}

.select-arrow {
  color: var(--text-secondary);
  transition: transform 0.2s ease;
}

.custom-select.is-open .select-arrow {
  transform: rotate(180deg);
}

.select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
  max-height: 240px;
  overflow-y: auto;
}

.select-option {
  padding: 10px 12px;
  font-size: 14px;
  color: var(--text-main);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.select-option:hover {
  background: var(--bg-color);
}

.select-option.is-selected {
  background: var(--bg-color);
  font-weight: 600;
}

/* Transitions */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
