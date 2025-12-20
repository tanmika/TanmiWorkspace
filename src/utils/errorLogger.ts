// src/utils/errorLogger.ts
// 错误日志记录器 - 记录运行时严重错误，方便排查

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
const DIR_SUFFIX = IS_DEV ? "-dev" : "";
const TANMI_HOME = path.join(os.homedir(), `.tanmi-workspace${DIR_SUFFIX}`);
const ERROR_LOG_PATH = path.join(TANMI_HOME, "error.log");
const MAX_LOG_SIZE = 500 * 1024; // 500KB

/**
 * 错误类型
 */
export type ErrorType =
  | "dir_missing"        // 工作区目录不存在
  | "config_corrupted"   // workspace.json 损坏
  | "graph_corrupted"    // graph.json 损坏
  | "index_corrupted"    // index.json 损坏
  | "version_too_high"   // 数据版本过高
  | "unknown";           // 未知错误

/**
 * 确保日志目录存在
 */
function ensureLogDir(): boolean {
  try {
    if (!fs.existsSync(TANMI_HOME)) {
      fs.mkdirSync(TANMI_HOME, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 格式化时间戳
 */
function formatTimestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/**
 * 检查并轮转日志文件
 * 当文件超过 MAX_LOG_SIZE 时，保留最后 50% 的内容
 */
function rotateLogIfNeeded(): void {
  try {
    if (!fs.existsSync(ERROR_LOG_PATH)) return;

    const stats = fs.statSync(ERROR_LOG_PATH);
    if (stats.size <= MAX_LOG_SIZE) return;

    // 读取文件，保留后半部分
    const content = fs.readFileSync(ERROR_LOG_PATH, "utf-8");
    const lines = content.split("\n");
    const keepLines = lines.slice(Math.floor(lines.length / 2));

    // 写回文件，添加轮转标记
    const rotatedContent = `--- Log rotated at ${formatTimestamp()} ---\n${keepLines.join("\n")}`;
    fs.writeFileSync(ERROR_LOG_PATH, rotatedContent, "utf-8");
  } catch {
    // 轮转失败不影响主流程
  }
}

/**
 * 记录错误日志
 * @param errorType 错误类型
 * @param workspaceId 工作区 ID（可选）
 * @param message 详细错误信息
 * @param extra 额外信息
 */
export function logError(
  errorType: ErrorType,
  workspaceId: string | undefined,
  message: string,
  extra?: Record<string, unknown>
): void {
  if (!ensureLogDir()) return;

  try {
    const timestamp = formatTimestamp();
    const wsId = workspaceId || "-";
    const extraStr = extra ? ` | ${JSON.stringify(extra)}` : "";
    const logLine = `${timestamp} | ${errorType} | ${wsId} | ${message}${extraStr}\n`;

    fs.appendFileSync(ERROR_LOG_PATH, logLine, "utf-8");

    // 检查是否需要轮转
    rotateLogIfNeeded();
  } catch {
    // 静默失败，不影响主流程
  }
}

/**
 * 读取错误日志（用于排查）
 * @param limit 最多返回多少行，默认 100
 */
export function readErrorLog(limit = 100): string[] {
  try {
    if (!fs.existsSync(ERROR_LOG_PATH)) return [];

    const content = fs.readFileSync(ERROR_LOG_PATH, "utf-8");
    const lines = content.split("\n").filter(line => line.trim());

    // 返回最后 limit 行
    return lines.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * 获取错误日志路径
 */
export function getErrorLogPath(): string {
  return ERROR_LOG_PATH;
}

export const errorLogger = {
  logError,
  readErrorLog,
  getErrorLogPath,
};
