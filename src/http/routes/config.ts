// src/http/routes/config.ts
// 全局配置相关 API 路由

import type { FastifyInstance, FastifyRequest } from "fastify";
import { getServices } from "../services.js";
import type { ConfigSetParams } from "../../types/settings.js";

// 请求类型定义
interface ConfigUpdateBody {
  defaultDispatchMode?: "none" | "git" | "no-git";
}

export async function configRoutes(fastify: FastifyInstance): Promise<void> {
  const services = getServices();

  /**
   * GET /api/config - 获取全局配置
   * 同时检查并创建新手教程工作区（如果尚未创建）
   */
  fastify.get("/config", async () => {
    // 检查并创建新手教程（静默执行，不阻塞）
    await services.tutorial.ensureTutorial();
    return services.config.get();
  });

  /**
   * PUT /api/config - 更新全局配置
   */
  fastify.put<{ Body: ConfigUpdateBody }>(
    "/config",
    async (request: FastifyRequest<{ Body: ConfigUpdateBody }>) => {
      const params: ConfigSetParams = {
        defaultDispatchMode: request.body.defaultDispatchMode,
      };
      return services.config.set(params);
    }
  );

  /**
   * POST /api/tutorial/trigger - 手动触发创建教程工作区
   * 用于设置页面连续点击版本号5次触发
   */
  fastify.post("/tutorial/trigger", async () => {
    return services.tutorial.manualTriggerTutorial();
  });
}
