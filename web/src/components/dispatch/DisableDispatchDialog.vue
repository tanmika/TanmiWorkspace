<script setup lang="ts">
import { ref } from 'vue'
import { useWorkspaceStore, useToastStore } from '@/stores'
import WsModal from '@/components/ui/WsModal.vue'
import WsButton from '@/components/ui/WsButton.vue'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'success': []
}>()

const workspaceStore = useWorkspaceStore()
const toastStore = useToastStore()
const loading = ref(false)

async function handleDisable() {
  loading.value = true
  try {
    await workspaceStore.disableDispatch()
    toastStore.success('派发模式已关闭')
    emit('success')
    emit('update:modelValue', false)
  } catch (error) {
    toastStore.error('关闭派发失败', error instanceof Error ? error.message : undefined)
  } finally {
    loading.value = false
  }
}

function handleClose() {
  emit('update:modelValue', false)
}
</script>

<template>
  <WsModal
    :model-value="modelValue"
    title="关闭派发模式"
    width="400px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="disable-dispatch-content">
      <div class="confirm-text">
        确认关闭派发模式？
      </div>
      <div class="confirm-desc">
        关闭后，派发状态跟踪将停止，已有的派发记录不会被删除。
      </div>
    </div>

    <template #footer>
      <WsButton variant="secondary" @click="handleClose">取消</WsButton>
      <WsButton
        variant="primary"
        :loading="loading"
        @click="handleDisable"
      >
        确认关闭
      </WsButton>
    </template>
  </WsModal>
</template>

<style scoped>
.disable-dispatch-content {
  padding: 20px 0;
  text-align: center;
}

.confirm-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 8px;
}

.confirm-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
</style>
