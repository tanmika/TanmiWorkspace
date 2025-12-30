<template>
  <div class="ws-collapse" :class="{ 'is-open': isOpen }">
    <div class="collapse-header" @click="toggle">
      <span class="collapse-arrow">
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.5 2.5L8 6L4.5 9.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <span class="collapse-title">{{ title }}</span>
    </div>
    <div class="collapse-content-wrapper">
      <div class="collapse-content">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  title: string
  defaultOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false
})

const isOpen = ref(props.defaultOpen)

function toggle() {
  isOpen.value = !isOpen.value
}

// 暴露方法供外部调用
defineExpose({
  toggle,
  isOpen
})
</script>

<style scoped>
.ws-collapse {
  border: 1px solid var(--border-color);
  background: var(--card-bg);
}

.collapse-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s ease;
}

.collapse-header:hover {
  background: var(--path-bg);
}

.collapse-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: transform 0.25s ease;
}

.is-open .collapse-arrow {
  transform: rotate(90deg);
}

.collapse-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 8px;
}

.collapse-title::before {
  content: '';
  display: block;
  width: 4px;
  height: 14px;
  background: var(--accent-red);
}

.collapse-content-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
}

.is-open .collapse-content-wrapper {
  grid-template-rows: 1fr;
}

.collapse-content {
  overflow: hidden;
}

.is-open .collapse-content {
  border-top: 1px solid var(--border-color);
}

/* 内容区内边距 */
.collapse-content > :deep(*) {
  padding: 16px;
}

/* 如果内容区没有子元素添加默认内边距 */
.collapse-content:empty::before {
  content: '';
  display: block;
  padding: 16px;
}
</style>
