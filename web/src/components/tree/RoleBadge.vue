<script setup lang="ts">
import { computed } from 'vue'
import { NODE_ROLE_CONFIG, type NodeRole } from '@/types'

const props = defineProps<{
  role?: NodeRole
}>()

const config = computed(() => props.role ? NODE_ROLE_CONFIG[props.role] : null)
</script>

<template>
  <span v-if="config" class="role-badge" :style="{ background: config.color, color: config.textColor }">
    {{ config.label }}
  </span>
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
}
</style>
