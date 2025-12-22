<script setup lang="ts">
import type { NodeRole } from '@/types'

defineProps<{
  role?: NodeRole
}>()
</script>

<template>
  <span v-if="role === 'info_collection'" class="role-badge">INFO</span>
</template>

<style scoped>
.role-badge {
  font-family: var(--mono-font), monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
  background: var(--accent-orange);
  color: #000;
}
</style>
