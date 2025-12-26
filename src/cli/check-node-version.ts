#!/usr/bin/env node
// src/cli/check-node-version.ts
// Node 版本检查 + 更新通知脚本 - 在加载主模块前执行

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const nodeVersion = parseInt(process.versions.node.split(".")[0], 10);

if (nodeVersion < 20) {
  console.error(`
[错误] TanmiWorkspace 需要 Node.js 20 或更高版本
当前版本: v${process.versions.node}

解决方案:
1. 安装 Node.js 20+: https://nodejs.org/
2. 或使用 nvm: nvm install 20 && nvm use 20
3. MCP 配置中指定 Node 20 路径，例如:
   {
     "command": "/path/to/node20/bin/node",
     "args": ["dist/index.js"]
   }

查找 Node 20 路径: nvm which 20
`);
  process.exit(1);
}

// 版本更新检查（异步，不阻塞启动）
async function checkForUpdates() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const require = createRequire(import.meta.url);

    // 读取 package.json (从 cli 目录向上两级)
    const pkg = require(join(__dirname, "..", "..", "package.json"));

    // 动态导入 update-notifier
    const updateNotifier = (await import("update-notifier")).default;

    const notifier = updateNotifier({
      pkg,
      updateCheckInterval: 1000 * 60 * 60 * 24, // 每天检查一次
    });

    // 如果有更新，显示通知
    if (notifier.update) {
      console.log(`
╭───────────────────────────────────────────╮
│                                           │
│   TanmiWorkspace 有新版本可用!            │
│                                           │
│   当前版本: ${notifier.update.current.padEnd(10)}                   │
│   最新版本: ${notifier.update.latest.padEnd(10)}                   │
│                                           │
│   运行以下命令更新:                       │
│   npm install -g tanmi-workspace          │
│                                           │
╰───────────────────────────────────────────╯
`);
    }
  } catch {
    // 更新检查失败时静默处理，不影响正常启动
  }
}

// 执行更新检查（不等待结果）
checkForUpdates();

// 获取版本号
function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const require = createRequire(import.meta.url);
    const pkg = require(join(__dirname, "..", "..", "package.json"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// 检查子命令
const subcommand = process.argv[2];

switch (subcommand) {
  case "setup":
    import("./setup.js").then((m) => m.default());
    break;
  case "plugins":
    import("./plugins.js").then((m) => m.default());
    break;
  case "webui":
    import("./webui.js").then((m) => m.default());
    break;
  case "rebuild":
    import("./rebuild.js").then((m) => m.default());
    break;
  case "version":
  case "-v":
  case "--version":
    console.log(`tanmi-workspace v${getVersion()}`);
    break;
  case "help":
  case "--help":
  case "-h":
    console.log(`
TanmiWorkspace v${getVersion()} - AI 工作区管理系统

用法: tanmi-workspace [command]

命令:
  (无)       启动 MCP 服务器 (供 Claude Code/Cursor 调用)
  setup      交互式安装配置
  plugins    插件管理 (安装/卸载/查看状态)
  webui      启动/管理 WebUI 服务
  rebuild    索引管理 (同步/重建/验证/备份)
  -v         显示版本

插件子命令:
  tanmi-workspace plugins                    查看插件状态
  tanmi-workspace plugins install --claude   安装 Claude 插件
  tanmi-workspace plugins install --cursor   安装 Cursor 插件

WebUI 子命令:
  tanmi-workspace webui          启动 WebUI
  tanmi-workspace webui stop     停止 WebUI
  tanmi-workspace webui status   查看状态

索引管理子命令:
  tanmi-workspace rebuild                    查看状态和帮助
  tanmi-workspace rebuild <path>             增量同步项目
  tanmi-workspace rebuild --verify           验证并清理
  tanmi-workspace rebuild --list             列出备份

更多帮助:
  tanmi-workspace plugins help   插件管理帮助
  tanmi-workspace webui help     WebUI 详细帮助
`);
    break;
  default:
    // 版本检查通过，加载主模块 (MCP Server)
    import("../index.js");
}
