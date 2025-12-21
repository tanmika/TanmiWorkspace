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
}>()

const emit = defineEmits<{
  click: [node: NodeTreeItem]
}>()

function handleClick() {
  emit('click', props.node)
}
</script>

<template>
  <div
    :class="['tree-node-item', { selected: isSelected, 'active-path': isActivePath }]"
    @click="handleClick"
  >
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
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.tree-node-item:hover {
  background: #f5f5f5;
}

.tree-node-item.selected {
  background: #f0f0f0;
}

.node-title {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-main);
}

/* 深色模式 */
[data-theme="dark"] .tree-node-item:hover {
  background: #2a2a2a;
}

[data-theme="dark"] .tree-node-item.selected {
  background: #333333;
}
</style>
