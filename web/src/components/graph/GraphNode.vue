<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeType, NodeStatus, NodeDispatchInfo } from '@/types'
import NodeIcon from '@/components/tree/NodeIcon.vue'
import FocusCrosshair from '@/components/tree/FocusCrosshair.vue'
import DispatchBadge from '@/components/tree/DispatchBadge.vue'

interface Props {
  data: {
    title: string
    type: NodeType
    status: NodeStatus
    dispatch?: NodeDispatchInfo
    isFocused: boolean
    isSelected: boolean
    isActivePath: boolean
  }
}

const props = defineProps<Props>()

const nodeClass = computed(() => ({
  'graph-node': true,
  'selected': props.data.isSelected,
  'active-path': props.data.isActivePath,
}))
</script>

<template>
  <div :class="nodeClass">
    <!-- 左侧连接点 -->
    <Handle type="target" :position="Position.Left" class="handle" />

    <!-- 节点内容 -->
    <div class="node-content">
      <!-- 节点图标 -->
      <FocusCrosshair
        v-if="data.isFocused"
        :type="data.type"
        :status="data.status"
      />
      <NodeIcon
        v-else
        :type="data.type"
        :status="data.status"
      />

      <!-- 节点标签 -->
      <span class="node-label">{{ data.title }}</span>

      <!-- 派发徽章 -->
      <DispatchBadge
        v-if="data.dispatch"
        :status="data.dispatch.status"
      />
    </div>

    <!-- 右侧连接点 -->
    <Handle type="source" :position="Position.Right" class="handle" />
  </div>
</template>

<style scoped>
.graph-node {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
  min-width: 80px;
  max-width: 200px;
}

.graph-node:hover {
  border-color: var(--border-heavy);
  box-shadow: 2px 2px 0 var(--border-color);
}

.graph-node.selected {
  border-left-width: 3px;
  border-left-style: solid;
  border-left-color: var(--accent-red);
}

.graph-node.selected:hover {
  box-shadow: 2px 2px 0 var(--border-color);
}

.graph-node.active-path {
  /* 路径上的节点不额外样式 */
}

.node-content {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.node-label {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.graph-node.selected .node-label,
.graph-node:has(.focus-crosshair) .node-label {
  color: var(--text-main);
  font-weight: 600;
}

/* Handle 样式 - 小而不可见但存在 */
.handle {
  width: 1px !important;
  height: 1px !important;
  min-width: 1px !important;
  min-height: 1px !important;
  background: transparent !important;
  border: none !important;
}
</style>
