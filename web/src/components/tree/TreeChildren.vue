<script setup lang="ts">
import { reactive, ref } from 'vue'
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
// 子组件引用（用于递归调用）
const childRefs = ref<{ setAllExpanded: (expanded: boolean) => void }[]>([])

function isExpanded(nodeId: string): boolean {
  // 默认展开
  return expandedMap[nodeId] !== false
}

function toggleExpand(nodeId: string) {
  expandedMap[nodeId] = !isExpanded(nodeId)
}

// 展开/收起所有节点
function setAllExpanded(expanded: boolean) {
  props.children.forEach(child => {
    expandedMap[child.id] = expanded
  })
  // 递归调用子组件
  childRefs.value.forEach(ref => {
    ref?.setAllExpanded(expanded)
  })
}

// 暴露方法给父组件
defineExpose({ setAllExpanded })

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
        :ref="(el) => { if (el) childRefs[children.indexOf(child)] = el as any }"
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
