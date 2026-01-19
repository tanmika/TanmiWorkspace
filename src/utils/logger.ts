// src/utils/logger.ts
// 统一日志记录工具 - JSON Lines 格式，异步写入

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
const DIR_SUFFIX = IS_DEV ? "-dev" : "";
const TANMI_HOME = path.join(os.homedir(), `.tanmi-workspace${DIR_SUFFIX}`);
const LOGS_DIR = path.join(TANMI_HOME, "logs");
const SYSTEM_LOG_PATH = path.join(LOGS_DIR, "system.log");
const CONFIG_PATH = path.join(TANMI_HOME, "config.json");

// 日志轮转配置
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 10; // 最多保留 10 个文件

export type LogLevel = "debug" | "info" | "warn" | "error";

// 日志级别优先级映射
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// 默认日志级别
const DEFAULT_LOG_LEVEL: LogLevel = "info";

// 配置缓存
let cachedLogLevel: LogLevel = DEFAULT_LOG_LEVEL;
let configLoaded = false;

/**
 * 异步加载日志级别配置
 * 在模块加载时调用，配置就绪前使用默认级别
 */
async function loadLogLevelConfig(): Promise<void> {
  try {
    const content = await fs.promises.readFile(CONFIG_PATH, "utf-8");
    const config = JSON.parse(content);

    // 验证 logLevel 是否有效
    if (config.logLevel && LOG_LEVEL_PRIORITY[config.logLevel as LogLevel] !== undefined) {
      cachedLogLevel = config.logLevel as LogLevel;
    }
  } catch {
    // 配置文件不存在或读取失败，使用默认级别
    cachedLogLevel = DEFAULT_LOG_LEVEL;
  }
  configLoaded = true;
}

/**
 * 检查日志级别是否应该被记录
 * @param level 当前日志级别
 * @returns 是否应该记录
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[cachedLogLevel];
}

// 模块加载时异步初始化配置（不阻塞）
// 注意：配置加载是异步的，在配置就绪前（通常几毫秒内）的日志将使用默认级别 'info'
// 这是故意的设计：避免同步 IO 阻塞模块加载，且影响范围极小
loadLogLevelConfig();

export interface LogEntry {
  ts: string;      // ISO 时间戳
  level: LogLevel;
  source: string;  // 来源标识，如 'mcp', 'client', 'system'
  [key: string]: unknown; // 其他动态字段
}

/**
 * 写入队列，用于处理并发写入
 */
let writeQueue: Promise<void> = Promise.resolve();
let dirEnsured = false;

/**
 * 确保日志目录存在
 */
function ensureLogDir(): boolean {
  if (dirEnsured) return true;

  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    dirEnsured = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取轮转日志文件路径
 * @param index 轮转索引，0 表示 system.log，1-9 表示 system.1.log - system.9.log
 */
function getRotatedLogPath(index: number): string {
  if (index === 0) {
    return SYSTEM_LOG_PATH;
  }
  return path.join(LOGS_DIR, `system.${index}.log`);
}

/**
 * 检查是否需要轮转日志文件
 */
function shouldRotate(): boolean {
  try {
    if (!fs.existsSync(SYSTEM_LOG_PATH)) {
      return false;
    }
    const stats = fs.statSync(SYSTEM_LOG_PATH);
    return stats.size >= MAX_LOG_SIZE;
  } catch {
    return false;
  }
}

/**
 * 执行日志轮转（同步方式）
 * 轮转流程:
 * 1. 删除 system.9.log (如果存在)
 * 2. system.8.log → system.9.log
 * 3. system.7.log → system.8.log
 * ...
 * 4. system.1.log → system.2.log
 * 5. system.log → system.1.log
 * 6. 创建新的空 system.log
 */
function rotateLogsSync(): void {
  try {
    // 删除最旧的日志文件 (system.9.log)
    const oldestLogPath = getRotatedLogPath(MAX_LOG_FILES - 1);
    if (fs.existsSync(oldestLogPath)) {
      fs.unlinkSync(oldestLogPath);
    }

    // 从最旧的开始，依次重命名文件
    // system.8.log → system.9.log, system.7.log → system.8.log, ...
    for (let i = MAX_LOG_FILES - 2; i >= 1; i--) {
      const currentPath = getRotatedLogPath(i);
      const nextPath = getRotatedLogPath(i + 1);
      if (fs.existsSync(currentPath)) {
        fs.renameSync(currentPath, nextPath);
      }
    }

    // system.log → system.1.log
    if (fs.existsSync(SYSTEM_LOG_PATH)) {
      fs.renameSync(SYSTEM_LOG_PATH, getRotatedLogPath(1));
    }

    // 创建新的空 system.log（不需要显式创建，appendFile 会自动创建）
  } catch {
    // 静默处理轮转失败
  }
}

/**
 * 异步写入日志行（使用队列保证顺序）
 */
function writeLogLine(entry: LogEntry): void {
  writeQueue = writeQueue.then(async () => {
    try {
      if (!ensureLogDir()) return;

      // 检查是否需要轮转（同步方式，避免并发问题）
      if (shouldRotate()) {
        rotateLogsSync();
      }

      const line = JSON.stringify(entry) + "\n";
      await fs.promises.appendFile(SYSTEM_LOG_PATH, line, "utf-8");
    } catch {
      // 静默处理写入失败
    }
  });
}

/**
 * 创建日志条目
 */
function createEntry(level: LogLevel, source: string, data: object): LogEntry {
  return {
    ts: new Date().toISOString(),
    level,
    source,
    ...data,
  };
}

/**
 * Logger 类 - 统一日志记录器
 */
class Logger {
  /**
   * 调试日志
   */
  debug(source: string, data: object): void {
    if (!shouldLog("debug")) return;
    const entry = createEntry("debug", source, data);
    writeLogLine(entry);
  }

  /**
   * 信息日志
   */
  info(source: string, data: object): void {
    if (!shouldLog("info")) return;
    const entry = createEntry("info", source, data);
    writeLogLine(entry);
  }

  /**
   * 警告日志
   */
  warn(source: string, data: object): void {
    if (!shouldLog("warn")) return;
    const entry = createEntry("warn", source, data);
    writeLogLine(entry);
  }

  /**
   * 错误日志
   */
  error(source: string, data: object): void {
    if (!shouldLog("error")) return;
    const entry = createEntry("error", source, data);
    writeLogLine(entry);
  }
}

/**
 * 导出单例实例
 */
export const logger = new Logger();

/**
 * 获取系统日志路径（用于调试/测试）
 */
export function getSystemLogPath(): string {
  return SYSTEM_LOG_PATH;
}

/**
 * 获取日志目录路径（用于调试/测试）
 */
export function getLogsDir(): string {
  return LOGS_DIR;
}
