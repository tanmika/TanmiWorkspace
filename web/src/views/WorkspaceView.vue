<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Plus, Aim, Refresh, InfoFilled, List, Share, Document } from '@element-plus/icons-vue'
import { useWorkspaceStore, useNodeStore, useSettingsStore } from '@/stores'
import NodeTree from '@/components/node/NodeTree.vue'
import NodeTreeGraph from '@/components/node/NodeTreeGraph.vue'
import NodeDetail from '@/components/node/NodeDetail.vue'
import EnableDispatchDialog from '@/components/dispatch/EnableDispatchDialog.vue'
import DisableDispatchDialog from '@/components/dispatch/DisableDispatchDialog.vue'
import SwitchDispatchModeDialog from '@/components/dispatch/SwitchDispatchModeDialog.vue'
import WsButton from '@/components/ui/WsButton.vue'
import WsModal from '@/components/ui/WsModal.vue'

// Toast notification helper
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`)
  // Simple toast implementation - can be enhanced
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'success' ? '#67c23a' : type === 'error' ? '#f56c6c' : '#409eff'};
    color: white;
    border-radius: 4px;
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease'
    setTimeout(() => document.body.removeChild(toast), 300)
  }, 3000)
}

// 视图模式
type ViewMode = 'list' | 'graph'
const viewMode = ref<ViewMode>(
  (localStorage.getItem('tanmi-workspace-view-mode') as ViewMode) || 'list'
)

function setViewMode(mode: ViewMode) {
  viewMode.value = mode
  localStorage.setItem('tanmi-workspace-view-mode', mode)
}

// 侧边栏宽度（可拖动调整）
const DEFAULT_SIDEBAR_WIDTH = 300
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 800

const sidebarWidth = ref(
  parseInt(localStorage.getItem('tanmi-workspace-sidebar-width') || '') || DEFAULT_SIDEBAR_WIDTH
)

// 拖动状态
const isResizing = ref(false)

function startResize() {
  isResizing.value = true
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function handleResize(e: MouseEvent) {
  if (!isResizing.value) return
  const newWidth = e.clientX
  if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
    sidebarWidth.value = newWidth
  }
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  localStorage.setItem('tanmi-workspace-sidebar-width', sidebarWidth.value.toString())
}

onUnmounted(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
})

const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()
const nodeStore = useNodeStore()
const settingsStore = useSettingsStore()

const workspaceId = computed(() => route.params.id as string)

// 加载工作区数据
async function loadWorkspace() {
  try {
    await workspaceStore.fetchWorkspace(workspaceId.value)
    await nodeStore.fetchNodeTree()
  } catch {
    showToast('加载工作区失败', 'error')
    router.push('/')
  }
}

// 工作区信息栏展开状态
const showInfoBar = ref(true)

// 工作区详情抽屉状态
const showWorkspaceDetail = ref(false)

// 是否有规则或文档可展开
const hasRulesOrDocs = computed(() => {
  return workspaceStore.currentRules.length > 0 || workspaceStore.currentDocs.length > 0
})

// 进度百分比
const progressPercent = computed(() => {
  const status = workspaceStore.currentStatus
  if (!status || status.totalNodes === 0) return 0
  return Math.round((status.completedNodes / status.totalNodes) * 100)
})

// 刷新数据
const isRefreshing = ref(false)
async function handleRefresh() {
  isRefreshing.value = true
  try {
    await loadWorkspace()
    if (nodeStore.selectedNodeId) {
      await nodeStore.selectNode(nodeStore.selectedNodeId)
    }
    showToast('刷新成功', 'success')
  } catch {
    showToast('刷新失败', 'error')
  } finally {
    isRefreshing.value = false
  }
}

// 聚焦当前任务
const isFocusing = ref(false)
async function handleFocusCurrent() {
  isFocusing.value = true
  try {
    await workspaceStore.fetchWorkspace(workspaceId.value)
    await nodeStore.fetchNodeTree()

    const focusId = workspaceStore.currentFocus
    if (focusId) {
      await nodeStore.selectNode(focusId)
      showToast('已定位到当前任务', 'success')
    } else {
      showToast('当前没有聚焦的任务', 'info')
    }
  } catch {
    showToast('定位失败', 'error')
  } finally {
    isFocusing.value = false
  }
}

// 监听路由变化
watch(workspaceId, loadWorkspace)

// 初始加载
onMounted(loadWorkspace)

// 返回首页
function goBack() {
  workspaceStore.clearCurrent()
  nodeStore.clearAll()
  router.push('/')
}

// 选择节点
function handleNodeSelect(nodeId: string) {
  nodeStore.selectNode(nodeId)
}

// 创建子节点对话框
const showCreateDialog = ref(false)
const createForm = ref<{ type: 'planning' | 'execution'; title: string; requirement: string }>({
  type: 'execution',
  title: '',
  requirement: ''
})

function openCreateDialog() {
  createForm.value = { type: 'execution', title: '', requirement: '' }
  showCreateDialog.value = true
}

async function handleCreateNode() {
  const parentId = nodeStore.selectedNodeId || 'root'
  if (!createForm.value.title) {
    showToast('请输入节点标题', 'error')
    return
  }
  try {
    await nodeStore.createNode({
      parentId,
      type: createForm.value.type,
      title: createForm.value.title,
      requirement: createForm.value.requirement,
    })
    showToast('创建成功', 'success')
    showCreateDialog.value = false
  } catch {
    showToast('创建失败', 'error')
  }
}

// 派发模式控制
const showEnableDispatchDialog = ref(false)
const showDisableDispatchDialog = ref(false)
const showSwitchModeDialog = ref(false)
const isEnablingDispatch = ref(false)

async function handleEnableDispatch() {
  await settingsStore.loadSettings()
  const mode = settingsStore.settings.defaultDispatchMode

  if (mode === 'none') {
    showEnableDispatchDialog.value = true
  } else {
    isEnablingDispatch.value = true
    try {
      await workspaceStore.enableDispatch()
      showToast('派发模式已启用', 'success')
      await loadWorkspace()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '启用派发失败', 'error')
    } finally {
      isEnablingDispatch.value = false
    }
  }
}

function handleDisableDispatch() {
  showDisableDispatchDialog.value = true
}

function handleSwitchMode() {
  showSwitchModeDialog.value = true
}

async function handleDispatchSuccess() {
  await loadWorkspace()
}
</script>

<template>
  <div class="workspace-view" v-loading="workspaceStore.loading">
    <!-- 头部 Header -->
    <header class="layout-header">
      <div class="header-left">
        <WsButton variant="icon" @click="goBack">
          <ArrowLeft />
        </WsButton>
        <h2 class="workspace-title">{{ workspaceStore.currentWorkspace?.name }}</h2>
        <WsButton
          variant="icon"
          :class="{ active: showInfoBar }"
          @click="showInfoBar = !showInfoBar"
          title="切换信息栏"
        >
          <InfoFilled />
        </WsButton>
      </div>
      <div class="header-right">
        <WsButton variant="icon" @click="handleFocusCurrent" :disabled="isFocusing" title="聚焦当前任务">
          <Aim />
        </WsButton>
        <WsButton variant="icon" @click="handleRefresh" :disabled="isRefreshing" title="刷新数据">
          <Refresh />
        </WsButton>
        <WsButton variant="primary" @click="openCreateDialog">
          <Plus style="width: 16px; height: 16px" />
          新建节点
        </WsButton>
      </div>
    </header>

    <!-- 工作区信息栏 InfoBar -->
    <transition name="slide">
      <div v-if="showInfoBar && workspaceStore.currentStatus" class="layout-infobar">
        <div class="info-item">
          <span class="info-label">目标</span>
          <span class="info-value">{{ workspaceStore.currentStatus.goal }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">进度</span>
          <div class="progress-container">
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
            </div>
            <span class="info-value">
              {{ workspaceStore.currentStatus.completedNodes }}/{{ workspaceStore.currentStatus.totalNodes }}
            </span>
          </div>
        </div>
        <div class="info-item">
          <span class="info-label">派发</span>
          <div class="dispatch-controls">
            <span
              :class="[
                'badge-status',
                workspaceStore.dispatchStatus === 'disabled' ? 'disabled' :
                workspaceStore.dispatchStatus === 'enabled' ? 'enabled' : 'git'
              ]"
            >
              {{
                workspaceStore.dispatchStatus === 'disabled' ? '未启用' :
                workspaceStore.dispatchStatus === 'enabled' ? '已启用(无Git)' : '已启用(Git)'
              }}
            </span>
            <WsButton
              v-if="workspaceStore.dispatchStatus === 'disabled'"
              variant="primary"
              size="sm"
              :disabled="isEnablingDispatch"
              @click="handleEnableDispatch"
            >
              启用
            </WsButton>
            <div v-else class="dispatch-actions">
              <WsButton variant="secondary" size="sm" @click="handleSwitchMode">
                切换模式
              </WsButton>
              <WsButton variant="danger" size="sm" @click="handleDisableDispatch">
                关闭
              </WsButton>
            </div>
          </div>
        </div>
        <div v-if="hasRulesOrDocs" class="info-item">
          <div class="info-tags">
            <span v-if="workspaceStore.currentRules.length" class="info-tag rules" @click="showWorkspaceDetail = true">
              {{ workspaceStore.currentRules.length }} 条规则
            </span>
            <span v-if="workspaceStore.currentDocs.length" class="info-tag docs" @click="showWorkspaceDetail = true">
              {{ workspaceStore.currentDocs.length }} 个文档
            </span>
          </div>
          <WsButton variant="primary" size="sm" @click="showWorkspaceDetail = true">
            查看详情
          </WsButton>
        </div>
      </div>
    </transition>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 左侧：节点树 Sidebar -->
      <aside class="layout-sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="sidebar-header">
          <div class="sidebar-header-left">
            <h3>任务树</h3>
            <WsButton
              variant="icon"
              class="workspace-detail-btn"
              @click="showWorkspaceDetail = true"
              title="查看工作区详情"
            >
              <Document />
            </WsButton>
          </div>
          <div class="view-toggle">
            <WsButton
              variant="icon"
              :class="{ active: viewMode === 'list' }"
              @click="setViewMode('list')"
              title="列表视图"
            >
              <List />
            </WsButton>
            <WsButton
              variant="icon"
              :class="{ active: viewMode === 'graph' }"
              @click="setViewMode('graph')"
              title="图形视图"
            >
              <Share />
            </WsButton>
          </div>
        </div>
        <div class="sidebar-content">
          <NodeTree
            v-if="viewMode === 'list'"
            :tree="nodeStore.nodeTree"
            :selected-id="nodeStore.selectedNodeId"
            :focus-id="workspaceStore.currentFocus"
            @select="handleNodeSelect"
          />
          <NodeTreeGraph
            v-else
            :tree="nodeStore.nodeTree"
            :selected-id="nodeStore.selectedNodeId"
            :focus-id="workspaceStore.currentFocus"
            @select="handleNodeSelect"
          />
        </div>
      </aside>

      <!-- 可拖动分隔条 -->
      <div
        class="resizer"
        :class="{ 'is-resizing': isResizing }"
        @mousedown="startResize"
      />

      <!-- 右侧：节点详情 Content -->
      <main class="layout-content">
        <NodeDetail v-if="nodeStore.selectedNodeId" />
        <div v-else class="empty-state">
          <div class="empty-icon">📋</div>
          <p class="empty-text">选择一个节点查看详情</p>
        </div>
      </main>
    </div>

    <!-- 工作区详情抽屉 -->
    <transition name="drawer-fade">
      <div v-if="showWorkspaceDetail" class="drawer-overlay" @click="showWorkspaceDetail = false">
        <div class="drawer-panel" @click.stop>
          <div class="modal-header">
            <span>工作区详情</span>
            <button class="modal-close" @click="showWorkspaceDetail = false">×</button>
          </div>
          <div class="modal-body">
            <!-- 基本信息 -->
            <div class="detail-section">
              <div class="section-header">
                <span class="info-label">目标</span>
              </div>
              <div class="goal-content">
                {{ workspaceStore.currentStatus?.goal || '暂无目标' }}
              </div>
            </div>

            <!-- 规则 -->
            <div v-if="workspaceStore.currentRules.length > 0" class="detail-section">
              <div class="section-header">
                <span class="info-label">规则</span>
                <span class="count-badge">{{ workspaceStore.currentRules.length }}</span>
              </div>
              <ul class="rules-list">
                <li v-for="(rule, idx) in workspaceStore.currentRules" :key="idx">{{ rule }}</li>
              </ul>
            </div>

            <!-- 文档 -->
            <div v-if="workspaceStore.currentDocs.length > 0" class="detail-section">
              <div class="section-header">
                <span class="info-label">文档</span>
                <span class="count-badge">{{ workspaceStore.currentDocs.length }}</span>
              </div>
              <ul class="docs-list">
                <li v-for="(doc, idx) in workspaceStore.currentDocs" :key="idx">
                  <span class="doc-path">{{ doc.path }}</span>
                  <span class="doc-desc">{{ doc.description }}</span>
                </li>
              </ul>
            </div>

            <!-- 日志 -->
            <div class="detail-section">
              <div class="section-header">
                <span class="info-label">工作区日志</span>
                <span class="count-badge">{{ workspaceStore.currentLogs.length }}</span>
              </div>
              <div v-if="workspaceStore.currentLogs.length > 0" class="log-container">
                <div
                  v-for="(log, idx) in workspaceStore.currentLogs"
                  :key="idx"
                  class="log-item"
                >
                  <div class="log-meta">
                    <span class="log-time">{{ log.timestamp }}</span>
                    <span
                      :class="[
                        'log-operator',
                        log.operator === 'AI' ? 'ai' :
                        log.operator === 'Human' ? 'usr' : 'sys'
                      ]"
                    >
                      {{ log.operator === 'AI' ? 'AI' : log.operator === 'Human' ? 'USR' : 'SYS' }}
                    </span>
                  </div>
                  <div class="log-event">{{ log.event }}</div>
                </div>
              </div>
              <div v-else class="empty-tip">暂无日志记录</div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 创建节点对话框 -->
    <WsModal v-model="showCreateDialog" title="新建节点">
      <div class="create-form">
        <div class="form-group">
          <label class="form-label">类型 *</label>
          <div class="radio-group">
            <label class="radio-option" :class="{ selected: createForm.type === 'execution' }">
              <input type="radio" v-model="createForm.type" value="execution" />
              <span class="radio-label exec">执行节点</span>
            </label>
            <label class="radio-option" :class="{ selected: createForm.type === 'planning' }">
              <input type="radio" v-model="createForm.type" value="planning" />
              <span class="radio-label plan">规划节点</span>
            </label>
          </div>
          <div class="type-hint">
            {{ createForm.type === 'execution' ? '具体执行任务，不能有子节点' : '分析分解任务，可创建子节点' }}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">标题 *</label>
          <input
            v-model="createForm.title"
            class="form-input"
            placeholder="输入节点标题"
          />
        </div>
        <div class="form-group">
          <label class="form-label">需求</label>
          <textarea
            v-model="createForm.requirement"
            class="form-textarea"
            rows="4"
            placeholder="描述节点需求"
          />
        </div>
      </div>
      <template #footer>
        <WsButton variant="secondary" @click="showCreateDialog = false">取消</WsButton>
        <WsButton variant="primary" @click="handleCreateNode" :disabled="nodeStore.loading">
          创建
        </WsButton>
      </template>
    </WsModal>

    <!-- 启用派发对话框 -->
    <EnableDispatchDialog
      v-model="showEnableDispatchDialog"
      @success="handleDispatchSuccess"
    />

    <!-- 禁用派发对话框 -->
    <DisableDispatchDialog
      v-model="showDisableDispatchDialog"
      @success="handleDispatchSuccess"
    />

    <!-- 切换派发模式对话框 -->
    <SwitchDispatchModeDialog
      v-model="showSwitchModeDialog"
      @success="handleDispatchSuccess"
    />
  </div>
</template>

<style scoped>
/* ===== 页面布局 ===== */
.workspace-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
}

/* ===== 头部 Header ===== */
.layout-header {
  height: 56px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  background: var(--card-bg);
  border-bottom: 2px solid var(--border-heavy);
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.workspace-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
}

.ws-button.active {
  background: rgba(0, 0, 0, 0.1);
}

[data-theme="dark"] .ws-button.active {
  background: rgba(255, 255, 255, 0.1);
}

/* ===== 信息栏 InfoBar ===== */
.layout-infobar {
  display: flex;
  align-items: center;
  gap: 40px;
  padding: 12px 24px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-item:first-child {
  flex: 1;
  min-width: 0;
}

.info-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 13px;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 进度条 */
.progress-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-track {
  width: 120px;
  height: 8px;
  background: var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--border-heavy);
  transition: width 0.3s ease;
}

/* 派发状态徽章 */
.badge-status {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.badge-status.disabled {
  background: #e0e0e0;
  color: #666;
}

.badge-status.enabled {
  background: #d4edda;
  color: #155724;
}

.badge-status.git {
  background: #fff3cd;
  color: #856404;
}

[data-theme="dark"] .badge-status.disabled {
  background: #333;
  color: #aaa;
}

[data-theme="dark"] .badge-status.enabled {
  background: #1e4620;
  color: #7bc67e;
}

[data-theme="dark"] .badge-status.git {
  background: #4a3c1a;
  color: #ffc107;
}

.dispatch-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dispatch-actions {
  display: flex;
  gap: 8px;
}

/* 信息标签 */
.info-tags {
  display: flex;
  gap: 8px;
}

.info-tag {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 3px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.info-tag:hover {
  opacity: 0.8;
}

.info-tag.rules {
  background: #fff3cd;
  color: #856404;
}

.info-tag.docs {
  background: #d1ecf1;
  color: #0c5460;
}

[data-theme="dark"] .info-tag.rules {
  background: #4a3c1a;
  color: #ffc107;
}

[data-theme="dark"] .info-tag.docs {
  background: #1a3a42;
  color: #5bc0de;
}

/* 信息栏动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 80px;
}

/* ===== 主内容区 ===== */
.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* ===== 侧边栏 Sidebar ===== */
.layout-sidebar {
  flex-shrink: 0;
  width: 260px;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border-right: 2px solid var(--border-heavy);
}

.sidebar-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.workspace-detail-btn {
  animation: pulse-highlight 2s ease-in-out infinite;
}

@keyframes pulse-highlight {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.view-toggle {
  display: flex;
  gap: 4px;
}

.sidebar-content {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

/* 可拖动分隔条 */
.resizer {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
}

.resizer:hover,
.resizer.is-resizing {
  background: var(--accent-red);
}

/* ===== 右侧内容区 Content ===== */
.layout-content {
  flex: 1;
  overflow: auto;
  padding: 24px;
  background: var(--card-bg);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  margin: 0;
}

/* ===== 工作区详情抽屉 ===== */
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: flex-end;
  z-index: 1000;
}

.drawer-panel {
  width: 450px;
  background: var(--card-bg);
  border-left: 4px solid var(--border-heavy);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  padding: 20px 24px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-close {
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
  line-height: 1;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.modal-close:hover {
  color: var(--text-main);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.count-badge {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--border-color);
  color: var(--text-secondary);
  border-radius: 10px;
  font-weight: 600;
}

.goal-content {
  padding: 12px;
  background: var(--bg-color);
  border-radius: 4px;
  font-size: 14px;
  color: var(--text-main);
  line-height: 1.6;
  border-left: 4px solid var(--border-color);
}

/* 规则列表 */
.rules-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rules-list li {
  padding: 10px 12px;
  background: var(--bg-color);
  border-left: 3px solid #e6a23c;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-main);
  line-height: 1.5;
}

/* 文档列表 */
.docs-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.docs-list li {
  padding: 10px 12px;
  background: var(--bg-color);
  border-left: 4px solid #3b82f6;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc-path {
  font-family: var(--mono-font);
  font-size: 12px;
  color: #3b82f6;
}

.doc-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 日志容器 */
.log-container {
  border-left: 4px solid var(--border-heavy);
  padding-left: 12px;
}

.log-item {
  padding: 10px 12px;
  background: var(--bg-color);
  border-radius: 4px;
  margin-bottom: 8px;
}

.log-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.log-time {
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-muted);
}

.log-operator {
  font-family: var(--mono-font);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 2px;
  text-transform: uppercase;
}

.log-operator.ai {
  background: var(--border-heavy);
  color: var(--card-bg);
}

.log-operator.usr {
  background: #67c23a;
  color: white;
}

.log-operator.sys {
  background: #909399;
  color: white;
}

.log-event {
  font-size: 13px;
  color: var(--text-main);
  line-height: 1.5;
}

.empty-tip {
  color: var(--text-muted);
  text-align: center;
  padding: 40px 20px;
  font-size: 13px;
}

/* 抽屉动画 */
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.3s ease;
}

.drawer-fade-enter-active .drawer-panel,
.drawer-fade-leave-active .drawer-panel {
  transition: transform 0.3s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-fade-enter-from .drawer-panel,
.drawer-fade-leave-to .drawer-panel {
  transform: translateX(100%);
}

/* ===== 创建节点对话框 ===== */
.create-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

/* Radio 组 */
.radio-group {
  display: flex;
  gap: 12px;
}

.radio-option {
  flex: 1;
  position: relative;
  cursor: pointer;
}

.radio-option input[type="radio"] {
  position: absolute;
  opacity: 0;
}

.radio-option .radio-label {
  display: block;
  padding: 10px 16px;
  border: 2px solid var(--border-color);
  border-radius: 4px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s;
}

.radio-option.selected .radio-label {
  border-color: var(--border-heavy);
  background: var(--bg-color);
}

.radio-option .radio-label.exec {
  color: #3498DB;
}

.radio-option .radio-label.plan {
  color: #9B59B6;
}

.type-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: -4px;
}

/* 表单输入框 */
.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--card-bg);
  color: var(--text-main);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: var(--border-heavy);
}

.form-input::placeholder {
  color: var(--text-muted);
}

/* 表单文本域 */
.form-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--card-bg);
  color: var(--text-main);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  resize: vertical;
  transition: border-color 0.2s;
  line-height: 1.5;
}

.form-textarea:focus {
  border-color: var(--border-heavy);
}

.form-textarea::placeholder {
  color: var(--text-muted);
}

/* ===== Toast 动画 ===== */
@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
</style>
