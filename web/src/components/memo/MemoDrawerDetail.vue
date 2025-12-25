<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMemoStore, useWorkspaceStore } from '@/stores'
import NodeIcon from '@/components/tree/NodeIcon.vue'

const memoStore = useMemoStore()
const workspaceStore = useWorkspaceStore()

const emit = defineEmits<{
  selectMemo: [memoId: string]
}>()

// 所有 memos
const memos = computed(() => memoStore.memos)

// 所有标签
const allTags = computed(() => memoStore.allTags)

// memo 数量
const memoCount = computed(() => memos.value.length)

// 当前 hover 的标签
const hoveredTag = ref<string | null>(null)

// 点击单个 memo
function handleMemoClick(memoId: string) {
  emit('selectMemo', memoId)
}
</script>

<template>
  <div class="memo-drawer-detail">
    <div class="drawer-panel">
      <!-- 头部区 -->
      <div class="detail-header">
        <div class="header-main">
          <NodeIcon type="execution" status="pending" :is-memo="true" :memo-count="memoCount" />
          <span class="drawer-type">MEMO</span>
          <span class="header-sep">·</span>
          <span class="header-title">草稿 ({{ memoCount }})</span>
        </div>
        <div class="header-meta">工作区: {{ workspaceStore.currentWorkspace?.name }}</div>
      </div>

      <!-- 标签区 -->
      <div class="detail-section" v-if="allTags.length > 0">
        <div class="section-title">All Tags / 所有标签</div>
        <div class="tags-container">
          <span
            v-for="tag in allTags"
            :key="tag"
            class="tag-item"
            :class="{ 'tag-hovered': hoveredTag === tag }"
            @mouseenter="hoveredTag = tag"
            @mouseleave="hoveredTag = null"
          >
            {{ tag }}
          </span>
        </div>
      </div>

      <!-- 备忘列表 -->
      <div class="detail-section">
        <div class="section-title">Memos / 备忘列表</div>
        <div class="memo-list">
          <div
            v-for="memo in memos"
            :key="memo.id"
            class="memo-item"
            @click="handleMemoClick(memo.id)"
          >
            <div class="memo-item-header">
              <NodeIcon
                type="execution"
                status="pending"
                :is-memo="true"
                :content-length="memo.contentLength"
              />
              <span class="memo-title">{{ memo.title }}</span>
            </div>
            <div class="memo-item-meta" v-if="memo.summary || memo.tags?.length">
              <div class="memo-summary" v-if="memo.summary">{{ memo.summary }}</div>
              <div class="memo-tags" v-if="memo.tags?.length">
                <span
                  v-for="tag in memo.tags"
                  :key="tag"
                  class="mini-tag"
                  :class="{ 'mini-tag-highlight': hoveredTag === tag }"
                >{{ tag }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="memos.length === 0" class="empty-state">
        <div class="empty-icon">[ ]</div>
        <span class="empty-text">暂无备忘</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.memo-drawer-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--card-bg);
}

.drawer-panel {
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

.drawer-type {
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
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tag-item:hover,
.tag-item.tag-hovered {
  color: var(--accent-red);
  border-color: var(--border-heavy);
}

[data-theme="dark"] .tag-item {
  background: #2a2a2a;
}

/* 备忘列表 */
.memo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.memo-item {
  padding: 12px;
  background: var(--path-bg);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.memo-item:hover {
  border-color: var(--border-heavy);
  box-shadow: 2px 2px 0 var(--border-color);
}

[data-theme="dark"] .memo-item {
  background: #1a1a1a;
}

.memo-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.memo-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.memo-item-meta {
  padding-left: 28px;
}

.memo-summary {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.memo-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.mini-tag {
  font-family: var(--mono-font), monospace;
  font-size: 10px;
  padding: 2px 6px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  transition: color 0.15s, border-color 0.15s;
}

.mini-tag.mini-tag-highlight {
  color: var(--accent-red);
  border-color: var(--border-heavy);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 32px;
  font-family: var(--mono-font);
  margin-bottom: 8px;
}

.empty-text {
  font-size: 13px;
}
</style>
