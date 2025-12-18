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
   */
  fastify.get("/config", async () => {
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
}
