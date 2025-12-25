<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useMemoStore, useWorkspaceStore } from '@/stores'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import NodeIcon from '@/components/tree/NodeIcon.vue'
import WsButton from '@/components/ui/WsButton.vue'
import WsConfirmDialog from '@/components/ui/WsConfirmDialog.vue'

const props = defineProps<{
  memoId: string
}>()

const emit = defineEmits<{
  deleted: []
}>()

const memoStore = useMemoStore()
const workspaceStore = useWorkspaceStore()

// 从 store 获取 memo 数据
const memo = computed(() => memoStore.currentMemo)

// 删除弹窗状态
const showDeleteDialog = ref(false)

// 加载 memo 数据
async function loadMemo() {
  if (!props.memoId || !workspaceStore.currentWorkspace?.id) return

  try {
    await memoStore.fetchMemo(workspaceStore.currentWorkspace.id, props.memoId)
  } catch {
    // 错误已在 store 中处理
  }
}

// 显示删除确认弹窗
function handleDelete() {
  showDeleteDialog.value = true
}

// 确认删除
async function confirmDelete() {
  if (!props.memoId || !workspaceStore.currentWorkspace?.id) return

  try {
    await memoStore.deleteMemo(workspaceStore.currentWorkspace.id, props.memoId)
    emit('deleted')
  } catch {
    // 错误已在 store 中处理
  }
}

// 组件挂载时加载数据
onMounted(() => {
  loadMemo()
})

// 监听 memoId 变化
watch(() => props.memoId, () => {
  loadMemo()
})
</script>

<template>
  <div class="memo-detail-wrapper" v-if="memo">
    <div class="memo-detail-panel">
      <!-- 头部区 -->
      <div class="detail-header">
        <div class="header-main">
          <NodeIcon type="execution" status="pending" :is-memo="true" :content-length="memo.contentLength" />
          <span class="memo-type">MEMO</span>
          <span class="header-sep">·</span>
          <span class="header-title">{{ memo.title }}</span>
        </div>
        <div class="header-meta">ID: {{ memo.id }}</div>
      </div>

      <!-- 摘要 -->
      <div class="detail-section" v-if="memo.summary">
        <div class="section-title">Summary / 摘要</div>
        <div class="summary-box">
          {{ memo.summary }}
        </div>
      </div>

      <!-- 标签 -->
      <div class="detail-section" v-if="memo.tags?.length">
        <div class="section-title">Tags / 标签</div>
        <div class="tags-container">
          <span v-for="tag in memo.tags" :key="tag" class="tag-item">
            {{ tag }}
          </span>
        </div>
      </div>

      <!-- 内容 -->
      <div class="detail-section">
        <div class="section-title">Content / 内容</div>
        <div class="content-box">
          <MarkdownContent :content="memo.content || '暂无内容'" />
        </div>
      </div>

      <!-- 元信息 -->
      <div class="detail-section">
        <div class="section-title">Metadata / 元信息</div>
        <div class="meta-info">
          <div class="meta-row">
            <span class="meta-label">创建时间:</span>
            <span class="meta-value">{{ memo.createdAt }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">更新时间:</span>
            <span class="meta-value">{{ memo.updatedAt }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作按钮区（固定底部） -->
    <div class="action-bar">
      <div class="action-group"></div>
      <div class="action-group">
        <WsButton
          variant="danger"
          size="sm"
          @click="handleDelete"
        >
          删除
        </WsButton>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <WsConfirmDialog
      v-model="showDeleteDialog"
      title="删除确认"
      message="确定要删除此备忘吗？此操作不可撤销。"
      confirm-text="删除"
      cancel-text="取消"
      type="danger"
      @confirm="confirmDelete"
    />
  </div>
  <div v-else-if="memoStore.loading" class="memo-loading">
    加载中...
  </div>
  <div v-else class="memo-empty">
    未找到备忘
  </div>
</template>

<style scoped>
/* 外层容器 */
.memo-detail-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--card-bg);
}

.memo-detail-panel {
  flex: 1;
  overflow-y: auto;
  width: 100%;
}

/* 头部区 */
.detail-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.header-main {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.memo-type {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-green);
  flex-shrink: 0;
}

.header-sep {
  color: var(--text-muted);
  font-size: 13px;
  flex-shrink: 0;
}

.header-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-meta {
  font-family: var(--mono-font), monospace;
  font-size: 11px;
  color: var(--text-muted);
}

/* 内容区块 */
.detail-section {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.detail-section:last-child {
  border-bottom: none;
}

/* Section 标题 - 带红色竖条 */
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

/* 摘要框 */
.summary-box {
  background: var(--path-bg);
  border-left: 4px solid var(--accent-green);
  padding: 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

[data-theme="dark"] .summary-box {
  background: #1a1a1a;
}

/* 标签容器 */
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  font-family: var(--mono-font), monospace;
  font-size: 11px;
  padding: 4px 8px;
  background: var(--path-bg);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  font-weight: 600;
}

[data-theme="dark"] .tag-item {
  background: #2a2a2a;
}

/* 内容框 */
.content-box {
  background: var(--path-bg);
  border-left: 4px solid var(--border-heavy);
  padding: 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

[data-theme="dark"] .content-box {
  background: #1a1a1a;
}

/* 元信息 */
.meta-info {
  background: #fafafa;
  border: 1px solid var(--border-color);
  padding: 12px 16px;
}

[data-theme="dark"] .meta-info {
  background: #1a1a1a;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.meta-row:last-child {
  margin-bottom: 0;
}

.meta-label {
  color: var(--text-muted);
  font-size: 13px;
  min-width: 80px;
}

.meta-value {
  font-family: var(--mono-font), monospace;
  color: var(--text-secondary);
  font-size: 12px;
}

/* 加载和空状态 */
.memo-loading,
.memo-empty {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

/* 操作按钮区 - 固定底部 */
.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #fafafa;
  flex-wrap: wrap;
  gap: 12px;
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
}

[data-theme="dark"] .action-bar {
  background: #1a1a1a;
}

.action-group {
  display: flex;
  gap: 8px;
}
</style>
