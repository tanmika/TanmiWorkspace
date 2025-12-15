/**
 * Tanmi-Workspace 日志模块
 *
 * 功能：
 * - 仅在 dev 模式下记录日志
 * - 按会话 ID 分文件记录
 * - 自动轮转，最多保留 50 个日志文件
 */

const fs = require('node:fs');
const path = require('node:path');
const { IS_DEV, TANMI_HOME } = require('./config.cjs');

// 日志目录
const LOGS_DIR = path.join(TANMI_HOME, 'logs');

// 最大日志文件数
const MAX_LOG_FILES = 50;

/**
 * 确保日志目录存在
 */
function ensureLogsDir() {
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
 * @param {string} sessionId - 会话 ID
 * @returns {string} 日志文件路径
 */
function getLogFilePath(sessionId) {
  const fileName = sessionId ? `${sessionId}.log` : 'default.log';
  return path.join(LOGS_DIR, fileName);
}

/**
 * 格式化时间戳
 * @returns {string} 格式化的时间戳
 */
function formatTimestamp() {
  return new Date().toISOString();
}

/**
 * 清理旧日志文件，保留最新的 MAX_LOG_FILES 个
 */
function rotateLogsIfNeeded() {
  if (!IS_DEV) return;

  try {
    if (!fs.existsSync(LOGS_DIR)) return;

    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.log'))
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
 * @param {string} sessionId - 会话 ID（可选）
 * @param {string} type - 日志类型 (hook/mcp)
 * @param {string} event - 事件名称
 * @param {object} data - 日志数据
 */
function log(sessionId, type, event, data = {}) {
  if (!IS_DEV) return;

  if (!ensureLogsDir()) return;

  try {
    const logPath = getLogFilePath(sessionId);
    const timestamp = formatTimestamp();

    const logLine = `[${timestamp}] [${type.toUpperCase()}] ${event}: ${JSON.stringify(data)}\n`;

    fs.appendFileSync(logPath, logLine, 'utf-8');

    // 每次写入后检查是否需要轮转
    rotateLogsIfNeeded();
  } catch {
    // 静默失败，不影响主流程
  }
}

/**
 * 记录 Hook 调用
 * @param {string} sessionId - 会话 ID
 * @param {string} hookEvent - Hook 事件类型
 * @param {object} details - 详细信息
 */
function logHook(sessionId, hookEvent, details = {}) {
  log(sessionId, 'hook', hookEvent, details);
}

/**
 * 记录 MCP 工具调用开始
 * @param {string} sessionId - 会话 ID
 * @param {string} toolName - 工具名称
 * @param {object} params - 调用参数
 */
function logMcpStart(sessionId, toolName, params = {}) {
  log(sessionId, 'mcp', `${toolName}:start`, { params });
}

/**
 * 记录 MCP 工具调用结束
 * @param {string} sessionId - 会话 ID
 * @param {string} toolName - 工具名称
 * @param {boolean} success - 是否成功
 * @param {any} result - 调用结果（截断）
 * @param {number} durationMs - 耗时（毫秒）
 */
function logMcpEnd(sessionId, toolName, success, result, durationMs = 0) {
  const resultStr = typeof result === 'object' ? JSON.stringify(result) : String(result);
  const details = {
    success,
    result: resultStr.length > 500 ? resultStr.slice(0, 500) + '...' : resultStr,
    durationMs
  };
  log(sessionId, 'mcp', `${toolName}:end`, details);
}

/**
 * 记录错误
 * @param {string} sessionId - 会话 ID
 * @param {string} context - 错误上下文
 * @param {Error|string} error - 错误信息
 */
function logError(sessionId, context, error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  log(sessionId, 'error', context, { error: errorMsg });
}

module.exports = {
  LOGS_DIR,
  MAX_LOG_FILES,
  log,
  logHook,
  logMcpStart,
  logMcpEnd,
  logError,
  rotateLogsIfNeeded
};
