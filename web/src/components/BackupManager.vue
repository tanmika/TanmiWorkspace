<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useToastStore } from '@/stores/toast'
import WsModal from '@/components/ui/WsModal.vue'
import WsButton from '@/components/ui/WsButton.vue'
import WsConfirmDialog from '@/components/ui/WsConfirmDialog.vue'

const toastStore = useToastStore()

// 备份元数据类型（与后端 GlobalBackupTrigger 保持一致）
interface BackupMeta {
  name: string
  createdAt: string
  trigger: 'manual' | 'beta_update' | 'pre_restore'
  codeVersion: string
  size: number
}

// Props
interface Props {
  visible: boolean
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'change'): void
}>()

// 状态
const loading = ref(false)
const backups = ref<BackupMeta[]>([])
const createLoading = ref(false)
const restoreLoading = ref(false)
const deleteLoading = ref(false)
const importLoading = ref(false)

// 拖拽状态
const isDragging = ref(false)
const dropZoneRef = ref<HTMLDivElement>()

// 确认弹窗状态
const showRestoreConfirm = ref(false)
const showDeleteConfirm = ref(false)
const pendingBackup = ref<BackupMeta | null>(null)

// 计算属性
const hasBackups = computed(() => backups.value.length > 0)

// 加载备份列表
async function loadBackups() {
  loading.value = true
  try {
    const response = await fetch('/api/backup/global')
    if (!response.ok) {
      throw new Error('加载备份列表失败')
    }
    const data = await response.json()
    backups.value = data.backups || []
  } catch (e) {
    console.error('[BackupManager] loadBackups failed:', e)
    toastStore.error('加载备份列表失败')
  } finally {
    loading.value = false
  }
}

// 监听弹窗打开
watch(() => props.visible, async (isVisible) => {
  if (isVisible) {
    await loadBackups()
  }
})

// 关闭弹窗
function handleClose() {
  emit('update:visible', false)
}

// 创建备份
async function handleCreate() {
  createLoading.value = true
  try {
    const response = await fetch('/api/backup/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual' })
    })
    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || '创建备份失败')
    }
    toastStore.success('备份创建成功')
    await loadBackups()
    emit('change')
  } catch (e) {
    console.error('[BackupManager] create failed:', e)
    toastStore.error(e instanceof Error ? e.message : '创建备份失败')
  } finally {
    createLoading.value = false
  }
}

// 确认恢复
function confirmRestore(backup: BackupMeta) {
  pendingBackup.value = backup
  showRestoreConfirm.value = true
}

// 执行恢复
async function doRestore() {
  if (!pendingBackup.value) return

  restoreLoading.value = true
  try {
    const response = await fetch(`/api/backup/global/${encodeURIComponent(pendingBackup.value.name)}/restore`, {
      method: 'POST'
    })
    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || '恢复失败')
    }
    toastStore.success('备份恢复成功')
    await loadBackups()
  } catch (e) {
    console.error('[BackupManager] restore failed:', e)
    toastStore.error(e instanceof Error ? e.message : '恢复失败')
  } finally {
    restoreLoading.value = false
    pendingBackup.value = null
  }
}

// 下载备份
function handleDownload(backup: BackupMeta) {
  window.open(`/api/backup/global/${encodeURIComponent(backup.name)}/download`, '_blank')
}

// 确认删除
function confirmDelete(backup: BackupMeta) {
  pendingBackup.value = backup
  showDeleteConfirm.value = true
}

// 执行删除
async function doDelete() {
  if (!pendingBackup.value) return

  deleteLoading.value = true
  try {
    const response = await fetch(`/api/backup/global/${encodeURIComponent(pendingBackup.value.name)}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || '删除失败')
    }
    toastStore.success('备份已删除')
    await loadBackups()
    emit('change')
  } catch (e) {
    console.error('[BackupManager] delete failed:', e)
    toastStore.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleteLoading.value = false
    pendingBackup.value = null
  }
}

// 导入备份 - 文件选择
function handleImportClick() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.twbak'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      await importFile(file)
    }
  }
  input.click()
}

// 导入备份 - 执行上传
async function importFile(file: File) {
  if (!file.name.endsWith('.twbak')) {
    toastStore.warning('仅支持 .twbak 格式的备份文件')
    return
  }

  importLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/backup/global/import', {
      method: 'POST',
      body: formData
    })
    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || '导入失败')
    }
    toastStore.success('备份导入成功')
    await loadBackups()
    emit('change')
  } catch (e) {
    console.error('[BackupManager] import failed:', e)
    toastStore.error(e instanceof Error ? e.message : '导入失败')
  } finally {
    importLoading.value = false
  }
}

// 拖拽事件
function handleDragEnter(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = true
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  const dropZone = dropZoneRef.value
  if (dropZone) {
    const relatedTarget = e.relatedTarget as Node | null
    if (!relatedTarget || !dropZone.contains(relatedTarget)) {
      isDragging.value = false
    }
  }
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = false

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  const file = files.item(0)
  if (file) {
    await importFile(file)
  }
}

// 格式化时间
function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 触发类型标签（与后端 GlobalBackupTrigger 保持一致）
function triggerLabel(trigger: string): string {
  const labels: Record<string, string> = {
    manual: '手动',
    beta_update: 'Beta更新前',
    pre_restore: '恢复前'
  }
  return labels[trigger] || trigger
}
</script>

<template>
  <WsModal
    :model-value="visible"
    title="BACKUP MANAGER"
    width="560px"
    @update:model-value="(val: boolean) => !val && handleClose()"
    @close="handleClose"
  >
    <div class="backup-manager">
      <!-- 操作栏 -->
      <div class="action-bar">
        <WsButton variant="primary" :loading="createLoading" @click="handleCreate">
          + 创建备份
        </WsButton>
        <span class="action-hint">工作台备份仅包含全局索引配置，不包含具体工作区内容</span>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="loading-state">
        加载中...
      </div>

      <!-- 备份列表 -->
      <div v-else-if="hasBackups" class="backup-list">
        <div v-for="backup in backups" :key="backup.name" class="backup-item">
          <div class="backup-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 8v13H3V8"/>
              <path d="M1 3h22v5H1z"/>
              <path d="M10 12h4"/>
            </svg>
          </div>
          <div class="backup-info">
            <div class="backup-name">{{ backup.name }}</div>
            <div class="backup-meta">
              <span class="meta-item">{{ formatTime(backup.createdAt) }}</span>
              <span class="meta-sep">|</span>
              <span class="meta-item">v{{ backup.codeVersion }}</span>
              <span class="meta-sep">|</span>
              <span class="meta-item">{{ formatSize(backup.size) }}</span>
              <span class="meta-sep">|</span>
              <span class="meta-item trigger-tag" :class="backup.trigger">{{ triggerLabel(backup.trigger) }}</span>
            </div>
          </div>
          <div class="backup-actions">
            <WsButton variant="ghost" size="sm" @click="confirmRestore(backup)">恢复</WsButton>
            <WsButton variant="ghost" size="sm" @click="handleDownload(backup)">下载</WsButton>
            <WsButton variant="danger" size="sm" @click="confirmDelete(backup)">删除</WsButton>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M21 8v13H3V8"/>
            <path d="M1 3h22v5H1z"/>
            <path d="M10 12h4"/>
          </svg>
        </div>
        <div class="empty-text">暂无备份</div>
        <div class="empty-hint">点击「创建备份」开始保护您的数据</div>
      </div>

      <!-- 拖拽导入区 -->
      <div
        ref="dropZoneRef"
        class="drop-zone"
        :class="{ dragging: isDragging }"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="handleImportClick"
      >
        <div class="drop-zone-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div class="drop-zone-text" :class="{ highlight: isDragging }">
          {{ isDragging ? '释放以导入' : '拖拽 .twbak 文件到此处，或点击选择' }}
        </div>
      </div>
    </div>
  </WsModal>

  <!-- 恢复确认弹窗 -->
  <WsConfirmDialog
    v-model="showRestoreConfirm"
    title="确认恢复"
    message="恢复将覆盖当前配置，系统会先自动备份当前状态。确定继续？"
    type="warning"
    confirm-text="确认恢复"
    cancel-text="取消"
    @confirm="doRestore"
  />

  <!-- 删除确认弹窗 -->
  <WsConfirmDialog
    v-model="showDeleteConfirm"
    title="确认删除"
    message="删除后将无法恢复此备份。确定继续？"
    type="danger"
    confirm-text="确认删除"
    cancel-text="取消"
    @confirm="doDelete"
  />
</template>

<style scoped>
.backup-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 操作栏 */
.action-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-hint {
  font-size: 11px;
  color: var(--text-muted);
  flex: 1;
}

/* 加载状态 */
.loading-state {
  text-align: center;
  color: var(--text-muted);
  padding: 40px 0;
  font-size: 13px;
}

/* 备份列表 */
.backup-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.backup-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--path-bg);
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}

.backup-item:hover {
  border-color: var(--border-heavy);
}

.backup-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e3f2fd;
  color: #1565c0;
  flex-shrink: 0;
}

[data-theme="dark"] .backup-icon {
  background: #1a3a5c;
  color: #64b5f6;
}

.backup-info {
  flex: 1;
  min-width: 0;
}

.backup-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.backup-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.meta-item {
  font-family: var(--mono-font);
}

.meta-sep {
  color: var(--border-color);
}

.trigger-tag {
  padding: 1px 6px;
  background: var(--border-color);
  font-size: 10px;
}

.trigger-tag.manual {
  background: #e3f2fd;
  color: #1565c0;
}

[data-theme="dark"] .trigger-tag.manual {
  background: #1a3a5c;
  color: #64b5f6;
}

.trigger-tag.beta_update {
  background: #fff8e1;
  color: #f57c00;
}

[data-theme="dark"] .trigger-tag.beta_update {
  background: #2a2010;
  color: #ffb74d;
}

.trigger-tag.pre_restore {
  background: #e8f5e9;
  color: #2e7d32;
}

[data-theme="dark"] .trigger-tag.pre_restore {
  background: #1b3320;
  color: #66bb6a;
}

.backup-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.empty-icon {
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text-secondary);
}

.empty-hint {
  font-size: 12px;
}

/* 拖拽区域 */
.drop-zone {
  border: 2px dashed var(--border-color);
  padding: 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--path-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.drop-zone:hover {
  border-color: var(--border-heavy);
  background: var(--card-bg);
}

.drop-zone.dragging {
  border-color: var(--accent-red);
  background: #fff5f5;
}

[data-theme="dark"] .drop-zone.dragging {
  background: #2d1b1b;
}

.drop-zone-icon {
  color: var(--text-secondary);
}

.drop-zone-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.drop-zone-text.highlight {
  color: var(--accent-red);
  font-weight: 600;
}
</style>
