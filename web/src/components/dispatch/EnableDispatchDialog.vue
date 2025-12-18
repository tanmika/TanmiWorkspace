<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useWorkspaceStore } from '@/stores'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'success': []
}>()

const workspaceStore = useWorkspaceStore()
const useGit = ref(false)
const loading = ref(false)

async function handleEnable() {
  loading.value = true
  try {
    await workspaceStore.enableDispatch(useGit.value)
    ElMessage.success('派发模式已启用')
    emit('success')
    emit('update:modelValue', false)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '启用派发失败')
  } finally {
    loading.value = false
  }
}

function handleClose() {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="启用派发模式"
    width="500px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="enable-dispatch-content">
      <div class="mode-section">
        <div class="section-label">选择模式</div>
        <el-radio-group v-model="useGit" class="mode-options">
          <el-radio :label="false" size="large">
            <div class="mode-option">
              <div class="mode-title">标准模式（无 Git）</div>
              <div class="mode-desc">仅更新元数据，不影响代码</div>
            </div>
          </el-radio>
          <el-radio :label="true" size="large">
            <div class="mode-option">
              <div class="mode-title">Git 模式（实验功能）</div>
              <div class="mode-desc warning-text">自动创建分支、提交、回滚，可能影响 Git 历史</div>
            </div>
          </el-radio>
        </el-radio-group>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleEnable">
        启用
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.enable-dispatch-content {
  padding: 8px 0;
}

.mode-section {
  margin-bottom: 16px;
}

.section-label {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 12px;
}

.mode-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.mode-options :deep(.el-radio) {
  margin-right: 0;
  padding: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  transition: all 0.2s;
}

.mode-options :deep(.el-radio:hover) {
  border-color: #409eff;
  background: #f5f7fa;
}

.mode-options :deep(.el-radio.is-checked) {
  border-color: #409eff;
  background: #ecf5ff;
}

.mode-option {
  margin-left: 8px;
  flex: 1;
}

.mode-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.mode-desc {
  font-size: 12px;
  color: #909399;
}

.mode-desc.warning-text {
  color: #e6a23c;
}
</style>
