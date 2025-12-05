<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Plus } from '@element-plus/icons-vue'
import { useWorkspaceStore, useNodeStore } from '@/stores'
import NodeTree from '@/components/node/NodeTree.vue'
import NodeDetail from '@/components/node/NodeDetail.vue'

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
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建节点</el-button>
    </header>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 左侧：节点树 -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3>任务树</h3>
        </div>
        <div class="sidebar-content">
          <NodeTree
            :tree="nodeStore.nodeTree"
            :selected-id="nodeStore.selectedNodeId"
            :focus-id="workspaceStore.currentFocus"
            @select="handleNodeSelect"
          />
        </div>
      </aside>

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

.header h2 {
  margin: 0;
  font-size: 18px;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 300px;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  background: #fafafa;
}

.sidebar-header {
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ed;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 14px;
  color: #606266;
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
