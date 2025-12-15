// src/utils/devLog.ts
// DEV 模式详细日志工具

const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";

type LogLevel = "debug" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

/**
 * DEV 模式日志工具
 * 仅在开发模式下输出，帮助调试难以定位的问题
 */
export const devLog = {
  /**
   * 调试信息
   */
  debug(message: string, context?: LogContext): void {
    if (!IS_DEV) return;
    console.error(`[DEV:DEBUG] ${message}`, context ? JSON.stringify(context, null, 2) : "");
  },

  /**
   * 警告信息
   */
  warn(message: string, context?: LogContext): void {
    if (!IS_DEV) return;
    console.error(`[DEV:WARN] ${message}`, context ? JSON.stringify(context, null, 2) : "");
  },

  /**
   * 错误信息（总是输出，但 DEV 模式下更详细）
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorInfo = error instanceof Error
      ? { name: error.name, message: error.message, stack: IS_DEV ? error.stack : undefined }
      : { raw: String(error) };

    console.error(`[DEV:ERROR] ${message}`, JSON.stringify({ error: errorInfo, ...context }, null, 2));
  },

  /**
   * 文件操作错误（路径相关问题的关键日志）
   */
  fileError(operation: string, filePath: string, error: Error | unknown): void {
    if (!IS_DEV) return;
    const code = (error as NodeJS.ErrnoException)?.code;
    console.error(`[DEV:FILE] ${operation} failed`, JSON.stringify({
      path: filePath,
      errorCode: code,
      message: error instanceof Error ? error.message : String(error),
    }, null, 2));
  },

  /**
   * 归档路径决策日志
   */
  archivePath(workspaceId: string, isArchived: boolean, resolvedPath: string): void {
    if (!IS_DEV) return;
    console.error(`[DEV:ARCHIVE] Path resolved`, JSON.stringify({
      workspaceId,
      isArchived,
      resolvedPath,
    }, null, 2));
  },

  /**
   * 工作区查找日志
   */
  workspaceLookup(workspaceId: string, found: boolean, status?: string): void {
    if (!IS_DEV) return;
    console.error(`[DEV:WORKSPACE] Lookup`, JSON.stringify({
      workspaceId,
      found,
      status: status || "N/A",
    }, null, 2));
  },
};
