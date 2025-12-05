// src/http/server.ts
// Fastify HTTP 服务器配置

import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { errorHandler } from "./middleware/errorHandler.js";
import { ensureBaseSetup } from "./services.js";

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

  // 启动前确保基础目录存在
  server.addHook("onReady", async () => {
    await ensureBaseSetup();
  });

  return server;
}

/**
 * 启动服务器
 */
export async function startServer(port: number = 3000): Promise<FastifyInstance> {
  const server = await createServer();

  try {
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`TanmiWorkspace HTTP Server 已启动: http://localhost:${port}`);
    return server;
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}
