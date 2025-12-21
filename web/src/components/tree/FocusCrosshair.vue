<script setup lang="ts">
import type { NodeType, NodeStatus } from '@/types'
import NodeIcon from './NodeIcon.vue'

defineProps<{
  type: NodeType
  status: NodeStatus
}>()
</script>

<template>
  <div class="focus-wrapper">
    <NodeIcon :type="type" :status="status" />
    <div class="focus-crosshair"><span></span></div>
  </div>
</template>

<style scoped>
.focus-wrapper {
  position: relative;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.focus-crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 32px;
  height: 32px;
  pointer-events: none;
}

.focus-crosshair::before,
.focus-crosshair::after {
  content: '';
  position: absolute;
  background: var(--accent-red);
}

/* 垂直线 */
.focus-crosshair::before {
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: 100%;
}

/* 水平线 */
.focus-crosshair::after {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  width: 100%;
  height: 2px;
}

.focus-crosshair span {
  display: none;
}
</style>
