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

async function handleEnable() {
  loading.value = true
  try {
    await workspaceStore.enableDispatch()
    toastStore.success('派发模式已启用')
    emit('success')
    emit('update:modelValue', false)
  } catch (error) {
    toastStore.error('启用派发失败', error instanceof Error ? error.message : undefined)
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
    title="启用派发模式"
    width="400px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="enable-dispatch-content">
      <div class="confirm-text">
        是否启用派发模式？
      </div>
      <div class="confirm-desc">
        启用后，系统将跟踪节点的派发状态，支持任务分发和进度管理。
      </div>
    </div>

    <template #footer>
      <WsButton variant="secondary" @click="handleClose">取消</WsButton>
      <WsButton variant="primary" :loading="loading" @click="handleEnable">
        启用
      </WsButton>
    </template>
  </WsModal>
</template>

<style scoped>
.enable-dispatch-content {
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
