<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { changeApi } from '@/api'
import { buildDiffLines, type DiffLine } from '@/utils/diff'
import type {
  ChangeRecordSummary,
  ChangeOperationSummary,
  ChangeRevertResult,
} from '@/types'

const props = defineProps<{
  workspaceId: string
  nodeId: string
}>()

// 状态
const isOpen = ref(false)
const loading = ref(false)
const changes = ref<ChangeRecordSummary[]>([])
const totalCount = ref(0)
const ambiguousCount = ref(0)
const expandedIds = ref<Set<string>>(new Set())
const revertResult = ref<ChangeRevertResult | null>(null)
const reverting = ref(false)

// 计算
const fileCount = computed(() => {
  const paths = new Set(changes.value.map(c => c.operation.filePath))
  return paths.size
})

const hasRevertable = computed(() =>
  changes.value.some(c => isRevertable(c.operation))
)

// 加载变更列表
async function fetchChanges() {
  loading.value = true
  try {
    const [listResult, ambResult] = await Promise.all([
      changeApi.list(props.workspaceId, props.nodeId),
      changeApi.ambiguousCount(props.workspaceId),
    ])
    changes.value = listResult.changes
    totalCount.value = listResult.totalCount
    ambiguousCount.value = ambResult.count
  } catch {
    // 静默处理
  } finally {
    loading.value = false
  }
}

// 展开/折叠区域
function toggleOpen() {
  isOpen.value = !isOpen.value
  if (isOpen.value && changes.value.length === 0) {
    fetchChanges()
  }
}

// 展开/折叠单条变更
function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
}

// 获取 diff 行
function getDiffLines(operation: ChangeOperationSummary): DiffLine[] {
  return buildDiffLines(operation)
}

// 格式化时间
function formatTime(timestamp: string): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

// 判断是否可回滚
function isRevertable(op: ChangeOperationSummary): boolean {
  if (op.type === 'delete') return false
  if (op.type === 'overwrite' && !op.hasOriginal) return false
  return true
}

// 单条回滚
async function revertSingle(changeId: string) {
  reverting.value = true
  revertResult.value = null
  try {
    const result = await changeApi.revert(props.workspaceId, [changeId])
    revertResult.value = result
    await fetchChanges()
  } catch {
    // 静默处理
  } finally {
    reverting.value = false
  }
}

// 批量回滚全部
async function revertAll() {
  if (changes.value.length === 0) return
  reverting.value = true
  revertResult.value = null
  try {
    const ids = changes.value.filter(c => isRevertable(c.operation)).map(c => c.id)
    if (ids.length === 0) return
    const result = await changeApi.revert(props.workspaceId, ids)
    revertResult.value = result
    await fetchChanges()
  } catch {
    // 静默处理
  } finally {
    reverting.value = false
  }
}

// 监听节点切换
watch(() => props.nodeId, () => {
  changes.value = []
  totalCount.value = 0
  ambiguousCount.value = 0
  expandedIds.value.clear()
  revertResult.value = null
  if (isOpen.value) {
    fetchChanges()
  }
})

// 暴露刷新方法
defineExpose({ fetchChanges, changes, totalCount })
</script>

<template>
  <div class="detail-section changes-section">
    <!-- 折叠触发器 -->
    <div class="section-title" :class="{ 'no-margin': !isOpen }">
      <div class="changes-trigger" @click="toggleOpen">
        <span class="trigger-arrow" :class="{ expanded: isOpen }">▶</span>
        <span>Changes / 变更记录</span>
        <span class="count-badge">{{ totalCount }}</span>
      </div>
    </div>

    <!-- 展开内容 -->
    <template v-if="isOpen">
      <!-- 加载中 -->
      <div v-if="loading" class="changes-empty">加载中...</div>

      <!-- 空状态 -->
      <template v-else-if="totalCount === 0">
        <div class="changes-empty">
          <div class="changes-empty-icon">◇</div>
          暂无变更记录
        </div>
      </template>

      <!-- 有变更 -->
      <template v-else>
        <!-- Ambiguous 提示 -->
        <div v-if="ambiguousCount > 0" class="ambiguous-banner">
          <span class="ambiguous-icon">⚠</span>
          <div>
            <div class="ambiguous-text">
              存在 <span class="ambiguous-count">{{ ambiguousCount }}</span> 条待认领变更（多节点并发时产生）
            </div>
            <div class="ambiguous-hint">由 AI 通过 change_claim 工具处理认领</div>
          </div>
        </div>

        <!-- 操作栏 -->
        <div class="changes-toolbar">
          <span class="toolbar-info">{{ totalCount }} changes · {{ fileCount }} files</span>
          <div v-if="hasRevertable" class="toolbar-actions">
            <button class="btn-sm danger" :disabled="reverting" @click="revertAll">回滚全部</button>
          </div>
        </div>

        <!-- 变更列表 -->
        <div class="changes-list">
          <div v-for="change in changes" :key="change.id" class="change-item">
            <!-- 变更头部 -->
            <div
              class="change-header"
              :class="{ active: expandedIds.has(change.id) }"
              @click="toggleExpand(change.id)"
            >
              <span class="change-expand-icon" :class="{ expanded: expandedIds.has(change.id) }">▶</span>
              <span class="op-badge" :class="change.operation.type">{{ change.operation.type.toUpperCase() }}</span>
              <span class="change-filepath">{{ change.operation.filePath }}</span>
              <span class="change-time">{{ formatTime(change.timestamp) }}</span>
              <button
                v-if="isRevertable(change.operation)"
                class="change-revert-btn"
                :disabled="reverting"
                @click.stop="revertSingle(change.id)"
              >REVERT</button>
            </div>

            <!-- Diff 展开 -->
            <div v-if="expandedIds.has(change.id)" class="change-diff">
              <template v-if="change.operation.type === 'add'">
                <div class="diff-newfile-hint">+ 新建文件 · {{ change.operation.lineCount }} 行</div>
              </template>
              <template v-else-if="change.operation.type === 'delete'">
                <div class="diff-delete-hint">文件已删除</div>
              </template>
              <template v-else-if="change.operation.type === 'overwrite'">
                <div class="diff-overwrite-hint">
                  ⚠ 文件被整体覆盖 · {{ change.operation.hasOriginal ? '有原始内容备份，可回滚' : '无法回滚，未保存原始内容' }}
                </div>
              </template>
              <template v-else-if="change.operation.type === 'update'">
                <table class="diff-table">
                  <tr
                    v-for="(line, idx) in getDiffLines(change.operation)"
                    :key="idx"
                    :class="`diff-line-${line.type}`"
                  >
                    <template v-if="line.type === 'hunk'">
                      <td colspan="3">{{ line.content }}</td>
                    </template>
                    <template v-else>
                      <td class="diff-line-num">{{ line.type === 'add' ? '' : line.lineNum }}</td>
                      <td class="diff-op">{{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ' }}</td>
                      <td class="diff-content">{{ line.content }}</td>
                    </template>
                  </tr>
                </table>
              </template>
            </div>
          </div>
        </div>

        <!-- 回滚结果 -->
        <div v-if="revertResult" class="revert-result" :class="revertResult.success ? 'success' : 'partial'">
          <div class="revert-result-title">{{ revertResult.success ? '✓ 回滚完成' : '⚠ 部分回滚失败' }}</div>
          <div
            v-for="item in revertResult.results"
            :key="item.changeId"
            class="revert-result-item"
            :class="item.success ? 'revert-ok' : 'revert-fail'"
          >
            {{ item.success ? '✓' : '✗' }} {{ item.changeId.slice(0, 8) }}
            {{ item.success ? '— 已回滚' : `— ${item.reason}` }}
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* 继承父组件的 section 结构样式（scoped 无法穿透） */
.detail-section {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}
.detail-section:last-child {
  border-bottom: none;
}

.section-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-title::before {
  content: '';
  width: 3px;
  height: 12px;
  background: var(--accent-red);
  flex-shrink: 0;
}

.count-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--border-color);
  color: var(--text-secondary);
  font-weight: 600;
  font-family: var(--mono-font);
}

/* 折叠触发器 */
.no-margin {
  margin-bottom: 0 !important;
}

.changes-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.changes-trigger:hover .trigger-arrow {
  color: var(--accent-red);
}

.trigger-arrow {
  font-size: 10px;
  color: var(--text-muted);
  transition: transform 0.2s, color 0.15s;
  flex-shrink: 0;
  width: 12px;
  text-align: center;
}
.trigger-arrow.expanded {
  transform: rotate(90deg);
}

/* Ambiguous 提示 */
.ambiguous-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #fff8f0;
  border: 1px solid var(--accent-orange);
  border-left: 4px solid var(--accent-orange);
  margin-bottom: 12px;
}

.ambiguous-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.ambiguous-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.ambiguous-count {
  font-family: var(--mono-font);
  font-weight: 700;
  color: var(--accent-orange);
}

.ambiguous-hint {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* 操作栏 */
.changes-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.toolbar-info {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--mono-font);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

/* 小按钮 */
.btn-sm {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.btn-sm:hover {
  border-color: var(--border-heavy);
  color: var(--text-main);
  box-shadow: 2px 2px 0 var(--border-color);
}
.btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm.danger {
  border-color: var(--accent-red);
  color: var(--accent-red);
}
.btn-sm.danger:hover:not(:disabled) {
  background: var(--accent-red);
  color: #fff;
  box-shadow: 2px 2px 0 rgba(217, 43, 43, 0.3);
}

/* 变更列表 */
.changes-list {
  border: 1px solid var(--border-color);
}

.change-item {
  border-bottom: 1px solid var(--border-color);
}
.change-item:last-child {
  border-bottom: none;
}

/* 变更头部 */
.change-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.1s;
}
.change-header:hover {
  background: var(--path-bg);
}
.change-header.active {
  background: var(--path-bg);
}

.change-expand-icon {
  font-size: 9px;
  color: var(--text-muted);
  width: 10px;
  text-align: center;
  flex-shrink: 0;
  transition: transform 0.15s;
}
.change-expand-icon.expanded {
  transform: rotate(90deg);
}

/* 操作类型徽章 */
.op-badge {
  font-family: var(--mono-font);
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}
.op-badge.add {
  background: var(--diff-add-line);
  color: var(--diff-add-text);
}
.op-badge.update {
  background: var(--diff-hunk-bg);
  color: var(--diff-hunk-text);
}
.op-badge.overwrite {
  background: #fff3cd;
  color: #856404;
}
.op-badge.delete {
  background: var(--diff-del-line);
  color: var(--diff-del-text);
}

/* 文件路径 */
.change-filepath {
  font-family: var(--mono-font);
  font-size: 12px;
  color: var(--accent-blue);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}

/* 时间戳 */
.change-time {
  font-family: var(--mono-font);
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* 单条回滚按钮 */
.change-revert-btn {
  font-family: var(--mono-font);
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: all 0.15s;
}
.change-header:hover .change-revert-btn {
  opacity: 1;
  border-color: var(--border-color);
}
.change-revert-btn:hover {
  border-color: var(--accent-red) !important;
  color: var(--accent-red) !important;
  background: var(--diff-del-bg) !important;
}
.change-revert-btn:disabled {
  opacity: 0.3 !important;
  cursor: not-allowed;
}

/* Diff 展开内容 */
.change-diff {
  border-top: 1px solid var(--border-color);
  background: var(--card-footer);
  overflow: hidden;
}

.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--mono-font);
  font-size: 11px;
  line-height: 1.5;
}

.diff-table td {
  padding: 0 12px;
  vertical-align: top;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 行号列 */
.diff-line-num {
  width: 40px;
  min-width: 40px;
  text-align: right;
  color: var(--text-muted);
  user-select: none;
  padding-right: 8px !important;
  border-right: 1px solid var(--border-color);
  font-size: 10px;
}

/* 操作符列 */
.diff-op {
  width: 16px;
  min-width: 16px;
  text-align: center;
  user-select: none;
  font-weight: 700;
}

/* 行内容 */
.diff-content {
  padding-left: 8px !important;
}

/* Diff 行着色 */
.diff-line-add .diff-line-num { background: var(--diff-add-line); }
.diff-line-add .diff-op { background: var(--diff-add-bg); color: var(--diff-add-text); }
.diff-line-add .diff-content { background: var(--diff-add-bg); color: var(--diff-add-text); }

.diff-line-del .diff-line-num { background: var(--diff-del-line); }
.diff-line-del .diff-op { background: var(--diff-del-bg); color: var(--diff-del-text); }
.diff-line-del .diff-content { background: var(--diff-del-bg); color: var(--diff-del-text); }

.diff-line-ctx .diff-line-num { background: transparent; }
.diff-line-ctx .diff-op { background: transparent; }
.diff-line-ctx .diff-content { background: transparent; color: var(--text-secondary); }

/* Hunk 分隔行 */
.diff-line-hunk td {
  background: var(--diff-hunk-bg);
  color: var(--diff-hunk-text);
  font-size: 10px;
  padding: 4px 12px !important;
  font-weight: 600;
}

/* 提示区 */
.diff-newfile-hint {
  padding: 12px 16px;
  font-size: 11px;
  color: var(--diff-add-text);
  background: var(--diff-add-bg);
  font-family: var(--mono-font);
}

.diff-delete-hint {
  padding: 12px 16px;
  font-size: 11px;
  color: var(--diff-del-text);
  background: var(--diff-del-bg);
  font-family: var(--mono-font);
}

.diff-overwrite-hint {
  padding: 12px 16px;
  font-size: 11px;
  color: #856404;
  background: #fff3cd;
  font-family: var(--mono-font);
}

/* 空状态 */
.changes-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  border: 1px dashed var(--border-color);
}

.changes-empty-icon {
  font-size: 20px;
  margin-bottom: 8px;
  opacity: 0.4;
}

/* 回滚结果 */
.revert-result {
  padding: 12px 16px;
  border: 1px solid;
  margin-top: 12px;
  font-size: 12px;
}

.revert-result.success {
  background: var(--diff-add-bg);
  border-color: var(--accent-green);
  color: var(--diff-add-text);
}

.revert-result.partial {
  background: #fff8f0;
  border-color: var(--accent-orange);
  color: #856404;
}

.revert-result-title {
  font-weight: 700;
  font-family: var(--mono-font);
  font-size: 11px;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.revert-result-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-family: var(--mono-font);
  font-size: 11px;
}

.revert-ok { color: var(--diff-add-text); }
.revert-fail { color: var(--diff-del-text); }

/* 暗色主题覆盖 */
[data-theme="dark"] .ambiguous-banner {
  background: #2a2000;
}

[data-theme="dark"] .op-badge.overwrite {
  background: #3d3000;
  color: #f5c842;
}

[data-theme="dark"] .diff-overwrite-hint {
  background: #3d3000;
  color: #f5c842;
}

[data-theme="dark"] .revert-result.partial {
  background: #2a2000;
  color: #f5c842;
}
</style>
