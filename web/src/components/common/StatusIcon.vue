<script setup lang="ts">
import { computed } from 'vue'
import type { NodeStatus } from '@/types'
import { STATUS_CONFIG } from '@/types'

const props = withDefaults(
  defineProps<{
    status: NodeStatus
    size?: number
  }>(),
  {
    size: 16,
  }
)

const config = computed(() => STATUS_CONFIG[props.status])
</script>

<template>
  <span
    class="status-icon"
    :style="{ color: config.color, fontSize: `${size}px` }"
    :title="config.label"
  >
    {{ config.emoji }}
  </span>
</template>

<style scoped>
.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
