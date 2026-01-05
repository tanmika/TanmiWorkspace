<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { adminApi, type ImportResult, type SyncCleanPreviewResult, type SyncCleanExecuteResult, type IndexStatsResult } from '@/api/admin'
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

// 导入相关
const importPath = ref('')
const importLoading = ref(false)
const importResult = ref<ImportResult | null>(null)

// 同步清理相关
type SyncCleanState = 'idle' | 'previewing' | 'previewed' | 'executing' | 'done'
const syncCleanState = ref<SyncCleanState>('idle')
const syncCleanPreview = ref<SyncCleanPreviewResult | null>(null)
const syncCleanResult = ref<SyncCleanExecuteResult | null>(null)

// 计算属性
const hasPreviewChanges = computed(() => {
  if (!syncCleanPreview.value) return false
  return syncCleanPreview.value.hasChanges
})

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
    // 重置状态
    importResult.value = null
    syncCleanState.value = 'idle'
    syncCleanPreview.value = null
    syncCleanResult.value = null
    await loadStats()
    loading.value = false
  }
})

// 关闭弹窗
function handleClose() {
  emit('update:visible', false)
}

// 选择目录
async function pickDirectory() {
  try {
    const result = await adminApi.pickDirectory()
    if (result.path) {
      importPath.value = result.path
    }
  } catch (e) {
    toastStore.error('无法打开目录选择器')
  }
}

// 导入工作区
async function handleImport() {
  if (!importPath.value.trim()) {
    toastStore.warning('请输入或选择目录路径')
    return
  }

  importLoading.value = true
  importResult.value = null

  try {
    const result = await adminApi.import(importPath.value.trim())
    importResult.value = result

    if (result.success) {
      if (result.added > 0) {
        toastStore.success(`成功导入 ${result.added} 个工作区`)
        emit('workspaceImported')
      } else if (result.existing > 0) {
        toastStore.info('工作区已存在于索引中')
      } else {
        toastStore.info('未找到有效的工作区')
      }
      await loadStats()
    }
  } catch (e) {
    toastStore.error('导入失败')
    importResult.value = { success: false, added: 0, existing: 0, workspaces: [], error: e instanceof Error ? e.message : '未知错误' }
  } finally {
    importLoading.value = false
  }
}

// 同步清理预览
async function handleSyncCleanPreview() {
  syncCleanState.value = 'previewing'
  syncCleanPreview.value = null
  syncCleanResult.value = null

  try {
    const result = await adminApi.syncCleanPreview()
    syncCleanPreview.value = result
    syncCleanState.value = 'previewed'

    if (!result.hasChanges) {
      toastStore.info('索引已是最新状态')
    }
  } catch (e) {
    toastStore.error('预览失败')
    syncCleanState.value = 'idle'
  }
}

// 执行同步清理
async function handleSyncCleanExecute() {
  syncCleanState.value = 'executing'

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
    toastStore.error('执行失败')
    syncCleanState.value = 'previewed'
  }
}

// 重置同步清理状态
function resetSyncClean() {
  syncCleanState.value = 'idle'
  syncCleanPreview.value = null
  syncCleanResult.value = null
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
        <div class="input-row">
          <input
            v-model="importPath"
            type="text"
            class="path-input"
            placeholder="选择或输入目录路径..."
            @keyup.enter="handleImport"
          >
          <WsButton variant="secondary" @click="pickDirectory">选择</WsButton>
          <WsButton variant="primary" :loading="importLoading" @click="handleImport">导入</WsButton>
        </div>
        <div class="function-desc">支持：项目目录、.tanmi-workspace 目录、名称_id 工作区目录</div>

        <!-- 导入结果 -->
        <div v-if="importResult" class="result-box" :class="{ success: importResult.success, error: !importResult.success }">
          <template v-if="importResult.success">
            <template v-if="importResult.added > 0 || importResult.existing > 0">
              <div class="result-summary">
                <span v-if="importResult.added > 0" class="result-stat success">{{ importResult.added }} 个新增</span>
                <span v-if="importResult.existing > 0" class="result-stat">{{ importResult.existing }} 个已存在</span>
              </div>
              <div v-if="importResult.workspaces.length > 0" class="ws-list compact">
                <div v-for="ws in importResult.workspaces.slice(0, 5)" :key="ws.id" class="ws-item">
                  <span class="ws-name">{{ ws.name }}</span>
                  <span class="ws-badge" :class="{ 'is-new': ws.isNew }">{{ ws.isNew ? '新增' : '已存在' }}</span>
                </div>
                <div v-if="importResult.workspaces.length > 5" class="ws-more">
                  还有 {{ importResult.workspaces.length - 5 }} 个...
                </div>
              </div>
            </template>
            <template v-else>
              未找到有效的工作区
            </template>
          </template>
          <template v-else>
            {{ importResult.message || importResult.error || '导入失败' }}
          </template>
        </div>
      </div>

      <!-- 同步清理 -->
      <div class="function-block">
        <div class="function-header">
          <div class="function-title">同步清理</div>
          <WsButton
            v-if="syncCleanState === 'idle' || syncCleanState === 'done' || syncCleanState === 'previewing'"
            variant="secondary"
            size="sm"
            :loading="syncCleanState === 'previewing'"
            :disabled="syncCleanState === 'previewing'"
            @click="handleSyncCleanPreview"
          >
            检查更新
          </WsButton>
        </div>
        <div class="function-desc">扫描已索引路径发现新工作区，清理无效的索引条目</div>

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
  margin-top: 8px;
}

/* 输入行 */
.input-row {
  display: flex;
  gap: 8px;
}

.path-input {
  flex: 1;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  font-family: var(--mono-font);
  font-size: 12px;
  background: var(--path-bg);
  color: var(--text-main);
}

.path-input:focus {
  outline: none;
  border-color: var(--border-heavy);
}

.path-input::placeholder {
  color: var(--text-muted);
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

.result-box.error {
  background: #ffebee;
  border-color: var(--accent-red);
  color: var(--accent-red);
}

[data-theme="dark"] .result-box.error {
  background: #2d1b1b;
}

.result-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.result-stat {
  font-weight: 600;
}

.result-stat.success {
  color: #2e7d32;
}

[data-theme="dark"] .result-stat.success {
  color: #66bb6a;
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

.ws-list.compact {
  max-height: 80px;
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

/* 操作行 */
.action-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
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
</style>
