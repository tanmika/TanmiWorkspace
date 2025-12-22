<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore, useToastStore } from '@/stores'
import { workspaceApi, type DevInfoResult } from '@/api/workspace'
import type { WorkspaceInitParams, WorkspaceEntry } from '@/types'
import SettingsModal from '@/components/SettingsModal.vue'
import WsModal from '@/components/ui/WsModal.vue'
import WsConfirmDialog from '@/components/ui/WsConfirmDialog.vue'

const router = useRouter()
const workspaceStore = useWorkspaceStore()
const toastStore = useToastStore()

// 主题
const theme = ref<'light' | 'dark'>('light')

// 状态
const showCreateDialog = ref(false)
const showSettingsModal = ref(false)

// 确认弹窗状态
const showConfirmDialog = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmDialogType = ref<'info' | 'warning' | 'danger'>('info')
const pendingConfirmAction = ref<(() => Promise<void>) | null>(null)

// 错误信息弹窗状态
const showErrorDialog = ref(false)
const errorDialogTitle = ref('')
const errorDialogMessage = ref('')

const createForm = ref<WorkspaceInitParams>({
  name: '',
  goal: '',
  rules: [],
  docs: [],
})
// 本地存储的偏好设置 key
const PREFERENCES_KEY = 'tanmi-workspace-home-preferences'

// 偏好设置类型
interface HomePreferences {
  statusFilter: 'all' | 'active' | 'archived' | 'error'
  sortBy: 'updatedAt' | 'createdAt'
  sortOrder: 'desc' | 'asc'
  theme: 'light' | 'dark'
}

// 加载本地偏好
function loadPreferences(): HomePreferences {
  try {
    const saved = localStorage.getItem(PREFERENCES_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch {
    // 忽略解析错误
  }
  return { statusFilter: 'all', sortBy: 'updatedAt', sortOrder: 'desc', theme: 'light' }
}

// 保存本地偏好
function savePreferences() {
  const prefs: HomePreferences = {
    statusFilter: statusFilter.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    theme: theme.value,
  }
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs))
}

// 初始化偏好设置
const savedPrefs = loadPreferences()
const statusFilter = ref<'all' | 'active' | 'archived' | 'error'>(savedPrefs.statusFilter)
const searchQuery = ref('')
const sortBy = ref<'updatedAt' | 'createdAt'>(savedPrefs.sortBy)
const sortOrder = ref<'desc' | 'asc'>(savedPrefs.sortOrder)
const sortSelectOpen = ref(false)
theme.value = savedPrefs.theme

// 点击其他地方关闭下拉
function handleClickOutside() {
  sortSelectOpen.value = false
}
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

// 开发信息
const devInfo = ref<DevInfoResult | null>(null)

// 主题切换
function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme.value)
}

// 刷新状态
const isRefreshing = ref(false)

// 刷新数据
async function handleRefresh() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await workspaceStore.fetchWorkspaces('all')
    toastStore.success('刷新成功')
  } catch {
    toastStore.error('刷新失败')
  } finally {
    isRefreshing.value = false
  }
}

// 暴露刷新方法给外部调用
defineExpose({ handleRefresh })

// 加载工作区列表和开发信息
onMounted(async () => {
  // 应用保存的主题
  document.documentElement.setAttribute('data-theme', theme.value)

  try {
    await workspaceStore.fetchWorkspaces('all')
  } catch {
    toastStore.error('加载失败', '无法加载工作区列表')
  }

  // 加载开发信息（静默失败）
  try {
    devInfo.value = await workspaceApi.getDevInfo()
  } catch {
    // 忽略
  }
})

// 监听偏好变化并自动保存
watch([statusFilter, sortBy, sortOrder, theme], () => {
  savePreferences()
})

// 创建工作区
async function handleCreate() {
  if (!createForm.value.name || !createForm.value.goal) {
    toastStore.warning('请填写名称和目标')
    return
  }
  try {
    await workspaceStore.createWorkspace(createForm.value)
    toastStore.success('创建成功')
    showCreateDialog.value = false
    createForm.value = { name: '', goal: '', rules: [], docs: [] }
  } catch {
    toastStore.error('创建失败')
  }
}

// 显示确认弹窗
function showConfirm(title: string, message: string, type: 'info' | 'warning' | 'danger', action: () => Promise<void>) {
  confirmDialogTitle.value = title
  confirmDialogMessage.value = message
  confirmDialogType.value = type
  pendingConfirmAction.value = action
  showConfirmDialog.value = true
}

// 执行确认操作
async function handleConfirmAction() {
  if (pendingConfirmAction.value) {
    await pendingConfirmAction.value()
    pendingConfirmAction.value = null
  }
}

// 删除工作区
function handleDelete(id: string, name: string) {
  showConfirm('删除确认', `确定要删除工作区「${name}」吗？此操作不可撤销。`, 'danger', async () => {
    await workspaceStore.deleteWorkspace(id, true)
    toastStore.success('删除成功')
  })
}

// 归档工作区
function handleArchive(id: string, name: string) {
  showConfirm('归档确认', `确定要归档工作区「${name}」吗？`, 'info', async () => {
    await workspaceStore.archiveWorkspace(id)
    toastStore.success('归档成功')
  })
}

// 恢复工作区
function handleRestore(id: string, name: string) {
  showConfirm('恢复确认', `确定要恢复工作区「${name}」吗？`, 'info', async () => {
    await workspaceStore.restoreWorkspace(id)
    toastStore.success('恢复成功')
  })
}

// 进入工作区
function handleEnter(ws: WorkspaceEntry) {
  if (ws.status === 'error') {
    // 错误状态的工作区显示错误信息弹窗
    showErrorInfo(ws)
    return
  }
  router.push(`/workspace/${ws.id}`)
}

// 显示错误信息
function showErrorInfo(ws: WorkspaceEntry) {
  const errorInfo = ws.errorInfo
  const message = errorInfo
    ? `错误类型：${errorInfo.type || '未知'}\n错误信息：${errorInfo.message}\n检测时间：${formatTime(errorInfo.detectedAt)}`
    : '未知错误'

  errorDialogTitle.value = `工作区「${ws.name}」出错`
  errorDialogMessage.value = message
  showErrorDialog.value = true
}

// 格式化时间
function formatTime(isoString: string) {
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 过滤、搜索、排序后的工作区列表
const filteredWorkspaces = computed(() => {
  let list: WorkspaceEntry[] = []

  // 1. 按状态筛选
  if (statusFilter.value === 'active') {
    list = [...workspaceStore.activeWorkspaces]
  } else if (statusFilter.value === 'archived') {
    list = [...workspaceStore.archivedWorkspaces]
  } else if (statusFilter.value === 'error') {
    list = workspaceStore.workspaces.filter(ws => ws.status === 'error')
  } else {
    list = [...workspaceStore.workspaces]
  }

  // 2. 搜索过滤（名称或路径）
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    list = list.filter(ws =>
      ws.name.toLowerCase().includes(query) ||
      ws.projectRoot.toLowerCase().includes(query)
    )
  }

  // 3. 排序
  list.sort((a, b) => {
    const aTime = new Date(a[sortBy.value]).getTime()
    const bTime = new Date(b[sortBy.value]).getTime()
    return sortOrder.value === 'desc' ? bTime - aTime : aTime - bTime
  })

  return list
})

// 获取路径显示（只显示最后两级目录）
function getShortPath(fullPath: string): string {
  const parts = fullPath.split('/')
  if (parts.length <= 2) return fullPath
  return '.../' + parts.slice(-2).join('/')
}

// 切换排序顺序
function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
}


// Badge 样式
function getBadgeClass(status: string) {
  if (status === 'active') return 'badge-active'
  if (status === 'error') return 'badge-error'
  return 'badge-archived'
}

function getBadgeText(status: string) {
  if (status === 'active') return 'Active'
  if (status === 'error') return 'Error'
  return 'Archived'
}
</script>

<template>
  <div class="home-view">
    <!-- 头部 -->
    <header class="header">
      <div class="logo">
        <div class="logo-icon"></div>
        <div class="logo-text">
          <span class="bold">Tanm<i class="red-dot">ı</i></span><span class="light">Workspace</span>
        </div>
      </div>
      <div class="header-actions">
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
        <button class="btn btn-secondary" @click="handleRefresh" :disabled="isRefreshing" title="刷新数据">
          <span :class="{ 'spin': isRefreshing }">⇄</span> SYNC
        </button>
        <button class="btn btn-secondary" @click="showSettingsModal = true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="1" y1="3" x2="15" y2="3"/>
            <rect x="10" y="1" width="3" height="4" fill="currentColor" stroke="none"/>
            <line x1="1" y1="8" x2="15" y2="8"/>
            <rect x="4" y="6" width="3" height="4" fill="currentColor" stroke="none"/>
            <line x1="1" y1="13" x2="15" y2="13"/>
            <rect x="8" y="11" width="3" height="4" fill="currentColor" stroke="none"/>
          </svg>
          SETTINGS
        </button>
        <button class="btn btn-primary" @click="showCreateDialog = true">+ NEW</button>
      </div>
    </header>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div class="filter-left">
        <div class="tabs">
          <div class="tab" :class="{ active: statusFilter === 'all' }" @click="statusFilter = 'all'">全部</div>
          <div class="tab" :class="{ active: statusFilter === 'active' }" @click="statusFilter = 'active'">活跃</div>
          <div class="tab" :class="{ active: statusFilter === 'archived' }" @click="statusFilter = 'archived'">已归档</div>
          <div class="tab" :class="{ active: statusFilter === 'error' }" @click="statusFilter = 'error'">错误</div>
        </div>
        <input type="text" class="search-input" v-model="searchQuery" placeholder="搜索名称或路径...">
      </div>
      <div class="filter-right">
        <div class="custom-select" :class="{ open: sortSelectOpen }">
          <div class="custom-select-trigger" @click.stop="sortSelectOpen = !sortSelectOpen">{{ sortBy === 'updatedAt' ? '更新时间' : '创建时间' }}</div>
          <div class="custom-select-dropdown">
            <div class="custom-select-option" :class="{ selected: sortBy === 'createdAt' }" @click="sortBy = 'createdAt'; sortSelectOpen = false">创建时间</div>
            <div class="custom-select-option" :class="{ selected: sortBy === 'updatedAt' }" @click="sortBy = 'updatedAt'; sortSelectOpen = false">更新时间</div>
          </div>
        </div>
        <button class="btn btn-icon" :class="{ desc: sortOrder === 'desc' }" @click="toggleSortOrder" title="切换排序方向">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M7 10l5 5 5-5"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 空状态 -->
      <div v-if="filteredWorkspaces.length === 0 && !workspaceStore.loading" class="empty-state">
        <div class="empty-state-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </div>
        <div class="empty-state-title">{{ searchQuery ? '没有匹配的工作区' : '暂无工作区' }}</div>
        <div class="empty-state-desc">创建一个新的工作区来开始管理你的任务</div>
        <button class="btn btn-primary" @click="showCreateDialog = true">+ 新建工作区</button>
      </div>

      <!-- 卡片网格 -->
      <div v-else class="card-grid" v-loading="workspaceStore.loading">
        <div
          v-for="ws in filteredWorkspaces"
          :key="ws.id"
          class="card"
          :class="{ archived: ws.status === 'archived' }"
        >
          <div class="card-header">
            <h3 class="card-title">{{ ws.name }}</h3>
            <span class="badge" :class="getBadgeClass(ws.status)">{{ getBadgeText(ws.status) }}</span>
          </div>
          <div class="card-body">
            <div class="path-box" :title="ws.projectRoot">{{ getShortPath(ws.projectRoot) }}</div>
            <div class="meta-info">
              <span>Created: {{ formatTime(ws.createdAt) }}</span>
              <span>Updated: {{ formatTime(ws.updatedAt) }}</span>
            </div>
          </div>
          <div class="card-footer">
            <template v-if="ws.status === 'error'">
              <button class="btn btn-accent" @click="showErrorInfo(ws)">查看错误</button>
              <button class="btn btn-danger" @click="handleDelete(ws.id, ws.name)">删除</button>
            </template>
            <template v-else>
              <button class="btn btn-accent" @click="handleEnter(ws)">进入 ></button>
              <button v-if="ws.status === 'active'" class="btn btn-ghost" @click="handleArchive(ws.id, ws.name)">归档</button>
              <button v-else class="btn btn-ghost" @click="handleRestore(ws.id, ws.name)">恢复</button>
              <button class="btn btn-danger" @click="handleDelete(ws.id, ws.name)">删除</button>
            </template>
          </div>
        </div>
      </div>
    </main>

    <!-- 创建对话框 -->
    <WsModal v-model="showCreateDialog" title="NEW WORKSPACE">
      <div class="form-group">
        <label class="form-label">工作区名称</label>
        <input type="text" class="form-input" v-model="createForm.name" placeholder="输入工作区名称...">
      </div>
      <div class="form-group">
        <label class="form-label">目标描述</label>
        <textarea class="form-input form-textarea" v-model="createForm.goal" placeholder="描述工作区的目标..." rows="3"></textarea>
      </div>
      <template #footer>
        <button class="btn btn-cancel" @click="showCreateDialog = false">取消</button>
        <button class="btn btn-primary" @click="handleCreate" :disabled="workspaceStore.loading">创建</button>
      </template>
    </WsModal>

    <!-- 设置弹窗 -->
    <SettingsModal v-model:visible="showSettingsModal" @tutorial-created="handleRefresh" />

    <!-- 开发模式标识 -->
    <div v-if="devInfo?.available" class="dev-badge" title="开发模式 - 点击设置查看详细版本信息">
      DEV
    </div>

    <!-- 确认弹窗 -->
    <WsConfirmDialog
      v-model="showConfirmDialog"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      :type="confirmDialogType"
      @confirm="handleConfirmAction"
    />

    <!-- 错误信息弹窗 -->
    <WsModal v-model="showErrorDialog" :title="errorDialogTitle" width="480px">
      <div class="error-message-box">{{ errorDialogMessage }}</div>
      <template #footer>
        <button class="btn btn-primary" @click="showErrorDialog = false">知道了</button>
      </template>
    </WsModal>
  </div>
</template>

<style scoped>
.home-view {
  min-height: 100vh;
  background-color: var(--bg-color);
  background-image: radial-gradient(var(--bg-dot) 1px, transparent 1px);
  background-size: 20px 20px;
}

/* Header */
.header {
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  padding: 0 32px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
}

.logo {
  display: flex;
  align-items: center;
}

.logo-icon {
  width: 24px;
  height: 24px;
  position: relative;
}

.logo-icon::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 18px;
  height: 18px;
  background-color: var(--logo-block);
}

.logo-icon::after {
  content: '';
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 10px;
  height: 10px;
  background-color: var(--accent-red);
  box-shadow: 0 0 0 2px var(--logo-outline);
}

.logo-text {
  font-size: 20px;
  line-height: 1;
  color: var(--text-main);
  margin-left: 12px;
}

.logo-text .bold {
  font-weight: 800;
  letter-spacing: -0.5px;
}

.logo-text .light {
  font-weight: 300;
  opacity: 0.7;
}

.logo-text .red-dot {
  position: relative;
  font-style: normal;
}

.logo-text .red-dot::after {
  content: '';
  position: absolute;
  top: 0.18em;
  left: 0.06em;
  width: 0.17em;
  height: 0.17em;
  background-color: var(--accent-red);
  border-radius: 50%;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

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

/* Filter Bar */
.filter-bar {
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filter-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.filter-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 0;
}

.tab {
  padding: 16px 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: all 0.15s ease;
  user-select: none;
}

.tab:hover {
  color: var(--text-main);
}

.tab.active {
  color: var(--text-main);
  border-bottom-color: var(--border-heavy);
}

/* Search Input */
.search-input {
  font-size: 14px;
  padding: 10px 0;
  border: none;
  border-bottom: 2px solid var(--border-color);
  background: transparent;
  width: 240px;
  outline: none;
  transition: border-color 0.15s ease;
  color: var(--text-main);
}

.search-input:focus {
  border-bottom-color: var(--border-heavy);
}

.search-input::placeholder {
  color: var(--text-muted);
}

/* Custom Select */
.custom-select {
  position: relative;
  width: 160px;
}

.custom-select-trigger {
  height: 36px;
  padding: 0 32px 0 12px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-main);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.15s ease;
  position: relative;
}

.custom-select-trigger::after {
  content: '';
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid var(--text-main);
  transition: transform 0.15s ease;
}

.custom-select.open .custom-select-trigger::after {
  transform: translateY(-50%) rotate(180deg);
}

.custom-select-trigger:hover,
.custom-select.open .custom-select-trigger {
  border-color: var(--border-heavy);
}

.custom-select-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-heavy);
  border-top: none;
  display: none;
  z-index: 100;
  box-shadow: 4px 4px 0 rgba(0,0,0,0.2);
}

.custom-select.open .custom-select-dropdown {
  display: block;
}

.custom-select-option {
  padding: 10px 12px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.1s ease;
  border-left: 3px solid transparent;
}

.custom-select-option:hover {
  background: var(--path-bg);
  border-left-color: var(--accent-red);
}

.custom-select-option.selected {
  background: var(--card-footer);
  font-weight: 600;
  border-left-color: var(--border-heavy);
}

/* Main Content */
.main-content {
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;
}

/* Card Grid */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

/* Card */
.card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--border-heavy);
  transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  position: relative;
}

.card:hover {
  transform: translate(-4px, -4px);
  box-shadow: 4px 4px 0px var(--border-heavy);
  border-color: var(--border-heavy);
  border-left-color: var(--accent-red);
}

.card.archived {
  border-left-color: var(--path-border);
}

.card.archived .card-title {
  color: var(--text-muted);
}

.card.archived:hover {
  border-left-color: var(--text-muted);
}

.card-header {
  padding: 20px 20px 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.3;
  margin: 0;
}

.card-body {
  padding: 0 20px 16px;
}

.path-box {
  background: var(--path-bg);
  padding: 10px 12px;
  font-family: var(--mono-font);
  font-size: 12px;
  color: var(--text-secondary);
  border-left: 2px solid var(--path-border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 12px;
}

.card.archived .path-box {
  color: var(--text-muted);
  border-left-color: var(--border-color);
}

.meta-info {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--mono-font);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-footer {
  border-top: 1px solid var(--border-color);
  padding: 12px 20px;
  display: flex;
  justify-content: space-evenly;
  gap: 16px;
  background: var(--card-footer);
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none;
  height: 36px;
  padding: 0 16px;
}

.btn-primary {
  background: var(--accent-red);
  color: #fff;
  border: 1px solid var(--accent-red);
}

.btn-primary:hover {
  background: #b82424;
  border-color: #b82424;
  transform: translateY(-1px);
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
}

.btn-secondary {
  background: var(--card-bg);
  color: var(--text-main);
  border: 1px solid var(--border-heavy);
}

.btn-secondary:hover {
  background: var(--path-bg);
  transform: translateY(-1px);
  box-shadow: 2px 2px 0 var(--border-heavy);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
}

.btn-ghost:hover {
  color: var(--text-main);
  background: var(--path-bg);
}

.btn-danger {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
}

.btn-danger:hover {
  color: var(--accent-red);
  background: #fff5f5;
}

.btn-accent {
  background: transparent;
  color: var(--accent-red);
  border: 1px solid transparent;
}

.btn-accent:hover {
  background: #fff5f5;
}

.btn-cancel {
  background: var(--card-bg);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-cancel:hover {
  border-color: var(--text-secondary);
  color: var(--text-main);
}

.btn-icon {
  width: 36px;
  padding: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--text-main);
}

.btn-icon:hover {
  border-color: var(--border-heavy);
  color: var(--accent-red);
}

.btn-icon.desc svg {
  transform: rotate(180deg);
}

/* 刷新图标旋转动画 */
.spin {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Badge */
.badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 8px;
  letter-spacing: 0.5px;
}

.badge-active {
  background: var(--border-heavy);
  color: #fff;
}

.badge-archived {
  background: var(--path-bg);
  color: var(--text-muted);
}

.badge-error {
  background: var(--accent-red);
  color: #fff;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 80px 40px;
  color: var(--text-muted);
}

.empty-state-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 24px;
  background: var(--path-bg);
  border: 2px dashed var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.empty-state-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 8px;
}

.empty-state-desc {
  font-size: 14px;
  margin-bottom: 24px;
}

/* Form */
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  font-size: 14px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-main);
  outline: none;
  transition: border-color 0.15s ease;
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-input:focus {
  border-color: var(--border-heavy);
}

.form-textarea {
  height: auto;
  padding: 12px;
  resize: vertical;
}

/* Dark Mode Overrides */
[data-theme="dark"] .btn-primary {
  background: var(--accent-red);
  border-color: var(--accent-red);
  color: #fff;
}

[data-theme="dark"] .btn-primary:hover {
  background: #b82424;
  border-color: #b82424;
  box-shadow: 2px 2px 0 rgba(255, 255, 255, 0.2);
}

[data-theme="dark"] .badge-active {
  background: #fff;
  color: #111;
}

[data-theme="dark"] .btn-danger:hover {
  background: rgba(217, 43, 43, 0.2);
}

[data-theme="dark"] .btn-accent:hover {
  background: rgba(217, 43, 43, 0.2);
}

/* 开发模式标识 */
.dev-badge {
  position: fixed;
  bottom: 12px;
  right: 12px;
  background: #f59e0b;
  color: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
  font-family: var(--mono-font);
  letter-spacing: 1px;
  z-index: 9999;
  cursor: default;
}

/* 错误信息框 */
.error-message-box {
  font-family: var(--mono-font);
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
  white-space: pre-wrap;
  background: var(--path-bg);
  padding: 16px;
  border-left: 4px solid var(--accent-red);
}
</style>
