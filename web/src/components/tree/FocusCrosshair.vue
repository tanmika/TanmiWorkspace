<script setup lang="ts">
import type { NodeType, NodeStatus } from '@/types'
import NodeIcon from './NodeIcon.vue'

defineProps<{
  type: NodeType
  status: NodeStatus
}>()
</script>

<template>
  <!-- 执行节点: 方形准星 -->
  <div v-if="type === 'execution'" class="focus-wrapper">
    <NodeIcon :type="type" :status="status" />
    <div class="focus-crosshair"><span></span></div>
  </div>
  <!-- 规划节点: 菱形准星 -->
  <div v-else class="focus-wrapper-diamond">
    <div class="node-plan-wrapper">
      <NodeIcon :type="type" :status="status" />
    </div>
    <div class="focus-diamond"><span></span></div>
  </div>
</template>

<style scoped>
/* 方形准星容器 - 与 NodeIcon 相同宽度 20px */
.focus-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

/* 准星四角样式 (方形节点) - 超出容器边界 */
.focus-crosshair {
  position: absolute;
  top: -3px;
  left: -3px;
  right: -3px;
  bottom: -3px;
  pointer-events: none;
}

.focus-crosshair::before,
.focus-crosshair::after,
.focus-crosshair span::before,
.focus-crosshair span::after {
  content: '';
  position: absolute;
  width: 5px;
  height: 5px;
  border-color: var(--accent-red);
  border-style: solid;
  border-width: 0;
}

/* 左上角 */
.focus-crosshair::before {
  top: 0;
  left: 0;
  border-top-width: 2px;
  border-left-width: 2px;
}

/* 右上角 */
.focus-crosshair::after {
  top: 0;
  right: 0;
  border-top-width: 2px;
  border-right-width: 2px;
}

/* span 用于生成下方两个角 */
.focus-crosshair span {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

/* 左下角 */
.focus-crosshair span::before {
  bottom: 0;
  left: 0;
  border-bottom-width: 2px;
  border-left-width: 2px;
}

/* 右下角 */
.focus-crosshair span::after {
  bottom: 0;
  right: 0;
  border-bottom-width: 2px;
  border-right-width: 2px;
}

/* 菱形准星容器 - 与 NodeIcon 相同宽度 20px */
.focus-wrapper-diamond {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.node-plan-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 菱形准星 - 超出容器边界 */
.focus-diamond {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%) rotate(45deg);
  pointer-events: none;
}

.focus-diamond::before,
.focus-diamond::after,
.focus-diamond span::before,
.focus-diamond span::after {
  content: '';
  position: absolute;
  width: 5px;
  height: 5px;
  border-color: var(--accent-red);
  border-style: solid;
  border-width: 0;
}

/* 菱形左上角 */
.focus-diamond::before {
  top: 0;
  left: 0;
  border-top-width: 2px;
  border-left-width: 2px;
}

/* 菱形右上角 */
.focus-diamond::after {
  top: 0;
  right: 0;
  border-top-width: 2px;
  border-right-width: 2px;
}

/* span 用于生成下方两个角 */
.focus-diamond span {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

/* 菱形左下角 */
.focus-diamond span::before {
  bottom: 0;
  left: 0;
  border-bottom-width: 2px;
  border-left-width: 2px;
}

/* 菱形右下角 */
.focus-diamond span::after {
  bottom: 0;
  right: 0;
  border-bottom-width: 2px;
  border-right-width: 2px;
}
</style>
