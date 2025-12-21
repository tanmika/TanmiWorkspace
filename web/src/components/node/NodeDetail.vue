<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useNodeStore, useWorkspaceStore } from '@/stores'
import { STATUS_CONFIG, NODE_ROLE_CONFIG, DISPATCH_STATUS_CONFIG, type TransitionAction } from '@/types'
import NodeIcon from '@/components/tree/NodeIcon.vue'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import WsButton from '@/components/ui/WsButton.vue'

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

// 节点角色
const nodeRole = computed(() => nodeMeta.value?.role)
const roleConfig = computed(() => nodeRole.value ? NODE_ROLE_CONFIG[nodeRole.value] : null)

// 派发信息
const dispatchInfo = computed(() => nodeMeta.value?.dispatch)
const dispatchConfig = computed(() => dispatchInfo.value ? DISPATCH_STATUS_CONFIG[dispatchInfo.value.status] : null)

// 可用的状态转换（根据节点类型）
const availableActions = computed(() => {
  const status = nodeMeta.value?.status
  const type = nodeMeta.value?.type
  if (!status || !type) return []

  const actions: { action: TransitionAction; label: string; variant: 'primary' | 'secondary' | 'accent' | 'danger' }[] = []

  if (type === 'execution') {
    // 执行节点状态转换
    switch (status) {
      case 'pending':
        actions.push({ action: 'start', label: '开始执行', variant: 'primary' })
        break
      case 'implementing':
        actions.push({ action: 'submit', label: '提交验证', variant: 'accent' })
        actions.push({ action: 'complete', label: '直接完成', variant: 'primary' })
        actions.push({ action: 'fail', label: '标记失败', variant: 'danger' })
        break
      case 'validating':
        actions.push({ action: 'complete', label: '验证通过', variant: 'primary' })
        actions.push({ action: 'fail', label: '验证失败', variant: 'danger' })
        break
      case 'failed':
        actions.push({ action: 'retry', label: '重试', variant: 'primary' })
        break
      case 'completed':
        actions.push({ action: 'reopen', label: '重新激活', variant: 'secondary' })
        break
    }
  } else {
    // 规划节点状态转换
    switch (status) {
      case 'pending':
        actions.push({ action: 'start', label: '开始规划', variant: 'primary' })
        break
      case 'planning':
        actions.push({ action: 'complete', label: '完成规划', variant: 'primary' })
        actions.push({ action: 'cancel', label: '取消', variant: 'danger' })
        break
      case 'monitoring':
        actions.push({ action: 'complete', label: '汇总完成', variant: 'primary' })
        actions.push({ action: 'cancel', label: '取消', variant: 'danger' })
        break
      case 'completed':
        actions.push({ action: 'reopen', label: '重新激活', variant: 'secondary' })
        break
      case 'cancelled':
        actions.push({ action: 'reopen', label: '重新激活', variant: 'secondary' })
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

// 获取操作者类名
function getOperatorClass(operator: 'AI' | 'Human' | 'system') {
  if (operator === 'AI') return 'ai'
  if (operator === 'Human') return 'usr'
  return 'sys'
}
</script>

<template>
  <div class="node-detail-wrapper" v-if="nodeMeta && currentNode">
    <div class="node-detail-panel">
    <!-- 头部区 -->
    <div class="detail-header">
      <div class="header-main">
        <NodeIcon :type="nodeMeta.type" :status="nodeMeta.status" />
        <span class="node-status" :data-status="nodeMeta.status">
          {{ STATUS_CONFIG[nodeMeta.status].label }}
        </span>
        <span class="header-sep">·</span>
        <span class="header-title">{{ currentNode.title }}</span>
        <div class="header-badges">
          <span
            v-if="roleConfig"
            class="role-badge"
            :data-role="nodeRole"
          >
            {{ roleConfig.label.toUpperCase() }}
          </span>
          <span
            v-if="nodeMeta.isolate"
            class="isolate-tag"
          >
            ISOLATED
          </span>
        </div>
      </div>
      <div class="header-meta">ID: {{ nodeMeta.id }}</div>
    </div>

    <!-- 派发信息 -->
    <div v-if="dispatchInfo && dispatchConfig" class="detail-section">
      <div class="section-title">
        <span>Dispatch / 派发信息</span>
        <span class="dispatch-status-badge" :data-status="dispatchInfo.status">
          {{ dispatchConfig.label.toUpperCase() }}
        </span>
      </div>
      <div class="dispatch-info">
        <div class="dispatch-row">
          <span class="dispatch-label">状态:</span>
          <span class="dispatch-value">{{ dispatchConfig.description }}</span>
        </div>
        <div class="dispatch-row">
          <span class="dispatch-label">开始:</span>
          <span class="dispatch-marker">{{ dispatchInfo.startMarker }}</span>
        </div>
        <div class="dispatch-row" v-if="dispatchInfo.endMarker">
          <span class="dispatch-label">结束:</span>
          <span class="dispatch-marker">{{ dispatchInfo.endMarker }}</span>
        </div>
      </div>
    </div>

    <!-- 需求描述 -->
    <div class="detail-section">
      <div class="section-title">Requirement / 需求描述</div>
      <div class="note-box">
        <MarkdownContent :content="currentNode.requirement || '暂无描述'" />
      </div>
    </div>

    <!-- 文档引用 -->
    <div v-if="currentNode.docs?.length" class="detail-section">
      <div class="section-title">References / 文档引用</div>
      <div class="docs-list">
        <div v-for="doc in currentNode.docs" :key="doc.path" class="docs-item">
          <span class="docs-path">{{ doc.path }}</span>
          <span class="docs-desc">{{ doc.description }}</span>
          <span v-if="doc.status === 'expired'" class="docs-expired">EXPIRED</span>
        </div>
      </div>
    </div>

    <!-- 备注 -->
    <div v-if="currentNode.note" class="detail-section">
      <div class="section-title">Note / 备注</div>
      <div class="note-box">
        <MarkdownContent :content="currentNode.note" />
      </div>
    </div>

    <!-- 当前问题 -->
    <div v-if="currentNode.problem" class="detail-section">
      <div class="section-title">Problem / 当前问题</div>
      <div class="problem-box">
        <div class="problem-title">[!] Blocking Issue</div>
        <MarkdownContent :content="currentNode.problem" />
      </div>
    </div>

    <!-- 结论（已完成节点） -->
    <div v-if="nodeMeta.conclusion" class="detail-section">
      <div class="section-title">Conclusion / 执行结论</div>
      <div class="conclusion-box">
        <span class="conclusion-badge">DONE</span>
        <div class="conclusion-content">
          <MarkdownContent :content="nodeMeta.conclusion" />
        </div>
      </div>
    </div>

    <!-- 子节点结论（仅规划节点显示） -->
    <div v-if="isPlanning && context?.childConclusions?.length" class="detail-section">
      <div class="section-title">Child Conclusions / 子节点结论</div>
      <div class="child-conclusions">
        <div
          v-for="child in context.childConclusions"
          :key="child.nodeId"
          class="child-conclusion-item"
        >
          <div class="child-conclusion-title">
            <span class="child-node-icon" :data-status="child.status"></span>
            {{ child.title }}
          </div>
          <div class="child-conclusion-content">{{ child.conclusion || '待执行...' }}</div>
        </div>
      </div>
    </div>

    <!-- 执行日志 -->
    <div class="detail-section">
      <div class="section-title">Log / 执行日志</div>
      <div class="log-container" v-if="currentNode.logEntries?.length">
        <div v-for="(entry, index) in currentNode.logEntries" :key="index" class="log-item">
          <span class="log-time">{{ entry.timestamp }}</span>
          <span class="log-operator" :class="getOperatorClass(entry.operator)">
            {{ entry.operator === 'AI' ? 'AI' : entry.operator === 'Human' ? 'USR' : 'SYS' }}
          </span>
          <span class="log-content">{{ entry.event }}</span>
        </div>
      </div>
      <div v-else class="log-empty">暂无日志</div>
    </div>

    </div>

    <!-- 操作按钮区（固定底部） -->
    <div class="action-bar">
      <div class="action-group">
        <WsButton
          v-for="action in availableActions"
          :key="action.action"
          :variant="action.variant"
          size="sm"
          @click="handleTransition(action.action)"
        >
          {{ action.label }}
        </WsButton>
      </div>
      <div class="action-group">
        <WsButton
          variant="secondary"
          size="sm"
          @click="handleSetFocus"
          :disabled="workspaceStore.currentFocus === nodeMeta.id"
        >
          设为焦点
        </WsButton>
        <WsButton
          variant="danger"
          size="sm"
          @click="handleDelete"
          :disabled="nodeMeta.id === 'root'"
        >
          删除
        </WsButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 外层容器 - flex 布局实现固定底部 */
.node-detail-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--card-bg);
}

.node-detail-panel {
  flex: 1;
  overflow-y: auto;
  width: 100%;
}

/* 头部区 */
.detail-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.header-main {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.node-status {
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.node-status[data-status="pending"] { color: var(--border-heavy); }
.node-status[data-status="implementing"] { color: var(--accent-blue); }
.node-status[data-status="validating"] { color: var(--accent-orange); }
.node-status[data-status="planning"] { color: var(--accent-purple); }
.node-status[data-status="monitoring"] { color: var(--accent-blue); }
.node-status[data-status="completed"] { color: var(--border-heavy); }
.node-status[data-status="failed"] { color: var(--accent-red); }
.node-status[data-status="cancelled"] { color: var(--text-muted); }

.header-sep {
  color: var(--text-muted);
  font-size: 13px;
  flex-shrink: 0;
}

.header-title {
  font-size: 16px;
  font-weight: 700;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-badges {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.header-meta {
  font-family: var(--mono-font), monospace;
  font-size: 11px;
  color: var(--text-muted);
}

/* 角色徽章 */
.role-badge {
  font-family: var(--mono-font), monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  line-height: 1;
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.role-badge[data-role="info-collection"] {
  background: var(--accent-orange);
  color: #000;
}

.role-badge[data-role="validation"] {
  background: var(--accent-green);
  color: #fff;
}

.role-badge[data-role="summary"] {
  background: #909399;
  color: #fff;
}

/* 隔离标签 */
.isolate-tag {
  font-family: var(--mono-font), monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  line-height: 1;
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--accent-orange);
  color: #000;
  border: 1px dashed #000;
}

/* 内容区块 */
.detail-section {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.detail-section:last-child {
  border-bottom: none;
}

/* Section 标题 */
.section-title {
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

/* 节点ID */
.node-id {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.id-label {
  color: var(--text-muted);
  font-weight: 600;
}

.id-value {
  font-family: var(--mono-font), monospace;
  color: var(--text-secondary);
}

/* 面板容器 */
.panel-section {
  background: var(--card-bg);
  border: 2px solid var(--border-heavy);
  box-shadow: 8px 8px 0 rgba(0,0,0,0.15);
}

.panel-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fafafa;
}

[data-theme="dark"] .panel-header {
  background: #1a1a1a;
}

.panel-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-main);
}

.panel-title::before {
  content: '';
  width: 3px;
  height: 14px;
  background: var(--accent-red);
}

.panel-body {
  padding: 0;
}

/* 派发信息 */
.dispatch-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
  background: var(--accent-blue);
  color: #fff;
}

.dispatch-info {
  padding: 16px;
}

.dispatch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.dispatch-row:last-child {
  margin-bottom: 0;
}

.dispatch-label {
  color: var(--text-muted);
  font-size: 13px;
  min-width: 80px;
}

.dispatch-value {
  color: var(--text-secondary);
  font-size: 13px;
}

.dispatch-marker {
  font-family: var(--mono-font), monospace;
  background: var(--path-bg);
  padding: 2px 8px;
  font-size: 12px;
  color: var(--text-main);
}

[data-theme="dark"] .dispatch-marker {
  background: #333;
}

/* 备注框 */
.note-box {
  background: var(--path-bg);
  border-left: 4px solid var(--border-heavy);
  padding: 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

[data-theme="dark"] .note-box {
  background: #1a1a1a;
}

/* 文档列表 */
.docs-list {
  background: #fafafa;
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--accent-blue);
}

[data-theme="dark"] .docs-list {
  background: #1a1a1a;
}

.docs-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #eee;
}

[data-theme="dark"] .docs-item {
  border-bottom: 1px solid #333;
}

.docs-item:last-child {
  border-bottom: none;
}

.docs-path {
  font-family: var(--mono-font), monospace;
  font-size: 12px;
  color: var(--accent-blue);
}

.docs-desc {
  font-size: 12px;
  color: var(--text-muted);
  flex: 1;
}

.docs-expired {
  font-size: 10px;
  color: #000;
  background: var(--accent-orange);
  padding: 2px 6px;
}

/* 问题框 */
.problem-box {
  background: #fff8f0;
  border: 1px solid var(--accent-orange);
  border-left: 4px solid var(--accent-orange);
  padding: 16px;
}

[data-theme="dark"] .problem-box {
  background: #332a0a;
}

.problem-title {
  font-family: var(--mono-font), monospace;
  font-size: 12px;
  font-weight: 700;
  color: #d35400;
  text-transform: uppercase;
  margin-bottom: 8px;
}

/* 结论框 */
.conclusion-box {
  background: #f4f4f4;
  border-left: 4px solid var(--border-heavy);
  padding: 16px;
}

[data-theme="dark"] .conclusion-box {
  background: #1a1a1a;
}

.conclusion-badge {
  font-family: var(--mono-font), monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  background: var(--accent-green);
  color: #fff;
  margin-bottom: 8px;
  display: inline-block;
}

.conclusion-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-main);
}

/* 日志容器 */
.log-container {
  background: #fafafa;
  border: 1px solid var(--border-color);
  max-height: 200px;
  overflow-y: auto;
}

[data-theme="dark"] .log-container {
  background: #1a1a1a;
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 12px;
  font-size: 11px;
  border-bottom: 1px solid var(--border-color);
}

[data-theme="dark"] .log-item {
  border-bottom: 1px solid #333;
}

.log-item:last-child {
  border-bottom: none;
}

.log-time {
  font-family: var(--mono-font), monospace;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.log-operator {
  font-family: var(--mono-font), monospace;
  width: 32px;
  text-align: center;
  padding: 2px 0;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.log-operator.ai {
  background: #111;
  color: #fff;
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
  color: var(--text-main);
  flex: 1;
}

.log-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* 子节点结论 */
.child-conclusions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.child-conclusion-item {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.child-conclusion-item:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.child-conclusion-title {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-main);
}

/* 子节点图标 */
.child-node-icon {
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-heavy);
  background: var(--border-heavy);
  flex-shrink: 0;
}

.child-node-icon[data-status="pending"] {
  background: transparent;
  border-style: dashed;
  border-color: #999;
}

.child-node-icon[data-status="implementing"] {
  background: var(--accent-blue);
  border-color: var(--accent-blue);
}

.child-node-icon[data-status="validating"] {
  background: var(--accent-orange);
  border-color: var(--accent-orange);
}

.child-node-icon[data-status="failed"] {
  background: var(--accent-red);
  border-color: var(--accent-red);
}

.child-conclusion-content {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  padding-left: 20px;
}

/* 操作按钮区 - 固定底部 */
.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #fafafa;
  flex-wrap: wrap;
  gap: 12px;
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
}

[data-theme="dark"] .action-bar {
  background: #1a1a1a;
}

.action-group {
  display: flex;
  gap: 8px;
}
</style>
