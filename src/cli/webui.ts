#!/usr/bin/env node
// src/cli/webui.ts
// WebUI 独立启动命令 - 支持进程管理和版本检测

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  readPidInfo,
  writePidInfo,
  removePidFile,
  isProcessRunning,
  getPortProcess,
  killProcess,
  getProcessCommand,
} from "../utils/processManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// 读取 package.json 获取版本
const pkg = require(join(__dirname, "..", "..", "package.json"));
const CURRENT_VERSION = pkg.version;

// 配置
const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
const DEFAULT_PORT = IS_DEV ? 19541 : 19540;
const PORT = parseInt(process.env.HTTP_PORT ?? process.env.PORT ?? String(DEFAULT_PORT), 10);

/**
 * 处理旧进程
 */
function handleOldProcessForCli(): void {
  const pidInfo = readPidInfo();

  // 情况1：有 PID 记录
  if (pidInfo) {
    if (isProcessRunning(pidInfo.pid)) {
      // 检查版本
      if (pidInfo.version !== CURRENT_VERSION) {
        console.log(`[webui] 检测到旧版本进程 (v${pidInfo.version} → v${CURRENT_VERSION})`);
        console.log(`[webui] 正在终止旧进程 (PID: ${pidInfo.pid})...`);
        if (killProcess(pidInfo.pid)) {
          console.log(`[webui] 旧进程已终止`);
          removePidFile();
        } else {
          const killCmd = process.platform === "win32" ? `taskkill /PID ${pidInfo.pid} /F` : `kill ${pidInfo.pid}`;
          console.error(`[webui] 无法终止旧进程，请手动执行: ${killCmd}`);
          process.exit(1);
        }
      } else {
        console.log(`[webui] 服务已在运行 (PID: ${pidInfo.pid}, 端口: ${pidInfo.port})`);
        console.log(`[webui] 访问: http://localhost:${pidInfo.port}`);
        console.log(`[webui] 如需重启，请先执行: tanmi-workspace webui stop`);
        process.exit(0);
      }
    } else {
      // PID 记录存在但进程不存在，清理
      removePidFile();
    }
  }

  // 情况2：端口被占用但不是我们的进程
  const portPid = getPortProcess(PORT);
  if (portPid) {
    const cmdline = getProcessCommand(portPid);
    // 检查是否是 tanmi-workspace 相关进程
    if (cmdline && (cmdline.includes("tanmi-workspace") || cmdline.includes("dist/http"))) {
      console.log(`[webui] 检测到端口 ${PORT} 被占用 (PID: ${portPid})`);
      console.log(`[webui] 进程: ${cmdline.substring(0, 60)}...`);
      console.log(`[webui] 正在终止...`);
      if (killProcess(portPid)) {
        console.log(`[webui] 进程已终止`);
      }
    } else {
      console.error(`[webui] 端口 ${PORT} 被其他服务占用 (PID: ${portPid})`);
      if (cmdline) {
        console.error(`[webui] 进程: ${cmdline}`);
      }
      console.error(`[webui] 请手动终止或使用其他端口: HTTP_PORT=19542 tanmi-workspace webui`);
      process.exit(1);
    }
  }
}

/**
 * 停止服务
 */
function stopServer(): void {
  const pidInfo = readPidInfo();
  if (pidInfo && isProcessRunning(pidInfo.pid)) {
    console.log(`[webui] 正在停止服务 (PID: ${pidInfo.pid})...`);
    if (killProcess(pidInfo.pid)) {
      removePidFile();
      console.log(`[webui] 服务已停止`);
    } else {
      const killCmd = process.platform === "win32" ? `taskkill /PID ${pidInfo.pid} /F` : `kill ${pidInfo.pid}`;
      console.error(`[webui] 无法停止服务，请手动执行: ${killCmd}`);
    }
  } else {
    const portPid = getPortProcess(PORT);
    if (portPid) {
      console.log(`[webui] 正在停止端口 ${PORT} 上的服务 (PID: ${portPid})...`);
      killProcess(portPid);
      removePidFile();
      console.log(`[webui] 服务已停止`);
    } else {
      console.log(`[webui] 没有运行中的服务`);
    }
  }
}

/**
 * 显示状态
 */
function showStatus(): void {
  const pidInfo = readPidInfo();
  if (pidInfo && isProcessRunning(pidInfo.pid)) {
    console.log(`[webui] 状态: 运行中`);
    console.log(`[webui] PID: ${pidInfo.pid}`);
    console.log(`[webui] 端口: ${pidInfo.port}`);
    console.log(`[webui] 版本: ${pidInfo.version}`);
    console.log(`[webui] 启动时间: ${pidInfo.startedAt}`);
    console.log(`[webui] 访问: http://localhost:${pidInfo.port}`);
  } else {
    const portPid = getPortProcess(PORT);
    if (portPid) {
      console.log(`[webui] 状态: 端口被占用`);
      console.log(`[webui] 占用进程 PID: ${portPid}`);
    } else {
      console.log(`[webui] 状态: 未运行`);
    }
  }
}

/**
 * 启动服务器
 */
async function startServer(): Promise<void> {
  // 处理旧进程
  handleOldProcessForCli();

  console.log(`[webui] 启动 TanmiWorkspace WebUI v${CURRENT_VERSION}...`);
  console.log(`[webui] 端口: ${PORT}`);
  console.log(`[webui] 模式: ${IS_DEV ? "开发" : "生产"}`);

  // 写入 PID 信息
  writePidInfo({
    pid: process.pid,
    port: PORT,
    version: CURRENT_VERSION,
    startedAt: new Date().toISOString(),
  });

  // 进程退出时清理
  process.on("exit", removePidFile);
  process.on("SIGINT", () => {
    removePidFile();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    removePidFile();
    process.exit(0);
  });

  // 启动 HTTP 服务器
  const { startServer: startHttpServer } = await import("../http/server.js");
  const server = await startHttpServer(PORT);

  console.log(`[webui] 服务已启动: http://localhost:${PORT}`);
  console.log(`[webui] 按 Ctrl+C 停止服务`);
}

/**
 * 主函数
 */
export default async function main(): Promise<void> {
  const action = process.argv[3] || "start";

  switch (action) {
    case "start":
      await startServer();
      break;
    case "stop":
      stopServer();
      break;
    case "restart":
      stopServer();
      await startServer();
      break;
    case "status":
      showStatus();
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(`
TanmiWorkspace WebUI 管理命令

用法: tanmi-workspace webui [action]

Actions:
  start     启动 WebUI 服务 (默认)
  stop      停止 WebUI 服务
  restart   重启 WebUI 服务
  status    查看服务状态

选项:
  HTTP_PORT=<port>  指定端口 (默认: ${DEFAULT_PORT})
  TANMI_DEV=true    开发模式

示例:
  tanmi-workspace webui              # 启动服务
  tanmi-workspace webui stop         # 停止服务
  tanmi-workspace webui status       # 查看状态
  HTTP_PORT=19542 tanmi-workspace webui  # 使用指定端口
`);
      break;
    default:
      console.error(`未知操作: ${action}`);
      console.error(`使用 tanmi-workspace webui help 查看帮助`);
      process.exit(1);
  }
}
