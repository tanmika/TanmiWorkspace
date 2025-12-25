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
  | "info_collection"  // 信息收集：调研、分析，完成时自动归档到工作区规则和文档
  | "info_summary"     // 信息总结：从已有信息中提取结构化内容
  | "validation";      // 验证：预留，用于验证类任务

/**
 * 验收标准 - WHEN/THEN 格式
 */
export interface AcceptanceCriteria {
  when: string;   // 触发条件，如 "用户点击登录按钮"
  then: string;   // 期望结果，如 "显示登录成功提示"
}

/**
 * 节点派发状态 - 用于跟踪派发执行进度
 */
export type NodeDispatchStatus =
  | "pending"          // 等待派发
  | "executing"        // subagent 执行中
  | "testing"          // 测试节点验证中
  | "passed"           // 测试通过
  | "failed";          // 执行失败或测试失败

/**
 * 节点派发信息 - 仅执行节点使用
 */
export interface NodeDispatchInfo {
  startMarker: string;              // Git 模式=commit hash，无 Git 模式=时间戳
  endMarker?: string;               // Git 模式=commit hash，无 Git 模式=时间戳
  status: NodeDispatchStatus;       // 派发状态
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
  role?: NodeRole;                  // 节点角色（可选）
  // executor?: NodeExecutor;       // 执行者（预留，用于子 agent 派发）
  createdAt: string;
  updatedAt: string;

  // ===== 验收标准（可选）=====
  acceptanceCriteria?: AcceptanceCriteria[];  // 验收标准（WHEN/THEN 格式）

  // ===== 派发相关字段（可选）=====
  dispatch?: NodeDispatchInfo;      // 派发信息（仅执行节点使用）
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
 * node_update 输入
 */
export interface NodeUpdateParams {
  workspaceId: string;
  nodeId: string;
  title?: string;
  requirement?: string;
  note?: string;
  conclusion?: string;
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
