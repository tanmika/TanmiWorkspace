<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { adminApi, type SyncCleanPreviewResult, type SyncCleanExecuteResult, type IndexStatsResult } from '@/api/admin'
import { useToastStore } from '@/stores/toast'
import WsModal from '@/components/ui/WsModal.vue'
import WsButton from '@/components/ui/WsButton.vue'

const toastStore = useToastStore()

// Props
interface Props {
  visible: boolean
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'workspaceImported'): void
}>()

// 状态
const loading = ref(false)
const stats = ref<IndexStatsResult | null>(null)

// 拖拽相关
const isDragging = ref(false)
const dropZoneRef = ref<HTMLDivElement>()

// 选中项相关
type SelectedType = 'none' | 'file' | 'directory'
const selectedType = ref<SelectedType>('none')
const selectedFile = ref<File | null>(null)
const selectedPath = ref('')
const selectedName = ref('')
const selectedMeta = ref('')

// 目标目录（仅用于 .twsp 导入）
const targetDir = ref('~/.tanmi-workspace/import/')

// 手动输入模式
const showManualInput = ref(false)
const manualPath = ref('')

// 导入状态
const importLoading = ref(false)

// 结果相关
type ResultType = 'none' | 'success' | 'warning' | 'error'
const resultType = ref<ResultType>('none')
const resultMessage = ref('')
const resultWarnings = ref<string[]>([])

// 同步清理相关
type SyncCleanState = 'idle' | 'previewing' | 'previewed' | 'executing' | 'done' | 'error'
const syncCleanState = ref<SyncCleanState>('idle')
const syncCleanPreview = ref<SyncCleanPreviewResult | null>(null)
const syncCleanResult = ref<SyncCleanExecuteResult | null>(null)
const syncCleanError = ref<string | null>(null)

// 计算属性
const hasPreviewChanges = computed(() => {
  if (!syncCleanPreview.value) return false
  return syncCleanPreview.value.hasChanges
})

const hasSelection = computed(() => selectedType.value !== 'none')

// 加载统计数据
async function loadStats() {
  try {
    stats.value = await adminApi.getIndexStats()
  } catch (e) {
    console.error('加载索引统计失败:', e)
  }
}

// 监听弹窗打开
watch(() => props.visible, async (isVisible) => {
  if (isVisible) {
    loading.value = true
    resetState()
    await loadStats()
    loading.value = false
  }
})

// 重置状态
function resetState() {
  selectedType.value = 'none'
  selectedFile.value = null
  selectedPath.value = ''
  selectedName.value = ''
  selectedMeta.value = ''
  resultType.value = 'none'
  resultMessage.value = ''
  resultWarnings.value = []
  showManualInput.value = false
  manualPath.value = ''
  syncCleanState.value = 'idle'
  syncCleanPreview.value = null
  syncCleanResult.value = null
  syncCleanError.value = null
}

// 关闭弹窗
function handleClose() {
  emit('update:visible', false)
}

// 清除选择
function clearSelection() {
  selectedType.value = 'none'
  selectedFile.value = null
  selectedPath.value = ''
  selectedName.value = ''
  selectedMeta.value = ''
  resultType.value = 'none'
  resultMessage.value = ''
  resultWarnings.value = []
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
  // 检查 relatedTarget 是否在拖拽区域内
  const dropZone = dropZoneRef.value
  if (dropZone) {
    const relatedTarget = e.relatedTarget as Node | null
    // 如果 relatedTarget 不在 dropZone 内，说明真的离开了
    if (!relatedTarget || !dropZone.contains(relatedTarget)) {
      isDragging.value = false
    }
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = false

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  const file = files.item(0)
  if (file) {
    handleFileSelect(file)
  }
}

// 点击选择文件
function handleClick() {
  // 创建隐藏的 input 元素
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.twsp'
  input.onchange = (e) => {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }
  input.click()
}

// 处理文件选择
function handleFileSelect(file: File) {
  clearSelection()

  if (file.name.endsWith('.twsp')) {
    selectedType.value = 'file'
    selectedFile.value = file
    selectedName.value = file.name
    selectedMeta.value = formatFileSize(file.size)
  } else {
    // 浏览器不支持直接拖拽目录选择，提示用户使用手动输入
    toastStore.warning('浏览器不支持拖拽目录，请使用手动输入路径')
    showManualInput.value = true
  }
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 切换手动输入
function toggleManualInput() {
  showManualInput.value = !showManualInput.value
}

// 选择目标目录
async function pickTargetDir() {
  try {
    const result = await adminApi.pickDirectory()
    if (result.path) {
      targetDir.value = result.path
    }
  } catch (e) {
    toastStore.error('无法打开目录选择器')
  }
}

// 导入操作
async function handleImport() {
  if (selectedType.value === 'file' && selectedFile.value) {
    await importTwspFile()
  } else if (selectedType.value === 'directory' || manualPath.value.trim()) {
    await importDirectory()
  }
}

// 导入 .twsp 文件
async function importTwspFile() {
  if (!selectedFile.value) return

  importLoading.value = true
  resultType.value = 'none'

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    // 发送目标目录（需要后端支持）
    formData.append('targetDir', targetDir.value.replace('~', ''))

    const result = await adminApi.importTwsp(formData)

    if (result.success) {
      if (result.warnings && result.warnings.length > 0) {
        resultType.value = 'warning'
        resultMessage.value = `工作区「${result.name || '未知'}」导入成功（有警告）`
        resultWarnings.value = result.warnings
      } else {
        resultType.value = 'success'
        resultMessage.value = `工作区「${result.name || '未知'}」导入成功`
      }
      await loadStats()
      emit('workspaceImported')
    } else {
      resultType.value = 'error'
      resultMessage.value = result.error || '导入失败'
    }
  } catch (e) {
    resultType.value = 'error'
    resultMessage.value = e instanceof Error ? e.message : '导入失败'
  } finally {
    importLoading.value = false
  }
}

// 导入目录
async function importDirectory() {
  const path = selectedPath.value || manualPath.value.trim()
  if (!path) {
    toastStore.warning('请输入目录路径')
    return
  }

  importLoading.value = true
  resultType.value = 'none'

  try {
    const result = await adminApi.import(path)

    if (result.success) {
      if (result.added > 0) {
        resultType.value = 'success'
        resultMessage.value = `发现并导入了 ${result.added} 个工作区`
        await loadStats()
        emit('workspaceImported')
      } else if (result.existing > 0) {
        resultType.value = 'warning'
        resultMessage.value = `发现 ${result.existing} 个工作区已存在`
      } else {
        resultType.value = 'warning'
        resultMessage.value = '未找到有效的工作区'
      }
    } else {
      resultType.value = 'error'
      resultMessage.value = result.error || '导入失败'
    }
  } catch (e) {
    resultType.value = 'error'
    resultMessage.value = e instanceof Error ? e.message : '导入失败'
  } finally {
    importLoading.value = false
  }
}

// 从手动输入导入
async function handleManualImport() {
  if (!manualPath.value.trim()) {
    toastStore.warning('请输入路径')
    return
  }

  // 判断是文件还是目录
  if (manualPath.value.endsWith('.twsp')) {
    // 暂不支持手动输入 .twsp 文件路径
    toastStore.warning('.twsp 文件请使用拖拽或点击选择')
    return
  }

  await importDirectory()
}

// 同步清理预览
async function handleSyncCleanPreview() {
  syncCleanState.value = 'previewing'
  syncCleanPreview.value = null
  syncCleanResult.value = null
  syncCleanError.value = null

  try {
    const result = await adminApi.syncCleanPreview()
    syncCleanPreview.value = result
    syncCleanState.value = 'previewed'

    if (!result.hasChanges) {
      toastStore.info('索引已是最新状态')
    }
  } catch (e) {
    console.error('同步清理预览失败:', e)
    const errorMsg = e instanceof Error ? e.message : '预览失败'
    syncCleanError.value = errorMsg
    syncCleanState.value = 'error'
    toastStore.error(errorMsg)
  }
}

// 执行同步清理
async function handleSyncCleanExecute() {
  syncCleanState.value = 'executing'
  syncCleanError.value = null

  try {
    const result = await adminApi.syncCleanExecute()
    syncCleanResult.value = result
    syncCleanState.value = 'done'
    await loadStats()

    if (result.added > 0 || result.removed > 0) {
      toastStore.success(`同步完成：新增 ${result.added} 个，清理 ${result.removed} 个`)
      if (result.added > 0) {
        emit('workspaceImported')
      }
    }
  } catch (e) {
    console.error('同步清理执行失败:', e)
    const errorMsg = e instanceof Error ? e.message : '执行失败'
    syncCleanError.value = errorMsg
    syncCleanState.value = 'error'
    toastStore.error(errorMsg)
  }
}

// 重置同步清理状态
function resetSyncClean() {
  syncCleanState.value = 'idle'
  syncCleanPreview.value = null
  syncCleanResult.value = null
  syncCleanError.value = null
}
</script>

<template>
  <WsModal
    :model-value="visible"
    title="索引管理"
    width="500px"
    @update:model-value="(val: boolean) => !val && handleClose()"
    @close="handleClose"
  >
    <div class="index-management">
      <!-- 统计概览 -->
      <div class="stats-bar">
        <div class="stats-item">
          <span class="stats-number">{{ stats?.total ?? '-' }}</span>
          <span class="stats-label">已索引</span>
        </div>
        <div class="stats-item">
          <span class="stats-number success">{{ stats?.valid ?? '-' }}</span>
          <span class="stats-label">有效</span>
        </div>
        <div class="stats-item">
          <span class="stats-number" :class="{ danger: (stats?.invalid ?? 0) > 0 }">{{ stats?.invalid ?? '-' }}</span>
          <span class="stats-label">无效</span>
        </div>
      </div>

      <!-- 导入工作区 -->
      <div class="function-block">
        <div class="function-header">
          <div class="function-title">导入工作区</div>
        </div>

        <!-- 拖拽区域（未选择时显示） -->
        <div
          v-if="!hasSelection && !showManualInput"
          ref="dropZoneRef"
          class="drop-zone"
          :class="{ dragging: isDragging }"
          @dragenter="handleDragEnter"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          @click="handleClick"
        >
          <div class="drop-zone-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div class="drop-zone-text" :class="{ highlight: isDragging }">
            {{ isDragging ? '释放以导入' : '拖入 .twsp 文件或文件夹' }}
          </div>
          <div class="drop-zone-hint">或点击选择</div>
        </div>

        <!-- 已选择项（文件） -->
        <div v-if="selectedType === 'file'" class="selected-item">
          <div class="selected-icon file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div class="selected-info">
            <div class="selected-name">{{ selectedName }}</div>
            <div class="selected-meta">{{ selectedMeta }}</div>
          </div>
          <div class="selected-clear" @click="clearSelection">×</div>
        </div>

        <!-- 目标目录（仅 .twsp 文件） -->
        <div v-if="selectedType === 'file'" class="target-dir-row">
          <span class="target-dir-label">目标目录：</span>
          <input type="text" class="target-dir-input" v-model="targetDir" readonly>
          <WsButton size="sm" variant="secondary" @click="pickTargetDir">浏览</WsButton>
        </div>

        <!-- 导入按钮 -->
        <div v-if="hasSelection" class="action-row">
          <WsButton variant="primary" :loading="importLoading" @click="handleImport">导入</WsButton>
        </div>

        <!-- 手动输入切换（未选择时显示） -->
        <div v-if="!hasSelection && !showManualInput" class="alt-input-toggle" @click="toggleManualInput">
          或手动输入路径
        </div>

        <!-- 手动输入模式 -->
        <div v-if="showManualInput && !hasSelection" class="manual-input-area">
          <div
            ref="dropZoneRef"
            class="drop-zone mini"
            :class="{ dragging: isDragging }"
            @dragenter="handleDragEnter"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
            @click="handleClick"
          >
            <div class="drop-zone-icon mini">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div class="drop-zone-text">{{ isDragging ? '释放以导入' : '拖入 .twsp 文件' }}</div>
          </div>
          <div class="alt-input-row">
            <input
              type="text"
              class="path-input"
              placeholder="输入目录路径..."
              v-model="manualPath"
              @keyup.enter="handleManualImport"
            >
            <WsButton size="sm" variant="primary" :loading="importLoading" @click="handleManualImport">导入</WsButton>
          </div>
        </div>

        <!-- 结果反馈 -->
        <div v-if="resultType !== 'none'" class="result-box" :class="resultType">
          <template v-if="resultType === 'success'">
            {{ resultMessage }}
          </template>
          <template v-else-if="resultType === 'warning'">
            <div>{{ resultMessage }}</div>
            <div v-if="resultWarnings.length > 0" class="warning-list">
              <div v-for="(warning, idx) in resultWarnings" :key="idx" class="warning-item">
                • {{ warning }}
              </div>
            </div>
          </template>
          <template v-else-if="resultType === 'error'">
            {{ resultMessage }}
          </template>
        </div>

        <div class="function-desc">支持：.twsp 导出文件、项目目录、工作区目录</div>
      </div>

      <!-- 同步清理 -->
      <div class="function-block">
        <div class="function-header">
          <div class="function-title">同步清理</div>
          <WsButton
            v-if="syncCleanState === 'idle' || syncCleanState === 'done' || syncCleanState === 'previewing' || syncCleanState === 'error'"
            variant="secondary"
            size="sm"
            :loading="syncCleanState === 'previewing'"
            :disabled="syncCleanState === 'previewing'"
            @click="handleSyncCleanPreview"
          >
            {{ syncCleanState === 'error' ? '重试' : '扫描并预览' }}
          </WsButton>
        </div>
        <div class="function-desc">扫描已索引路径发现新工作区，清理无效条目</div>

        <!-- 预览结果 -->
        <div v-if="(syncCleanState === 'previewed' || syncCleanState === 'executing') && syncCleanPreview" class="result-area">
          <template v-if="hasPreviewChanges">
            <div class="result-header">
              <span class="result-title">发现以下变更</span>
            </div>

            <!-- 待添加 -->
            <div v-if="syncCleanPreview.toAdd.length > 0" class="change-section">
              <div class="change-header add">
                <span class="change-icon">+</span>
                <span>{{ syncCleanPreview.toAdd.length }} 个新工作区</span>
              </div>
              <div class="ws-list">
                <div v-for="ws in syncCleanPreview.toAdd.slice(0, 3)" :key="ws.id" class="ws-item">
                  <span class="ws-name">{{ ws.name }}</span>
                </div>
                <div v-if="syncCleanPreview.toAdd.length > 3" class="ws-more">
                  还有 {{ syncCleanPreview.toAdd.length - 3 }} 个...
                </div>
              </div>
            </div>

            <!-- 待清理 -->
            <div v-if="syncCleanPreview.toRemove.length > 0" class="change-section">
              <div class="change-header remove">
                <span class="change-icon">-</span>
                <span>{{ syncCleanPreview.toRemove.length }} 个无效条目</span>
              </div>
              <div class="ws-list">
                <div v-for="ws in syncCleanPreview.toRemove.slice(0, 3)" :key="ws.id" class="ws-item invalid">
                  <span class="ws-name">{{ ws.name }}</span>
                  <span class="ws-reason">{{ ws.reason }}</span>
                </div>
                <div v-if="syncCleanPreview.toRemove.length > 3" class="ws-more">
                  还有 {{ syncCleanPreview.toRemove.length - 3 }} 个...
                </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="action-row">
              <WsButton variant="secondary" size="sm" @click="resetSyncClean">取消</WsButton>
              <WsButton
                variant="primary"
                size="sm"
                :loading="syncCleanState === 'executing'"
                @click="handleSyncCleanExecute"
              >
                确认执行
              </WsButton>
            </div>
          </template>

          <template v-else>
            <div class="no-changes">
              <span class="no-changes-icon">✓</span>
              <span>索引已是最新状态，无需更新</span>
            </div>
          </template>
        </div>

        <!-- 执行结果 -->
        <div v-if="syncCleanState === 'done' && syncCleanResult" class="result-area done">
          <div class="result-header">
            <span class="result-title">同步完成</span>
            <div class="result-stats">
              <span v-if="syncCleanResult.added > 0" class="stat"><span class="stat-num success">{{ syncCleanResult.added }}</span> 新增</span>
              <span v-if="syncCleanResult.removed > 0" class="stat"><span class="stat-num danger">{{ syncCleanResult.removed }}</span> 清理</span>
            </div>
          </div>
          <div v-if="syncCleanResult.addedList.length > 0 || syncCleanResult.removedList.length > 0" class="ws-list">
            <div v-for="ws in syncCleanResult.addedList.slice(0, 3)" :key="ws.id" class="ws-item">
              <span class="ws-badge is-new">新增</span>
              <span class="ws-name">{{ ws.name }}</span>
            </div>
            <div v-for="ws in syncCleanResult.removedList.slice(0, 3)" :key="ws.id" class="ws-item invalid">
              <span class="ws-badge is-removed">清理</span>
              <span class="ws-name">{{ ws.name }}</span>
            </div>
          </div>
        </div>

        <!-- 错误状态 -->
        <div v-if="syncCleanState === 'error' && syncCleanError" class="result-area error">
          <div class="error-content">
            <span class="error-icon">✕</span>
            <span class="error-message">{{ syncCleanError }}</span>
          </div>
        </div>
      </div>
    </div>
  </WsModal>
</template>

<style scoped>
.index-management {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 统计栏 */
.stats-bar {
  display: flex;
  gap: 20px;
  padding: 12px 16px;
  background: var(--path-bg);
  border: 1px solid var(--border-color);
}

.stats-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.stats-number {
  font-family: var(--mono-font);
  font-size: 24px;
  font-weight: 700;
  color: var(--text-main);
}

.stats-number.success {
  color: #2e7d32;
}

[data-theme="dark"] .stats-number.success {
  color: #66bb6a;
}

.stats-number.danger {
  color: var(--accent-red);
}

.stats-label {
  font-size: 11px;
  color: var(--text-muted);
}

/* 功能区块 */
.function-block {
  border: 1px solid var(--border-color);
  padding: 16px;
}

.function-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.function-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 8px;
}

.function-title::before {
  content: '';
  width: 3px;
  height: 12px;
  background: var(--accent-red);
}

.function-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 10px;
}

/* 拖拽区域 */
.drop-zone {
  border: 2px dashed var(--border-color);
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--path-bg);
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

.drop-zone.mini {
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-zone-icon {
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.drop-zone-icon.mini {
  margin-bottom: 0;
  margin-right: 8px;
}

.drop-zone-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.drop-zone-text.highlight {
  color: var(--accent-red);
  font-weight: 600;
}

.drop-zone-hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* 已选择项 */
.selected-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--path-bg);
  border: 1px solid var(--border-color);
}

.selected-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.selected-icon.file {
  background: #e3f2fd;
  color: #1565c0;
}

[data-theme="dark"] .selected-icon.file {
  background: #1a3a5c;
  color: #64b5f6;
}

.selected-icon.folder {
  background: #fff8e1;
}

[data-theme="dark"] .selected-icon.folder {
  background: #3a3010;
}

.selected-info {
  flex: 1;
  min-width: 0;
}

.selected-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-meta {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--mono-font);
}

.selected-clear {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 16px;
  font-weight: 300;
}

.selected-clear:hover {
  color: var(--accent-red);
}

/* 目标目录 */
.target-dir-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
}

.target-dir-label {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.target-dir-input {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  font-family: var(--mono-font);
  font-size: 11px;
  background: var(--card-bg);
  color: var(--text-secondary);
}

/* 手动输入切换 */
.alt-input-toggle {
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  text-decoration: underline;
  margin-top: 10px;
  display: inline-block;
}

.alt-input-toggle:hover {
  color: var(--text-secondary);
}

/* 手动输入区域 */
.manual-input-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alt-input-row {
  display: flex;
  gap: 8px;
}

.path-input {
  flex: 1;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  font-family: var(--mono-font);
  font-size: 12px;
  background: var(--card-bg);
  color: var(--text-main);
}

.path-input:focus {
  outline: none;
  border-color: var(--border-heavy);
}

.path-input::placeholder {
  color: var(--text-muted);
}

/* 操作按钮行 */
.action-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

/* 结果框 */
.result-box {
  margin-top: 12px;
  padding: 10px 12px;
  font-size: 12px;
  border-left: 3px solid;
}

.result-box.success {
  background: #e8f5e9;
  border-color: #4caf50;
  color: #2e7d32;
}

[data-theme="dark"] .result-box.success {
  background: #1b3320;
  color: #a5d6a7;
}

.result-box.warning {
  background: #fff8e1;
  border-color: #ffc107;
  color: #856404;
}

[data-theme="dark"] .result-box.warning {
  background: #2a2010;
  color: #ffd54f;
}

.result-box.error {
  background: #ffebee;
  border-color: var(--accent-red);
  color: var(--accent-red);
}

[data-theme="dark"] .result-box.error {
  background: #2d1b1b;
}

.warning-list {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(0,0,0,0.1);
}

[data-theme="dark"] .warning-list {
  border-top-color: rgba(255,255,255,0.1);
}

.warning-item {
  font-size: 11px;
  opacity: 0.9;
  padding: 2px 0;
}

/* 结果区 */
.result-area {
  margin-top: 12px;
  padding: 12px;
  background: var(--path-bg);
  border: 1px solid var(--border-color);
}

.result-area.done {
  background: #e8f5e9;
  border-color: #4caf50;
}

[data-theme="dark"] .result-area.done {
  background: #1b3320;
  border-color: #2e7d32;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.result-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.3px;
}

.result-stats {
  display: flex;
  gap: 12px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-num {
  font-family: var(--mono-font);
  font-weight: 700;
  color: var(--text-main);
}

.stat-num.success {
  color: #2e7d32;
}

[data-theme="dark"] .stat-num.success {
  color: #66bb6a;
}

.stat-num.danger {
  color: var(--accent-red);
}

/* 变更区块 */
.change-section {
  margin-bottom: 12px;
}

.change-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
}

.change-header.add {
  color: #2e7d32;
}

[data-theme="dark"] .change-header.add {
  color: #66bb6a;
}

.change-header.remove {
  color: var(--accent-red);
}

.change-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
}

/* 工作区列表 */
.ws-list {
  max-height: 100px;
  overflow-y: auto;
}

.ws-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
}

.ws-item:last-child {
  border-bottom: none;
}

.ws-item.invalid {
  color: var(--accent-red);
}

.ws-name {
  color: var(--text-main);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 2px;
  background: var(--border-color);
  color: var(--text-muted);
}

.ws-badge.is-new {
  background: #e8f5e9;
  color: #2e7d32;
}

[data-theme="dark"] .ws-badge.is-new {
  background: #1b3320;
  color: #66bb6a;
}

.ws-badge.is-removed {
  background: #ffebee;
  color: var(--accent-red);
}

[data-theme="dark"] .ws-badge.is-removed {
  background: #2d1b1b;
}

.ws-reason {
  margin-left: auto;
  font-size: 10px;
  color: var(--accent-red);
  flex-shrink: 0;
}

.ws-more {
  padding: 6px 0;
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}

/* 无变更提示 */
.no-changes {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #2e7d32;
  font-size: 12px;
}

[data-theme="dark"] .no-changes {
  color: #66bb6a;
}

.no-changes-icon {
  font-size: 14px;
}

/* 错误状态 */
.result-area.error {
  background: #ffebee;
  border-color: var(--accent-red);
}

[data-theme="dark"] .result-area.error {
  background: #2d1b1b;
}

.error-content {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent-red);
  font-size: 12px;
}

.error-icon {
  font-size: 14px;
  font-weight: 700;
}

.error-message {
  flex: 1;
}
</style>
