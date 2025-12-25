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
import { eventService } from "../services/EventService.js";

// ESM 下获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 服务启动时间（模块加载时记录）
const SERVER_START_TIME = new Date().toISOString();

// 判断是否为开发模式
const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";

// 导入路由
import { workspaceRoutes } from "./routes/workspace.js";
import { nodeRoutes } from "./routes/node.js";
import { stateRoutes } from "./routes/state.js";
import { contextRoutes } from "./routes/context.js";
import { logRoutes } from "./routes/log.js";
import { configRoutes } from "./routes/config.js";

/**
 * 创建并配置 Fastify 服务器
 */
export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: IS_DEV
      ? {
          level: "info",
          transport: {
            target: "pino-pretty",
            options: {
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          },
        }
      : {
          level: "warn", // 生产环境只记录警告和错误
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

  // SSE 事件流端点
  server.get("/api/events", async (request, reply) => {
    // 设置 SSE 响应头
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // 注册客户端
    const clientId = eventService.addClient(reply);
    server.log.info(`SSE 客户端连接: ${clientId}, 当前连接数: ${eventService.getClientCount()}`);

    // 发送初始连接确认
    reply.raw.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

    // 保持连接（心跳）
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // 清理
    reply.raw.on("close", () => {
      clearInterval(heartbeat);
      eventService.removeClient(clientId);
      server.log.info(`SSE 客户端断开: ${clientId}, 剩余连接数: ${eventService.getClientCount()}`);
    });

    // 不要调用 reply.send()，保持连接打开
    return reply;
  });

  // 版本检查接口（公开）
  server.get("/api/version", async () => {
    // 读取当前版本
    let currentVersion: string = "unknown";
    const packageJsonPath = path.resolve(__dirname, "../../package.json");
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      currentVersion = packageJson.version;
    } catch {
      // 忽略错误
    }

    // 从 npm registry 获取最新版本（带缓存）
    let latestVersion: string | null = null;
    let updateAvailable = false;

    // 语义化版本比较：v1 > v2 返回 true
    const semverGreaterThan = (v1: string, v2: string): boolean => {
      const parse = (v: string) => v.split(".").map(Number);
      const [a1, a2, a3] = parse(v1);
      const [b1, b2, b3] = parse(v2);
      if (a1 !== b1) return a1 > b1;
      if (a2 !== b2) return a2 > b2;
      return a3 > b3;
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(
        "https://registry.npmjs.org/tanmi-workspace/latest",
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json() as { version?: string };
        latestVersion = data.version || null;
        if (latestVersion && currentVersion !== "unknown") {
          // 只有当 npm 版本大于当前版本时才提示更新
          updateAvailable = semverGreaterThan(latestVersion, currentVersion);
        }
      }
    } catch {
      // 网络错误时静默处理
    }

    return {
      currentVersion,
      latestVersion,
      updateAvailable,
    };
  });

  // 服务信息接口（基本信息所有环境可用，调试信息仅开发模式）
  server.get("/api/dev-info", async () => {
    // 读取 package.json 版本
    let packageVersion: string | null = null;
    const packageJsonPath = path.resolve(__dirname, "../../package.json");
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      packageVersion = packageJson.version;
    } catch {
      // 忽略错误
    }

    // 基本信息（所有环境可用）
    const baseInfo = {
      available: true,
      isDev: IS_DEV,
      packageVersion,
      nodeVersion: process.version,
      platform: process.platform,
    };

    // 生产环境只返回基本信息
    if (!IS_DEV) {
      return baseInfo;
    }

    // 开发环境额外返回调试信息
    // 获取代码编译时间（dist/index.js 的修改时间）
    let codeBuildTime: string | null = null;
    const distIndexPath = path.resolve(__dirname, "../index.js");
    try {
      const stat = fs.statSync(distIndexPath);
      codeBuildTime = stat.mtime.toISOString();
    } catch {
      // 忽略错误
    }

    return {
      ...baseInfo,
      serverStartTime: SERVER_START_TIME,
      codeBuildTime,
      dataDir: ".tanmi-workspace-dev",
    };
  });

  // 注册 API 路由
  await server.register(workspaceRoutes, { prefix: "/api" });
  await server.register(nodeRoutes, { prefix: "/api" });
  await server.register(stateRoutes, { prefix: "/api" });
  await server.register(contextRoutes, { prefix: "/api" });
  await server.register(logRoutes, { prefix: "/api" });
  await server.register(configRoutes, { prefix: "/api" });

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
 * 启动服务器
 */
export async function startServer(port: number = 19540): Promise<FastifyInstance> {
  const server = await createServer();
  const modeLabel = IS_DEV ? "[DEV]" : "[PROD]";
  const dataDir = IS_DEV ? ".tanmi-workspace-dev" : ".tanmi-workspace";
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
