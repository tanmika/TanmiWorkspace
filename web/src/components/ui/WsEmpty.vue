<template>
  <div class="empty-state">
    <div class="empty-icon">
      <slot name="icon">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <rect x="12" y="12" width="40" height="40" rx="4" stroke="currentColor" stroke-width="2"/>
          <path d="M20 28L28 36L44 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
        </svg>
      </slot>
    </div>
    <div class="empty-title">
      <slot name="title">
        {{ title || '暂无数据' }}
      </slot>
    </div>
    <div v-if="description || $slots.description" class="empty-description">
      <slot name="description">
        {{ description }}
      </slot>
    </div>
    <div v-if="$slots.action" class="empty-action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title?: string
  description?: string
}

withDefaults(defineProps<Props>(), {
  title: '',
  description: ''
})
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  color: var(--text-muted);
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 8px;
}

.empty-description {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 24px;
  max-width: 400px;
  line-height: 1.6;
}

.empty-action {
  margin-top: 8px;
}
</style>
