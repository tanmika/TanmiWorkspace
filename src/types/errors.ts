// src/types/errors.ts

/**
 * 错误码定义
 */
export const ErrorCodes = {
  // 工作区错误
  WORKSPACE_EXISTS: "WORKSPACE_EXISTS",
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",
  WORKSPACE_ACTIVE: "WORKSPACE_ACTIVE",
  INVALID_NAME: "INVALID_NAME",
  INVALID_PATH: "INVALID_PATH",
  INIT_FAILED: "INIT_FAILED",

  // 节点错误
  NODE_NOT_FOUND: "NODE_NOT_FOUND",
  PARENT_NOT_FOUND: "PARENT_NOT_FOUND",
  INVALID_TITLE: "INVALID_TITLE",
  CANNOT_DELETE_ROOT: "CANNOT_DELETE_ROOT",

  // 状态转换错误
  INVALID_TRANSITION: "INVALID_TRANSITION",
  CONCLUSION_REQUIRED: "CONCLUSION_REQUIRED",
  INFO_COLLECTION_REQUIRED: "INFO_COLLECTION_REQUIRED",

  // 引用错误
  REFERENCE_NOT_FOUND: "REFERENCE_NOT_FOUND",
  REFERENCE_EXISTS: "REFERENCE_EXISTS",

  // 日志错误
  LOG_APPEND_FAILED: "LOG_APPEND_FAILED",

  // 节点类型错误
  INVALID_NODE_TYPE: "INVALID_NODE_TYPE",
  EXECUTION_CANNOT_HAVE_CHILDREN: "EXECUTION_CANNOT_HAVE_CHILDREN",
  INVALID_PARENT_STATUS: "INVALID_PARENT_STATUS",
  INCOMPLETE_CHILDREN: "INCOMPLETE_CHILDREN",
  RULES_HASH_MISMATCH: "RULES_HASH_MISMATCH",
  INVALID_PARAMS: "INVALID_PARAMS",

  // 校验错误
  GRAPH_CORRUPTED: "GRAPH_CORRUPTED",
  NODE_DIR_MISSING: "NODE_DIR_MISSING",
  NODE_INFO_MISSING: "NODE_INFO_MISSING",
} as const;

/**
 * 错误码类型
 */
export type ErrorCode = keyof typeof ErrorCodes;

/**
 * 自定义错误类
 */
export class TanmiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = "TanmiError";
  }
}

/**
 * 错误消息映射
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  WORKSPACE_EXISTS: "工作区已存在",
  WORKSPACE_NOT_FOUND: "工作区不存在",
  WORKSPACE_ACTIVE: "工作区处于活动状态，无法删除（使用 force 强制删除）",
  INVALID_NAME: "名称不合法，不能包含特殊字符: / \\ : * ? \" < > |",
  INVALID_PATH: "路径不合法或不存在",
  INIT_FAILED: "工作区初始化失败",
  NODE_NOT_FOUND: "节点不存在",
  PARENT_NOT_FOUND: "父节点不存在",
  INVALID_TITLE: "标题不合法，不能包含特殊字符: / \\ : * ? \" < > |",
  CANNOT_DELETE_ROOT: "无法删除根节点",
  INVALID_TRANSITION: "非法状态转换",
  CONCLUSION_REQUIRED: "complete/fail 动作必须提供 conclusion",
  INFO_COLLECTION_REQUIRED: "根节点 start 前必须完成信息收集节点",
  REFERENCE_NOT_FOUND: "引用不存在",
  REFERENCE_EXISTS: "引用已存在",
  LOG_APPEND_FAILED: "日志追加失败",
  INVALID_NODE_TYPE: "节点类型无效，必须是 planning 或 execution",
  EXECUTION_CANNOT_HAVE_CHILDREN: "执行节点不能创建子节点",
  INVALID_PARENT_STATUS: "父节点状态不允许创建子节点",
  INCOMPLETE_CHILDREN: "存在未完成的子节点",
  RULES_HASH_MISMATCH: "规则哈希不匹配，请先获取最新规则",
  INVALID_PARAMS: "参数无效",
  GRAPH_CORRUPTED: "节点图数据损坏",
  NODE_DIR_MISSING: "节点目录不存在",
  NODE_INFO_MISSING: "节点 Info.md 不存在",
};
