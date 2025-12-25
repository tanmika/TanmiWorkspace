<script setup lang="ts">
import { computed } from 'vue'
import type { NodeType, NodeStatus } from '@/types'

const props = defineProps<{
  type: NodeType
  status: NodeStatus
  isMemo?: boolean
  contentLength?: number  // MEMO 内容长度，用于显示横线数量
  memoCount?: number      // MEMO 抽屉：备忘数量，用于显示横线数量
}>()

// 是否为规划节点 - 必须是 computed 才能响应式
const isPlanning = computed(() => props.type === 'planning')

// 计算横线数量（1-3条）
const memoLines = computed(() => {
  // 抽屉节点：按备忘数量计算
  if (props.memoCount !== undefined) {
    if (props.memoCount <= 3) return 1
    if (props.memoCount <= 8) return 2
    return 3
  }
  // 单个备忘：按内容长度计算
  if (!props.contentLength) return 1
  if (props.contentLength < 500) return 1
  if (props.contentLength <= 1000) return 2
  return 3
})
</script>

<template>
  <!-- Memo 节点 - 方形 + 横线 -->
  <div v-if="isMemo" class="node-memo" :class="'lines-' + memoLines">
    <span class="memo-line" v-for="i in memoLines" :key="i"></span>
  </div>
  <!-- 规划节点需要外层容器保持对齐 -->
  <div v-else-if="isPlanning" class="node-plan-wrapper">
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

/* Memo 节点 - 六边形 + 横线 */
.node-memo {
  width: 20px;
  height: 20px;
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 1px;
}

/* 六边形背景（边框效果）- 正六边形，使用 aspect-ratio 保持比例 */
.node-memo::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 17px;  /* 20 * cos(30deg) ≈ 17.32 */
  transform: translate(-50%, -50%);
  background: var(--accent-green);
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}

/* 六边形内部（背景色）*/
.node-memo::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;  /* 20 - 4 for border */
  height: 14px;  /* 17 - 3 for border */
  transform: translate(-50%, -50%);
  background: var(--card-bg);
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}

/* 横线样式 */
.memo-line {
  width: 8px;
  height: 2px;
  background: var(--accent-green);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

/* 1条横线时居中 */
.node-memo.lines-1 {
  justify-content: center;
}

/* 2条横线 - 间距2px */
.node-memo.lines-2 {
  justify-content: center;
  gap: 2px;
}

/* 3条横线 - 均匀分布，间距2px */
.node-memo.lines-3 {
  justify-content: center;
  gap: 2px;
}

.node-memo.lines-3 .memo-line {
  height: 1.5px;  /* 略细以适应空间 */
}

</style>
