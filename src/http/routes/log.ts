// src/http/routes/log.ts
// 日志相关 API 路由

import type { FastifyInstance, FastifyRequest } from "fastify";
import { getServices } from "../services.js";
import type {
  LogAppendParams,
  ProblemUpdateParams,
  ProblemClearParams,
} from "../../types/index.js";

// 请求类型定义
interface WorkspaceIdParams {
  wid: string;
}

interface NodeIdParams extends WorkspaceIdParams {
  nid: string;
}

interface LogAppendBody {
  operator: "AI" | "Human";
  event: string;
}

interface ProblemUpdateBody {
  problem: string;
  nextStep?: string;
}

export async function logRoutes(fastify: FastifyInstance): Promise<void> {
  const services = getServices();

  /**
   * POST /api/workspaces/:wid/logs - 追加工作区日志
   */
  fastify.post<{ Params: WorkspaceIdParams; Body: LogAppendBody }>(
    "/workspaces/:wid/logs",
    async (request: FastifyRequest<{ Params: WorkspaceIdParams; Body: LogAppendBody }>) => {
      const params: LogAppendParams = {
        workspaceId: request.params.wid,
        operator: request.body.operator,
        event: request.body.event,
      };
      return await services.log.append(params);
    }
  );

  /**
   * POST /api/workspaces/:wid/nodes/:nid/logs - 追加节点日志
   */
  fastify.post<{ Params: NodeIdParams; Body: LogAppendBody }>(
    "/workspaces/:wid/nodes/:nid/logs",
    async (request: FastifyRequest<{ Params: NodeIdParams; Body: LogAppendBody }>) => {
      const params: LogAppendParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
        operator: request.body.operator,
        event: request.body.event,
      };
      return await services.log.append(params);
    }
  );

  /**
   * PUT /api/workspaces/:wid/problem - 更新工作区问题
   */
  fastify.put<{ Params: WorkspaceIdParams; Body: ProblemUpdateBody }>(
    "/workspaces/:wid/problem",
    async (request: FastifyRequest<{ Params: WorkspaceIdParams; Body: ProblemUpdateBody }>) => {
      const params: ProblemUpdateParams = {
        workspaceId: request.params.wid,
        problem: request.body.problem,
        nextStep: request.body.nextStep,
      };
      return await services.log.updateProblem(params);
    }
  );

  /**
   * PUT /api/workspaces/:wid/nodes/:nid/problem - 更新节点问题
   */
  fastify.put<{ Params: NodeIdParams; Body: ProblemUpdateBody }>(
    "/workspaces/:wid/nodes/:nid/problem",
    async (request: FastifyRequest<{ Params: NodeIdParams; Body: ProblemUpdateBody }>) => {
      const params: ProblemUpdateParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
        problem: request.body.problem,
        nextStep: request.body.nextStep,
      };
      return await services.log.updateProblem(params);
    }
  );

  /**
   * DELETE /api/workspaces/:wid/problem - 清空工作区问题
   */
  fastify.delete<{ Params: WorkspaceIdParams }>(
    "/workspaces/:wid/problem",
    async (request: FastifyRequest<{ Params: WorkspaceIdParams }>) => {
      const params: ProblemClearParams = {
        workspaceId: request.params.wid,
      };
      return await services.log.clearProblem(params);
    }
  );

  /**
   * DELETE /api/workspaces/:wid/nodes/:nid/problem - 清空节点问题
   */
  fastify.delete<{ Params: NodeIdParams }>(
    "/workspaces/:wid/nodes/:nid/problem",
    async (request: FastifyRequest<{ Params: NodeIdParams }>) => {
      const params: ProblemClearParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
      };
      return await services.log.clearProblem(params);
    }
  );
}
