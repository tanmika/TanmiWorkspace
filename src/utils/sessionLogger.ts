// src/utils/sessionLogger.ts
// 会话级别日志记录器 - 使用统一 Logger 记录 MCP 调用

import { logger } from "./logger.js";

// 当前活跃的 sessionId（从 session_bind/session_status 调用中提取）
let currentSessionId: string | undefined;

/**
 * 设置当前会话 ID
 */
export function setCurrentSessionId(sessionId: string | undefined): void {
  currentSessionId = sessionId;
}

/**
 * 获取当前会话 ID
 */
export function getCurrentSessionId(): string | undefined {
  return currentSessionId;
}

/**
 * 记录 MCP 工具调用开始
 */
export function logMcpStart(toolName: string, params: Record<string, unknown> = {}): void {
  // 尝试从参数中提取 sessionId
  if (params.sessionId && typeof params.sessionId === "string") {
    currentSessionId = params.sessionId;
  }
  logger.info("mcp", {
    event: "start",
    tool: toolName,
    sessionId: currentSessionId,
    params,
  });
}

/**
 * 记录 MCP 工具调用结束
 */
export function logMcpEnd(toolName: string, success: boolean, result: unknown, durationMs: number = 0): void {
  const resultStr = typeof result === "object" ? JSON.stringify(result) : String(result);
  const truncatedResult = resultStr.length > 500 ? resultStr.slice(0, 500) + "..." : resultStr;

  if (success) {
    logger.info("mcp", {
      event: "end",
      tool: toolName,
      sessionId: currentSessionId,
      success,
      result: truncatedResult,
      durationMs,
    });
  } else {
    logger.error("mcp", {
      event: "end",
      tool: toolName,
      sessionId: currentSessionId,
      success,
      result: truncatedResult,
      durationMs,
    });
  }
}

/**
 * 记录错误
 */
export function logMcpError(toolName: string, error: Error | string): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  logger.error("mcp", {
    event: "error",
    tool: toolName,
    sessionId: currentSessionId,
    error: errorMsg,
    stack: errorStack,
  });
}

export const sessionLogger = {
  setCurrentSessionId,
  getCurrentSessionId,
  logMcpStart,
  logMcpEnd,
  logMcpError,
};
