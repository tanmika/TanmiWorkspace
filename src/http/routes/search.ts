// src/http/routes/search.ts
// 搜索相关 API 路由

import type { FastifyInstance } from "fastify";
import { getServices } from "../services.js";

// 请求类型定义
interface ContentSearchParams {
  wid: string;
}

interface ContentSearchQuery {
  query: string;
  regex?: string;
  id?: string;
  target?: "all" | "node" | "memo";
  limit?: string;
  context?: string;
}

/**
 * 搜索路由
 */
export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  const { search } = getServices();

  // 内容搜索
  fastify.get<{ Params: ContentSearchParams; Querystring: ContentSearchQuery }>(
    "/workspaces/:wid/search",
    async (request, reply) => {
      const { wid } = request.params;
      const { query, regex, id, target, limit, context } = request.query;

      // 解析数字参数，NaN 时使用 undefined 让服务层使用默认值
      const parsedLimit = limit ? parseInt(limit, 10) : undefined;
      const parsedContext = context ? parseInt(context, 10) : undefined;

      const result = await search.contentSearch({
        workspaceId: wid,
        query,
        regex: regex === "true",
        id,
        target: target || "all",
        limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit,
        context: Number.isNaN(parsedContext) ? undefined : parsedContext,
      });

      return result;
    }
  );
}
