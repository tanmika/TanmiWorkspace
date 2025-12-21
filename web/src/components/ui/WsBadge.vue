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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Active - 黑底 */
.badge-active {
  background: var(--border-heavy);
  color: var(--card-bg);
}

/* Archived - 灰底 */
.badge-archived {
  background: var(--text-muted);
  color: var(--card-bg);
}

/* Error - 红底 */
.badge-error {
  background: var(--accent-red);
  color: white;
}
</style>
