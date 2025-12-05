// src/http/routes/node.ts
// 节点相关 API 路由

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getServices } from "../services.js";
import type {
  NodeCreateParams,
  NodeGetParams,
  NodeListParams,
  NodeDeleteParams,
  NodeSplitParams,
  NodeUpdateParams,
  DocRef,
} from "../../types/index.js";

// 请求类型定义
interface WorkspaceIdParams {
  wid: string;
}

interface NodeIdParams extends WorkspaceIdParams {
  nid: string;
}

interface CreateNodeBody {
  parentId: string;
  title: string;
  requirement?: string;
  docs?: DocRef[];
}

interface UpdateNodeBody {
  title?: string;
  requirement?: string;
  note?: string;
}

interface SplitNodeBody {
  title: string;
  requirement: string;
  inheritContext?: boolean;
}

interface ListNodesQuery {
  rootId?: string;
  depth?: string;
}

export async function nodeRoutes(fastify: FastifyInstance): Promise<void> {
  const services = getServices();

  /**
   * POST /api/workspaces/:wid/nodes - 创建节点
   */
  fastify.post<{ Params: WorkspaceIdParams; Body: CreateNodeBody }>(
    "/workspaces/:wid/nodes",
    async (
      request: FastifyRequest<{ Params: WorkspaceIdParams; Body: CreateNodeBody }>,
      reply: FastifyReply
    ) => {
      const params: NodeCreateParams = {
        workspaceId: request.params.wid,
        parentId: request.body.parentId,
        title: request.body.title,
        requirement: request.body.requirement,
        docs: request.body.docs,
      };
      const result = await services.node.create(params);
      reply.status(201).send(result);
    }
  );

  /**
   * GET /api/workspaces/:wid/nodes - 获取节点树
   */
  fastify.get<{ Params: WorkspaceIdParams; Querystring: ListNodesQuery }>(
    "/workspaces/:wid/nodes",
    async (request: FastifyRequest<{ Params: WorkspaceIdParams; Querystring: ListNodesQuery }>) => {
      const params: NodeListParams = {
        workspaceId: request.params.wid,
        rootId: request.query.rootId,
        depth: request.query.depth ? parseInt(request.query.depth, 10) : undefined,
      };
      return services.node.list(params);
    }
  );

  /**
   * GET /api/workspaces/:wid/nodes/:nid - 获取节点详情
   */
  fastify.get<{ Params: NodeIdParams }>(
    "/workspaces/:wid/nodes/:nid",
    async (request: FastifyRequest<{ Params: NodeIdParams }>) => {
      const params: NodeGetParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
      };
      return services.node.get(params);
    }
  );

  /**
   * PATCH /api/workspaces/:wid/nodes/:nid - 更新节点
   */
  fastify.patch<{ Params: NodeIdParams; Body: UpdateNodeBody }>(
    "/workspaces/:wid/nodes/:nid",
    async (request: FastifyRequest<{ Params: NodeIdParams; Body: UpdateNodeBody }>) => {
      const params: NodeUpdateParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
        title: request.body.title,
        requirement: request.body.requirement,
        note: request.body.note,
      };
      return services.node.update(params);
    }
  );

  /**
   * DELETE /api/workspaces/:wid/nodes/:nid - 删除节点
   */
  fastify.delete<{ Params: NodeIdParams }>(
    "/workspaces/:wid/nodes/:nid",
    async (request: FastifyRequest<{ Params: NodeIdParams }>) => {
      const params: NodeDeleteParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
      };
      return services.node.delete(params);
    }
  );

  /**
   * POST /api/workspaces/:wid/nodes/:nid/split - 分裂节点
   */
  fastify.post<{ Params: NodeIdParams; Body: SplitNodeBody }>(
    "/workspaces/:wid/nodes/:nid/split",
    async (
      request: FastifyRequest<{ Params: NodeIdParams; Body: SplitNodeBody }>,
      reply: FastifyReply
    ) => {
      const params: NodeSplitParams = {
        workspaceId: request.params.wid,
        parentId: request.params.nid,
        title: request.body.title,
        requirement: request.body.requirement,
        inheritContext: request.body.inheritContext,
      };
      const result = await services.node.split(params);
      reply.status(201).send(result);
    }
  );
}
