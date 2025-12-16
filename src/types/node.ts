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
  | "validation"       // 验证：预留，用于验证类任务
  | "summary";         // 汇总：预留，用于汇总类任务

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
}

/**
 * 节点元数据
 */
export interface NodeMeta {
  id: string;
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
}

/**
 * node_create 输出
 */
export interface NodeCreateResult {
  nodeId: string;
  path: string;
  autoReopened?: string; // 如果父节点被自动 reopen，返回父节点 ID
  hint?: string;
  actionRequired?: ActionRequired;  // AI 必须执行的行为
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
 * node_transition 输入
 */
export interface NodeTransitionParams {
  workspaceId: string;
  nodeId: string;
  action: TransitionAction;
  reason?: string;
  conclusion?: string;    // complete/fail 时必填
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
