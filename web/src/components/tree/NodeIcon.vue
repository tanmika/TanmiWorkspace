<script setup lang="ts">
import type { NodeType, NodeStatus } from '@/types'

const props = defineProps<{
  type: NodeType
  status: NodeStatus
}>()

// 是否为规划节点
const isPlanning = props.type === 'planning'
</script>

<template>
  <div
    :class="[
      isPlanning ? 'node-plan' : 'node-exec',
      status
    ]"
  ></div>
</template>

<style scoped>
/* 执行节点 - 方形 20x20 */
.node-exec {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  position: relative;
}

/* 执行节点: pending - 空心黑框 */
.node-exec.pending {
  border: 2px solid var(--border-heavy);
  background: transparent;
}

/* 执行节点: implementing - 蓝白斜纹 */
.node-exec.implementing {
  background: linear-gradient(
    135deg,
    var(--accent-blue) 25%,
    #ffffff 25%,
    #ffffff 50%,
    var(--accent-blue) 50%,
    var(--accent-blue) 75%,
    #ffffff 75%,
    #ffffff
  );
  background-size: 8px 8px;
}

/* 执行节点: validating - 橙色 + 白点 */
.node-exec.validating {
  background: #f59e0b;
}

.node-exec.validating::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ffffff;
}

/* 执行节点: completed - 实心黑块 */
.node-exec.completed {
  background: var(--border-heavy);
}

/* 执行节点: failed - 红底白X */
.node-exec.failed {
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
  background: #ffffff;
}

.node-exec.failed::before {
  transform: translate(-50%, -50%) rotate(45deg);
}

.node-exec.failed::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}

/* 规划节点 - 菱形 16x16, rotate 45deg */
.node-plan {
  width: 16px;
  height: 16px;
  transform: rotate(45deg);
  flex-shrink: 0;
  position: relative;
}

/* 规划节点: pending - 空心菱形 */
.node-plan.pending {
  border: 2px solid var(--border-heavy);
  background: transparent;
}

/* 规划节点: planning - 紫色横纹 */
.node-plan.planning {
  background: linear-gradient(
    0deg,
    #9B59B6 25%,
    #ffffff 25%,
    #ffffff 50%,
    #9B59B6 50%,
    #9B59B6 75%,
    #ffffff 75%,
    #ffffff
  );
  background-size: 8px 8px;
}

/* 规划节点: monitoring - 蓝框 + 中心点 */
.node-plan.monitoring {
  border: 2px solid var(--accent-blue);
  background: transparent;
}

.node-plan.monitoring::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent-blue);
}

/* 规划节点: completed - 实心黑菱形 */
.node-plan.completed {
  background: var(--border-heavy);
}

/* 规划节点: cancelled - 灰色虚线 */
.node-plan.cancelled {
  border: 2px dashed #999;
  background: transparent;
}

/* 深色模式调整 */
[data-theme="dark"] .node-exec.implementing {
  background: linear-gradient(
    135deg,
    var(--accent-blue) 25%,
    #1a1a1a 25%,
    #1a1a1a 50%,
    var(--accent-blue) 50%,
    var(--accent-blue) 75%,
    #1a1a1a 75%,
    #1a1a1a
  );
  background-size: 8px 8px;
}

[data-theme="dark"] .node-plan.planning {
  background: linear-gradient(
    0deg,
    #9B59B6 25%,
    #1a1a1a 25%,
    #1a1a1a 50%,
    #9B59B6 50%,
    #9B59B6 75%,
    #1a1a1a 75%,
    #1a1a1a
  );
  background-size: 8px 8px;
}
</style>
