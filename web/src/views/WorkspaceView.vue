<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Plus, List, Share, Refresh, InfoFilled, Aim, ArrowDown, Document } from '@element-plus/icons-vue'
import { useWorkspaceStore, useNodeStore } from '@/stores'
import NodeTree from '@/components/node/NodeTree.vue'
import NodeTreeGraph from '@/components/node/NodeTreeGraph.vue'
import NodeDetail from '@/components/node/NodeDetail.vue'
import EnableDispatchDialog from '@/components/dispatch/EnableDispatchDialog.vue'
import DisableDispatchDialog from '@/components/dispatch/DisableDispatchDialog.vue'

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

// 聚焦当前任务
const isFocusing = ref(false)
async function handleFocusCurrent() {
  isFocusing.value = true
  try {
    // 先刷新工作区数据，获取最新的 currentFocus
    await workspaceStore.fetchWorkspace(workspaceId.value)
    await nodeStore.fetchNodeTree()

    const focusId = workspaceStore.currentFocus
    if (focusId) {
      // 选中聚焦的节点
      await nodeStore.selectNode(focusId)
      ElMessage.success('已定位到当前任务')
    } else {
      ElMessage.info('当前没有聚焦的任务')
    }
  } catch {
    ElMessage.error('定位失败')
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
    ElMessage.warning('请输入节点标题')
    return
  }
  try {
    await nodeStore.createNode({
      parentId,
      type: createForm.value.type,
      title: createForm.value.title,
      requirement: createForm.value.requirement,
    })
    ElMessage.success('创建成功')
    showCreateDialog.value = false
  } catch {
    ElMessage.error('创建失败')
  }
}

// 派发模式控制
const showEnableDispatchDialog = ref(false)
const showDisableDispatchDialog = ref(false)

function handleEnableDispatch() {
  showEnableDispatchDialog.value = true
}

function handleDisableDispatch() {
  showDisableDispatchDialog.value = true
}

async function handleDispatchSuccess() {
  await loadWorkspace()
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
        <el-tooltip content="聚焦当前任务" placement="bottom">
          <el-button
            :icon="Aim"
            circle
            :loading="isFocusing"
            @click="handleFocusCurrent"
          />
        </el-tooltip>
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
        <div class="info-bar-main">
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
          <div class="info-item dispatch">
            <span class="label">派发</span>
            <div class="dispatch-content">
              <span v-if="workspaceStore.dispatchStatus === 'disabled'" class="dispatch-status disabled">
                未启用
              </span>
              <span v-else-if="workspaceStore.dispatchStatus === 'enabled'" class="dispatch-status enabled">
                已启用
              </span>
              <span v-else class="dispatch-status enabled-git">
                已启用(Git)
              </span>
              <el-button
                v-if="workspaceStore.dispatchStatus === 'disabled'"
                size="small"
                type="primary"
                @click="handleEnableDispatch"
              >
                启用
              </el-button>
              <el-button
                v-else
                size="small"
                type="danger"
                @click="handleDisableDispatch"
              >
                关闭
              </el-button>
            </div>
          </div>
          <div class="info-item rules-docs" v-if="hasRulesOrDocs">
            <el-tag
              v-if="workspaceStore.currentRules.length"
              type="warning"
              size="small"
              class="count-tag"
              @click="showWorkspaceDetail = true"
            >
              {{ workspaceStore.currentRules.length }} 条规则
            </el-tag>
            <el-tag
              v-if="workspaceStore.currentDocs.length"
              type="info"
              size="small"
              class="count-tag"
              @click="showWorkspaceDetail = true"
            >
              {{ workspaceStore.currentDocs.length }} 个文档
            </el-tag>
          </div>
          <el-button
            v-if="hasRulesOrDocs"
            :icon="ArrowDown"
            type="primary"
            size="small"
            @click="showWorkspaceDetail = true"
          >
            查看详情
          </el-button>
        </div>
      </div>
    </transition>

    <!-- 工作区详情抽屉 -->
    <el-drawer
      v-model="showWorkspaceDetail"
      title="工作区详情"
      direction="rtl"
      size="450px"
      :with-header="true"
    >
      <div class="workspace-detail-content">
        <!-- 基本信息 -->
        <div class="detail-section">
          <div class="section-header">
            <span class="section-label">目标</span>
          </div>
          <div class="goal-content">
            {{ workspaceStore.currentStatus?.goal || '暂无目标' }}
          </div>
        </div>

        <!-- 规则 -->
        <div v-if="workspaceStore.currentRules.length > 0" class="detail-section">
          <div class="section-header">
            <span class="section-label">规则</span>
            <el-tag type="warning" size="small">{{ workspaceStore.currentRules.length }}</el-tag>
          </div>
          <ul class="info-list rules-list">
            <li v-for="(rule, idx) in workspaceStore.currentRules" :key="idx">{{ rule }}</li>
          </ul>
        </div>

        <!-- 文档 -->
        <div v-if="workspaceStore.currentDocs.length > 0" class="detail-section">
          <div class="section-header">
            <span class="section-label">文档</span>
            <el-tag type="info" size="small">{{ workspaceStore.currentDocs.length }}</el-tag>
          </div>
          <ul class="info-list docs-list">
            <li v-for="(doc, idx) in workspaceStore.currentDocs" :key="idx">
              <span class="doc-path">{{ doc.path }}</span>
              <span class="doc-desc">{{ doc.description }}</span>
            </li>
          </ul>
        </div>

        <!-- 日志 -->
        <div class="detail-section logs-section">
          <div class="section-header">
            <span class="section-label">工作区日志</span>
            <el-tag type="success" size="small">{{ workspaceStore.currentLogs.length }}</el-tag>
          </div>
          <div v-if="workspaceStore.currentLogs.length > 0" class="log-list">
            <div
              v-for="(log, idx) in workspaceStore.currentLogs"
              :key="idx"
              class="log-item"
              :class="{
                'log-ai': log.operator === 'AI',
                'log-human': log.operator === 'Human',
                'log-system': log.operator === 'system'
              }"
            >
              <div class="log-meta">
                <span class="log-time">{{ log.timestamp }}</span>
                <el-tag
                  :type="log.operator === 'AI' ? 'primary' : log.operator === 'Human' ? 'success' : 'info'"
                  size="small"
                >
                  {{ log.operator }}
                </el-tag>
              </div>
              <div class="log-event">{{ log.event }}</div>
            </div>
          </div>
          <div v-else class="empty-tip">
            暂无日志记录
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 主内容区 -->
    <div class="main-content">

      <!-- 左侧：节点树 -->
      <aside class="sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="sidebar-header">
          <div class="sidebar-header-left">
            <h3>任务树</h3>
            <el-tooltip content="查看工作区详情（目标、规则、文档、日志）" placement="top">
              <el-button
                :icon="Document"
                type="warning"
                size="small"
                circle
                class="workspace-detail-btn"
                @click="showWorkspaceDetail = true"
              />
            </el-tooltip>
          </div>
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
        <el-form-item label="类型" required>
          <el-radio-group v-model="createForm.type">
            <el-radio-button value="execution">
              <span style="color: #3498DB">执行节点</span>
            </el-radio-button>
            <el-radio-button value="planning">
              <span style="color: #9B59B6">规划节点</span>
            </el-radio-button>
          </el-radio-group>
          <div class="type-hint">
            {{ createForm.type === 'execution' ? '具体执行任务，不能有子节点' : '分析分解任务，可创建子节点' }}
          </div>
        </el-form-item>
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
  flex-direction: column;
  padding: 12px 24px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%);
  border-bottom: 1px solid #e4e7ed;
}

.info-bar-main {
  display: flex;
  align-items: center;
  gap: 32px;
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

.info-item.dispatch .dispatch-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-item.dispatch .dispatch-status {
  font-size: 13px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
}

.info-item.dispatch .dispatch-status.disabled {
  color: #909399;
  background: #f4f4f5;
}

.info-item.dispatch .dispatch-status.enabled {
  color: #67c23a;
  background: #f0f9ff;
}

.info-item.dispatch .dispatch-status.enabled-git {
  color: #e6a23c;
  background: #fdf6ec;
}

/* 规则文档标签 */
.info-item.rules-docs {
  display: flex;
  gap: 8px;
}

.count-tag {
  cursor: pointer;
}

.count-tag:hover {
  opacity: 0.8;
}

/* 抽屉内容样式 */
.drawer-content {
  padding: 0 8px;
}

.info-section {
  margin-bottom: 20px;
}

.info-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.section-label {
  font-size: 15px;
  color: #303133;
  font-weight: 600;
}

.info-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rules-list li {
  padding: 10px 12px;
  background: #fdf6ec;
  border-left: 3px solid #e6a23c;
  border-radius: 4px;
  margin-bottom: 8px;
  font-size: 14px;
  color: #303133;
  line-height: 1.6;
}

.docs-list li {
  padding: 10px 12px;
  background: #f0f9ff;
  border-left: 3px solid #409eff;
  border-radius: 4px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc-path {
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 13px;
  color: #409eff;
}

.doc-desc {
  font-size: 13px;
  color: #606266;
}

.empty-tip {
  color: #909399;
  text-align: center;
  padding: 40px 20px;
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
  position: relative;
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

.type-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

/* 侧边栏头部左侧 */
.sidebar-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 工作区详情按钮高亮动画 */
.workspace-detail-btn {
  animation: pulse-highlight 2s ease-in-out infinite;
}

@keyframes pulse-highlight {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.4);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(230, 162, 60, 0.2);
  }
}

/* 工作区详情抽屉内容 */
.workspace-detail-content {
  padding: 0 8px;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.goal-content {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 14px;
  color: #303133;
  line-height: 1.6;
}

/* 日志区域 */
.logs-section {
  flex: 1;
}

.log-list {
  max-height: 400px;
  overflow-y: auto;
}

.log-item {
  padding: 10px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  background: #f5f7fa;
}

.log-item.log-ai {
  border-left: 3px solid #409eff;
}

.log-item.log-human {
  border-left: 3px solid #67c23a;
}

.log-item.log-system {
  border-left: 3px solid #909399;
}

.log-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.log-time {
  font-size: 12px;
  color: #909399;
  font-family: 'Monaco', 'Menlo', monospace;
}

.log-event {
  font-size: 13px;
  color: #303133;
  line-height: 1.5;
}
</style>
