// src/types/confirmation.ts

/**
 * Confirmation Token - 用于确保 AI 必须等待真实用户输入
 * 当 actionRequired 触发时，系统会生成一个 token，AI 必须携带此 token + 用户真实输入才能继续
 */
export interface ConfirmationToken {
  token: string;                    // 唯一标识符
  createdAt: string;                // ISO 8601 时间戳
  expiresAt: string;                // 过期时间（ISO 8601）
  context: string;                  // token 关联的上下文描述
}

/**
 * 待确认状态 - 当需要用户确认时的状态数据
 */
export interface PendingConfirmation {
  workspaceId: string;              // 工作区 ID
  nodeId?: string;                  // 节点 ID（可选）
  token: ConfirmationToken;         // 确认 token
  actionType: string;               // 触发确认的动作类型（如 ask_user, show_plan）
  message: string;                  // 提示用户的消息
  data?: Record<string, unknown>;   // 附加数据
}

/**
 * 确认结果 - 用户提供确认后的结果
 */
export interface ConfirmationResult {
  token: string;                    // 提供的 token
  valid: boolean;                   // token 是否有效
  userInput?: string;               // 用户的真实输入（如果 valid 为 true）
  reason?: string;                  // 如果无效，说明原因（如 expired, not_found, already_used）
}

/**
 * Token 验证状态
 */
export type TokenValidationStatus =
  | "valid"           // token 有效
  | "expired"         // token 已过期
  | "not_found"       // token 不存在
  | "already_used";   // token 已被使用
