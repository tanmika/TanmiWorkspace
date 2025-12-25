// src/utils/processManager.ts
// 进程管理工具 - 版本检测和旧进程替换

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
const baseDir = IS_DEV ? ".tanmi-workspace-dev" : ".tanmi-workspace";

export interface PidInfo {
  pid: number;
  port: number;
  version: string;
  startedAt: string;
}

/**
 * 获取 PID 文件路径
 */
export function getPidFilePath(): string {
  return path.join(os.homedir(), baseDir, "webui.pid");
}

/**
 * 读取 PID 信息
 */
export function readPidInfo(): PidInfo | null {
  try {
    const pidFile = getPidFilePath();
    if (fs.existsSync(pidFile)) {
      const content = fs.readFileSync(pidFile, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // 忽略
  }
  return null;
}

/**
 * 写入 PID 信息
 */
export function writePidInfo(info: PidInfo): void {
  const pidFile = getPidFilePath();
  const dir = path.dirname(pidFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(pidFile, JSON.stringify(info, null, 2));
}

/**
 * 删除 PID 文件
 */
export function removePidFile(): void {
  try {
    const pidFile = getPidFilePath();
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  } catch {
    // 忽略
  }
}

/**
 * 检查进程是否存活
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查端口占用并获取占用进程的 PID
 */
export function getPortProcess(port: number): number | null {
  try {
    if (process.platform === "win32") {
      // Windows: netstat -ano | findstr :PORT
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8" });
      const lines = result.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        // 匹配 LISTENING 状态的行
        if (line.includes("LISTENING")) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(pid)) return pid;
        }
      }
      return null;
    } else {
      // Unix: lsof
      const result = execSync(`lsof -ti:${port} 2>/dev/null || true`, { encoding: "utf-8" });
      const pids = result.trim().split("\n").filter(Boolean);
      return pids.length > 0 ? parseInt(pids[0], 10) : null;
    }
  } catch {
    return null;
  }
}

/**
 * 跨平台等待
 */
function sleep(ms: number): void {
  if (process.platform === "win32") {
    execSync(`ping -n 1 127.0.0.1 > nul`, { timeout: ms + 1000 });
  } else {
    execSync(`sleep ${ms / 1000}`);
  }
}

/**
 * 终止进程
 */
export function killProcess(pid: number): boolean {
  try {
    if (process.platform === "win32") {
      // Windows: taskkill
      execSync(`taskkill /PID ${pid} /F 2>nul`, { encoding: "utf-8" });
    } else {
      process.kill(pid, "SIGTERM");
    }
    // 等待进程终止
    let attempts = 0;
    while (isProcessRunning(pid) && attempts < 10) {
      sleep(100);
      attempts++;
    }
    // 如果还在运行，强制终止
    if (isProcessRunning(pid)) {
      if (process.platform === "win32") {
        execSync(`taskkill /PID ${pid} /F 2>nul`, { encoding: "utf-8" });
      } else {
        process.kill(pid, "SIGKILL");
      }
    }
    return !isProcessRunning(pid);
  } catch {
    return false;
  }
}

/**
 * 检查进程命令行是否包含指定关键词
 */
export function getProcessCommand(pid: number): string | null {
  try {
    if (process.platform === "win32") {
      // Windows: wmic
      const result = execSync(`wmic process where processid=${pid} get commandline 2>nul`, {
        encoding: "utf-8",
      });
      const lines = result.trim().split("\n").filter(Boolean);
      return lines.length > 1 ? lines[1].trim() : null;
    } else {
      return execSync(`ps -p ${pid} -o command= 2>/dev/null || true`, { encoding: "utf-8" }).trim();
    }
  } catch {
    return null;
  }
}

/**
 * 旧版本使用的端口（用于迁移检测）
 */
const LEGACY_PORTS = [3000, 3001];

/**
 * 检查并清理旧版本端口上的进程
 * @param logger 日志函数
 * @returns 是否执行了迁移
 */
export function migrateLegacyPorts(logger: (msg: string) => void = console.error): boolean {
  let migrated = false;

  for (const legacyPort of LEGACY_PORTS) {
    const portPid = getPortProcess(legacyPort);
    if (portPid) {
      const cmdline = getProcessCommand(portPid);
      // 检查是否是 tanmi-workspace 相关进程
      if (cmdline && (cmdline.includes("tanmi-workspace") || cmdline.includes("dist/http") || cmdline.includes("dist/index"))) {
        logger(`[迁移] 检测到旧版本服务在端口 ${legacyPort} 运行 (PID: ${portPid})`);
        logger(`[迁移] 端口已从 ${legacyPort} 迁移到 19540/19541`);
        logger(`[迁移] 正在关闭旧服务...`);
        if (killProcess(portPid)) {
          logger(`[迁移] 旧服务已关闭`);
          migrated = true;
        } else {
          logger(`[迁移] 无法关闭旧服务，请手动关闭后重试`);
        }
      }
    }
  }

  if (migrated) {
    logger(`[迁移] 提示：新版本 WebUI 地址为 http://localhost:19540`);
    logger(`[迁移] 请更新浏览器书签`);
  }

  return migrated;
}

/**
 * 检查并处理旧版本进程
 * @param port 要使用的端口
 * @param currentVersion 当前版本
 * @param logger 日志函数
 * @returns true 表示可以继续启动，false 表示应该跳过（相同版本已在运行）
 */
export function handleOldProcess(
  port: number,
  currentVersion: string,
  logger: (msg: string) => void = console.error
): boolean {
  // 首先检查并迁移旧版本端口
  migrateLegacyPorts(logger);

  const pidInfo = readPidInfo();

  // 情况1：有 PID 记录且进程存活
  if (pidInfo && isProcessRunning(pidInfo.pid)) {
    // 检查端口是否匹配
    const samePort = pidInfo.port === port;

    if (pidInfo.version !== currentVersion) {
      // 版本不同，需要替换
      logger(`检测到旧版本进程 (v${pidInfo.version} → v${currentVersion})`);
      logger(`正在终止旧进程 (PID: ${pidInfo.pid})...`);
      if (killProcess(pidInfo.pid)) {
        logger(`旧进程已终止`);
        removePidFile();
        return true;
      } else {
        const killCmd = process.platform === "win32" ? `taskkill /PID ${pidInfo.pid} /F` : `kill ${pidInfo.pid}`;
        logger(`无法终止旧进程，请手动执行: ${killCmd}`);
        return false;
      }
    } else if (samePort) {
      // 相同版本且相同端口，跳过启动
      logger(`服务已在运行 (PID: ${pidInfo.pid}, 端口: ${pidInfo.port}, 版本: ${pidInfo.version})`);
      return false;
    } else {
      // 相同版本但不同端口，允许启动（旧进程在不同端口运行）
      logger(`注意: 旧进程在端口 ${pidInfo.port} 运行，当前请求端口 ${port}`);
      // 继续检查当前端口是否被占用
    }
  }

  // 清理无效的 PID 记录
  if (pidInfo && !isProcessRunning(pidInfo.pid)) {
    removePidFile();
  }

  // 情况2：端口被占用
  const portPid = getPortProcess(port);
  if (portPid) {
    const cmdline = getProcessCommand(portPid);
    // 检查是否是 tanmi-workspace 相关进程
    if (cmdline && (cmdline.includes("tanmi-workspace") || cmdline.includes("dist/http"))) {
      logger(`端口 ${port} 被旧进程占用 (PID: ${portPid})`);
      logger(`正在终止...`);
      if (killProcess(portPid)) {
        logger(`进程已终止`);
        return true;
      } else {
        logger(`无法终止进程`);
        return false;
      }
    }
    // 其他进程占用端口，返回 false 但不报错（由调用方处理）
    return false;
  }

  return true;
}
