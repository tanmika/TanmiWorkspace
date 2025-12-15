// src/utils/sessionLogger.ts
// 会话级别日志记录器 - 仅在 DEV 模式下将 MCP 调用记录到文件

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
const DIR_SUFFIX = IS_DEV ? "-dev" : "";
const TANMI_HOME = path.join(os.homedir(), `.tanmi-workspace${DIR_SUFFIX}`);
const LOGS_DIR = path.join(TANMI_HOME, "logs");
const MAX_LOG_FILES = 50;

/**
 * 确保日志目录存在
 */
function ensureLogsDir(): boolean {
  if (!IS_DEV) return false;

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
 * 获取日志文件路径
 */
function getLogFilePath(sessionId: string | undefined): string {
  const fileName = sessionId ? `${sessionId}.log` : "default.log";
  return path.join(LOGS_DIR, fileName);
}

/**
 * 格式化时间戳
 */
function formatTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 清理旧日志文件，保留最新的 MAX_LOG_FILES 个
 */
function rotateLogsIfNeeded(): void {
  if (!IS_DEV) return;

  try {
    if (!fs.existsSync(LOGS_DIR)) return;

    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith(".log"))
      .map(f => ({
        name: f,
        path: path.join(LOGS_DIR, f),
        mtime: fs.statSync(path.join(LOGS_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime); // 按修改时间降序

    // 删除超出限制的旧文件
    if (files.length > MAX_LOG_FILES) {
      const toDelete = files.slice(MAX_LOG_FILES);
      for (const file of toDelete) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // 忽略删除失败
        }
      }
    }
  } catch {
    // 忽略轮转错误
  }
}

/**
 * 写入日志
 */
function log(sessionId: string | undefined, type: string, event: string, data: Record<string, unknown> = {}): void {
  if (!IS_DEV) return;
  if (!ensureLogsDir()) return;

  try {
    const logPath = getLogFilePath(sessionId);
    const timestamp = formatTimestamp();
    const logLine = `[${timestamp}] [${type.toUpperCase()}] ${event}: ${JSON.stringify(data)}\n`;

    fs.appendFileSync(logPath, logLine, "utf-8");

    // 每次写入后检查是否需要轮转
    rotateLogsIfNeeded();
  } catch {
    // 静默失败，不影响主流程
  }
}

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
  log(currentSessionId, "mcp", `${toolName}:start`, { params });
}

/**
 * 记录 MCP 工具调用结束
 */
export function logMcpEnd(toolName: string, success: boolean, result: unknown, durationMs: number = 0): void {
  const resultStr = typeof result === "object" ? JSON.stringify(result) : String(result);
  const details = {
    success,
    result: resultStr.length > 500 ? resultStr.slice(0, 500) + "..." : resultStr,
    durationMs
  };
  log(currentSessionId, "mcp", `${toolName}:end`, details);
}

/**
 * 记录错误
 */
export function logMcpError(toolName: string, error: Error | string): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  log(currentSessionId, "error", toolName, { error: errorMsg });
}

export const sessionLogger = {
  setCurrentSessionId,
  getCurrentSessionId,
  logMcpStart,
  logMcpEnd,
  logMcpError,
};
