// src/http/routes/context.ts
// 上下文相关 API 路由

import type { FastifyInstance, FastifyRequest } from "fastify";
import { getServices } from "../services.js";
import type {
  ContextGetParams,
  ContextFocusParams,
  NodeIsolateParams,
  NodeReferenceParams,
  ReferenceAction,
} from "../../types/index.js";

// 请求类型定义
interface WorkspaceIdParams {
  wid: string;
}

interface NodeIdParams extends WorkspaceIdParams {
  nid: string;
}

interface ContextGetQuery {
  includeLog?: string;
  maxLogEntries?: string;
  reverseLog?: string;
  includeProblem?: string;
}

interface FocusBody {
  nodeId: string;
}

interface IsolateBody {
  isolate: boolean;
}

interface ReferenceBody {
  targetIdOrPath: string;
  action: ReferenceAction;
  description?: string;
}

export async function contextRoutes(fastify: FastifyInstance): Promise<void> {
  const services = getServices();

  /**
   * GET /api/workspaces/:wid/nodes/:nid/context - 获取上下文
   */
  fastify.get<{ Params: NodeIdParams; Querystring: ContextGetQuery }>(
    "/workspaces/:wid/nodes/:nid/context",
    async (request: FastifyRequest<{ Params: NodeIdParams; Querystring: ContextGetQuery }>) => {
      const params: ContextGetParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
        includeLog: request.query.includeLog !== "false",
        maxLogEntries: request.query.maxLogEntries
          ? parseInt(request.query.maxLogEntries, 10)
          : undefined,
        reverseLog: request.query.reverseLog === "true",
        includeProblem: request.query.includeProblem !== "false",
      };
      return services.context.get(params);
    }
  );

  /**
   * POST /api/workspaces/:wid/focus - 设置焦点
   */
  fastify.post<{ Params: WorkspaceIdParams; Body: FocusBody }>(
    "/workspaces/:wid/focus",
    async (request: FastifyRequest<{ Params: WorkspaceIdParams; Body: FocusBody }>) => {
      const params: ContextFocusParams = {
        workspaceId: request.params.wid,
        nodeId: request.body.nodeId,
      };
      return services.context.focus(params);
    }
  );

  /**
   * PATCH /api/workspaces/:wid/nodes/:nid/isolate - 设置隔离
   */
  fastify.patch<{ Params: NodeIdParams; Body: IsolateBody }>(
    "/workspaces/:wid/nodes/:nid/isolate",
    async (request: FastifyRequest<{ Params: NodeIdParams; Body: IsolateBody }>) => {
      const params: NodeIsolateParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
        isolate: request.body.isolate,
      };
      return services.reference.isolate(params);
    }
  );

  /**
   * POST /api/workspaces/:wid/nodes/:nid/references - 管理引用
   */
  fastify.post<{ Params: NodeIdParams; Body: ReferenceBody }>(
    "/workspaces/:wid/nodes/:nid/references",
    async (request: FastifyRequest<{ Params: NodeIdParams; Body: ReferenceBody }>) => {
      const params: NodeReferenceParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
        targetIdOrPath: request.body.targetIdOrPath,
        action: request.body.action,
        description: request.body.description,
      };
      return services.reference.reference(params);
    }
  );
}
