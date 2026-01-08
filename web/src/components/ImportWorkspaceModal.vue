<template>
  <WsModal
    :model-value="visible"
    title="IMPORT WORKSPACE"
    width="500px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="import-workspace">
      <!-- 文件选择区域 -->
      <div
        class="upload-area"
        :class="{ 'drag-over': isDragging }"
        @click="selectFile"
        @drop.prevent="handleDrop"
        @dragover.prevent="isDragging = true"
        @dragleave="isDragging = false"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".twsp"
          hidden
          @change="handleFileSelect"
        >
        <div v-if="!selectedFile" class="upload-hint">
          <div class="upload-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <span class="upload-text">Click or drag .twsp file here</span>
        </div>
        <div v-else class="file-info">
          <div class="file-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div class="file-details">
            <span class="file-name">{{ selectedFile.name }}</span>
            <span class="file-size">{{ formatSize(selectedFile.size) }}</span>
          </div>
          <button class="clear-btn" @click.stop="clearFile" title="Clear">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 目标目录选择 -->
      <div class="target-dir-section">
        <div class="section-label">Target Directory</div>
        <div class="target-dir-row">
          <input
            type="text"
            class="target-dir-input"
            :value="targetDir || defaultTargetDir"
            readonly
            :placeholder="defaultTargetDir"
          >
          <WsButton variant="secondary" size="sm" @click="selectTargetDir">
            Browse
          </WsButton>
          <WsButton v-if="targetDir" variant="secondary" size="sm" @click="targetDir = ''">
            Reset
          </WsButton>
        </div>
        <div class="target-dir-hint">Default: ~/.tanmi-workspace/import/</div>
      </div>

      <!-- 导入结果 -->
      <div v-if="importResult" class="result-box" :class="{ success: importResult.success, error: !importResult.success }">
        <template v-if="importResult.success">
          <div class="result-success">
            <span class="result-icon">OK</span>
            <span>{{ importResult.name }}</span>
          </div>
          <div v-if="importResult.warnings?.length" class="result-warnings">
            <div class="warning-title">Warnings:</div>
            <ul>
              <li v-for="(w, i) in importResult.warnings" :key="i">{{ w }}</li>
            </ul>
          </div>
        </template>
        <template v-else>
          <div class="result-error">
            <span class="result-icon">ERR</span>
            <span>{{ importResult.error || 'Import failed' }}</span>
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <WsButton variant="cancel" @click="handleClose">Cancel</WsButton>
      <WsButton
        variant="primary"
        :loading="importing"
        :disabled="!selectedFile || importing"
        @click="handleImport"
      >
        Import
      </WsButton>
    </template>
  </WsModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import WsModal from '@/components/ui/WsModal.vue'
import WsButton from '@/components/ui/WsButton.vue'
import { adminApi, type ImportTwspResult } from '@/api/admin'
import { useToastStore } from '@/stores/toast'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'imported', workspaceId: string): void
}>()

const toastStore = useToastStore()

const fileInput = ref<HTMLInputElement>()
const selectedFile = ref<File | null>(null)
const importing = ref(false)
const importResult = ref<ImportTwspResult | null>(null)
const isDragging = ref(false)
const targetDir = ref('')
const defaultTargetDir = '~/.tanmi-workspace/import/'

// Reset state when modal opens
watch(() => props.visible, (newVal) => {
  if (newVal) {
    selectedFile.value = null
    importResult.value = null
    importing.value = false
    isDragging.value = false
    targetDir.value = ''
  }
})

function selectFile() {
  fileInput.value?.click()
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) {
    const file = input.files[0]
    if (file.name.endsWith('.twsp')) {
      selectedFile.value = file
      importResult.value = null
    } else {
      toastStore.warning('Please select a .twsp file')
    }
  }
  // Reset input to allow selecting the same file again
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file?.name.endsWith('.twsp')) {
    selectedFile.value = file
    importResult.value = null
  } else {
    toastStore.warning('Please select a .twsp file')
  }
}

function clearFile() {
  selectedFile.value = null
  importResult.value = null
}

async function selectTargetDir() {
  try {
    const result = await adminApi.pickDirectory()
    if (result.path) {
      targetDir.value = result.path
    }
  } catch {
    toastStore.error('Failed to open directory picker')
  }
}

async function handleImport() {
  if (!selectedFile.value) return

  importing.value = true
  importResult.value = null

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    if (targetDir.value) {
      formData.append('targetDir', targetDir.value)
    }

    const result = await adminApi.importTwsp(formData)
    importResult.value = result

    if (result.success) {
      toastStore.success(`Imported "${result.name}"`)
      emit('imported', result.workspaceId)
    }
  } catch (e) {
    importResult.value = {
      success: false,
      workspaceId: '',
      name: '',
      path: '',
      warnings: [],
      error: e instanceof Error ? e.message : 'Import failed'
    }
    toastStore.error('Import failed')
  } finally {
    importing.value = false
  }
}

function handleClose() {
  emit('update:visible', false)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style scoped>
.import-workspace {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Upload Area */
.upload-area {
  border: 2px dashed var(--border-color);
  padding: 32px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--path-bg);
}

.upload-area:hover,
.upload-area.drag-over {
  border-color: var(--border-heavy);
  background: var(--card-bg);
}

.upload-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
}

.upload-icon {
  color: var(--text-secondary);
}

.upload-text {
  font-size: 14px;
}

/* Target Directory */
.target-dir-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.target-dir-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.target-dir-input {
  flex: 1;
  padding: 8px 12px;
  font-size: 13px;
  font-family: var(--mono-font);
  background: var(--path-bg);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  min-width: 0;
}

.target-dir-hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* File Info */
.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-icon {
  color: var(--border-heavy);
  flex-shrink: 0;
}

.file-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 12px;
  font-family: var(--mono-font);
  color: var(--text-muted);
}

.clear-btn {
  flex-shrink: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.clear-btn:hover {
  color: var(--accent-red);
}

/* Result Box */
.result-box {
  padding: 16px;
  border-left: 4px solid var(--border-color);
  background: var(--path-bg);
}

.result-box.success {
  border-left-color: #22c55e;
}

.result-box.error {
  border-left-color: var(--accent-red);
}

.result-success,
.result-error {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
}

.result-success {
  color: #22c55e;
}

.result-error {
  color: var(--accent-red);
}

.result-icon {
  font-family: var(--mono-font);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  background: currentColor;
  color: #fff;
}

.result-success .result-icon {
  background: #22c55e;
}

.result-error .result-icon {
  background: var(--accent-red);
}

/* Warnings */
.result-warnings {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.warning-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.result-warnings ul {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-secondary);
}

.result-warnings li {
  margin-bottom: 4px;
}

.result-warnings li:last-child {
  margin-bottom: 0;
}
</style>
