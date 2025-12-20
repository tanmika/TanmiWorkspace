<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useWorkspaceStore } from '@/stores'
import { WarningFilled } from '@element-plus/icons-vue'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'success': []
}>()

const workspaceStore = useWorkspaceStore()
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
    git: 'Git 模式',
    'no-git': '无 Git 模式'
  }
})

async function handleSwitch() {
  loading.value = true
  try {
    const useGit = targetMode.value === 'git'
    await workspaceStore.switchDispatchMode(useGit)
    ElMessage.success(`已切换到${modeDisplayName.value[targetMode.value]}`)
    emit('success')
    emit('update:modelValue', false)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '切换派发模式失败')
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
    title="切换派发模式"
    width="520px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="switch-mode-content">
      <!-- 警告提示 -->
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        class="warning-box"
      >
        <template #title>
          <div class="warning-title">
            <el-icon :size="18"><WarningFilled /></el-icon>
            <span>切换派发模式可能带来风险</span>
          </div>
        </template>
        <div class="warning-content">
          <p>在派发任务进行中修改模式可能导致意外行为，强烈建议：</p>
          <ul>
            <li>确保当前<strong>没有正在执行的派发任务</strong></li>
            <li>了解两种模式的区别和影响</li>
            <li>切换后需重新启动派发流程</li>
          </ul>
        </div>
      </el-alert>

      <!-- 模式切换说明 -->
      <div class="mode-info">
        <div class="mode-row">
          <span class="label">当前模式:</span>
          <el-tag :type="currentMode === 'git' ? 'warning' : 'success'" size="large">
            {{ modeDisplayName[currentMode] }}
          </el-tag>
        </div>
        <div class="arrow">→</div>
        <div class="mode-row">
          <span class="label">切换到:</span>
          <el-tag :type="targetMode === 'git' ? 'warning' : 'success'" size="large">
            {{ modeDisplayName[targetMode] }}
          </el-tag>
        </div>
      </div>

      <!-- 模式说明 -->
      <div class="mode-description">
        <div v-if="targetMode === 'git'" class="desc-card git-mode">
          <h4>Git 模式特性</h4>
          <ul>
            <li>自动创建分支、提交变更</li>
            <li>可回滚代码和元数据</li>
            <li>会影响 Git 历史记录</li>
            <li>需要 Git 仓库环境</li>
          </ul>
        </div>
        <div v-else class="desc-card no-git-mode">
          <h4>无 Git 模式特性</h4>
          <ul>
            <li>仅更新元数据，不影响代码</li>
            <li>无需 Git 仓库</li>
            <li>更轻量、简单</li>
            <li>无法回滚代码修改</li>
          </ul>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="warning" :loading="loading" @click="handleSwitch">
          确认切换
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.switch-mode-content {
  padding: 8px 0;
}

.warning-box {
  margin-bottom: 20px;
}

.warning-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #e6a23c;
}

.warning-content {
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
}

.warning-content p {
  margin: 0 0 8px 0;
}

.warning-content ul {
  margin: 0;
  padding-left: 20px;
}

.warning-content li {
  margin-bottom: 4px;
}

.warning-content strong {
  color: #e6a23c;
}

.mode-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 20px 0;
  background: #f5f7fa;
  border-radius: 8px;
  margin-bottom: 20px;
}

.mode-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.mode-row .label {
  font-size: 13px;
  color: #909399;
  font-weight: 500;
}

.arrow {
  font-size: 24px;
  color: #409eff;
  font-weight: bold;
}

.mode-description {
  margin-top: 16px;
}

.desc-card {
  padding: 16px;
  border-radius: 8px;
  border: 2px solid;
}

.desc-card h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
}

.desc-card ul {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.8;
}

.desc-card li {
  margin-bottom: 4px;
  color: #606266;
}

.git-mode {
  background: #fdf6ec;
  border-color: #e6a23c;
}

.git-mode h4 {
  color: #e6a23c;
}

.no-git-mode {
  background: #f0f9ff;
  border-color: #67c23a;
}

.no-git-mode h4 {
  color: #67c23a;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
