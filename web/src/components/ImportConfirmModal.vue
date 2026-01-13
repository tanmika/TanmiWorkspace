<script setup lang="ts">
import { ref, watch } from 'vue'
import { adminApi } from '@/api/admin'
import WsButton from './ui/WsButton.vue'

interface WorkspaceInfo {
  id: string
  name: string
  isNew: boolean
}

interface Props {
  modelValue: boolean
  workspaces: WorkspaceInfo[]
  defaultTargetDir?: string
}

const props = withDefaults(defineProps<Props>(), {
  defaultTargetDir: '',  // 由后端 API 返回，根据环境自动设置
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [targetDir: string]
  cancel: []
}>()

const show = ref(props.modelValue)
const targetDir = ref(props.defaultTargetDir)

watch(
  () => props.modelValue,
  (val) => {
    show.value = val
    if (val) {
      targetDir.value = props.defaultTargetDir
    }
  }
)

function handleConfirm() {
  emit('update:modelValue', false)
  emit('confirm', targetDir.value)
}

function handleCancel() {
  emit('update:modelValue', false)
  emit('cancel')
}

function handleOverlayClick() {
  handleCancel()
}

async function pickTargetDir() {
  try {
    const result = await adminApi.pickDirectory()
    if (result.path) {
      targetDir.value = result.path
    }
  } catch (e) {
    console.error('无法打开目录选择器:', e)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="dialog-overlay" @click="handleOverlayClick">
        <div class="dialog" @click.stop>
          <div class="dialog-header">
            <span class="dialog-title">确认导入</span>
            <button class="dialog-close" @click="handleCancel">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="dialog-body">
            <div class="workspace-preview">
              <div class="preview-label">将导入以下工作区：</div>
              <div class="workspace-list">
                <div v-for="ws in workspaces" :key="ws.id" class="workspace-item">
                  <span class="workspace-name">{{ ws.name }}</span>
                  <span v-if="!ws.isNew" class="workspace-existing">(已存在)</span>
                </div>
              </div>
            </div>
            <div class="target-dir-section">
              <div class="target-label">目标目录：</div>
              <div class="target-input-row">
                <input type="text" class="target-input" v-model="targetDir" placeholder="选择目标目录...">
                <WsButton size="sm" variant="secondary" @click="pickTargetDir">浏览</WsButton>
              </div>
              <div class="target-hint">工作区将被复制到此目录的 .tanmi-workspace 子目录下</div>
            </div>
          </div>
          <div class="dialog-footer">
            <WsButton variant="secondary" size="sm" @click="handleCancel">
              取消
            </WsButton>
            <WsButton variant="primary" size="sm" @click="handleConfirm">
              确认导入
            </WsButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.dialog {
  background: var(--card-bg);
  border: 2px solid var(--border-heavy);
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.15);
  width: 450px;
  max-width: 90vw;
}

.dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}

.dialog-close {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-close:hover {
  color: var(--accent-red);
}

.dialog-body {
  padding: 20px;
}

.workspace-preview {
  margin-bottom: 16px;
}

.preview-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.workspace-list {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  max-height: 120px;
  overflow-y: auto;
}

.workspace-item {
  padding: 4px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.workspace-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main);
}

.workspace-existing {
  font-size: 12px;
  color: var(--text-muted);
}

.target-dir-section {
  margin-top: 16px;
}

.target-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.target-input-row {
  display: flex;
  gap: 8px;
}

.target-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-main);
  font-size: 13px;
  font-family: inherit;
}

.target-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.target-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  background: var(--card-footer);
}

/* Transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-active .dialog,
.modal-fade-leave-active .dialog {
  transition: transform 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .dialog,
.modal-fade-leave-to .dialog {
  transform: scale(0.95);
}
</style>
