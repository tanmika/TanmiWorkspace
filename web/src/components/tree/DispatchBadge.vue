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
      return 'RUN_'
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
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font-family: monospace;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 600;
  border-radius: 2px;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

/* wait - 灰底 */
.dispatch-badge.pending {
  background: #e5e7eb;
  color: #6b7280;
}

/* run - 蓝底 + 闪烁光标 */
.dispatch-badge.executing {
  background: var(--accent-blue);
  color: #ffffff;
  animation: blink-cursor 1s step-end infinite;
}

@keyframes blink-cursor {
  0%, 50% {
    opacity: 1;
  }
  51%, 100% {
    opacity: 0.7;
  }
}

/* test - 橙底 */
.dispatch-badge.testing {
  background: #f59e0b;
  color: #ffffff;
}

/* pass - 黑底 */
.dispatch-badge.passed {
  background: var(--border-heavy);
  color: #ffffff;
}

/* fail - 红底 */
.dispatch-badge.failed {
  background: var(--accent-red);
  color: #ffffff;
}

/* 深色模式调整 */
[data-theme="dark"] .dispatch-badge.pending {
  background: #374151;
  color: #9ca3af;
}
</style>
