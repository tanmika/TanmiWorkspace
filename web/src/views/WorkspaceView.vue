<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Plus, List, Share, Refresh, InfoFilled } from '@element-plus/icons-vue'
import { useWorkspaceStore, useNodeStore } from '@/stores'
import NodeTree from '@/components/node/NodeTree.vue'
import NodeTreeGraph from '@/components/node/NodeTreeGraph.vue'
import NodeDetail from '@/components/node/NodeDetail.vue'

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
  // 禁止选择文本
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
  // 保存宽度
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

// 获取工作区 ID
const workspaceId = computed(() => route.params.id as string)

// 加载工作区数据
async function loadWorkspace() {
  try {
    await workspaceStore.fetchWorkspace(workspaceId.value)
    await nodeStore.fetchNodeTree()
  } catch {
    ElMessage.error('加载工作区失败')
    router.push('/')
  }
}

// 工作区信息栏展开状态
const showInfoBar = ref(true)

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
    // 如果有选中的节点，刷新其详情
    if (nodeStore.selectedNodeId) {
      await nodeStore.selectNode(nodeStore.selectedNodeId)
    }
    ElMessage.success('刷新成功')
  } catch {
    ElMessage.error('刷新失败')
  } finally {
    isRefreshing.value = false
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
const createForm = ref({ title: '', requirement: '' })

function openCreateDialog() {
  createForm.value = { title: '', requirement: '' }
  showCreateDialog.value = true
}

async function handleCreateNode() {
  const parentId = nodeStore.selectedNodeId || 'root'
  if (!createForm.value.title) {
    ElMessage.warning('请输入节点标题')
    return
  }
  try {
    await nodeStore.createNode({
      parentId,
      title: createForm.value.title,
      requirement: createForm.value.requirement,
    })
    ElMessage.success('创建成功')
    showCreateDialog.value = false
  } catch {
    ElMessage.error('创建失败')
  }
}
</script>

<template>
  <div class="workspace-view" v-loading="workspaceStore.loading">
    <!-- 头部 -->
    <header class="header">
      <div class="left">
        <el-button :icon="ArrowLeft" text @click="goBack">返回</el-button>
        <h2>{{ workspaceStore.currentWorkspace?.name }}</h2>
        <el-tooltip :content="showInfoBar ? '隐藏工作区信息' : '显示工作区信息'" placement="bottom">
          <el-button
            :icon="InfoFilled"
            circle
            size="small"
            :type="showInfoBar ? 'primary' : 'default'"
            @click="showInfoBar = !showInfoBar"
          />
        </el-tooltip>
      </div>
      <div class="right">
        <el-tooltip content="刷新数据" placement="bottom">
          <el-button
            :icon="Refresh"
            circle
            :loading="isRefreshing"
            @click="handleRefresh"
          />
        </el-tooltip>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建节点</el-button>
      </div>
    </header>

    <!-- 工作区信息栏 -->
    <transition name="slide">
      <div v-if="showInfoBar && workspaceStore.currentStatus" class="info-bar">
        <div class="info-item goal">
          <span class="label">目标</span>
          <span class="value">{{ workspaceStore.currentStatus.goal }}</span>
        </div>
        <div class="info-item progress">
          <span class="label">进度</span>
          <div class="progress-content">
            <el-progress
              :percentage="progressPercent"
              :stroke-width="8"
              :show-text="false"
              style="width: 120px"
            />
            <span class="progress-text">
              {{ workspaceStore.currentStatus.completedNodes }}/{{ workspaceStore.currentStatus.totalNodes }}
            </span>
          </div>
        </div>
      </div>
    </transition>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 左侧：节点树 -->
      <aside class="sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="sidebar-header">
          <h3>任务树</h3>
          <div class="view-toggle">
            <el-tooltip content="列表视图" placement="top">
              <el-button
                :type="viewMode === 'list' ? 'primary' : 'default'"
                :icon="List"
                size="small"
                circle
                @click="setViewMode('list')"
              />
            </el-tooltip>
            <el-tooltip content="图形视图" placement="top">
              <el-button
                :type="viewMode === 'graph' ? 'primary' : 'default'"
                :icon="Share"
                size="small"
                circle
                @click="setViewMode('graph')"
              />
            </el-tooltip>
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

      <!-- 右侧：节点详情 -->
      <main class="content">
        <NodeDetail v-if="nodeStore.selectedNodeId" />
        <el-empty v-else description="选择一个节点查看详情" />
      </main>
    </div>

    <!-- 创建节点对话框 -->
    <el-dialog v-model="showCreateDialog" title="新建节点" width="500px">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="createForm.title" placeholder="输入节点标题" />
        </el-form-item>
        <el-form-item label="需求">
          <el-input
            v-model="createForm.requirement"
            type="textarea"
            :rows="3"
            placeholder="描述节点需求"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateNode" :loading="nodeStore.loading">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.workspace-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-bottom: 1px solid #e4e7ed;
  background: #fff;
}

.header .left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header .right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header h2 {
  margin: 0;
  font-size: 18px;
}

/* 信息栏样式 */
.info-bar {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 12px 24px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%);
  border-bottom: 1px solid #e4e7ed;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-item .label {
  font-size: 12px;
  color: #909399;
  font-weight: 500;
}

.info-item.goal {
  flex: 1;
}

.info-item.goal .value {
  font-size: 14px;
  color: #303133;
}

.info-item.progress .progress-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-item.progress .progress-text {
  font-size: 13px;
  color: #606266;
  font-weight: 500;
}

/* 信息栏展开/收起动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
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
  max-height: 60px;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  flex-shrink: 0;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}

.resizer {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
}

.resizer:hover,
.resizer.is-resizing {
  background: #409eff;
}

.sidebar-header {
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 14px;
  color: #606266;
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

.content {
  flex: 1;
  overflow: auto;
  padding: 24px;
  background: #fff;
}
</style>
