<script setup lang="ts">
import type { NodeTreeItem } from '@/types'
import TreeNodeItem from './TreeNodeItem.vue'

const props = defineProps<{
  children: NodeTreeItem[]
  selectedId: string | null
  focusId: string | null
  activePathIds: Set<string>
}>()

const emit = defineEmits<{
  select: [node: NodeTreeItem]
}>()

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
      @click="handleSelect(child)"
    />
    <div
      v-if="child.children && child.children.length > 0"
      :class="['tree-children', { 'active-path': isActivePath(child.id) }]"
    >
      <TreeChildren
        :children="child.children"
        :selected-id="selectedId"
        :focus-id="focusId"
        :active-path-ids="activePathIds"
        @select="handleSelect"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node-wrapper {
  position: relative;
}

/* 子树容器 - 曼哈顿连线 */
.tree-children {
  margin-left: 11px;
  border-left: 2px solid #999;
  padding-left: 20px;
}

/* 选中路径加粗变黑 */
.tree-children.active-path {
  border-left-color: #111;
}

/* 子节点水平连线 */
.tree-node-wrapper:not(:first-child) .tree-node-item::before {
  content: '';
  position: absolute;
  left: -22px;
  top: 50%;
  width: 22px;
  height: 2px;
  background: #999;
}

/* 选中路径的水平连线 */
.tree-node-wrapper .tree-node-item.active-path::before {
  background: #111;
}

/* 深色模式 */
[data-theme="dark"] .tree-children {
  border-left-color: #666;
}

[data-theme="dark"] .tree-children.active-path {
  border-left-color: #fff;
}

[data-theme="dark"] .tree-node-wrapper:not(:first-child) .tree-node-item::before {
  background: #666;
}

[data-theme="dark"] .tree-node-wrapper .tree-node-item.active-path::before {
  background: #fff;
}
</style>
