<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useNodeStore, useWorkspaceStore } from '@/stores'
import { STATUS_CONFIG, NODE_TYPE_CONFIG, type TransitionAction } from '@/types'
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

// 节点类型
const nodeType = computed(() => nodeMeta.value?.type || 'execution')
const isPlanning = computed(() => nodeType.value === 'planning')

// 可用的状态转换（根据节点类型）
const availableActions = computed(() => {
  const status = nodeMeta.value?.status
  const type = nodeMeta.value?.type
  if (!status || !type) return []

  const actions: { action: TransitionAction; label: string; type: 'primary' | 'success' | 'danger' | 'warning' | 'default' }[] = []

  if (type === 'execution') {
    // 执行节点状态转换
    switch (status) {
      case 'pending':
        actions.push({ action: 'start', label: '开始执行', type: 'primary' })
        break
      case 'implementing':
        actions.push({ action: 'submit', label: '提交验证', type: 'warning' })
        actions.push({ action: 'complete', label: '直接完成', type: 'success' })
        actions.push({ action: 'fail', label: '标记失败', type: 'danger' })
        break
      case 'validating':
        actions.push({ action: 'complete', label: '验证通过', type: 'success' })
        actions.push({ action: 'fail', label: '验证失败', type: 'danger' })
        break
      case 'failed':
        actions.push({ action: 'retry', label: '重试', type: 'primary' })
        break
      case 'completed':
        actions.push({ action: 'reopen', label: '重新激活', type: 'warning' })
        break
    }
  } else {
    // 规划节点状态转换
    switch (status) {
      case 'pending':
        actions.push({ action: 'start', label: '开始规划', type: 'primary' })
        break
      case 'planning':
        actions.push({ action: 'complete', label: '完成规划', type: 'success' })
        actions.push({ action: 'cancel', label: '取消', type: 'danger' })
        break
      case 'monitoring':
        actions.push({ action: 'complete', label: '汇总完成', type: 'success' })
        actions.push({ action: 'cancel', label: '取消', type: 'danger' })
        break
      case 'completed':
        actions.push({ action: 'reopen', label: '重新激活', type: 'warning' })
        break
      case 'cancelled':
        actions.push({ action: 'reopen', label: '重新激活', type: 'warning' })
        break
    }
  }

  return actions
})

// 状态转换
async function handleTransition(action: TransitionAction) {
  try {
    let conclusion: string | undefined

    if (action === 'complete' || action === 'fail' || action === 'cancel') {
      const promptTitle = action === 'complete' ? '请输入完成结论'
        : action === 'fail' ? '请输入失败原因'
        : '请输入取消原因'
      const result = await ElMessageBox.prompt(
        promptTitle,
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

// 格式化时间
function formatTime(isoString: string) {
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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
      <div class="header-badges">
        <el-tag
          :color="NODE_TYPE_CONFIG[nodeType].color"
          effect="dark"
          size="small"
        >
          {{ NODE_TYPE_CONFIG[nodeType].label }}
        </el-tag>
        <el-tag :color="STATUS_CONFIG[nodeMeta.status].color" effect="dark" size="small">
          {{ STATUS_CONFIG[nodeMeta.status].label }}
        </el-tag>
      </div>
    </div>

    <!-- 节点属性 -->
    <div class="node-properties">
      <div class="property-item">
        <span class="property-label">ID:</span>
        <span class="property-value">{{ nodeMeta.id }}</span>
      </div>
      <div class="property-item">
        <span class="property-label">创建时间:</span>
        <span class="property-value">{{ formatTime(nodeMeta.createdAt) }}</span>
      </div>
      <div class="property-item">
        <span class="property-label">更新时间:</span>
        <span class="property-value">{{ formatTime(nodeMeta.updatedAt) }}</span>
      </div>
      <div class="property-item" v-if="nodeMeta.isolate">
        <span class="property-label">隔离:</span>
        <el-tag type="warning" size="small">已隔离</el-tag>
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

    <!-- 子节点结论（仅规划节点显示） -->
    <el-card v-if="isPlanning && context?.childConclusions?.length" class="section-card">
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
  margin-bottom: 12px;
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

.header-badges {
  display: flex;
  gap: 8px;
}

.node-properties {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 16px;
  font-size: 13px;
}

.property-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.property-label {
  color: #909399;
}

.property-value {
  color: #606266;
  font-family: monospace;
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
