<script setup lang="ts">
import { ref, computed } from 'vue'
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

// 当前模式
const currentMode = computed(() => {
  return workspaceStore.dispatchStatus === 'enabled-git' ? 'git' : 'no-git'
})

// 目标模式（切换后的模式）
const targetMode = computed(() => {
  return currentMode.value === 'git' ? 'no-git' : 'git'
})

// 模式显示名称
const modeDisplayName = computed(() => {
  return {
    git: 'GIT 模式',
    'no-git': '标准模式'
  }
})

async function handleSwitch() {
  loading.value = true
  try {
    const useGit = targetMode.value === 'git'
    await workspaceStore.switchDispatchMode(useGit)
    toastStore.success(`已切换到${modeDisplayName.value[targetMode.value]}`)
    emit('success')
    emit('update:modelValue', false)
  } catch (error) {
    toastStore.error('切换派发模式失败', error instanceof Error ? error.message : undefined)
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
    title="切换派发模式"
    width="500px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="switch-mode-content">
      <!-- 警告框 -->
      <div class="warning-box">
        <strong>[!] 切换派发模式可能带来风险</strong><br>
        - 确保当前没有正在执行的派发任务<br>
        - 切换后需重新启动派发流程
      </div>

      <!-- 模式切换可视化 -->
      <div class="mode-switch-viz">
        <div class="mode-tag" :class="currentMode">
          {{ modeDisplayName[currentMode] }}
        </div>
        <div class="mode-arrow">→</div>
        <div class="mode-tag" :class="targetMode">
          {{ modeDisplayName[targetMode] }}
        </div>
      </div>

      <!-- 切换说明 -->
      <div class="switch-desc">
        <template v-if="targetMode === 'git'">
          即将切换到<strong>Git 模式</strong>。系统将自动创建分支、提交代码，并在失败时执行回滚。
        </template>
        <template v-else>
          即将切换到<strong>标准模式</strong>。系统将不再自动创建 Git 分支或提交代码，仅维护任务元数据。
        </template>
      </div>
    </div>

    <template #footer>
      <WsButton variant="secondary" @click="handleClose">取消</WsButton>
      <WsButton variant="accent" :loading="loading" @click="handleSwitch">
        确认切换
      </WsButton>
    </template>
  </WsModal>
</template>

<style scoped>
.switch-mode-content {
  padding: 0;
}

.warning-box {
  border: 1px solid var(--accent-orange);
  background: #fffcf0;
  padding: 12px;
  font-size: 12px;
  color: #b45309;
  margin-bottom: 16px;
  border-left-width: 4px;
  line-height: 1.6;
}

[data-theme="dark"] .warning-box {
  background: #2a2010;
  color: #fbbf24;
  border-color: #b8860b;
}

.mode-switch-viz {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  background: #f5f7fa;
  padding: 20px;
  margin-bottom: 20px;
}

[data-theme="dark"] .mode-switch-viz {
  background: #1a1a1a;
}

.mode-tag {
  padding: 6px 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  font-family: var(--mono-font);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.mode-tag.git {
  border-color: var(--accent-orange);
  color: #d97706;
}

.mode-tag.no-git {
  border-color: var(--accent-green);
  color: var(--accent-green);
}

.mode-arrow {
  font-size: 18px;
  color: var(--text-muted);
}

.switch-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.switch-desc strong {
  color: var(--text-main);
}
</style>
