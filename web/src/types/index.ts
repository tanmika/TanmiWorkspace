// 前端类型定义
// 复用后端类型并扩展前端特有类型

// ========== 基础类型 ==========

export type WorkspaceStatus = 'active' | 'archived'

export type NodeStatus = 'pending' | 'implementing' | 'validating' | 'completed' | 'failed'

export type TransitionAction = 'start' | 'submit' | 'complete' | 'fail' | 'retry'

export type ReferenceAction = 'add' | 'remove' | 'expire' | 'activate'

// ========== 工作区类型 ==========

export interface DocRef {
  path: string
  description: string
}

export interface DocRefWithStatus extends DocRef {
  status: 'active' | 'expired'
}

export interface WorkspaceEntry {
  id: string
  name: string
  projectRoot: string
  status: WorkspaceStatus
  createdAt: string
  updatedAt: string
}

export interface WorkspaceConfig {
  id: string
  name: string
  status: WorkspaceStatus
  createdAt: string
  updatedAt: string
  rootNodeId: string
}

// ========== 节点类型 ==========

export interface NodeMeta {
  id: string
  parentId: string | null
  children: string[]
  status: NodeStatus
  isolate: boolean
  references: string[]
  conclusion: string | null
  createdAt: string
  updatedAt: string
}

export interface NodeGraph {
  version: string
  currentFocus: string | null
  nodes: Record<string, NodeMeta>
}

export interface NodeTreeItem {
  id: string
  title: string
  status: NodeStatus
  children: NodeTreeItem[]
}

// ========== 上下文类型 ==========

export interface TypedLogEntry {
  timestamp: string
  operator: 'AI' | 'Human'
  event: string
}

export interface ContextChainItem {
  nodeId: string
  title: string
  requirement: string
  docs: DocRefWithStatus[]
  note: string
  conclusion?: string
  problem?: string
  logEntries?: TypedLogEntry[]
}

export interface ChildConclusionItem {
  nodeId: string
  title: string
  status: NodeStatus
  conclusion: string
}

// ========== API 输入类型 ==========

export interface WorkspaceInitParams {
  name: string
  goal: string
  projectRoot?: string
  rules?: string[]
  docs?: DocRef[]
}

export interface WorkspaceListParams {
  status?: 'active' | 'archived' | 'all'
}

export interface NodeCreateParams {
  workspaceId: string
  parentId: string
  title: string
  requirement?: string
  docs?: DocRef[]
}

// ========== API 输出类型 ==========

export interface WorkspaceInitResult {
  workspaceId: string
  path: string
  projectRoot: string
  rootNodeId: string
  webUrl?: string
}

export interface WorkspaceListResult {
  workspaces: WorkspaceEntry[]
}

export interface WorkspaceGetResult {
  config: WorkspaceConfig
  graph: NodeGraph
  workspaceMd: string
}

export interface WorkspaceDeleteResult {
  success: boolean
}

export interface WorkspaceStatusResult {
  output: string
  summary: {
    name: string
    goal: string
    status: string
    totalNodes: number
    completedNodes: number
    currentFocus: string | null
  }
}

export interface NodeCreateResult {
  nodeId: string
  path: string
}

export interface NodeGetResult {
  meta: NodeMeta
  infoMd: string
  logMd: string
  problemMd: string
}

export interface NodeListResult {
  tree: NodeTreeItem
}

export interface NodeUpdateResult {
  success: boolean
  updatedAt: string
}

export interface NodeDeleteResult {
  success: boolean
  deletedNodes: string[]
}

export interface NodeSplitResult {
  nodeId: string
  path: string
}

export interface NodeTransitionResult {
  success: boolean
  previousStatus: NodeStatus
  currentStatus: NodeStatus
  conclusion: string | null
}

export interface ContextGetResult {
  workspace: {
    goal: string
    rules: string[]
    docs: DocRefWithStatus[]
  }
  chain: ContextChainItem[]
  references: ContextChainItem[]
  childConclusions: ChildConclusionItem[]
}

export interface ContextFocusResult {
  success: boolean
  previousFocus: string | null
  currentFocus: string
}

export interface NodeIsolateResult {
  success: boolean
}

export interface NodeReferenceResult {
  success: boolean
  references: DocRefWithStatus[]
}

export interface LogAppendResult {
  success: boolean
  timestamp: string
}

export interface ProblemUpdateResult {
  success: boolean
}

export interface ProblemClearResult {
  success: boolean
}

// ========== 前端扩展类型 ==========

// 状态配置
export interface StatusConfig {
  icon: string
  color: string
  label: string
  emoji: string
}

export const STATUS_CONFIG: Record<NodeStatus, StatusConfig> = {
  pending: {
    icon: 'CircleClose',
    color: '#909399',
    label: '待执行',
    emoji: '⚪',
  },
  implementing: {
    icon: 'Loading',
    color: '#409EFF',
    label: '执行中',
    emoji: '🔵',
  },
  validating: {
    icon: 'Clock',
    color: '#E6A23C',
    label: '验证中',
    emoji: '🟡',
  },
  completed: {
    icon: 'CircleCheck',
    color: '#67C23A',
    label: '已完成',
    emoji: '✅',
  },
  failed: {
    icon: 'CircleCloseFilled',
    color: '#F56C6C',
    label: '失败',
    emoji: '❌',
  },
}
