<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, ArrowRight, Box, RefreshRight, Sort, Setting, WarningFilled, Moon, Sunny } from '@element-plus/icons-vue'
import { useWorkspaceStore } from '@/stores'
import { workspaceApi, type DevInfoResult } from '@/api/workspace'
import type { WorkspaceInitParams, WorkspaceEntry } from '@/types'
import SettingsModal from '@/components/SettingsModal.vue'
import WsButton from '@/components/ui/WsButton.vue'
import WsInput from '@/components/ui/WsInput.vue'
import WsSelect from '@/components/ui/WsSelect.vue'
import WsBadge from '@/components/ui/WsBadge.vue'
import WsModal from '@/components/ui/WsModal.vue'
import WsEmpty from '@/components/ui/WsEmpty.vue'

const router = useRouter()
const workspaceStore = useWorkspaceStore()

// 主题
const theme = ref<'light' | 'dark'>('light')

// 状态
const showCreateDialog = ref(false)
const showSettingsModal = ref(false)
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
theme.value = savedPrefs.theme

// 开发信息
const devInfo = ref<DevInfoResult | null>(null)

// 主题切换
function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme.value)
}

// 加载工作区列表和开发信息
onMounted(async () => {
  // 应用保存的主题
  document.documentElement.setAttribute('data-theme', theme.value)

  try {
    await workspaceStore.fetchWorkspaces('all')
  } catch {
    ElMessage.error('加载工作区列表失败')
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
    ElMessage.warning('请填写名称和目标')
    return
  }
  try {
    await workspaceStore.createWorkspace(createForm.value)
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    createForm.value = { name: '', goal: '', rules: [], docs: [] }
  } catch {
    ElMessage.error('创建失败')
  }
}

// 删除工作区
async function handleDelete(id: string, name: string) {
  try {
    await ElMessageBox.confirm(`确定要删除工作区「${name}」吗？`, '删除确认', {
      type: 'warning',
    })
    await workspaceStore.deleteWorkspace(id, true)
    ElMessage.success('删除成功')
  } catch {
    // 用户取消或删除失败
  }
}

// 归档工作区
async function handleArchive(id: string, name: string) {
  try {
    await ElMessageBox.confirm(`确定要归档工作区「${name}」吗？`, '归档确认', {
      type: 'info',
    })
    await workspaceStore.archiveWorkspace(id)
    ElMessage.success('归档成功')
  } catch {
    // 用户取消或归档失败
  }
}

// 恢复工作区
async function handleRestore(id: string, name: string) {
  try {
    await ElMessageBox.confirm(`确定要恢复工作区「${name}」吗？`, '恢复确认', {
      type: 'info',
    })
    await workspaceStore.restoreWorkspace(id)
    ElMessage.success('恢复成功')
  } catch {
    // 用户取消或恢复失败
  }
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

  ElMessageBox.alert(message, `工作区「${ws.name}」出错`, {
    type: 'error',
    confirmButtonText: '知道了',
    dangerouslyUseHTMLString: false,
  })
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

// Select 组件的选项
const sortOptions = [
  { label: '更新时间', value: 'updatedAt' },
  { label: '创建时间', value: 'createdAt' }
]
</script>

<template>
  <div class="home-view">
    <!-- 头部 -->
    <header class="header">
      <div class="logo">TanmiWorkspace</div>
      <div class="header-actions">
        <WsButton variant="icon" @click="toggleTheme" :title="theme === 'light' ? '切换到深色模式' : '切换到浅色模式'" class="theme-toggle">
          <Moon v-if="theme === 'light'" style="width: 18px; height: 18px;" />
          <Sunny v-else style="width: 18px; height: 18px;" />
        </WsButton>
        <WsButton variant="secondary" @click="showSettingsModal = true">
          <Setting style="width: 16px; height: 16px;" />
          设置
        </WsButton>
        <WsButton variant="primary" @click="showCreateDialog = true">
          <Plus style="width: 16px; height: 16px;" />
          新建工作区
        </WsButton>
      </div>
    </header>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div class="filter-left">
        <div class="tabs">
          <button
            class="tab"
            :class="{ active: statusFilter === 'all' }"
            @click="statusFilter = 'all'"
          >
            全部
          </button>
          <button
            class="tab"
            :class="{ active: statusFilter === 'active' }"
            @click="statusFilter = 'active'"
          >
            活跃
          </button>
          <button
            class="tab"
            :class="{ active: statusFilter === 'archived' }"
            @click="statusFilter = 'archived'"
          >
            已归档
          </button>
          <button
            class="tab"
            :class="{ active: statusFilter === 'error' }"
            @click="statusFilter = 'error'"
          >
            错误
          </button>
        </div>
        <WsInput
          v-model="searchQuery"
          placeholder="搜索名称或路径..."
          class="search-input-wrapper"
        />
      </div>
      <div class="filter-right">
        <WsSelect
          v-model="sortBy"
          :options="sortOptions"
          class="sort-select"
        />
        <WsButton variant="icon" @click="toggleSortOrder" :title="sortOrder === 'desc' ? '降序' : '升序'">
          <Sort style="width: 16px; height: 16px;" />
          {{ sortOrder === 'desc' ? '↓' : '↑' }}
        </WsButton>
      </div>
    </div>

    <!-- 工作区列表 -->
    <div class="workspace-list" v-loading="workspaceStore.loading">
      <WsEmpty
        v-if="filteredWorkspaces.length === 0"
        :title="searchQuery ? '没有匹配的工作区' : '暂无工作区'"
      />
      <div v-else class="workspace-grid">
        <div
          v-for="ws in filteredWorkspaces"
          :key="ws.id"
          class="card"
          :class="{ 'error-card': ws.status === 'error' }"
        >
          <div class="card-header">
            <span class="name">{{ ws.name }}</span>
            <WsBadge
              :variant="ws.status === 'active' ? 'active' : ws.status === 'error' ? 'error' : 'archived'"
            >
              {{ ws.status === 'active' ? '活跃' : ws.status === 'error' ? '错误' : '已归档' }}
            </WsBadge>
          </div>
          <div class="card-body">
            <div class="project-path" :title="ws.projectRoot">
              {{ getShortPath(ws.projectRoot) }}
            </div>
            <div class="meta">
              <span>创建于 {{ formatTime(ws.createdAt) }}</span>
              <span>更新于 {{ formatTime(ws.updatedAt) }}</span>
            </div>
          </div>
          <div class="card-footer">
            <!-- 错误状态的工作区 -->
            <template v-if="ws.status === 'error'">
              <WsButton variant="accent" size="sm" @click="showErrorInfo(ws)">
                <WarningFilled style="width: 14px; height: 14px;" />
                查看错误
              </WsButton>
              <WsButton variant="danger" size="sm" @click="handleDelete(ws.id, ws.name)">
                <Delete style="width: 14px; height: 14px;" />
                删除
              </WsButton>
            </template>
            <!-- 正常状态的工作区 -->
            <template v-else>
              <WsButton variant="ghost" size="sm" @click="handleEnter(ws)">
                <ArrowRight style="width: 14px; height: 14px;" />
                进入
              </WsButton>
              <WsButton
                v-if="ws.status === 'active'"
                variant="ghost"
                size="sm"
                @click="handleArchive(ws.id, ws.name)"
              >
                <Box style="width: 14px; height: 14px;" />
                归档
              </WsButton>
              <WsButton
                v-else
                variant="accent"
                size="sm"
                @click="handleRestore(ws.id, ws.name)"
              >
                <RefreshRight style="width: 14px; height: 14px;" />
                恢复
              </WsButton>
              <WsButton variant="danger" size="sm" @click="handleDelete(ws.id, ws.name)">
                <Delete style="width: 14px; height: 14px;" />
                删除
              </WsButton>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建对话框 -->
    <WsModal v-model="showCreateDialog" title="新建工作区">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" placeholder="输入工作区名称" />
        </el-form-item>
        <el-form-item label="目标" required>
          <el-input
            v-model="createForm.goal"
            type="textarea"
            :rows="3"
            placeholder="描述工作区的目标"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <WsButton variant="secondary" @click="showCreateDialog = false">取消</WsButton>
        <WsButton variant="primary" @click="handleCreate" :disabled="workspaceStore.loading">
          创建
        </WsButton>
      </template>
    </WsModal>

    <!-- 设置弹窗 -->
    <SettingsModal v-model:visible="showSettingsModal" />

    <!-- 开发模式标识 -->
    <div v-if="devInfo?.available" class="dev-badge" title="开发模式 - 点击设置查看详细版本信息">
      DEV
    </div>
  </div>
</template>

<style scoped>
.home-view {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--bg-color);
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 16px 0;
  position: sticky;
  top: 0;
  background: var(--bg-color);
  z-index: 10;
}

.logo {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: -0.5px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Filter Bar */
.filter-bar {
  margin-bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.filter-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  flex: 1;
}

.filter-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 4px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px;
}

.tab {
  padding: 6px 16px;
  background: transparent;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab:hover {
  background: var(--bg-color);
  color: var(--text-main);
}

.tab.active {
  background: var(--border-heavy);
  color: var(--card-bg);
}

/* Search Input */
.search-input-wrapper {
  width: 240px;
}

/* Sort Select */
.sort-select {
  width: 130px;
}

/* Workspace Grid */
.workspace-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

/* Card */
.card {
  background: var(--card-bg);
  border: 2px solid var(--border-heavy);
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
}

.card:hover {
  transform: translate(-4px, -4px);
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.15);
}

[data-theme="dark"] .card:hover {
  box-shadow: 8px 8px 0 rgba(255, 255, 255, 0.1);
}

.card.error-card {
  border-color: var(--accent-red);
  background: var(--card-bg);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-header .name {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-main);
}

.card-body .project-path {
  color: var(--text-secondary);
  font-size: 12px;
  font-family: var(--mono-font);
  background: var(--bg-color);
  padding: 6px 10px;
  border-radius: 4px;
  margin-bottom: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid var(--border-color);
}

.card-body .meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-muted);
  font-size: 12px;
}

.card-footer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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
</style>
