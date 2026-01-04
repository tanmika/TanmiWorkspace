// src/http/routes/log.ts
// 日志相关 API 路由

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getServices } from "../services.js";
import { logger } from "../../utils/logger.js";
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

// 前端客户端日志请求体
interface ClientLogBody {
  type: string;       // 日志类型，如 'vue', 'js', 'promise'
  message: string;    // 错误信息
  stack?: string;     // 堆栈信息
  component?: string; // Vue 组件名
  url?: string;       // 发生错误的 URL
  extra?: Record<string, unknown>; // 额外信息
}

export async function logRoutes(fastify: FastifyInstance): Promise<void> {
  const services = getServices();

  /**
   * POST /api/logs/client - 接收前端客户端错误日志
   * 用于前端错误上报，写入 system.log
   */
  fastify.post<{ Body: ClientLogBody }>(
    "/logs/client",
    async (request: FastifyRequest<{ Body: ClientLogBody }>, reply: FastifyReply) => {
      const { type, message, stack, component, url, extra } = request.body;

      // 验证必填字段
      if (!type || !message) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Missing required fields: type and message are required",
        });
      }

      // 构建日志数据
      const logData: Record<string, unknown> = {
        type,
        message,
      };

      // 添加可选字段
      if (stack) logData.stack = stack;
      if (component) logData.component = component;
      if (url) logData.url = url;
      if (extra) logData.extra = extra;

      // 记录日志（异步写入，不阻塞响应）
      logger.error("client", logData);

      // 快速返回
      return { success: true };
    }
  );

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
