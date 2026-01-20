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

      const result = await search.contentSearch({
        workspaceId: wid,
        query,
        regex: regex === "true",
        id,
        target: target || "all",
        limit: limit ? parseInt(limit, 10) : 20,
        context: context ? parseInt(context, 10) : 1,
      });

      return result;
    }
  );
}
