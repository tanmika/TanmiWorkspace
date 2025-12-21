<script setup lang="ts">
import { computed } from 'vue'
import type { NodeTreeItem } from '@/types'
import TreeNodeItem from '@/components/tree/TreeNodeItem.vue'
import TreeChildren from '@/components/tree/TreeChildren.vue'
import WsEmpty from '@/components/ui/WsEmpty.vue'

const props = defineProps<{
  tree: NodeTreeItem | null
  selectedId: string | null
  focusId: string | null
}>()

const emit = defineEmits<{
  select: [nodeId: string]
}>()

// 计算选中路径上的所有节点ID
const activePathIds = computed(() => {
  const pathIds = new Set<string>()
  if (!props.selectedId || !props.tree) return pathIds

  // 递归查找选中节点的路径
  function findPath(node: NodeTreeItem, targetId: string, currentPath: string[]): boolean {
    currentPath.push(node.id)

    if (node.id === targetId) {
      currentPath.forEach(id => pathIds.add(id))
      return true
    }

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        if (findPath(child, targetId, [...currentPath])) {
          return true
        }
      }
    }

    return false
  }

  findPath(props.tree, props.selectedId, [])
  return pathIds
})

// 选择节点
function handleNodeClick(node: NodeTreeItem) {
  emit('select', node.id)
}

// 判断是否当前焦点
function isFocused(nodeId: string): boolean {
  return props.focusId === nodeId
}

// 判断是否选中
function isSelected(nodeId: string): boolean {
  return props.selectedId === nodeId
}

// 判断是否在选中路径上
function isActivePath(nodeId: string): boolean {
  return activePathIds.value.has(nodeId)
}
</script>

<template>
  <div class="node-tree">
    <div v-if="tree" class="tree-container">
      <!-- Root node -->
      <TreeNodeItem
        :node="tree"
        :is-focused="isFocused(tree.id)"
        :is-selected="isSelected(tree.id)"
        :is-active-path="isActivePath(tree.id)"
        @click="handleNodeClick(tree)"
      />
      <!-- Children -->
      <div
        v-if="tree.children && tree.children.length > 0"
        :class="['tree-children', { 'active-path': isActivePath(tree.id) }]"
      >
        <TreeChildren
          :children="tree.children"
          :selected-id="selectedId"
          :focus-id="focusId"
          :active-path-ids="activePathIds"
          @select="handleNodeClick"
        />
      </div>
    </div>
    <WsEmpty v-else description="暂无节点" />
  </div>
</template>

<style scoped>
.node-tree {
  min-height: 200px;
}

.tree-container {
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

/* 深色模式 */
[data-theme="dark"] .tree-children {
  border-left-color: #666;
}

[data-theme="dark"] .tree-children.active-path {
  border-left-color: #fff;
}
</style>
