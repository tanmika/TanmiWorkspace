#!/usr/bin/env node
// src/check-node-version.ts
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

    // 读取 package.json
    const pkg = require(join(__dirname, "..", "package.json"));

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

// 版本检查通过，加载主模块
import("./index.js");
