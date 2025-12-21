<script setup lang="ts">
import { ref, watch } from 'vue'
import { useWorkspaceStore, useToastStore } from '@/stores'
import { workspaceApi } from '@/api'
import type { MergeStrategy, DisableDispatchQueryResult } from '@/types'
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
const loading = ref(false)
const queryLoading = ref(false)
const dispatchInfo = ref<DisableDispatchQueryResult | null>(null)

// 表单数据
const mergeStrategy = ref<MergeStrategy>('squash')
const keepBackupBranch = ref(false)
const keepProcessBranch = ref(false)
const commitMessage = ref('')

// 查询派发状态
async function queryDispatchStatus() {
  if (!workspaceStore.currentWorkspace) return

  queryLoading.value = true
  try {
    dispatchInfo.value = await workspaceApi.queryDisableDispatch(workspaceStore.currentWorkspace.id)
  } catch (error) {
    toastStore.error('获取派发状态失败')
    emit('update:modelValue', false)
  } finally {
    queryLoading.value = false
  }
}

// 监听对话框打开
watch(() => props.modelValue, (val) => {
  if (val) {
    queryDispatchStatus()
    // 重置表单
    mergeStrategy.value = 'squash'
    keepBackupBranch.value = false
    keepProcessBranch.value = false
    commitMessage.value = ''
  }
})

async function handleDisable() {
  loading.value = true
  try {
    await workspaceStore.disableDispatch({
      mergeStrategy: mergeStrategy.value,
      keepBackupBranch: keepBackupBranch.value,
      keepProcessBranch: keepProcessBranch.value,
      commitMessage: mergeStrategy.value === 'squash' ? commitMessage.value : undefined,
    })
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

// 策略选项
const strategyOptions: { value: MergeStrategy; title: string; desc: string }[] = [
  { value: 'sequential', title: '按顺序合并 (保留历史)', desc: '保留所有提交记录' },
  { value: 'squash', title: 'Squash (压缩提交)', desc: '合并为单个提交' },
  { value: 'cherry-pick', title: 'Cherry-pick (遴选)', desc: '遴选到当前分支' },
  { value: 'skip', title: 'Drop (丢弃分支)', desc: '不合并，直接丢弃' },
]
</script>

<template>
  <WsModal
    :model-value="modelValue"
    title="关闭派发模式"
    width="500px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="disable-dispatch-content">
      <!-- 加载中 -->
      <div v-if="queryLoading" class="loading-state">
        正在加载派发状态...
      </div>

      <!-- 无 Git 模式 - 简单确认 -->
      <div v-else-if="dispatchInfo && !dispatchInfo.status.useGit" class="simple-confirm">
        确定要关闭派发模式吗？
      </div>

      <!-- Git 模式 - 显示合并选项 -->
      <div v-else-if="dispatchInfo && dispatchInfo.status.useGit" class="git-options">
        <!-- 提交信息 -->
        <div v-if="dispatchInfo.status.processCommits && dispatchInfo.status.processCommits.length > 0" class="info-box">
          当前有 <strong>{{ dispatchInfo.status.processCommits.length }}</strong> 个提交待处理
        </div>

        <!-- 合并策略 -->
        <div class="form-section">
          <div class="section-label">合并策略：</div>
          <div class="strategy-options">
            <div
              v-for="option in strategyOptions"
              :key="option.value"
              class="card-option"
              :class="{ selected: mergeStrategy === option.value }"
              @click="mergeStrategy = option.value"
            >
              <div class="card-option-title">{{ option.title }}</div>
            </div>
          </div>
        </div>

        <!-- Squash 提交信息 -->
        <div v-if="mergeStrategy === 'squash'" class="form-section">
          <div class="section-label">提交信息：</div>
          <textarea
            v-model="commitMessage"
            class="commit-input"
            placeholder="feat: complete workspace task dispatch"
            rows="3"
          />
        </div>

        <!-- 分支保留选项 -->
        <div class="form-section">
          <label class="checkbox-custom">
            <input type="checkbox" v-model="keepBackupBranch">
            <span class="checkbox-box"></span>
            <span class="checkbox-text">保留备份分支</span>
          </label>
          <div v-if="keepBackupBranch && dispatchInfo.status.backupBranch" class="branch-name">
            <span class="code-inline">{{ dispatchInfo.status.backupBranch }}</span>
          </div>

          <label class="checkbox-custom" :class="{ disabled: mergeStrategy === 'skip' }">
            <input
              type="checkbox"
              v-model="keepProcessBranch"
              :disabled="mergeStrategy === 'skip'"
            >
            <span class="checkbox-box"></span>
            <span class="checkbox-text">保留派发分支</span>
          </label>
        </div>
      </div>
    </div>

    <template #footer>
      <WsButton variant="secondary" @click="handleClose">取消</WsButton>
      <WsButton
        variant="primary"
        :loading="loading"
        :disabled="queryLoading"
        @click="handleDisable"
      >
        确认关闭
      </WsButton>
    </template>
  </WsModal>
</template>

<style scoped>
.disable-dispatch-content {
  padding: 0;
  min-height: 100px;
}

.loading-state {
  padding: 40px 0;
  text-align: center;
  color: var(--text-muted);
  font-family: var(--mono-font);
  font-size: 12px;
}

.simple-confirm {
  padding: 40px 0;
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary);
}

.git-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-box {
  background: #f5f7fa;
  padding: 12px;
  font-size: 12px;
  font-family: var(--mono-font);
  color: var(--text-secondary);
}

[data-theme="dark"] .info-box {
  background: #1a1a1a;
}

.info-box strong {
  color: var(--text-main);
}

.form-section {
  margin-bottom: 8px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 8px;
}

.strategy-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-option {
  border: 1px solid var(--border-color);
  padding: 8px 12px;
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
}

[data-theme="dark"] .card-option.selected {
  background: rgba(37, 99, 235, 0.15);
}

.card-option-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}

.commit-input {
  width: 100%;
  padding: 8px;
  font-size: 13px;
  font-family: var(--mono-font);
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-main);
  resize: none;
  outline: none;
  transition: border-color 0.15s;
}

.commit-input:focus {
  border-color: var(--border-heavy);
}

.commit-input::placeholder {
  color: var(--text-muted);
}

/* Custom Checkbox */
.checkbox-custom {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
  margin-bottom: 8px;
}

.checkbox-custom.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-custom input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.checkbox-box {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-heavy);
  background: var(--card-bg);
  position: relative;
  flex-shrink: 0;
  transition: all 0.1s;
}

.checkbox-custom:hover .checkbox-box {
  border-color: var(--accent-blue);
}

.checkbox-custom input:checked + .checkbox-box {
  background: var(--border-heavy);
  border-color: var(--border-heavy);
}

.checkbox-custom input:checked + .checkbox-box::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 4px;
  border: 2px solid #fff;
  border-top: none;
  border-right: none;
  transform: translate(-50%, -60%) rotate(-45deg);
}

.checkbox-text {
  color: var(--text-main);
}

.branch-name {
  margin-left: 24px;
  margin-bottom: 8px;
}

.code-inline {
  font-family: var(--mono-font);
  font-size: 11px;
  background: #f5f7fa;
  padding: 2px 6px;
  display: inline-block;
  color: var(--text-secondary);
}

[data-theme="dark"] .code-inline {
  background: #1a1a1a;
}
</style>
