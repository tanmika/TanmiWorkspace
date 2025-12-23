// src/types/context.ts

import type { NodeStatus, AcceptanceCriteria } from "./node.js";
import type { DispatchConfig } from "./workspace.js";

/**
 * 文档引用（含状态）
 */
export interface DocRefWithStatus {
  path: string;
  description: string;
  status: "active" | "expired";
}

/**
 * 带类型的日志条目（Phase 2）
 */
export interface TypedLogEntry {
  timestamp: string;           // HH:mm 格式
  operator: "AI" | "Human";
  event: string;
}

/**
 * 上下文链项
 */
export interface ContextChainItem {
  nodeId: string;
  title: string;
  requirement: string;
  docs: DocRefWithStatus[];    // 仅包含 status == 'active' 的引用
  note: string;
  conclusion?: string;         // 已完成节点的结论
  problem?: string;
  logEntries?: TypedLogEntry[];     // 根据 maxLogEntries 截断后的日志
  acceptanceCriteria?: AcceptanceCriteria[];  // 验收标准
}

/**
 * 子节点结论项
 */
export interface ChildConclusionItem {
  nodeId: string;
  title: string;
  status: NodeStatus;
  conclusion: string;
}

/**
 * context_get 结果
 */
export interface ContextGetResult {
  workspace: {
    goal: string;
    rules: string[];
    rulesHash: string;           // 规则哈希（用于 node_create 验证）
    docs: DocRefWithStatus[];  // 仅包含 status == 'active' 的引用
    dispatch?: DispatchConfig;   // 派发配置（如果启用）
  };
  chain: ContextChainItem[];   // 从根到当前节点的上下文链
  references: ContextChainItem[]; // 跨节点引用（仅 active）
  childConclusions: ChildConclusionItem[]; // 子节点结论冒泡
  hint?: string;                // 工作流提示
  guidance?: string;            // 场景感知引导内容（L0 级别）
}

// ========== API 输入输出类型 ==========

/**
 * context_get 输入
 */
export interface ContextGetParams {
  workspaceId: string;
  nodeId: string;
  includeLog?: boolean;       // 默认 true
  maxLogEntries?: number;     // 默认 20
  reverseLog?: boolean;       // 默认 false
  includeProblem?: boolean;   // 默认 true
}

/**
 * context_focus 输入
 */
export interface ContextFocusParams {
  workspaceId: string;
  nodeId: string;
}

/**
 * context_focus 输出
 */
export interface ContextFocusResult {
  success: boolean;
  previousFocus: string | null;
  currentFocus: string;
}

/**
 * node_isolate 输入
 */
export interface NodeIsolateParams {
  workspaceId: string;
  nodeId: string;
  isolate: boolean;
}

/**
 * node_isolate 输出
 */
export interface NodeIsolateResult {
  success: boolean;
}

/**
 * node_reference 操作类型
 */
export type ReferenceAction = "add" | "remove" | "expire" | "activate";

/**
 * node_reference 输入
 */
export interface NodeReferenceParams {
  workspaceId: string;
  nodeId: string;
  targetIdOrPath: string;
  action: ReferenceAction;
  description?: string;
}

/**
 * node_reference 输出
 */
export interface NodeReferenceResult {
  success: boolean;
  references: DocRefWithStatus[];
}

// ========== 日志和问题 API 类型 ==========

/**
 * log_append 输入
 */
export interface LogAppendParams {
  workspaceId: string;
  nodeId?: string;            // 为空则追加到全局日志
  operator: "AI" | "Human";
  event: string;
}

/**
 * log_append 输出
 */
export interface LogAppendResult {
  success: boolean;
  timestamp: string;
  hint?: string;
}

/**
 * problem_update 输入
 */
export interface ProblemUpdateParams {
  workspaceId: string;
  nodeId?: string;
  problem: string;
  nextStep?: string;
}

/**
 * problem_update 输出
 */
export interface ProblemUpdateResult {
  success: boolean;
  hint?: string;
}

/**
 * problem_clear 输入
 */
export interface ProblemClearParams {
  workspaceId: string;
  nodeId?: string;
}

/**
 * problem_clear 输出
 */
export interface ProblemClearResult {
  success: boolean;
}
