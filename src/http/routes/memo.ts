// src/http/routes/memo.ts
// 备忘相关 API 路由

import type { FastifyInstance } from "fastify";
import { getServices } from "../services.js";

// 请求类型定义
interface WorkspaceIdParams {
  wid: string;
}

interface MemoIdParams extends WorkspaceIdParams {
  mid: string;
}

interface ListMemosQuery {
  tags?: string;  // 逗号分隔的标签列表
}

/**
 * 备忘路由
 */
export async function memoRoutes(fastify: FastifyInstance): Promise<void> {
  const { memo } = getServices();

  // 列出备忘
  fastify.get<{ Params: WorkspaceIdParams; Querystring: ListMemosQuery }>(
    "/workspaces/:wid/memos",
    async (request, reply) => {
      const { wid } = request.params;
      const { tags } = request.query;

      const result = await memo.list({
        workspaceId: wid,
        tags: tags ? tags.split(",").map(t => t.trim()) : undefined,
      });

      return result;
    }
  );

  // 获取单个备忘
  fastify.get<{ Params: MemoIdParams }>(
    "/workspaces/:wid/memos/:mid",
    async (request, reply) => {
      const { wid, mid } = request.params;

      const result = await memo.get({
        workspaceId: wid,
        memoId: mid,
      });

      return result;
    }
  );
}
