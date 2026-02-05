// src/types/change.ts

/**
 * 客户端类型
 */
export type ChangeClient = "claude-code" | "cursor" | "opencode";

/**
 * 变更操作类型 - 添加文件
 */
export interface ChangeOperationAdd {
  type: "add";
  filePath: string;
  content: string;
}

/**
 * 变更操作类型 - 删除文件
 */
export interface ChangeOperationDelete {
  type: "delete";
  filePath: string;
}

/**
 * 变更操作类型 - 更新文件（精确替换）
 */
export interface ChangeOperationUpdate {
  type: "update";
  filePath: string;
  oldLines: string[];           // 被替换的行（用于回滚时匹配）
  newLines: string[];           // 替换后的行
  lineNumber?: number;          // 原始行号（可选，辅助定位）
  contextBefore?: string[];     // 上下文（前 N 行）
  contextAfter?: string[];      // 上下文（后 N 行）
}

/**
 * 变更操作类型 - 覆盖文件（罕见，无法精确回滚）
 */
export interface ChangeOperationOverwrite {
  type: "overwrite";
  filePath: string;
  originalContent?: string;     // 原始内容（如果可获取）
  newContent?: string;          // 新内容（如果可获取）
}

/**
 * 变更操作联合类型
 */
export type ChangeOperation =
  | ChangeOperationAdd
  | ChangeOperationDelete
  | ChangeOperationUpdate
  | ChangeOperationOverwrite;

/**
 * 单次变更记录
 */
export interface ChangeRecord {
  id: string;                   // "chg-{timestamp}-{random}"
  nodeId: string | null;        // 归属节点，null 表示在 ambiguous
  timestamp: string;            // ISO 时间
  sessionId: string;            // 来源会话
  client: ChangeClient;         // 客户端类型
  operation: ChangeOperation;   // 变更操作
}

/**
 * 文件索引条目
 */
export interface FileIndexEntry {
  nodeId: string;
  changeId: string;
}

/**
 * 变更序列条目
 */
export interface ChangeSequenceEntry {
  nodeId: string | null;
  changeId: string;
}

/**
 * 变更索引（全局索引文件）
 */
export interface ChangesIndex {
  version: number;                                      // Schema 版本
  ambiguous: string[];                                  // 待认领的 changeId 列表
  fileIndex: Record<string, FileIndexEntry[]>;          // 文件路径 -> 变更记录列表
  sequence: ChangeSequenceEntry[];                      // 时间顺序的变更记录
}

// ========== API 输入输出类型 ==========

/**
 * change_claim 输入
 */
export interface ChangeClaimParams {
  workspaceId: string;
  nodeId: string;
  changeIds: string[];
}

/**
 * change_claim 输出
 */
export interface ChangeClaimResult {
  success: boolean;
  claimedCount: number;
  failedIds?: string[];           // 认领失败的 ID（不在 ambiguous 中）
}

/**
 * change_transfer 输入
 */
export interface ChangeTransferParams {
  workspaceId: string;
  changeId: string;
  toNodeId: string;
}

/**
 * change_transfer 输出
 */
export interface ChangeTransferResult {
  success: boolean;
  previousNodeId: string | null;
}

/**
 * change_list 输入
 */
export interface ChangeListParams {
  workspaceId: string;
  nodeId?: string;                // 不传查 ambiguous，传则查该节点
}

/**
 * change_list 输出
 */
export interface ChangeListResult {
  changes: ChangeRecord[];
  totalCount: number;
}

/**
 * 单个变更回滚结果
 */
export interface ChangeRevertItemResult {
  changeId: string;
  success: boolean;
  patchFile?: string;             // 失败时的 patch 文件路径
  reason?: string;                // 失败原因
}

/**
 * change_revert 输入
 */
export interface ChangeRevertParams {
  workspaceId: string;
  changeIds: string[];
}

/**
 * change_revert 输出
 */
export interface ChangeRevertResult {
  success: boolean;               // 全部成功为 true
  results: ChangeRevertItemResult[];
}

/**
 * 记录变更的输入参数（内部使用）
 */
export interface RecordChangeParams {
  workspaceId: string;
  sessionId: string;
  client: ChangeClient;
  operation: ChangeOperation;
  nodeId?: string;                // 指定归属节点，不传则自动判断
}

/**
 * 记录变更的输出结果（内部使用）
 */
export interface RecordChangeResult {
  changeId: string;
  nodeId: string | null;          // 实际归属的节点，null 表示在 ambiguous
  isAmbiguous: boolean;
}
