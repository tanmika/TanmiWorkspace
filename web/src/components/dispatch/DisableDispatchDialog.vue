<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useWorkspaceStore } from '@/stores'
import { workspaceApi } from '@/api'
import type { MergeStrategy, DisableDispatchQueryResult } from '@/types'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'success': []
}>()

const workspaceStore = useWorkspaceStore()
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
    ElMessage.error('获取派发状态失败')
    emit('update:modelValue', false)
  } finally {
    queryLoading.value = false
  }
}

async function handleDisable() {
  loading.value = true
  try {
    await workspaceStore.disableDispatch({
      mergeStrategy: mergeStrategy.value,
      keepBackupBranch: keepBackupBranch.value,
      keepProcessBranch: keepProcessBranch.value,
      commitMessage: mergeStrategy.value === 'squash' ? commitMessage.value : undefined,
    })
    ElMessage.success('派发模式已关闭')
    emit('success')
    emit('update:modelValue', false)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '关闭派发失败')
  } finally {
    loading.value = false
  }
}

function handleClose() {
  emit('update:modelValue', false)
}

onMounted(() => {
  if (props.modelValue) {
    queryDispatchStatus()
  }
})
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="关闭派发模式"
    width="500px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="queryLoading" class="disable-dispatch-content">
      <!-- 无 Git 模式 - 简单确认 -->
      <div v-if="dispatchInfo && !dispatchInfo.status.useGit" class="simple-confirm">
        <p>确定要关闭派发模式吗？</p>
      </div>

      <!-- Git 模式 - 显示合并选项 -->
      <div v-else-if="dispatchInfo && dispatchInfo.status.useGit" class="git-options">
        <div v-if="dispatchInfo.status.processCommits && dispatchInfo.status.processCommits.length > 0" class="info-text">
          当前有 {{ dispatchInfo.status.processCommits.length }} 个提交在派发分支上。
        </div>

        <div class="form-section">
          <div class="section-label">合并策略</div>
          <el-radio-group v-model="mergeStrategy" class="strategy-options">
            <el-radio value="sequential" size="large">
              <div class="option-text">
                <div class="option-title">按顺序合并</div>
                <div class="option-desc">保留提交历史</div>
              </div>
            </el-radio>
            <el-radio value="squash" size="large">
              <div class="option-text">
                <div class="option-title">squash</div>
                <div class="option-desc">压缩为一个提交</div>
              </div>
            </el-radio>
            <el-radio value="cherry-pick" size="large">
              <div class="option-text">
                <div class="option-title">cherry-pick</div>
                <div class="option-desc">遴选到当前分支</div>
              </div>
            </el-radio>
            <el-radio value="skip" size="large">
              <div class="option-text">
                <div class="option-title">跳过</div>
                <div class="option-desc">不合并，保留分支</div>
              </div>
            </el-radio>
          </el-radio-group>
        </div>

        <div v-if="mergeStrategy === 'squash'" class="form-section">
          <div class="section-label">提交信息</div>
          <el-input
            v-model="commitMessage"
            type="textarea"
            :rows="3"
            placeholder="输入 squash 合并的提交信息（可选）"
          />
        </div>

        <div class="form-section">
          <div class="section-label">分支保留选项</div>
          <div class="checkbox-group">
            <el-checkbox v-model="keepBackupBranch">保留备份分支</el-checkbox>
            <el-checkbox v-model="keepProcessBranch" :disabled="mergeStrategy === 'skip'">
              保留派发分支
            </el-checkbox>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button
        type="primary"
        :loading="loading"
        :disabled="queryLoading"
        @click="handleDisable"
      >
        确认关闭
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.disable-dispatch-content {
  padding: 8px 0;
  min-height: 100px;
}

.simple-confirm {
  padding: 20px 0;
  text-align: center;
  font-size: 14px;
  color: #606266;
}

.git-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-text {
  font-size: 14px;
  color: #606266;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.form-section {
  margin-bottom: 16px;
}

.section-label {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 12px;
}

.strategy-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.strategy-options :deep(.el-radio) {
  margin-right: 0;
  padding: 10px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  transition: all 0.2s;
}

.strategy-options :deep(.el-radio:hover) {
  border-color: #409eff;
  background: #f5f7fa;
}

.strategy-options :deep(.el-radio.is-checked) {
  border-color: #409eff;
  background: #ecf5ff;
}

.option-text {
  margin-left: 8px;
  flex: 1;
}

.option-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.option-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
