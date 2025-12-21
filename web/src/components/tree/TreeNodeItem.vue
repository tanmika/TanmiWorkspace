<script setup lang="ts">
import type { NodeTreeItem } from '@/types'
import FocusCrosshair from './FocusCrosshair.vue'
import NodeIcon from './NodeIcon.vue'
import DispatchBadge from './DispatchBadge.vue'

const props = defineProps<{
  node: NodeTreeItem
  isFocused: boolean
  isSelected: boolean
  isActivePath: boolean
  depth?: number
  hasChildren?: boolean
  isExpanded?: boolean
}>()

const emit = defineEmits<{
  click: [node: NodeTreeItem]
  toggleExpand: []
}>()

// 计算层级点数量（有子节点时最后一个位置留给展开按钮）
const depthDots = props.depth ? (props.hasChildren ? props.depth - 1 : props.depth) : 0

function handleClick() {
  emit('click', props.node)
}

function handleToggleExpand(e: Event) {
  e.stopPropagation()
  emit('toggleExpand')
}
</script>

<template>
  <div
    :class="['tree-node-item', { selected: isSelected, 'active-path': isActivePath }]"
    @click="handleClick"
  >
    <!-- 层级点 -->
    <span v-if="depthDots > 0" class="depth-dots">
      <span v-for="i in depthDots" :key="i" class="dot"></span>
    </span>
    <!-- 展开/收起按钮（替代最后一个层级点） -->
    <button
      v-if="hasChildren"
      class="expand-btn"
      :class="{ expanded: isExpanded }"
      @click="handleToggleExpand"
      :title="isExpanded ? '收起' : '展开'"
    >
      <span class="expand-icon">▶</span>
    </button>
    <!-- 节点图标 -->
    <FocusCrosshair
      v-if="isFocused"
      :type="node.type"
      :status="node.status"
    />
    <NodeIcon
      v-else
      :type="node.type"
      :status="node.status"
    />
    <span class="node-title">{{ node.title }}</span>
    <DispatchBadge
      v-if="node.dispatch"
      :status="node.dispatch.status"
    />
  </div>
</template>

<style scoped>
.tree-node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--card-bg);
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: all 0.1s;
}

.tree-node-item:hover {
  background: var(--card-bg);
  border-color: var(--border-color);
  border-left-color: transparent;
}

.tree-node-item.selected {
  background: rgba(217, 43, 43, 0.03);
  border-color: var(--border-heavy);
  border-left-color: var(--accent-red);
}

[data-theme="dark"] .tree-node-item.selected {
  background: rgba(217, 43, 43, 0.08);
}

/* 层级点容器 */
.depth-dots {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-right: -8px;
}

/* 单个层级点 - 与图标宽度对齐 (20px + 8px gap) */
.dot {
  width: 28px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding-left: 8px;
}

.dot::before {
  content: '';
  width: 4px;
  height: 4px;
  background: var(--text-muted);
}

/* 选中路径上的点变红 */
.tree-node-item.active-path .dot::before {
  background: var(--accent-red);
}

/* 展开/收起按钮 */
.expand-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-muted);
  transition: all 0.15s;
}

.expand-btn:hover {
  color: var(--text-main);
}

.expand-icon {
  font-size: 10px;
  transition: transform 0.15s;
}

.expand-btn.expanded .expand-icon {
  transform: rotate(90deg);
}

/* 选中路径上的展开按钮变红 */
.tree-node-item.active-path .expand-btn {
  color: var(--accent-red);
}

.node-title {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
}

/* 深色模式 */
[data-theme="dark"] .tree-node-item.active-path .dot::before {
  background: var(--accent-red);
}
</style>
