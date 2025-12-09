<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useNodeStore, useWorkspaceStore } from '@/stores'
import { STATUS_CONFIG, type TransitionAction } from '@/types'
import StatusIcon from '@/components/common/StatusIcon.vue'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import LogTimeline from '@/components/log/LogTimeline.vue'

const nodeStore = useNodeStore()
const workspaceStore = useWorkspaceStore()

// 当前节点信息
const nodeMeta = computed(() => nodeStore.selectedNodeMeta)
const context = computed(() => nodeStore.nodeContext)
const currentNode = computed(() => {
  if (!context.value?.chain.length) return null
  return context.value.chain[context.value.chain.length - 1]
})

// 可用的状态转换
const availableActions = computed(() => {
  const status = nodeMeta.value?.status
  if (!status) return []

  const actions: { action: TransitionAction; label: string; type: 'primary' | 'success' | 'danger' | 'warning' | 'default' }[] = []

  switch (status) {
    case 'pending':
      actions.push({ action: 'start', label: '开始执行', type: 'primary' })
      break
    case 'implementing':
      actions.push({ action: 'submit', label: '提交验证', type: 'warning' })
      actions.push({ action: 'complete', label: '直接完成', type: 'success' })
      break
    case 'validating':
      actions.push({ action: 'complete', label: '验证通过', type: 'success' })
      actions.push({ action: 'fail', label: '验证失败', type: 'danger' })
      break
    case 'failed':
      actions.push({ action: 'retry', label: '重试', type: 'primary' })
      break
  }

  return actions
})

// 状态转换
async function handleTransition(action: TransitionAction) {
  try {
    let conclusion: string | undefined

    if (action === 'complete' || action === 'fail') {
      const result = await ElMessageBox.prompt(
        action === 'complete' ? '请输入完成结论' : '请输入失败原因',
        '填写结论',
        { inputType: 'textarea' }
      )
      conclusion = result.value
    }

    await nodeStore.transition(action, undefined, conclusion)
    ElMessage.success('状态更新成功')
  } catch {
    // 用户取消或操作失败
  }
}

// 设为焦点
async function handleSetFocus() {
  if (!nodeStore.selectedNodeId) return
  try {
    await nodeStore.setFocus(nodeStore.selectedNodeId)
    ElMessage.success('已设为当前焦点')
  } catch {
    ElMessage.error('设置焦点失败')
  }
}

// 删除节点
async function handleDelete() {
  if (!nodeStore.selectedNodeId) return
  try {
    await ElMessageBox.confirm('确定要删除此节点吗？', '删除确认', { type: 'warning' })
    await nodeStore.deleteNode(nodeStore.selectedNodeId)
    ElMessage.success('删除成功')
  } catch {
    // 用户取消
  }
}

// 分裂节点
const showSplitDialog = ref(false)
const splitForm = ref({ title: '', requirement: '' })

function openSplitDialog() {
  splitForm.value = { title: '', requirement: '' }
  showSplitDialog.value = true
}

async function handleSplit() {
  if (!splitForm.value.title || !splitForm.value.requirement) {
    ElMessage.warning('请填写完整信息')
    return
  }
  try {
    await nodeStore.splitNode(splitForm.value)
    ElMessage.success('分裂成功')
    showSplitDialog.value = false
  } catch {
    ElMessage.error('分裂失败')
  }
}
</script>

<template>
  <div class="node-detail" v-if="nodeMeta && currentNode">
    <!-- 节点标题和状态 -->
    <div class="detail-header">
      <div class="title-row">
        <StatusIcon :status="nodeMeta.status" :size="20" />
        <h3>{{ currentNode.title }}</h3>
      </div>
      <div class="status-badge">
        <el-tag :color="STATUS_CONFIG[nodeMeta.status].color" effect="dark">
          {{ STATUS_CONFIG[nodeMeta.status].label }}
        </el-tag>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-bar">
      <el-button-group>
        <el-button
          v-for="action in availableActions"
          :key="action.action"
          :type="action.type"
          size="small"
          @click="handleTransition(action.action)"
        >
          {{ action.label }}
        </el-button>
      </el-button-group>
      <div class="extra-actions">
        <el-button size="small" @click="handleSetFocus" :disabled="workspaceStore.currentFocus === nodeMeta.id">
          设为焦点
        </el-button>
        <el-button
          v-if="nodeMeta.status === 'implementing'"
          size="small"
          @click="openSplitDialog"
        >
          分裂子任务
        </el-button>
        <el-button size="small" type="danger" @click="handleDelete" :disabled="nodeMeta.id === 'root'">
          删除
        </el-button>
      </div>
    </div>

    <!-- 需求描述 -->
    <el-card class="section-card">
      <template #header>
        <span>需求描述</span>
      </template>
      <MarkdownContent :content="currentNode.requirement || '暂无描述'" />
    </el-card>

    <!-- 结论（已完成节点） -->
    <el-card v-if="nodeMeta.conclusion" class="section-card">
      <template #header>
        <span>结论</span>
      </template>
      <MarkdownContent :content="nodeMeta.conclusion" />
    </el-card>

    <!-- 当前问题 -->
    <el-card v-if="currentNode.problem" class="section-card problem-card">
      <template #header>
        <span>当前问题</span>
      </template>
      <MarkdownContent :content="currentNode.problem" />
    </el-card>

    <!-- 日志时间线 -->
    <el-card class="section-card">
      <template #header>
        <span>执行日志</span>
      </template>
      <LogTimeline :entries="currentNode.logEntries || []" />
    </el-card>

    <!-- 子节点结论 -->
    <el-card v-if="context?.childConclusions?.length" class="section-card">
      <template #header>
        <span>子节点结论</span>
      </template>
      <div class="child-conclusions">
        <div
          v-for="child in context.childConclusions"
          :key="child.nodeId"
          class="child-item"
        >
          <StatusIcon :status="child.status" :size="14" />
          <span class="child-title">{{ child.title }}</span>
          <span class="child-conclusion">{{ child.conclusion }}</span>
        </div>
      </div>
    </el-card>

    <!-- 分裂对话框 -->
    <el-dialog v-model="showSplitDialog" title="分裂子任务" width="500px">
      <el-form :model="splitForm" label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="splitForm.title" placeholder="输入子任务标题" />
        </el-form-item>
        <el-form-item label="需求" required>
          <el-input
            v-model="splitForm.requirement"
            type="textarea"
            :rows="3"
            placeholder="描述子任务需求"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSplitDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSplit" :loading="nodeStore.loading">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.node-detail {
  width: 100%;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-row h3 {
  margin: 0;
  font-size: 20px;
}

.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}

.extra-actions {
  display: flex;
  gap: 8px;
}

.section-card {
  margin-bottom: 16px;
}

.section-card :deep(.el-card__header) {
  padding: 12px 16px;
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}


.problem-card {
  border-color: #e6a23c;
}

.problem-card :deep(.el-card__header) {
  background: #fdf6ec;
  color: #e6a23c;
}

.child-conclusions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.child-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
}

.child-title {
  font-weight: 600;
  min-width: 100px;
}

.child-conclusion {
  flex: 1;
  color: #606266;
}
</style>
