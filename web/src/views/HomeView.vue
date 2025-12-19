<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, ArrowRight, Box, RefreshRight, Search, Sort, Setting, WarningFilled } from '@element-plus/icons-vue'
import { useWorkspaceStore } from '@/stores'
import { workspaceApi, type DevInfoResult } from '@/api/workspace'
import type { WorkspaceInitParams, WorkspaceEntry } from '@/types'
import SettingsModal from '@/components/SettingsModal.vue'

const router = useRouter()
const workspaceStore = useWorkspaceStore()

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
  return { statusFilter: 'all', sortBy: 'updatedAt', sortOrder: 'desc' }
}

// 保存本地偏好
function savePreferences() {
  const prefs: HomePreferences = {
    statusFilter: statusFilter.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
  }
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs))
}

// 初始化偏好设置
const savedPrefs = loadPreferences()
const statusFilter = ref<'all' | 'active' | 'archived' | 'error'>(savedPrefs.statusFilter)
const searchQuery = ref('')
const sortBy = ref<'updatedAt' | 'createdAt'>(savedPrefs.sortBy)
const sortOrder = ref<'desc' | 'asc'>(savedPrefs.sortOrder)

// 开发信息
const devInfo = ref<DevInfoResult | null>(null)

// 加载工作区列表和开发信息
onMounted(async () => {
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
watch([statusFilter, sortBy, sortOrder], () => {
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
</script>

<template>
  <div class="home-view">
    <!-- 头部 -->
    <header class="header">
      <h1>TanmiWorkspace</h1>
      <div class="header-actions">
        <el-button :icon="Setting" @click="showSettingsModal = true" title="设置">
          设置
        </el-button>
        <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">
          新建工作区
        </el-button>
      </div>
    </header>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div class="filter-left">
        <el-radio-group v-model="statusFilter" size="small">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="active">活跃</el-radio-button>
          <el-radio-button value="archived">已归档</el-radio-button>
          <el-radio-button value="error">错误</el-radio-button>
        </el-radio-group>
        <el-input
          v-model="searchQuery"
          placeholder="搜索名称或路径..."
          :prefix-icon="Search"
          clearable
          size="small"
          class="search-input"
        />
      </div>
      <div class="filter-right">
        <el-select v-model="sortBy" size="small" class="sort-select">
          <el-option value="updatedAt" label="更新时间" />
          <el-option value="createdAt" label="创建时间" />
        </el-select>
        <el-button size="small" :icon="Sort" @click="toggleSortOrder" :title="sortOrder === 'desc' ? '降序' : '升序'">
          {{ sortOrder === 'desc' ? '↓' : '↑' }}
        </el-button>
      </div>
    </div>

    <!-- 工作区列表 -->
    <div class="workspace-list" v-loading="workspaceStore.loading">
      <el-empty v-if="filteredWorkspaces.length === 0" :description="searchQuery ? '没有匹配的工作区' : '暂无工作区'" />
      <div v-else class="workspace-grid">
        <el-card
          v-for="ws in filteredWorkspaces"
          :key="ws.id"
          class="workspace-card"
          :class="{ 'error-card': ws.status === 'error' }"
          shadow="hover"
        >
          <template #header>
            <div class="card-header">
              <span class="name">{{ ws.name }}</span>
              <el-tag
                :type="ws.status === 'active' ? 'success' : ws.status === 'error' ? 'danger' : 'info'"
                size="small"
              >
                {{ ws.status === 'active' ? '活跃' : ws.status === 'error' ? '错误' : '已归档' }}
              </el-tag>
            </div>
          </template>
          <div class="card-body">
            <div class="project-path" :title="ws.projectRoot">
              {{ getShortPath(ws.projectRoot) }}
            </div>
            <div class="meta">
              <span>创建于 {{ formatTime(ws.createdAt) }}</span>
              <span>更新于 {{ formatTime(ws.updatedAt) }}</span>
            </div>
          </div>
          <div class="card-actions">
            <!-- 错误状态的工作区 -->
            <template v-if="ws.status === 'error'">
              <el-button type="warning" text :icon="WarningFilled" @click="showErrorInfo(ws)">
                查看错误
              </el-button>
              <el-button type="danger" text :icon="Delete" @click="handleDelete(ws.id, ws.name)">
                删除
              </el-button>
            </template>
            <!-- 正常状态的工作区 -->
            <template v-else>
              <el-button type="primary" text :icon="ArrowRight" @click="handleEnter(ws)">
                进入
              </el-button>
              <el-button
                v-if="ws.status === 'active'"
                type="info"
                text
                :icon="Box"
                @click="handleArchive(ws.id, ws.name)"
              >
                归档
              </el-button>
              <el-button
                v-else
                type="success"
                text
                :icon="RefreshRight"
                @click="handleRestore(ws.id, ws.name)"
              >
                恢复
              </el-button>
              <el-button type="danger" text :icon="Delete" @click="handleDelete(ws.id, ws.name)">
                删除
              </el-button>
            </template>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 创建对话框 -->
    <el-dialog v-model="showCreateDialog" title="新建工作区" width="500px">
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
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="workspaceStore.loading">
          创建
        </el-button>
      </template>
    </el-dialog>

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
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h1 {
  margin: 0;
  font-size: 24px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filter-bar {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.filter-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  width: 220px;
}

.sort-select {
  width: 110px;
}

.workspace-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.workspace-card {
  cursor: pointer;
}

.workspace-card.error-card {
  border-color: #F56C6C;
  background: linear-gradient(135deg, #fff 0%, #fef0f0 100%);
}

.workspace-card.error-card:hover {
  border-color: #f56c6c;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header .name {
  font-weight: 600;
  font-size: 16px;
}

.card-body .project-path {
  color: #606266;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', monospace;
  background: #f5f7fa;
  padding: 4px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-body .meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #909399;
  font-size: 12px;
}

.card-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
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
  font-family: 'Monaco', 'Menlo', monospace;
  letter-spacing: 1px;
  z-index: 9999;
  cursor: default;
}
</style>
