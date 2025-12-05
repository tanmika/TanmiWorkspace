<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, ArrowRight } from '@element-plus/icons-vue'
import { useWorkspaceStore } from '@/stores'
import type { WorkspaceInitParams } from '@/types'

const router = useRouter()
const workspaceStore = useWorkspaceStore()

// 状态
const showCreateDialog = ref(false)
const createForm = ref<WorkspaceInitParams>({
  name: '',
  goal: '',
  rules: [],
  docs: [],
})
const statusFilter = ref<'all' | 'active' | 'archived'>('all')

// 加载工作区列表
onMounted(async () => {
  try {
    await workspaceStore.fetchWorkspaces()
  } catch {
    ElMessage.error('加载工作区列表失败')
  }
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

// 进入工作区
function handleEnter(id: string) {
  router.push(`/workspace/${id}`)
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

// 过滤后的工作区列表
function getFilteredWorkspaces() {
  if (statusFilter.value === 'active') {
    return workspaceStore.activeWorkspaces
  }
  if (statusFilter.value === 'archived') {
    return workspaceStore.archivedWorkspaces
  }
  return workspaceStore.workspaces
}
</script>

<template>
  <div class="home-view">
    <!-- 头部 -->
    <header class="header">
      <h1>TanmiWorkspace</h1>
      <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">
        新建工作区
      </el-button>
    </header>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-radio-group v-model="statusFilter" size="small">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="active">活跃</el-radio-button>
        <el-radio-button value="archived">已归档</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 工作区列表 -->
    <div class="workspace-list" v-loading="workspaceStore.loading">
      <el-empty v-if="getFilteredWorkspaces().length === 0" description="暂无工作区" />
      <div v-else class="workspace-grid">
        <el-card
          v-for="ws in getFilteredWorkspaces()"
          :key="ws.id"
          class="workspace-card"
          shadow="hover"
        >
          <template #header>
            <div class="card-header">
              <span class="name">{{ ws.name }}</span>
              <el-tag :type="ws.status === 'active' ? 'success' : 'info'" size="small">
                {{ ws.status === 'active' ? '活跃' : '已归档' }}
              </el-tag>
            </div>
          </template>
          <div class="card-body">
            <div class="meta">
              <span>创建于 {{ formatTime(ws.createdAt) }}</span>
              <span>更新于 {{ formatTime(ws.updatedAt) }}</span>
            </div>
          </div>
          <div class="card-actions">
            <el-button type="primary" text :icon="ArrowRight" @click="handleEnter(ws.id)">
              进入
            </el-button>
            <el-button type="danger" text :icon="Delete" @click="handleDelete(ws.id, ws.name)">
              删除
            </el-button>
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

.filter-bar {
  margin-bottom: 16px;
}

.workspace-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.workspace-card {
  cursor: pointer;
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
</style>
