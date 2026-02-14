// src/http/routes/change.ts
// 变更追踪相关 API 路由

import type { FastifyInstance } from "fastify";
import { getServices } from "../services.js";
import { errorHandler } from "../middleware/errorHandler.js";

// 请求类型定义
interface WorkspaceIdParams {
  wid: string;
}

interface NodeIdParams extends WorkspaceIdParams {
  nid: string;
}

interface ListNodeChangesQuery {
  summary?: string;  // "true" 时返回精简数据
}

interface RevertBody {
  changeIds: string[];
}

// JSON Schema 定义
const workspaceIdSchema = {
  params: {
    type: "object",
    required: ["wid"],
    properties: {
      wid: { type: "string", minLength: 1, maxLength: 50 },
    },
  },
};

const nodeChangesSchema = {
  params: {
    type: "object",
    required: ["wid", "nid"],
    properties: {
      wid: { type: "string", minLength: 1, maxLength: 50 },
      nid: { type: "string", minLength: 1, maxLength: 50 },
    },
  },
  querystring: {
    type: "object",
    properties: {
      summary: { type: "string", enum: ["true", "false"] },
    },
    additionalProperties: false,
  },
};

const revertSchema = {
  ...workspaceIdSchema,
  body: {
    type: "object",
    required: ["changeIds"],
    properties: {
      changeIds: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: { type: "string", minLength: 1, maxLength: 100 },
      },
    },
    additionalProperties: false,
  },
};

/**
 * 变更追踪路由
 */
export async function changeRoutes(fastify: FastifyInstance): Promise<void> {
  const { change } = getServices();

  // 注册错误处理器（确保独立测试也能正确映射错误码到 HTTP 状态码）
  fastify.setErrorHandler(errorHandler);

  /**
   * GET /api/workspaces/:wid/nodes/:nid/changes - 获取节点变更列表
   */
  fastify.get<{ Params: NodeIdParams; Querystring: ListNodeChangesQuery }>(
    "/workspaces/:wid/nodes/:nid/changes",
    { schema: nodeChangesSchema },
    async (request) => {
      const { wid, nid } = request.params;
      const summary = request.query.summary === "true";

      const result = await change.listChanges({
        workspaceId: wid,
        nodeId: nid,
        summary,
      });

      return {
        changes: result.changes,
        totalCount: result.totalCount,
      };
    }
  );

  /**
   * GET /api/workspaces/:wid/changes/ambiguous - 获取 ambiguous 变更数量
   */
  fastify.get<{ Params: WorkspaceIdParams }>(
    "/workspaces/:wid/changes/ambiguous",
    { schema: workspaceIdSchema },
    async (request) => {
      const { wid } = request.params;
      const count = await change.getAmbiguousCount(wid);
      return { count };
    }
  );

  /**
   * POST /api/workspaces/:wid/changes/revert - 回滚变更
   */
  fastify.post<{ Params: WorkspaceIdParams; Body: RevertBody }>(
    "/workspaces/:wid/changes/revert",
    { schema: revertSchema },
    async (request) => {
      const { wid } = request.params;
      const { changeIds } = request.body;

      const result = await change.revertChanges({
        workspaceId: wid,
        changeIds,
      });

      return {
        success: result.success,
        results: result.results,
      };
    }
  );

  /**
   * POST /api/workspaces/:wid/changes/revert-check - 模拟回滚 dry-run
   */
  fastify.post<{ Params: WorkspaceIdParams; Body: RevertBody }>(
    "/workspaces/:wid/changes/revert-check",
    { schema: revertSchema },
    async (request) => {
      const { wid } = request.params;
      const { changeIds } = request.body;

      const result = await change.revertChanges({
        workspaceId: wid,
        changeIds,
        dryRun: true,
      });

      return {
        success: result.success,
        results: result.results,
      };
    }
  );
}
