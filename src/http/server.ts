// src/http/server.ts
// Fastify HTTP 服务器配置

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { errorHandler } from "./middleware/errorHandler.js";
import { ensureBaseSetup } from "./services.js";

// ESM 下获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 导入路由
import { workspaceRoutes } from "./routes/workspace.js";
import { nodeRoutes } from "./routes/node.js";
import { stateRoutes } from "./routes/state.js";
import { contextRoutes } from "./routes/context.js";
import { logRoutes } from "./routes/log.js";

/**
 * 创建并配置 Fastify 服务器
 */
export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    },
  });

  // 注册 CORS
  await server.register(cors, {
    origin: true, // 开发环境允许所有来源
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // 设置错误处理器
  server.setErrorHandler(errorHandler);

  // 健康检查
  server.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  // 注册 API 路由
  await server.register(workspaceRoutes, { prefix: "/api" });
  await server.register(nodeRoutes, { prefix: "/api" });
  await server.register(stateRoutes, { prefix: "/api" });
  await server.register(contextRoutes, { prefix: "/api" });
  await server.register(logRoutes, { prefix: "/api" });

  // 托管前端静态文件（生产模式）
  // web/dist 目录相对于 dist/http/server.js，路径为 ../../web/dist
  const webDistPath = path.resolve(__dirname, "../../web/dist");
  if (fs.existsSync(webDistPath)) {
    await server.register(fastifyStatic, {
      root: webDistPath,
      prefix: "/",
    });

    // SPA 路由回退：非 API 路径且非静态文件时返回 index.html
    server.setNotFoundHandler(async (request, reply) => {
      // API 路由返回 404 JSON
      if (request.url.startsWith("/api/")) {
        return reply.status(404).send({ error: "Not found" });
      }
      // 其他路由返回 index.html（SPA 前端路由）
      return reply.sendFile("index.html");
    });

    server.log.info(`Web UI 静态文件已加载: ${webDistPath}`);
  } else {
    server.log.warn(`Web UI 静态文件目录不存在: ${webDistPath}`);
    server.log.warn("请运行 'cd web && npm run build' 构建前端");
  }

  // 启动前确保基础目录存在
  server.addHook("onReady", async () => {
    await ensureBaseSetup();
  });

  return server;
}

/**
 * 判断是否为开发模式
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
}

/**
 * 启动服务器
 */
export async function startServer(port: number = 3000): Promise<FastifyInstance> {
  const server = await createServer();
  const isDev = isDevelopment();
  const modeLabel = isDev ? "[DEV]" : "[PROD]";
  const dataDir = isDev ? ".tanmi-workspace-dev" : ".tanmi-workspace";
  // 默认只监听本地地址（安全），可通过 TANMI_HOST 环境变量覆盖
  const host = process.env.TANMI_HOST || "127.0.0.1";

  try {
    await server.listen({ port, host });
    console.log(`${modeLabel} TanmiWorkspace HTTP Server 已启动: http://${host}:${port}`);
    console.log(`${modeLabel} 数据目录: ~/${dataDir}/`);
    return server;
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}
