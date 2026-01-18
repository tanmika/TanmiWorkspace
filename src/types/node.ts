// src/types/node.ts

import type { DocRef, ActionRequired } from "./workspace.js";

/**
 * 节点类型
 */
export type NodeType =
  | "planning"    // 规划节点：负责分析、分解、派发、汇总
  | "execution";  // 执行节点：负责具体执行，不能有子节点

/**
 * 节点角色 - 节点在工作流中的特殊职责
 */
export type NodeRole =
  | "info_collection"   // 信息收集：调研、分析，完成时自动归档到工作区规则和文档
  | "info_summary"      // 信息总结：从已有信息中提取结构化内容
  | "dispatch_exec"     // 派发执行：派发母节点自动创建的执行子节点
  | "dispatch_spec"     // 派发规格审查：验证执行结果是否符合需求规格
  | "dispatch_quality"; // 派发质量审查：检查代码质量、最佳实践、潜在问题

/**
 * 验收标准 - 动态键值对格式
 *
 * 支持任意列结构，如：
 * - { when, then }
 * - { given, when, then }
 * - { scenario, input, expected }
 *
 * 前端会根据第一条数据的 keys 动态生成表头
 */
export type AcceptanceCriteria = Record<string, string>;

/**
 * 节点派发状态 - 用于跟踪派发执行进度
 */
export type NodeDispatchStatus =
  | "pending"           // 等待派发
  | "executing"         // subagent 执行中
  | "passed"            // 执行通过
  | "failed";           // 执行失败

/**
 * 派发尝试记录 - 记录每次执行尝试的详情
 */
export interface DispatchAttempt {
  attemptNumber: number;              // 尝试次数（从 1 开始）
  startMarker: string;                // Git 模式=commit hash，无 Git 模式=时间戳
  endMarker?: string;                 // 结束标记
  status: "executing" | "passed" | "failed";  // 本次尝试状态
  failureReason?: string;             // 失败原因（status=failed 时）
  conclusion?: string;                // 执行结论
}

/**
 * 节点派发信息 - 派发子节点使用
 */
export interface NodeDispatchInfo {
  startMarker?: string;             // Git 模式=commit hash，无 Git 模式=时间戳（当前尝试）- 开始执行时设置
  endMarker?: string;               // Git 模式=commit hash，无 Git 模式=时间戳
  status: NodeDispatchStatus;       // 派发状态
  attempts?: DispatchAttempt[];     // 执行尝试历史（用于重试时提供失败上下文）
}

/**
 * 派发母节点信息 - 派发母节点使用
 */
export interface NodeDispatchParent {
  children: {                       // 派发子节点 ID
    execId: string;
    specId: string;
    qualityId?: string;
  };
}

/**
 * 节点执行者 - 预留字段，用于未来子 agent 派发
 * @reserved 暂不实现，仅作设计预留
 */
// export type NodeExecutor =
//   | "main"        // 主 agent 执行（默认）
//   | "sub_agent"   // 派发到子 agent 执行
//   | "human";      // 需要人工介入

/**
 * 执行节点状态
 */
export type ExecutionStatus =
  | "pending"       // 待执行
  | "implementing"  // 执行中
  | "validating"    // 验证中
  | "completed"     // 已完成
  | "failed";       // 失败

/**
 * 规划节点状态
 */
export type PlanningStatus =
  | "pending"       // 待执行
  | "planning"      // 规划中：分析需求、创建子节点
  | "monitoring"    // 监控中：子节点执行中，等待结果
  | "completed"     // 已完成
  | "cancelled";    // 已取消

/**
 * 节点状态（联合类型）
 */
export type NodeStatus = ExecutionStatus | PlanningStatus;

/**
 * 执行节点状态转换动作
 */
export type ExecutionAction =
  | "start"      // pending → implementing
  | "submit"     // implementing → validating
  | "complete"   // implementing/validating → completed
  | "fail"       // implementing/validating → failed
  | "retry"      // failed → implementing
  | "reopen";    // completed → implementing

/**
 * 规划节点状态转换动作
 */
export type PlanningAction =
  | "start"      // pending → planning
  | "complete"   // monitoring/planning → completed
  | "cancel"     // planning/monitoring → cancelled
  | "reopen";    // completed/cancelled → planning

/**
 * 状态转换动作（联合类型，保持向后兼容）
 */
export type TransitionAction = ExecutionAction | PlanningAction;

/**
 * 节点图 - 存储在 .tanmi-workspace/[workspace-id]/graph.json
 */
export interface NodeGraph {
  version: string;
  currentFocus: string | null;      // 当前聚焦的节点 ID
  nodes: Record<string, NodeMeta>;
  memos?: Record<string, import("./memo.js").MemoListItem>;  // 备忘索引（可选）
  lastWriteCodeVersion?: string;    // 最后写入时的代码版本 (package.json 版本)
}

/**
 * 节点元数据
 */
export interface NodeMeta {
  id: string;
  dirName: string;                  // 目录名（可读格式：标题_短ID，root 节点为 "root"）
  type: NodeType;                   // 节点类型：planning 或 execution
  parentId: string | null;          // 根节点为 null
  children: string[];               // 子节点 ID 列表（execution 节点永远为空）
  status: NodeStatus;
  isolate: boolean;                 // 是否切断上下文继承
  references: string[];             // 跨节点引用的 ID 列表
  conclusion: string | null;        // 节点完成时的结论
  conclusionStale?: boolean;        // 结论是否过期
  role?: NodeRole;                  // 节点角色（可选）
  // executor?: NodeExecutor;       // 执行者（预留，用于子 agent 派发）
  createdAt: string;
  updatedAt: string;

  // ===== 验收标准（可选）=====
  acceptanceCriteria?: AcceptanceCriteria[];  // 验收标准（WHEN/THEN 格式）

  // ===== 派发相关字段（可选）=====
  dispatch?: NodeDispatchInfo;        // 派发信息（派发子节点使用）
  dispatchParent?: NodeDispatchParent; // 派发母节点信息（派发母节点使用）
}

/**
 * 节点 Info.md 数据结构
 */
export interface NodeInfoData {
  id: string;
  type: NodeType;
  title: string;
  status: NodeStatus;
  createdAt: string;
  updatedAt: string;
  requirement: string;
  docs: DocRef[];
  notes: string;
  conclusion: string;
  acceptanceCriteria?: AcceptanceCriteria[];  // 验收标准（WHEN/THEN 格式）
}

/**
 * 节点树结构（用于 node_list 输出）
 */
export interface NodeTreeItem {
  id: string;
  type: NodeType;
  title: string;
  status: NodeStatus;
  role?: NodeRole;
  dispatch?: NodeDispatchInfo;
  children: NodeTreeItem[];
}

// ========== API 输入输出类型 ==========

/**
 * node_create 输入
 */
export interface NodeCreateParams {
  workspaceId: string;
  parentId: string;
  type: NodeType;                   // 节点类型（必填）
  title: string;
  requirement?: string;
  docs?: DocRef[];
  rulesHash?: string;               // 规则哈希（用于验证 AI 已阅读规则）
  role?: NodeRole;                  // 节点角色（可选）
  acceptanceCriteria?: AcceptanceCriteria[];  // 验收标准（WHEN/THEN 格式）

  // ===== 测试节点附属化参数（可选）=====
  isNeedTest?: boolean;             // 是否需要测试（仅执行节点有效）
  testRequirement?: string;         // 测试验收标准（isNeedTest=true 时使用）
}

/**
 * node_create 输出
 */
export interface NodeCreateResult {
  nodeId: string;
  path: string;
  autoReopened?: string;            // 如果父节点被自动 reopen，返回父节点 ID
  hint?: string;
  guidance?: string;  // 场景感知引导内容（L0 级别）
  actionRequired?: ActionRequired;  // AI 必须执行的行为

  // ===== 测试节点附属化输出（isNeedTest=true 时返回）=====
  upgradedToPlanning?: boolean;     // 是否已升级为管理节点（planning）
  execNodeId?: string;              // 自动创建的执行子节点 ID
  testNodeId?: string;              // 自动创建的测试子节点 ID
}

/**
 * node_get 输入
 */
export interface NodeGetParams {
  workspaceId: string;
  nodeId: string;
}

/**
 * node_get 输出
 */
export interface NodeGetResult {
  meta: NodeMeta;
  infoMd: string;
  logMd: string;
  problemMd: string;
  /** 节点内容的 hash，用于先读后写校验 */
  nodeHash: string;
}

/**
 * node_list 输入
 */
export interface NodeListParams {
  workspaceId: string;
  rootId?: string;
  depth?: number;
}

/**
 * node_list 输出
 */
export interface NodeListResult {
  tree: NodeTreeItem;
}

/**
 * node_delete 输入
 */
export interface NodeDeleteParams {
  workspaceId: string;
  nodeId: string;
}

/**
 * node_delete 输出
 */
export interface NodeDeleteResult {
  success: boolean;
  deletedNodes: string[];
}

// ========== 状态转换 API 类型 ==========

/**
 * Confirmation Token 验证数据
 */
export interface ConfirmationData {
  token: string;           // 待验证的 token
  userInput: string;       // 用户的真实输入
}

/**
 * node_transition 输入
 */
export interface NodeTransitionParams {
  workspaceId: string;
  nodeId: string;
  action: TransitionAction;
  reason?: string;
  conclusion?: string;    // complete/fail 时必填
  confirmation?: ConfirmationData;  // Confirmation Token 验证数据（当 actionRequired 返回 token 时必须提供）
  conclusionsHash?: string;   // 规划节点 complete 时必填（先 context_get 获取）
}

/**
 * node_transition 输出
 */
export interface NodeTransitionResult {
  success: boolean;
  previousStatus: NodeStatus;
  currentStatus: NodeStatus;
  conclusion: string | null;
  cascadeUpdates?: string[];  // 级联更新的父节点状态变化
  hint?: string;              // 工作流提示，提醒 AI 下一步应做什么
  guidance?: string;          // 场景感知引导内容（L0 级别）
  actionRequired?: ActionRequired;  // AI 必须执行的行为
}

// ========== Phase 3: 节点更新 ==========

/**
 * 精确替换的目标字段类型
 */
export type NodeUpdateField = 'requirement' | 'note' | 'conclusion';

/**
 * node_update 输入
 *
 * 支持两种更新模式：
 * 1. 整体替换：直接提供 requirement/note/conclusion 字段值
 * 2. 精确替换：提供 field + old_str + new_str 进行字符串替换
 *
 * 两种模式都需要提供 nodeHash 进行先读后写校验
 */
export interface NodeUpdateParams {
  workspaceId: string;
  nodeId: string;
  /** 节点内容的 hash，用于先读后写校验（MCP 调用必填，内部调用可省略） */
  nodeHash?: string;
  title?: string;
  requirement?: string;
  note?: string;
  conclusion?: string;
  /** 指定要精确替换的字段（与 old_str/new_str 配合使用） */
  field?: NodeUpdateField;
  /** 要替换的原文本（精确替换模式） */
  old_str?: string;
  /** 替换后的文本（精确替换模式） */
  new_str?: string;
  /** 上下文 hash，stale=true 时更新 conclusion 必填（先 context_get 获取） */
  conclusionsHash?: string;
}

/**
 * node_update 输出
 */
export interface NodeUpdateResult {
  success: boolean;
  updatedAt: string;
}

/**
 * node_move 输入
 */
export interface NodeMoveParams {
  workspaceId: string;
  nodeId: string;
  newParentId: string;
}

/**
 * node_move 输出
 */
export interface NodeMoveResult {
  success: boolean;
  previousParentId: string | null;
  newParentId: string;
}

// ========== 执行节点失败信息 ==========

/**
 * 执行节点失败原因类型
 */
export type ExecutionFailureReason =
  | "unclear_requirement"   // 需求不清晰
  | "task_too_large"        // 任务过大需要分解
  | "blocked"               // 执行受阻（依赖/权限等）
  | "other";                // 其他原因

/**
 * 执行节点失败详情
 */
export interface ExecutionFailure {
  reason: ExecutionFailureReason;
  detail: string;
  suggestion?: string;      // 给父规划节点的建议
}

// ========== 工具拆分 API 类型 ==========

/**
 * node_replace 输入 - 全量替换节点字段
 */
export interface NodeReplaceParams {
  workspaceId: string;
  nodeId: string;
  contentHash?: string;
  requirement?: string;
  conclusion?: string;
  notes?: string;
}

/**
 * node_edit 输入 - 精确字符串替换或行范围替换
 *
 * 替换模式：
 * - mode='string': 字符串精确替换，需提供 old_str + new_str
 * - mode='line_range': 行范围替换，需提供 lineStart + lineEnd + new_str
 *
 * 约束：
 * - old_str 和 lineStart/lineEnd 不能同时存在
 * - 行号从 1 开始
 */
export interface NodeEditParams {
  workspaceId: string;
  nodeId: string;
  contentHash?: string;
  field: 'requirement' | 'conclusion' | 'notes';

  /** 替换模式：字符串精确替换或行范围替换 */
  mode?: 'string' | 'line_range';

  /** 要替换的原文本（mode='string' 时必填） */
  old_str?: string;
  /** 替换后的文本 */
  new_str: string;

  /** 起始行号（mode='line_range' 时必填，从 1 开始） */
  lineStart?: number;
  /** 结束行号（mode='line_range' 时必填，包含该行） */
  lineEnd?: number;
}
