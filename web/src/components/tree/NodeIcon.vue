<script setup lang="ts">
import { computed } from 'vue'
import type { NodeType, NodeStatus } from '@/types'

const props = defineProps<{
  type: NodeType
  status: NodeStatus
}>()

// 是否为规划节点 - 必须是 computed 才能响应式
const isPlanning = computed(() => props.type === 'planning')
</script>

<template>
  <!-- 规划节点需要外层容器保持对齐 -->
  <div v-if="isPlanning" class="node-plan-wrapper">
    <div :class="['node-plan', status]"></div>
  </div>
  <!-- 执行节点直接渲染 -->
  <div v-else :class="['node-exec', status]"></div>
</template>

<style scoped>
/* 执行节点 - 方形 20x20 */
.node-exec {
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 执行节点: pending - 空心黑框 */
.node-exec.pending {
  border: 2px solid var(--border-heavy);
  background: var(--card-bg);
}

/* 执行节点: implementing - 蓝白斜纹 (施工中) */
.node-exec.implementing {
  border: 2px solid var(--accent-blue);
  background: repeating-linear-gradient(
    45deg,
    var(--accent-blue),
    var(--accent-blue) 3px,
    #fff 3px,
    #fff 6px
  );
}

/* 执行节点: validating - 橙色 + 中心白方点 */
.node-exec.validating {
  border: 2px solid var(--accent-orange);
  background: var(--accent-orange);
}

.node-exec.validating::after {
  content: '';
  width: 6px;
  height: 6px;
  background: #fff;
}

/* 执行节点: completed - 实心黑块 */
.node-exec.completed {
  border: 2px solid var(--border-heavy);
  background: var(--border-heavy);
}

/* 执行节点: failed - 红底白X */
.node-exec.failed {
  border: 2px solid var(--accent-red);
  background: var(--accent-red);
}

.node-exec.failed::before,
.node-exec.failed::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 12px;
  height: 2px;
  background: #fff;
}

.node-exec.failed::before {
  transform: translate(-50%, -50%) rotate(45deg);
}

.node-exec.failed::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}

/* 规划节点容器 - 与执行节点统一宽度 */
.node-plan-wrapper {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 规划节点 - 菱形 14x14, rotate 45deg */
.node-plan {
  width: 14px;
  height: 14px;
  transform: rotate(45deg);
  box-sizing: border-box;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 规划节点: pending - 空心菱形 */
.node-plan.pending {
  border: 2px solid var(--border-heavy);
  background: var(--card-bg);
}

/* 规划节点: planning - 紫色横纹 */
.node-plan.planning {
  border: 2px solid var(--accent-purple);
  background: repeating-linear-gradient(
    0deg,
    var(--accent-purple),
    var(--accent-purple) 2px,
    #fff 2px,
    #fff 4px
  );
}

/* 规划节点: monitoring - 蓝框 + 中心方点 */
.node-plan.monitoring {
  border: 2px solid var(--accent-blue);
  background: #fff;
}

.node-plan.monitoring::after {
  content: '';
  width: 4px;
  height: 4px;
  background: var(--accent-blue);
}

/* 规划节点: completed - 实心黑菱形 */
.node-plan.completed {
  border: 2px solid var(--border-heavy);
  background: var(--border-heavy);
}

/* 规划节点: cancelled - 灰色虚线框 */
.node-plan.cancelled {
  border: 2px dashed #9CA3AF;
  background: transparent;
}

/* 深色模式调整 */
[data-theme="dark"] .node-exec.implementing {
  background: repeating-linear-gradient(
    45deg,
    var(--accent-blue),
    var(--accent-blue) 3px,
    #1a1a1a 3px,
    #1a1a1a 6px
  );
}

[data-theme="dark"] .node-plan.planning {
  background: repeating-linear-gradient(
    0deg,
    var(--accent-purple),
    var(--accent-purple) 2px,
    #1a1a1a 2px,
    #1a1a1a 4px
  );
}

[data-theme="dark"] .node-plan.monitoring {
  background: #1a1a1a;
}

[data-theme="dark"] .node-exec.validating::after {
  background: #181818;
}

[data-theme="dark"] .node-exec.failed::before,
[data-theme="dark"] .node-exec.failed::after {
  background: #181818;
}

</style>
