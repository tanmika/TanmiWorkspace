<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()

// Props
interface Props {
  visible: boolean
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

// 本地状态
const localMode = ref<'none' | 'git' | 'no-git'>('none')

// 监听弹窗打开，加载配置
watch(() => props.visible, async (isVisible) => {
  if (isVisible) {
    await settingsStore.loadSettings()
    localMode.value = settingsStore.settings.defaultDispatchMode
  }
})

// 关闭弹窗
function handleClose() {
  emit('update:visible', false)
}

// 保存配置
async function handleSave() {
  // 如果从 none 切换到 git 模式，显示警告确认
  if (settingsStore.settings.defaultDispatchMode !== 'git' && localMode.value === 'git') {
    try {
      await ElMessageBox.confirm(
        '启用 Git 模式后，新建工作区的派发功能将默认使用 Git 模式（自动创建分支、提交、回滚）。此功能为实验性功能，可能会影响 Git 历史。确定要启用吗？',
        'Git 模式警告',
        {
          type: 'warning',
          confirmButtonText: '确定启用',
          cancelButtonText: '取消',
        }
      )
    } catch {
      // 用户取消
      return
    }
  }

  try {
    await settingsStore.updateSettings({
      defaultDispatchMode: localMode.value,
    })
    ElMessage.success('配置已保存')
    handleClose()
  } catch {
    ElMessage.error('保存失败')
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="设置"
    width="600px"
    @close="handleClose"
  >
    <div class="settings-content">
      <!-- 派发模式设置 -->
      <div class="setting-section">
        <div class="section-header">
          <el-icon :size="18" style="margin-right: 8px">
            <Setting />
          </el-icon>
          <h3>派发默认模式</h3>
        </div>
        <div class="section-description">
          选择新建工作区时的默认派发模式。已启用派发的工作区不受影响。
        </div>

        <el-radio-group v-model="localMode" class="mode-radio-group">
          <el-radio value="none" size="large">
            <div class="radio-content">
              <div class="radio-title">不启用派发</div>
              <div class="radio-desc">默认不使用派发功能（推荐）</div>
            </div>
          </el-radio>

          <el-radio value="no-git" size="large">
            <div class="radio-content">
              <div class="radio-title">无 Git 模式</div>
              <div class="radio-desc">仅更新元数据，不影响代码仓库</div>
            </div>
          </el-radio>

          <el-radio value="git" size="large">
            <div class="radio-content">
              <div class="radio-title">Git 模式（实验功能）</div>
              <div class="radio-desc">自动创建分支、提交、回滚</div>
            </div>
          </el-radio>
        </el-radio-group>

        <!-- Git 模式警告 -->
        <el-alert
          v-if="localMode === 'git'"
          type="warning"
          :closable="false"
          class="git-warning"
        >
          <template #title>
            <div class="warning-title">实验功能警告</div>
          </template>
          <div class="warning-content">
            <p>Git 模式可能带来以下风险：</p>
            <ul>
              <li>自动创建 <code>tanmi_workspace/process/*</code> 分支</li>
              <li>任务完成时自动提交代码</li>
              <li>测试失败时执行 <code>git reset --hard</code>（可能丢失未提交代码）</li>
              <li>合并时可能产生冲突</li>
            </ul>
            <p style="margin-top: 8px; font-weight: 600;">
              建议在生产环境使用前充分测试
            </p>
          </div>
        </el-alert>

        <!-- 无 Git 模式说明 -->
        <el-alert
          v-if="localMode === 'no-git'"
          type="info"
          :closable="false"
          class="no-git-info"
        >
          <div class="info-content">
            <p>无 Git 模式限制：</p>
            <ul>
              <li>测试失败时无法自动回滚</li>
              <li>建议在执行前手动备份重要文件</li>
            </ul>
          </div>
        </el-alert>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="settingsStore.loading">
          保存
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.settings-content {
  padding: 8px 0;
}

.setting-section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.section-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.section-description {
  color: #606266;
  font-size: 14px;
  margin-bottom: 16px;
  line-height: 1.5;
}

.mode-radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.mode-radio-group :deep(.el-radio) {
  margin-right: 0;
  width: 100%;
  height: auto;
  padding: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  transition: all 0.2s;
}

.mode-radio-group :deep(.el-radio:hover) {
  border-color: #409eff;
  background-color: #f0f9ff;
}

.mode-radio-group :deep(.el-radio.is-checked) {
  border-color: #409eff;
  background-color: #ecf5ff;
}

.radio-content {
  margin-left: 8px;
}

.radio-title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
  margin-bottom: 4px;
}

.radio-desc {
  font-size: 13px;
  color: #909399;
}

.git-warning,
.no-git-info {
  margin-top: 16px;
}

.warning-title {
  font-weight: 600;
  font-size: 14px;
}

.warning-content,
.info-content {
  font-size: 13px;
  line-height: 1.6;
}

.warning-content p,
.info-content p {
  margin: 0 0 8px 0;
}

.warning-content ul,
.info-content ul {
  margin: 0;
  padding-left: 20px;
}

.warning-content li,
.info-content li {
  margin-bottom: 4px;
}

.warning-content code {
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
