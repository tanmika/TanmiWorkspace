// src/types/node.ts

import type { DocRef } from "./workspace.js";

/**
 * 节点状态
 */
export type NodeStatus =
  | "pending"       // 待执行
  | "implementing"  // 执行中
  | "validating"    // 验证中
  | "completed"     // 已完成
  | "failed";       // 失败

/**
 * 状态转换动作
 */
export type TransitionAction =
  | "start"      // pending → implementing
  | "submit"     // implementing → validating
  | "complete"   // implementing/validating → completed
  | "fail"       // validating → failed
  | "retry"      // failed → implementing
  | "reopen";    // completed → implementing（用于重新激活已完成节点）

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
  parentId: string | null;          // 根节点为 null
  children: string[];               // 子节点 ID 列表
  status: NodeStatus;
  isolate: boolean;                 // 是否切断上下文继承
  references: string[];             // 跨节点引用的 ID 列表
  conclusion: string | null;        // 节点完成时的结论
  createdAt: string;
  updatedAt: string;
}

/**
 * 节点 Info.md 数据结构
 */
export interface NodeInfoData {
  id: string;
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
  title: string;
  status: NodeStatus;
  children: NodeTreeItem[];
}

// ========== API 输入输出类型 ==========

/**
 * node_create 输入
 */
export interface NodeCreateParams {
  workspaceId: string;
  parentId: string;
  title: string;
  requirement?: string;
  docs?: DocRef[];
}

/**
 * node_create 输出
 */
export interface NodeCreateResult {
  nodeId: string;
  path: string;
  hint?: string;
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
}

// ========== Phase 3: 节点分裂与更新 ==========

/**
 * node_split 输入
 */
export interface NodeSplitParams {
  workspaceId: string;
  parentId: string;           // 当前节点 ID（将成为父节点）
  title: string;
  requirement: string;
  inheritContext?: boolean;   // 是否继承上下文，默认 true
  docs?: DocRef[];            // 派发给子节点的文档引用
}

/**
 * node_split 输出
 */
export interface NodeSplitResult {
  nodeId: string;
  path: string;
  hint?: string;
}

/**
 * node_update 输入
 */
export interface NodeUpdateParams {
  workspaceId: string;
  nodeId: string;
  title?: string;
  requirement?: string;
  note?: string;
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
