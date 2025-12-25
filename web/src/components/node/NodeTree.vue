<script setup lang="ts">
import { computed, ref } from 'vue'
import type { NodeTreeItem, MemoListItem } from '@/types'
import TreeNodeItem from '@/components/tree/TreeNodeItem.vue'
import TreeChildren from '@/components/tree/TreeChildren.vue'
import WsEmpty from '@/components/ui/WsEmpty.vue'

const props = defineProps<{
  tree: NodeTreeItem | null
  selectedId: string | null
  focusId: string | null
  memos?: MemoListItem[]
}>()

const emit = defineEmits<{
  select: [nodeId: string]
}>()

// TreeChildren 组件引用
const treeChildrenRef = ref<InstanceType<typeof TreeChildren> | null>(null)
// 当前是否全部展开
const allExpanded = ref(true)

// 构造虚拟 MEMO 抽屉节点
const memoDrawerNode = computed<NodeTreeItem | null>(() => {
  if (!props.memos || props.memos.length === 0) return null

  // 将 memos 转换为 NodeTreeItem[] 格式
  const memoChildren: NodeTreeItem[] = props.memos.map(memo => ({
    id: memo.id,
    type: 'execution' as const,
    title: memo.title,
    status: 'pending' as const,
    contentLength: memo.contentLength,
    children: []
  }))

  return {
    id: 'memo-drawer',
    type: 'planning' as const,
    title: `草稿 (${props.memos.length})`,
    status: 'pending' as const,
    children: memoChildren
  }
})

// 扩展的子节点列表（包含原节点树 + MEMO 抽屉）
const extendedChildren = computed<NodeTreeItem[]>(() => {
  const children = props.tree?.children || []
  return memoDrawerNode.value ? [...children, memoDrawerNode.value] : children
})

// 计算选中路径上的所有节点ID（包含虚拟 MEMO 节点）
const activePathIds = computed(() => {
  const pathIds = new Set<string>()
  if (!props.selectedId || !props.tree) return pathIds

  // 递归查找选中节点的路径（在真实节点树中）
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

  // 先在真实节点树中查找
  findPath(props.tree, props.selectedId, [])

  // 如果没找到，且选中的是 memo 节点，需要添加 memo-drawer 到路径
  if (pathIds.size === 0 && memoDrawerNode.value && props.selectedId.startsWith('memo-')) {
    pathIds.add('memo-drawer')
    pathIds.add(props.selectedId)
  }

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

// 双击根节点：一键展开/收起所有
function handleRootDblClick() {
  allExpanded.value = !allExpanded.value
  treeChildrenRef.value?.setAllExpanded(allExpanded.value)
}
</script>

<template>
  <div class="node-tree">
    <div v-if="tree" class="tree-container">
      <!-- Root node (depth=0, no expand button, dblclick to toggle all) -->
      <TreeNodeItem
        :node="tree"
        :is-focused="isFocused(tree.id)"
        :is-selected="isSelected(tree.id)"
        :is-active-path="isActivePath(tree.id)"
        :depth="0"
        @click="handleNodeClick(tree)"
        @dblclick="handleRootDblClick"
      />
      <!-- Children (depth starts at 1, includes virtual memo drawer) -->
      <div
        v-if="extendedChildren.length > 0"
        class="tree-children"
      >
        <TreeChildren
          ref="treeChildrenRef"
          :children="extendedChildren"
          :selected-id="selectedId"
          :focus-id="focusId"
          :active-path-ids="activePathIds"
          :depth="1"
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

.tree-children {
  /* 简单缩进，无连接线 */
}
</style>
