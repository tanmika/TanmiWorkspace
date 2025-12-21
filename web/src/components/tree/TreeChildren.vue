<script setup lang="ts">
import { reactive } from 'vue'
import type { NodeTreeItem } from '@/types'
import TreeNodeItem from './TreeNodeItem.vue'

const props = defineProps<{
  children: NodeTreeItem[]
  selectedId: string | null
  focusId: string | null
  activePathIds: Set<string>
  depth: number
}>()

const emit = defineEmits<{
  select: [node: NodeTreeItem]
}>()

// 展开状态管理（默认全部展开）
const expandedMap = reactive<Record<string, boolean>>({})

function isExpanded(nodeId: string): boolean {
  // 默认展开
  return expandedMap[nodeId] !== false
}

function toggleExpand(nodeId: string) {
  expandedMap[nodeId] = !isExpanded(nodeId)
}

function handleSelect(node: NodeTreeItem) {
  emit('select', node)
}

function isFocused(nodeId: string): boolean {
  return props.focusId === nodeId
}

function isSelected(nodeId: string): boolean {
  return props.selectedId === nodeId
}

function isActivePath(nodeId: string): boolean {
  return props.activePathIds.has(nodeId)
}

function hasChildren(node: NodeTreeItem): boolean {
  return !!(node.children && node.children.length > 0)
}
</script>

<template>
  <div
    v-for="child in children"
    :key="child.id"
    class="tree-node-wrapper"
  >
    <TreeNodeItem
      :node="child"
      :is-focused="isFocused(child.id)"
      :is-selected="isSelected(child.id)"
      :is-active-path="isActivePath(child.id)"
      :depth="depth"
      :has-children="hasChildren(child)"
      :is-expanded="isExpanded(child.id)"
      @click="handleSelect(child)"
      @toggle-expand="toggleExpand(child.id)"
    />
    <div
      v-if="hasChildren(child)"
      v-show="isExpanded(child.id)"
      class="tree-children"
    >
      <TreeChildren
        :children="child.children!"
        :selected-id="selectedId"
        :focus-id="focusId"
        :active-path-ids="activePathIds"
        :depth="depth + 1"
        @select="handleSelect"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node-wrapper {
  position: relative;
}

.tree-children {
  /* 简单缩进，无连接线 */
}
</style>
