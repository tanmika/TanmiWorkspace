<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
// Element Plus icons (no longer used in header/sidebar)
import { useWorkspaceStore, useNodeStore, useSettingsStore, useToastStore, useMemoStore } from '@/stores'
import { getGlobalSSE } from '@/composables/useSSE'
import NodeTree from '@/components/node/NodeTree.vue'
import NodeTreeGraph from '@/components/node/NodeTreeGraph.vue'
import NodeDetail from '@/components/node/NodeDetail.vue'
import MemoDetail from '@/components/memo/MemoDetail.vue'
import MemoDrawerDetail from '@/components/memo/MemoDrawerDetail.vue'
import EnableDispatchDialog from '@/components/dispatch/EnableDispatchDialog.vue'
import DisableDispatchDialog from '@/components/dispatch/DisableDispatchDialog.vue'
import SwitchDispatchModeDialog from '@/components/dispatch/SwitchDispatchModeDialog.vue'
import WsButton from '@/components/ui/WsButton.vue'
import WsModal from '@/components/ui/WsModal.vue'

// Toast store
const toastStore = useToastStore()

// 主题 - 从 localStorage 读取
function getSavedTheme(): 'light' | 'dark' {
  try {
    const prefs = JSON.parse(localStorage.getItem('tanmi-workspace-home-preferences') || '{}')
    return prefs.theme || 'light'
  } catch {
    return 'light'
  }
}
const theme = ref<'light' | 'dark'>(getSavedTheme())
// 立即应用主题
document.documentElement.setAttribute('data-theme', theme.value)

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme.value)
  // 同步到 localStorage
  const prefs = JSON.parse(localStorage.getItem('tanmi-workspace-home-preferences') || '{}')
  prefs.theme = theme.value
  localStorage.setItem('tanmi-workspace-home-preferences', JSON.stringify(prefs))
}

// Toast notification helper
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (type === 'success') {
    toastStore.success(message)
  } else if (type === 'error') {
    toastStore.error(message)
  } else {
    toastStore.info(message)
  }
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
const memoStore = useMemoStore()

const workspaceId = computed(() => route.params.id as string)

// 选中状态：区分 node、memo 和 memo-drawer
type SelectionType = 'node' | 'memo' | 'memo-drawer'
const selectedType = ref<SelectionType>('node')
const selectedMemoId = ref<string | null>(null)

// 计算当前有效的 selectedId（用于传递给 NodeTree 和 NodeTreeGraph）
const effectiveSelectedId = computed(() => {
  if (selectedType.value === 'node') return nodeStore.selectedNodeId
  if (selectedType.value === 'memo-drawer') return '__memo_drawer__'
  return selectedMemoId.value
})

// 加载工作区数据
async function loadWorkspace() {
  try {
    await workspaceStore.fetchWorkspace(workspaceId.value)
    await nodeStore.fetchNodeTree()
    await memoStore.fetchMemos(workspaceId.value)
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : '未知错误'
    toastStore.error('加载工作区失败', errorMessage)
    router.push('/')
  }
}

// 工作区详情抽屉状态
const showWorkspaceDetail = ref(false)

// 抽屉宽度（可拖动调整）
const DEFAULT_DRAWER_WIDTH = 450
const MIN_DRAWER_WIDTH = 320
const MAX_DRAWER_WIDTH = 800

const drawerWidth = ref(
  parseInt(localStorage.getItem('tanmi-workspace-drawer-width') || '') || DEFAULT_DRAWER_WIDTH
)

const isDrawerResizing = ref(false)

function startDrawerResize(e: MouseEvent) {
  e.preventDefault()
  isDrawerResizing.value = true
  document.addEventListener('mousemove', handleDrawerResize)
  document.addEventListener('mouseup', stopDrawerResize)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'ew-resize'
}

function handleDrawerResize(e: MouseEvent) {
  if (!isDrawerResizing.value) return
  const newWidth = window.innerWidth - e.clientX
  if (newWidth >= MIN_DRAWER_WIDTH && newWidth <= MAX_DRAWER_WIDTH) {
    drawerWidth.value = newWidth
  }
}

function stopDrawerResize() {
  isDrawerResizing.value = false
  document.removeEventListener('mousemove', handleDrawerResize)
  document.removeEventListener('mouseup', stopDrawerResize)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  localStorage.setItem('tanmi-workspace-drawer-width', drawerWidth.value.toString())
}

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
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : '未知错误'
    toastStore.error('刷新失败', errorMessage)
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
      // 切换到节点视图并选中聚焦节点
      selectedType.value = 'node'
      selectedMemoId.value = null
      await nodeStore.selectNode(focusId)
      showToast('已定位到当前任务', 'success')
    } else {
      showToast('当前没有聚焦的任务', 'info')
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : '未知错误'
    toastStore.error('定位失败', errorMessage)
  } finally {
    isFocusing.value = false
  }
}

// 监听路由变化
watch(workspaceId, loadWorkspace)

// 初始加载
onMounted(() => {
  loadWorkspace()

  // 连接 SSE 并监听更新事件
  const sse = getGlobalSSE()
  sse.connect()

  // 监听节点更新事件
  sse.on('node_updated', (event) => {
    if (event.workspaceId === workspaceId.value) {
      console.log('[SSE] 收到节点更新，刷新数据')
      nodeStore.fetchNodeTree()
    }
  })

  // 监听日志更新事件
  sse.on('log_updated', (event) => {
    if (event.workspaceId === workspaceId.value) {
      console.log('[SSE] 收到日志更新，刷新数据')
      workspaceStore.fetchWorkspace(workspaceId.value)
    }
  })
})

// 返回首页
function goBack() {
  workspaceStore.clearCurrent()
  nodeStore.clearAll()
  router.push('/')
}

// 选择节点
function handleNodeSelect(nodeId: string) {
  selectedType.value = 'node'
  selectedMemoId.value = null
  nodeStore.selectNode(nodeId)
}

// 选择 memo
function handleMemoSelect(memoId: string) {
  selectedType.value = 'memo'
  selectedMemoId.value = memoId
  nodeStore.clearSelection()
}

// 统一处理树选择（区分节点、memo 和 memo-drawer）
function handleTreeSelect(id: string) {
  // memo 抽屉
  if (id === '__memo_drawer__') {
    handleMemoDrawerClick()
    return
  }
  // memo 节点 ID 以 memo- 开头
  if (id.startsWith('memo-')) {
    handleMemoSelect(id)
  } else {
    handleNodeSelect(id)
  }
}

// 点击图形视图中的memo抽屉
function handleMemoDrawerClick() {
  selectedType.value = 'memo-drawer'
  selectedMemoId.value = null
  nodeStore.clearSelection()
}

// 从抽屉详情选择具体 memo
function handleDrawerSelectMemo(memoId: string) {
  handleMemoSelect(memoId)
}

// 删除 memo 后的处理
async function handleMemoDeleted() {
  // 清除选中状态，返回到抽屉视图
  selectedMemoId.value = null
  selectedType.value = 'memo-drawer'
  // 刷新 memo 列表
  if (workspaceStore.currentWorkspace?.id) {
    await memoStore.fetchMemos(workspaceStore.currentWorkspace.id)
  }
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

// @ts-ignore - Reserved for future disable dispatch button
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
        <button class="ws-btn text" @click="goBack" title="返回首页">&lt;</button>
        <h2 class="workspace-title">{{ workspaceStore.currentWorkspace?.name }}</h2>
        <span class="header-sep">·</span>
        <button class="ws-btn text details-link" @click="showWorkspaceDetail = true">DETAILS<span class="blink-cursor">_</span></button>
      </div>
      <div class="header-right">
        <button class="theme-toggle" @click="toggleTheme" :title="theme === 'light' ? '切换到深色模式' : '切换到浅色模式'">
          <svg v-if="theme === 'light'" class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg v-else class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
        <button class="ws-btn" @click="handleFocusCurrent" :disabled="isFocusing" title="聚焦当前任务">▶ FOCUS</button>
        <button class="ws-btn" @click="handleRefresh" :disabled="isRefreshing" title="刷新数据">⇄ SYNC</button>
        <button class="ws-btn primary" @click="openCreateDialog">+ NEW</button>
      </div>
    </header>

    <!-- 工作区信息栏 InfoBar -->
    <div v-if="workspaceStore.currentStatus" class="layout-infobar">
        <div class="info-item info-goal">
          <span class="info-label">Goal / 目标</span>
          <span class="info-value">{{ workspaceStore.currentStatus.goal }}</span>
        </div>
        <div class="info-item info-progress">
          <span class="info-label">Progress / 进度</span>
          <div class="info-value progress-display">
            <span class="progress-number">
              <span class="progress-current">{{ workspaceStore.currentStatus.completedNodes }}</span>
              <span class="progress-sep">/</span>
              <span class="progress-total">{{ workspaceStore.currentStatus.totalNodes }}</span>
            </span>
            <div class="progress-bar-wrapper">
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="info-item">
          <span class="info-label">Dispatch / 派发</span>
          <div class="info-value">
            <span
              :class="[
                'badge-status',
                workspaceStore.dispatchStatus === 'disabled' ? 'disabled' :
                workspaceStore.dispatchStatus === 'enabled' ? 'enabled' : 'git'
              ]"
            >
              {{
                workspaceStore.dispatchStatus === 'disabled' ? 'OFF' :
                workspaceStore.dispatchStatus === 'enabled' ? 'ON' : 'GIT'
              }}
            </span>
            <button
              v-if="workspaceStore.dispatchStatus === 'disabled'"
              class="ws-btn config-btn"
              :disabled="isEnablingDispatch"
              @click="handleEnableDispatch"
            >ENABLE</button>
            <button v-else class="ws-btn config-btn" @click="handleSwitchMode">CONFIG</button>
          </div>
        </div>
        <div class="info-item" v-if="hasRulesOrDocs">
          <span class="info-label">Links / 引用</span>
          <div class="info-value">
            <span v-if="workspaceStore.currentRules.length" class="tag-outline" @click="showWorkspaceDetail = true">
              {{ workspaceStore.currentRules.length }} 规则
            </span>
            <span v-if="workspaceStore.currentDocs.length" class="tag-outline" @click="showWorkspaceDetail = true">
              {{ workspaceStore.currentDocs.length }} 文档
            </span>
          </div>
        </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 左侧：节点树 Sidebar -->
      <aside class="layout-sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="sidebar-header">
          <h3>Task Tree</h3>
          <div class="view-toggle">
            <button
              class="ws-btn view-btn"
              :class="{ active: viewMode === 'list' }"
              @click="setViewMode('list')"
              title="列表视图"
            >☰</button>
            <button
              class="ws-btn view-btn"
              :class="{ active: viewMode === 'graph' }"
              @click="setViewMode('graph')"
              title="图形视图"
            >◇</button>
          </div>
        </div>
        <div class="sidebar-content">
          <NodeTree
            v-if="viewMode === 'list'"
            :tree="nodeStore.nodeTree"
            :selected-id="effectiveSelectedId"
            :focus-id="workspaceStore.currentFocus"
            :memos="memoStore.memos"
            @select="handleTreeSelect"
          />
          <NodeTreeGraph
            v-else
            :tree="nodeStore.nodeTree"
            :selected-id="effectiveSelectedId"
            :focus-id="workspaceStore.currentFocus"
            :memos="memoStore.memos"
            @select="handleTreeSelect"
            @select-memo="handleMemoDrawerClick"
          />
        </div>
      </aside>

      <!-- 可拖动分隔条 -->
      <div
        class="resizer"
        :class="{ 'is-resizing': isResizing }"
        @mousedown="startResize"
      />

      <!-- 右侧：节点/备忘详情 Content -->
      <main class="layout-content">
        <NodeDetail v-if="selectedType === 'node' && nodeStore.selectedNodeId" />
        <MemoDetail v-else-if="selectedType === 'memo' && selectedMemoId" :memo-id="selectedMemoId" @deleted="handleMemoDeleted" />
        <MemoDrawerDetail v-else-if="selectedType === 'memo-drawer'" @select-memo="handleDrawerSelectMemo" />
        <div v-else class="empty-state">
          <div class="empty-icon"></div>
          <p class="empty-text">SELECT A NODE OR MEMO</p>
          <p class="empty-hint">选择左侧节点或备忘查看详情</p>
        </div>
      </main>
    </div>

    <!-- 工作区详情抽屉 -->
    <transition name="drawer-fade">
      <div v-if="showWorkspaceDetail" class="drawer-overlay" @click="showWorkspaceDetail = false">
        <div class="drawer-panel" :style="{ width: drawerWidth + 'px' }" @click.stop>
          <div
            class="drawer-resizer"
            @mousedown="startDrawerResize"
          />
          <div class="modal-header">
            <span>工作区详情</span>
            <button class="modal-close" @click="showWorkspaceDetail = false">×</button>
          </div>
          <div class="modal-body">
            <!-- 基本信息 -->
            <div class="detail-section">
              <div class="section-title">Goal / 目标</div>
              <div class="goal-content">
                {{ workspaceStore.currentStatus?.goal || '暂无目标' }}
              </div>
            </div>

            <!-- 规则 -->
            <div v-if="workspaceStore.currentRules.length > 0" class="detail-section">
              <div class="section-title">
                Rules / 规则
                <span class="count-badge">{{ workspaceStore.currentRules.length }}</span>
              </div>
              <ul class="rules-list">
                <li v-for="(rule, idx) in workspaceStore.currentRules" :key="idx">{{ rule }}</li>
              </ul>
            </div>

            <!-- 文档 -->
            <div v-if="workspaceStore.currentDocs.length > 0" class="detail-section">
              <div class="section-title">
                Docs / 文档
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
              <div class="section-title">
                Log / 工作区日志
                <span class="count-badge">{{ workspaceStore.currentLogs.length }}</span>
              </div>
              <div v-if="workspaceStore.currentLogs.length > 0" class="log-container">
                <div
                  v-for="(log, idx) in workspaceStore.currentLogs"
                  :key="idx"
                  class="log-item"
                >
                  <div class="log-header">
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
                  <div class="log-content">{{ log.event }}</div>
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
  height: 64px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 32px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
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
  font-weight: 700;
  color: var(--text-main);
}

.header-sep {
  color: var(--text-muted);
  font-size: 14px;
  margin: 0 4px 0 -4px;
}

.details-link {
  color: var(--accent-red) !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  margin-left: -4px;
}

.details-link:hover:not(:disabled) {
  background: rgba(217, 43, 43, 0.08) !important;
}

.blink-cursor {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* 主题切换按钮 */
.theme-toggle {
  width: 36px;
  height: 36px;
  padding: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-heavy);
  color: var(--text-main);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.theme-toggle:hover {
  border-color: var(--border-heavy);
  color: var(--accent-red);
  background: var(--path-bg);
  transform: translateY(-1px);
  box-shadow: 2px 2px 0 var(--border-heavy);
}

.theme-toggle .icon-sun,
.theme-toggle .icon-moon {
  width: 18px;
  height: 18px;
}

/* 工作区操作按钮 */
.ws-btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid var(--border-heavy);
  background: var(--card-bg);
  color: var(--text-main);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.ws-btn:hover:not(:disabled) {
  border-color: var(--border-heavy);
  transform: translate(-1px, -1px);
  box-shadow: 2px 2px 0 var(--border-heavy);
}

.ws-btn:active:not(:disabled) {
  transform: translate(0, 0);
  box-shadow: none;
}

.ws-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ws-btn.text {
  border: none;
  background: transparent;
  padding: 0 8px;
  font-size: 14px;
}

.ws-btn.text:hover:not(:disabled) {
  box-shadow: none;
  background: rgba(0, 0, 0, 0.05);
  transform: none;
}

.ws-btn.text.active {
  background: rgba(0, 0, 0, 0.1);
}

[data-theme="dark"] .ws-btn.text:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
}

[data-theme="dark"] .ws-btn.text.active {
  background: rgba(255, 255, 255, 0.1);
}

.ws-btn.primary {
  background: var(--accent-red);
  border-color: var(--accent-red);
  color: #fff;
}

.ws-btn.primary:hover:not(:disabled) {
  background: #b82424;
  border-color: #b82424;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
}

/* ===== 信息栏 InfoBar ===== */
.layout-infobar {
  display: flex;
  align-items: center;
  gap: 40px;
  padding: 16px 32px;
  background: var(--card-bg);
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
  white-space: nowrap;
  flex-shrink: 0;
}

.info-value {
  font-size: 13px;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 进度条 - 构成主义风格 */
.progress-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  min-width: 64px;
  padding-bottom: 6px;
}

.progress-number {
  display: flex;
  align-items: baseline;
  font-family: var(--mono-font);
  font-weight: 700;
  line-height: 1;
}

.progress-current {
  font-size: 18px;
  color: var(--accent-red);
}

.progress-sep {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 1px;
}

.progress-total {
  font-size: 12px;
  color: var(--text-secondary);
}

.progress-bar-wrapper {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
}

.progress-track {
  width: 48px;
  height: 3px;
  background: var(--border-color);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-red);
  transition: width 0.3s ease;
}

/* 派发状态徽章 - 终端/军牌风格 */
.badge-status {
  font-family: var(--mono-font);
  font-size: 10px;
  font-weight: 700;
  padding: 0 8px;
  min-width: 32px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: inline-block;
  box-sizing: border-box;
}

.badge-status.disabled {
  background: #eee;
  color: #666;
  border: 1px solid #ddd;
}

.badge-status.enabled {
  background: var(--accent-green);
  color: #fff;
}

.badge-status.git {
  background: var(--accent-orange);
  color: #000;
}

[data-theme="dark"] .badge-status.disabled {
  background: #333;
  color: #aaa;
  border-color: #444;
}

[data-theme="dark"] .badge-status.enabled {
  background: var(--accent-green);
  color: #fff;
}

[data-theme="dark"] .badge-status.git {
  background: var(--accent-orange);
  color: #000;
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

/* 配置按钮 */
.config-btn {
  height: 20px;
  padding: 0 6px;
  font-size: 10px;
}


/* 引用标签 - outline 样式 */
.tag-outline {
  font-family: var(--mono-font);
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  background: var(--card-bg);
  cursor: pointer;
  text-transform: uppercase;
  font-weight: 600;
  transition: all 0.15s;
}

.tag-outline:hover {
  border-color: var(--border-heavy);
  color: var(--text-main);
}

/* 信息标签 */
.info-tags {
  display: flex;
  gap: 8px;
}

.info-tag {
  font-size: 12px;
  padding: 4px 10px;
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

.sidebar-header h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.view-toggle {
  display: inline-flex;
}

.view-toggle .ws-btn.view-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.view-toggle .ws-btn.view-btn:first-child {
  border-right: none;
}

.view-toggle .ws-btn.view-btn.active {
  background: var(--border-heavy);
  border-color: var(--border-heavy);
  color: #fff;
}

[data-theme="dark"] .view-toggle .ws-btn.view-btn.active {
  color: #181818;
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
  overflow: hidden;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--card-bg);
}

.empty-icon {
  width: 48px;
  height: 48px;
  border: 3px dashed var(--border-color);
  margin-bottom: 20px;
}

.empty-text {
  font-family: var(--mono-font), monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--text-muted);
  margin: 0 0 8px 0;
}

.empty-hint {
  font-size: 13px;
  color: var(--text-muted);
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
  background: var(--card-bg);
  border-left: 4px solid var(--border-heavy);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.drawer-resizer {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  background: transparent;
  z-index: 10;
  transition: background 0.2s;
}

.drawer-resizer:hover {
  background: var(--accent-red);
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

/* 抽屉内 Section 标题 - 带红色竖条 */
.drawer-panel .section-title {
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

.drawer-panel .section-title::before {
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

.goal-content {
  padding: 12px;
  background: var(--bg-color);
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
  word-break: break-all;
  line-height: 1.4;
}

.doc-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 日志容器 */
.log-container {
  background: #fafafa;
  border: 1px solid var(--border-color);
  max-height: 400px;
  overflow-y: auto;
}

[data-theme="dark"] .log-container {
  background: #1a1a1a;
}

.log-item {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
}

[data-theme="dark"] .log-item {
  border-bottom-color: #333;
}

.log-item:last-child {
  border-bottom: none;
}

.log-header {
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
  font-weight: 700;
  padding: 2px 6px;
  text-align: center;
}

.log-operator.ai {
  background: #111;
  color: #fff;
}

[data-theme="dark"] .log-operator.ai {
  background: #E0E0E0;
  color: #181818;
}

.log-operator.usr {
  background: var(--accent-green);
  color: #fff;
}

.log-operator.sys {
  background: #999;
  color: #fff;
}

.log-content {
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
