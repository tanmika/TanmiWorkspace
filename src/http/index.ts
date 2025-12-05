#!/usr/bin/env node
// src/http/index.ts
// HTTP Server 入口

import { startServer } from "./server.js";

// 获取端口配置
const port = parseInt(process.env.PORT || "3000", 10);

// 启动服务器
startServer(port).catch((err) => {
  console.error("服务器启动失败:", err);
  process.exit(1);
});
