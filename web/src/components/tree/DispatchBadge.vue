<script setup lang="ts">
import type { NodeDispatchStatus } from '@/types'

defineProps<{
  status: NodeDispatchStatus
}>()

// 获取显示文本
function getText(status: NodeDispatchStatus): string {
  switch (status) {
    case 'pending':
      return 'WAIT'
    case 'executing':
      return 'RUN'
    case 'testing':
      return 'TEST'
    case 'passed':
      return 'PASS'
    case 'failed':
      return 'FAIL'
    default:
      return ''
  }
}
</script>

<template>
  <span :class="['dispatch-badge', status]">
    {{ getText(status) }}
  </span>
</template>

<style scoped>
.dispatch-badge {
  display: inline-block;
  padding: 2px 5px;
  font-family: var(--mono-font);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1;
  flex-shrink: 0;
}

/* WAIT - 灰底 + 灰边框 */
.dispatch-badge.pending {
  background: #eee;
  color: #666;
  border: 1px solid #ddd;
}

/* RUN - 蓝底 + 闪烁光标 */
.dispatch-badge.executing {
  background: var(--accent-blue);
  color: #fff;
}

.dispatch-badge.executing::after {
  content: '_';
  animation: blink 1s infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* TEST - 橙底黑字 */
.dispatch-badge.testing {
  background: var(--accent-orange);
  color: #000;
}

/* PASS - 黑底白字 */
.dispatch-badge.passed {
  background: var(--border-heavy);
  color: #fff;
}

/* FAIL - 红底白字 */
.dispatch-badge.failed {
  background: var(--accent-red);
  color: #fff;
}

/* 深色模式调整 */
[data-theme="dark"] .dispatch-badge.pending {
  background: #374151;
  color: #9ca3af;
  border-color: #4b5563;
}

[data-theme="dark"] .dispatch-badge.passed {
  color: #111;
}
</style>
