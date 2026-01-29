// 前端类型定义
// 复用后端类型并扩展前端特有类型

// ========== 基础类型 ==========

// 验收标准 - 动态键值对格式（支持任意列）
export type AcceptanceCriteria = Record<string, string>

export type WorkspaceStatus = 'active' | 'archived' | 'error'

// 工作区错误信息
export interface WorkspaceErrorInfo {
  message: string
  detectedAt: string
  type?: 'dir_missing' | 'config_corrupted' | 'graph_corrupted' | 'version_too_high' | 'node_corrupted' | 'unknown'
  previousStatus?: 'active' | 'archived'
}

// 节点类型
export type NodeType = 'planning' | 'execution'

// 节点角色
export type NodeRole = 'info_collection' | 'info_summary' | 'validation'

// 执行节点状态
export type ExecutionStatus = 'pending' | 'implementing' | 'validating' | 'completed' | 'failed'

// 规划节点状态
export type PlanningStatus = 'pending' | 'planning' | 'monitoring' | 'completed' | 'cancelled'

// 联合状态类型
export type NodeStatus = ExecutionStatus | PlanningStatus

// 节点派发状态
export type NodeDispatchStatus = 'pending' | 'executing' | 'testing' | 'passed' | 'failed'

// 节点派发信息
export interface NodeDispatchInfo {
  startMarker: string // Git 模式=commit hash，无 Git 模式=时间戳
  endMarker?: string // Git 模式=commit hash，无 Git 模式=时间戳
  status: NodeDispatchStatus
}

// 执行节点动作
export type ExecutionAction = 'start' | 'submit' | 'complete' | 'fail' | 'retry' | 'reopen'

// 规划节点动作
export type PlanningAction = 'start' | 'complete' | 'cancel' | 'reopen'

// 联合动作类型
export type TransitionAction = ExecutionAction | PlanningAction

export type ReferenceAction = 'add' | 'remove' | 'expire' | 'activate'

// ========== 工作区类型 ==========

// Memo 元数据（用于 DocRef 引用 memo）
export interface MemoMeta {
  id: string
  title: string
  summary: string
  tags: string[]
}

// 节点元数据（用于 DocRef 引用 node）
export interface NodeRefMeta {
  id: string
  title: string
  type: NodeType
  status: NodeStatus
}

export interface DocRef {
  path: string
  description: string
  memoMeta?: MemoMeta
  nodeMeta?: NodeRefMeta
  status?: 'active' | 'expired'
}

export interface DocRefWithStatus extends DocRef {
  status: 'active' | 'expired'
}

export interface WorkspaceEntry {
  id: string
  name: string
  goal?: string
  projectRoot: string
  status: WorkspaceStatus
  createdAt: string
  updatedAt: string
  errorInfo?: WorkspaceErrorInfo
  pinned?: boolean
}

// 派发资源限制配置
export interface DispatchLimits {
  timeoutMs?: number
  maxRetries?: number
}

// 派发配置
export interface DispatchConfig {
  enabled: boolean
  useGit: boolean
  enabledAt: number
  originalBranch?: string
  processBranch?: string
  backupBranches?: string[]
  limits?: DispatchLimits
}

export interface WorkspaceConfig {
  id: string
  name: string
  status: WorkspaceStatus
  createdAt: string
  updatedAt: string
  rootNodeId: string
  dispatch?: DispatchConfig
}

// ========== 节点类型 ==========

export interface NodeMeta {
  id: string
  type: NodeType
  parentId: string | null
  children: string[]
  status: NodeStatus
  isolate: boolean
  references: string[]
  conclusion: string | null
  role?: NodeRole
  dispatch?: NodeDispatchInfo
  acceptanceCriteria?: AcceptanceCriteria[]
  createdAt: string
  updatedAt: string
}

// 工作流阶段
export type WorkflowPhase = 'info' | 'design' | 'impl'

// 工作流状态
export interface WorkflowState {
  phase: WorkflowPhase
  phaseSkillInvoked: boolean
}

export interface NodeGraph {
  version: string
  currentFocus: string | null
  nodes: Record<string, NodeMeta>
  workflow?: WorkflowState
}

export interface NodeTreeItem {
  id: string
  type: NodeType
  title: string
  status: NodeStatus
  role?: NodeRole
  dispatch?: NodeDispatchInfo
  contentLength?: number  // MEMO 节点专用：内容长度
  memoCount?: number      // MEMO 抽屉专用：备忘数量
  children: NodeTreeItem[]
}

// ========== 上下文类型 ==========

export interface TypedLogEntry {
  timestamp: string
  operator: 'AI' | 'Human' | 'system'
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
  acceptanceCriteria?: AcceptanceCriteria[]
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
  type: NodeType
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
  logMd: string
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

// ========== 派发相关类型 ==========

export type MergeStrategy = 'sequential' | 'squash' | 'cherry-pick' | 'skip'

export interface DisableDispatchOptions {
  mergeStrategy: MergeStrategy
  keepBackupBranch?: boolean
  keepProcessBranch?: boolean
  commitMessage?: string
}

export interface DisableDispatchQueryResult {
  success: boolean
  status: {
    originalBranch?: string
    processBranch?: string
    backupBranch?: string | null
    hasBackupChanges: boolean
    processCommits?: Array<{ hash: string; message: string }>
    useGit: boolean
  }
  hint?: string
}

export interface EnableDispatchResult {
  success: boolean
  config: DispatchConfig
  hint?: string
}

export interface DisableDispatchExecuteResult {
  success: boolean
  hint?: string
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
  // 共用状态
  pending: {
    icon: 'CircleClose',
    color: '#909399',
    label: '待执行',
    emoji: '⚪',
  },
  completed: {
    icon: 'CircleCheck',
    color: '#67C23A',
    label: '已完成',
    emoji: '✅',
  },
  // 执行节点状态
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
  failed: {
    icon: 'CircleCloseFilled',
    color: '#F56C6C',
    label: '失败',
    emoji: '❌',
  },
  // 规划节点状态
  planning: {
    icon: 'Edit',
    color: '#9B59B6',
    label: '规划中',
    emoji: '◇',
  },
  monitoring: {
    icon: 'View',
    color: '#3498DB',
    label: '监控中',
    emoji: '◈',
  },
  cancelled: {
    icon: 'Remove',
    color: '#95A5A6',
    label: '已取消',
    emoji: '⊘',
  },
}

// 节点类型配置
export interface NodeTypeConfig {
  label: string
  color: string
  description: string
}

export const NODE_TYPE_CONFIG: Record<NodeType, NodeTypeConfig> = {
  planning: {
    label: '规划节点',
    color: '#9B59B6',
    description: '负责分析、分解任务、创建子节点',
  },
  execution: {
    label: '执行节点',
    color: '#3498DB',
    description: '负责具体执行，不能有子节点',
  },
}

// 节点角色配置
export interface NodeRoleConfig {
  label: string
  color: string       // 背景色
  textColor: string   // 文字颜色
  description: string
}

export const NODE_ROLE_CONFIG: Record<NodeRole, NodeRoleConfig> = {
  info_collection: {
    label: 'INFO',
    color: '#E6A23C',
    textColor: '#000',
    description: '收集项目信息，完成时自动归档规则和文档到工作区',
  },
  info_summary: {
    label: 'SUMM',
    color: '#909399',
    textColor: '#fff',
    description: '信息总结，从已有信息中提取结构化内容',
  },
  validation: {
    label: 'VALID',
    color: '#67C23A',
    textColor: '#fff',
    description: '验证类任务（预留）',
  },
}

// 派发状态配置
export interface DispatchStatusConfig {
  label: string
  color: string
  bgColor: string
  description: string
}

export const DISPATCH_STATUS_CONFIG: Record<NodeDispatchStatus, DispatchStatusConfig> = {
  pending: {
    label: '待派发',
    color: '#909399',
    bgColor: '#f4f4f5',
    description: '等待派发执行',
  },
  executing: {
    label: '执行中',
    color: '#409EFF',
    bgColor: '#ecf5ff',
    description: 'Subagent 正在执行',
  },
  testing: {
    label: '测试中',
    color: '#E6A23C',
    bgColor: '#fdf6ec',
    description: '测试节点验证中',
  },
  passed: {
    label: '已通过',
    color: '#67C23A',
    bgColor: '#f0f9eb',
    description: '测试通过',
  },
  failed: {
    label: '已失败',
    color: '#F56C6C',
    bgColor: '#fef0f0',
    description: '执行或测试失败',
  },
}

// ========== Memo 类型 ==========

/**
 * 备忘（Memo）- 工作区独立草稿区
 */
export interface Memo {
  id: string
  title: string
  summary: string
  content: string
  tags: string[]
  contentLength?: number  // 内容长度（用于UI显示横线数量）
  createdAt: string
  updatedAt: string
}

/**
 * memo_list 输出项（精简信息）
 */
export interface MemoListItem {
  id: string
  title: string
  summary: string
  tags: string[]
  contentLength: number  // 内容长度（用于UI显示横线数量）
  dirName: string        // 目录名，格式：{title}_{shortId}
  createdAt: string
  updatedAt: string
}

/**
 * memo_list 输出
 */
export interface MemoListResult {
  memos: MemoListItem[]
  allTags: string[]
  hint?: string
}

// ========== 搜索类型 ==========

/**
 * 内容搜索输入参数
 */
export interface ContentSearchParams {
  query: string
  regex?: boolean
  id?: string
  target?: 'all' | 'node' | 'memo'
  limit?: number
  context?: number
}

/**
 * 内容搜索匹配项
 */
export interface ContentSearchMatch {
  type: 'node' | 'memo'
  nodeId?: string
  nodeTitle?: string
  memoId?: string
  memoTitle?: string
  source: string  // title/requirement/conclusion/summary/content/tags
  line?: number
  snippet: string
}

/**
 * 内容搜索结果
 */
export interface ContentSearchResult {
  matches: ContentSearchMatch[]
  hasMore: boolean
}
