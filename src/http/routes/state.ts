// src/http/routes/state.ts
// 状态转换相关 API 路由

import type { FastifyInstance, FastifyRequest } from "fastify";
import { getServices } from "../services.js";
import type { NodeTransitionParams, TransitionAction } from "../../types/index.js";

// 请求类型定义
interface NodeIdParams {
  wid: string;
  nid: string;
}

interface TransitionBody {
  action: TransitionAction;
  reason?: string;
  conclusion?: string;
}

export async function stateRoutes(fastify: FastifyInstance): Promise<void> {
  const services = getServices();

  /**
   * POST /api/workspaces/:wid/nodes/:nid/transition - 状态转换
   */
  fastify.post<{ Params: NodeIdParams; Body: TransitionBody }>(
    "/workspaces/:wid/nodes/:nid/transition",
    async (request: FastifyRequest<{ Params: NodeIdParams; Body: TransitionBody }>) => {
      const params: NodeTransitionParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
        action: request.body.action,
        reason: request.body.reason,
        conclusion: request.body.conclusion,
      };
      return services.state.transition(params);
    }
  );
}
