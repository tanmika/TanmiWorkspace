#!/usr/bin/env node
// src/http/index.ts
// HTTP Server 入口

import { startServer } from "./server.js";

// 判断是否为开发模式
const isDev = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";

// 获取端口配置：开发模式默认 3001，正式模式默认 3000
const defaultPort = isDev ? "3001" : "3000";
const port = parseInt(process.env.PORT || defaultPort, 10);

// 启动服务器
startServer(port).catch((err) => {
  console.error("服务器启动失败:", err);
  process.exit(1);
});
