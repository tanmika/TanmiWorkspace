// src/utils/sessionLogger.ts
// 会话级别日志记录器
// - 有 sessionId：写入 {sessionId}.log
// - 无 sessionId：写入 system.log

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { logger } from "./logger.js";

const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
const DIR_SUFFIX = IS_DEV ? "-dev" : "";
const TANMI_HOME = path.join(os.homedir(), `.tanmi-workspace${DIR_SUFFIX}`);
const LOGS_DIR = path.join(TANMI_HOME, "logs");

// 当前活跃的 sessionId（从 session_bind/session_status 调用中提取）
let currentSessionId: string | undefined;

/**
 * 确保日志目录存在
 */
function ensureLogsDir(): boolean {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 写入会话专属日志
 */
function writeToSessionLog(sessionId: string, type: string, event: string, data: object): void {
  if (!ensureLogsDir()) return;

  try {
    const logPath = path.join(LOGS_DIR, `${sessionId}.log`);
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${type}] ${event}: ${JSON.stringify(data)}\n`;
    fs.appendFileSync(logPath, line, "utf-8");
  } catch {
    // 静默失败
  }
}

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

  const data = {
    event: "start",
    tool: toolName,
    params,
  };

  if (currentSessionId) {
    // 有 sessionId：写入会话日志
    writeToSessionLog(currentSessionId, "MCP", `${toolName}:start`, { params });
  } else {
    // 无 sessionId：写入 system.log
    logger.info("mcp", { ...data, sessionId: undefined });
  }
}

/**
 * 记录 MCP 工具调用结束
 */
export function logMcpEnd(toolName: string, success: boolean, result: unknown, durationMs: number = 0): void {
  const resultStr = typeof result === "object" ? JSON.stringify(result) : String(result);
  const truncatedResult = resultStr.length > 500 ? resultStr.slice(0, 500) + "..." : resultStr;

  if (currentSessionId) {
    // 有 sessionId：写入会话日志
    writeToSessionLog(currentSessionId, "MCP", `${toolName}:end`, {
      success,
      result: truncatedResult,
      durationMs,
    });
  } else {
    // 无 sessionId：写入 system.log
    const data = {
      event: "end",
      tool: toolName,
      sessionId: undefined,
      success,
      result: truncatedResult,
      durationMs,
    };
    if (success) {
      logger.info("mcp", data);
    } else {
      logger.error("mcp", data);
    }
  }
}

/**
 * 记录错误
 */
export function logMcpError(toolName: string, error: Error | string): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  if (currentSessionId) {
    // 有 sessionId：写入会话日志
    writeToSessionLog(currentSessionId, "MCP", `${toolName}:error`, {
      error: errorMsg,
      stack: errorStack,
    });
  } else {
    // 无 sessionId：写入 system.log
    logger.error("mcp", {
      event: "error",
      tool: toolName,
      sessionId: undefined,
      error: errorMsg,
      stack: errorStack,
    });
  }
}

export const sessionLogger = {
  setCurrentSessionId,
  getCurrentSessionId,
  logMcpStart,
  logMcpEnd,
  logMcpError,
};
