#!/usr/bin/env node
// src/check-node-version.ts
// Node 版本检查脚本 - 在加载主模块前执行

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

// 版本检查通过，加载主模块
import("./index.js");
