<script setup lang="ts">
import type { TypedLogEntry } from '@/types'

defineProps<{
  entries: TypedLogEntry[]
}>()

function getOperatorColor(operator: 'AI' | 'Human') {
  return operator === 'AI' ? '#409EFF' : '#67C23A'
}
</script>

<template>
  <div class="log-timeline">
    <el-empty v-if="!entries.length" description="暂无日志" :image-size="40" />
    <el-timeline v-else>
      <el-timeline-item
        v-for="(entry, index) in entries"
        :key="index"
        :timestamp="entry.timestamp"
        placement="top"
      >
        <div class="log-entry">
          <el-tag :color="getOperatorColor(entry.operator)" size="small" effect="dark">
            {{ entry.operator }}
          </el-tag>
          <span class="event">{{ entry.event }}</span>
        </div>
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<style scoped>
.log-timeline {
  max-height: 400px;
  overflow-y: auto;
}

.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.event {
  flex: 1;
  line-height: 1.5;
}
</style>
