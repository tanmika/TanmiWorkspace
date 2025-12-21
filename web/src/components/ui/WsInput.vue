<template>
  <div class="ws-input-wrapper">
    <input
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      class="search-input"
      @input="handleInput"
      @focus="handleFocus"
      @blur="handleBlur"
    />
  </div>
</template>

<script setup lang="ts">
interface Props {
  modelValue: string
  type?: string
  placeholder?: string
  disabled?: boolean
}

withDefaults(defineProps<Props>(), {
  type: 'text',
  placeholder: '',
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'focus', event: FocusEvent): void
  (e: 'blur', event: FocusEvent): void
}>()

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

const handleFocus = (event: FocusEvent) => {
  emit('focus', event)
}

const handleBlur = (event: FocusEvent) => {
  emit('blur', event)
}
</script>

<style scoped>
.ws-input-wrapper {
  position: relative;
  width: 100%;
}

/* 下划线风格输入框 */
.search-input {
  width: 100%;
  padding: 8px 0;
  border: none;
  border-bottom: 2px solid var(--border-color);
  background: transparent;
  font-size: 14px;
  color: var(--text-main);
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s ease;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-input:focus {
  border-bottom-color: var(--border-heavy);
}

.search-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
