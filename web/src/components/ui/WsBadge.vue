<template>
  <span :class="badgeClass">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'active' | 'archived' | 'error'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'active'
})

const badgeClass = computed(() => {
  const classes = ['ws-badge']

  switch (props.variant) {
    case 'active':
      classes.push('badge-active')
      break
    case 'archived':
      classes.push('badge-archived')
      break
    case 'error':
      classes.push('badge-error')
      break
  }

  return classes.join(' ')
})
</script>

<style scoped>
.ws-badge {
  display: inline-block;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Active - 黑底 */
.badge-active {
  background: var(--border-heavy);
  color: #fff;
}

/* Archived - 浅灰底 */
.badge-archived {
  background: var(--path-bg);
  color: var(--text-muted);
}

/* Error - 红底 */
.badge-error {
  background: var(--accent-red);
  color: #fff;
}

/* Dark Mode */
[data-theme="dark"] .badge-active {
  background: #fff;
  color: #111;
}
</style>
