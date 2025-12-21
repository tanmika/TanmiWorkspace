<script setup lang="ts">
import { ref, watch } from 'vue'
import { useWorkspaceStore, useToastStore } from '@/stores'
import WsModal from '@/components/ui/WsModal.vue'
import WsButton from '@/components/ui/WsButton.vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'success': []
}>()

const workspaceStore = useWorkspaceStore()
const toastStore = useToastStore()
const useGit = ref(false)
const loading = ref(false)

// 重置选择
watch(() => props.modelValue, (val) => {
  if (val) {
    useGit.value = false
  }
})

async function handleEnable() {
  loading.value = true
  try {
    await workspaceStore.enableDispatch(useGit.value)
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
    width="500px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="enable-dispatch-content">
      <div class="section-label">选择模式：</div>

      <div class="mode-options">
        <div
          class="card-option"
          :class="{ selected: !useGit }"
          @click="useGit = false"
        >
          <div class="card-option-title">
            <span>标准模式 (无 Git)</span>
          </div>
          <div class="card-option-desc">
            仅更新元数据，不影响代码。适合轻量级任务管理。
          </div>
        </div>

        <div
          class="card-option"
          :class="{ selected: useGit }"
          @click="useGit = true"
        >
          <div class="card-option-title">
            <span>Git 模式 (实验功能)</span>
            <span class="tag-experimental">Experimental</span>
          </div>
          <div class="card-option-desc">
            自动创建分支、提交、回滚。提供完整的代码版本控制能力。
          </div>
        </div>
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
  padding: 0;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 12px;
}

.mode-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-option {
  border: 1px solid var(--border-color);
  padding: 12px;
  cursor: pointer;
  transition: all 0.1s;
  background: var(--card-bg);
}

.card-option:hover {
  border-color: var(--border-heavy);
  background: #f9fafb;
}

[data-theme="dark"] .card-option:hover {
  background: #1a1a1a;
}

.card-option.selected {
  border-color: var(--accent-blue);
  background: rgba(37, 99, 235, 0.05);
  position: relative;
}

[data-theme="dark"] .card-option.selected {
  background: rgba(37, 99, 235, 0.15);
}

.card-option-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-main);
}

.card-option-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.tag-experimental {
  font-family: var(--mono-font);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.2);
  text-transform: uppercase;
}

[data-theme="dark"] .tag-experimental {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}
</style>
