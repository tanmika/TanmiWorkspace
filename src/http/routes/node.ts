// src/http/routes/node.ts
// 节点相关 API 路由

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getServices } from "../services.js";
import type {
  NodeCreateParams,
  NodeGetParams,
  NodeListParams,
  NodeDeleteParams,
  NodeUpdateParams,
  NodeMoveParams,
  DocRef,
  NodeType,
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
  type: NodeType;
  title: string;
  requirement?: string;
  docs?: DocRef[];
  rulesHash?: string;
}

interface UpdateNodeBody {
  title?: string;
  requirement?: string;
  note?: string;
}

interface MoveNodeBody {
  newParentId: string;
}

interface ListNodesQuery {
  rootId?: string;
  depth?: string;
}

// JSON Schema 定义
const workspaceIdSchema = {
  params: {
    type: "object",
    required: ["wid"],
    properties: {
      wid: { type: "string", minLength: 1, maxLength: 50 }
    }
  }
};

const nodeIdSchema = {
  params: {
    type: "object",
    required: ["wid", "nid"],
    properties: {
      wid: { type: "string", minLength: 1, maxLength: 50 },
      nid: { type: "string", minLength: 1, maxLength: 50 }
    }
  }
};

const createNodeSchema = {
  ...workspaceIdSchema,
  body: {
    type: "object",
    required: ["parentId", "type", "title"],
    properties: {
      parentId: { type: "string", minLength: 1, maxLength: 50 },
      type: { type: "string", enum: ["planning", "execution"] },
      title: { type: "string", minLength: 1, maxLength: 100 },
      requirement: { type: "string", maxLength: 5000 },
      docs: {
        type: "array",
        maxItems: 100,
        items: {
          type: "object",
          required: ["path", "description"],
          properties: {
            path: { type: "string", minLength: 1, maxLength: 500 },
            description: { type: "string", maxLength: 200 }
          }
        }
      },
      rulesHash: { type: "string", minLength: 8, maxLength: 8 }
    },
    additionalProperties: false
  }
};

const listNodesSchema = {
  ...workspaceIdSchema,
  querystring: {
    type: "object",
    properties: {
      rootId: { type: "string", maxLength: 50 },
      depth: { type: "string", pattern: "^\\d+$" }
    },
    additionalProperties: false
  }
};

const updateNodeSchema = {
  ...nodeIdSchema,
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 100 },
      requirement: { type: "string", maxLength: 5000 },
      note: { type: "string", maxLength: 2000 }
    },
    additionalProperties: false
  }
};

const moveNodeSchema = {
  ...nodeIdSchema,
  body: {
    type: "object",
    required: ["newParentId"],
    properties: {
      newParentId: { type: "string", minLength: 1, maxLength: 50 }
    },
    additionalProperties: false
  }
};

export async function nodeRoutes(fastify: FastifyInstance): Promise<void> {
  const services = getServices();

  /**
   * POST /api/workspaces/:wid/nodes - 创建节点
   */
  fastify.post<{ Params: WorkspaceIdParams; Body: CreateNodeBody }>(
    "/workspaces/:wid/nodes",
    { schema: createNodeSchema },
    async (
      request: FastifyRequest<{ Params: WorkspaceIdParams; Body: CreateNodeBody }>,
      reply: FastifyReply
    ) => {
      const params: NodeCreateParams = {
        workspaceId: request.params.wid,
        parentId: request.body.parentId,
        type: request.body.type,
        title: request.body.title,
        requirement: request.body.requirement,
        docs: request.body.docs,
        rulesHash: request.body.rulesHash,
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
    { schema: listNodesSchema },
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
    { schema: nodeIdSchema },
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
    { schema: updateNodeSchema },
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
    { schema: nodeIdSchema },
    async (request: FastifyRequest<{ Params: NodeIdParams }>) => {
      const params: NodeDeleteParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
      };
      return services.node.delete(params);
    }
  );

  /**
   * POST /api/workspaces/:wid/nodes/:nid/move - 移动节点
   */
  fastify.post<{ Params: NodeIdParams; Body: MoveNodeBody }>(
    "/workspaces/:wid/nodes/:nid/move",
    { schema: moveNodeSchema },
    async (request: FastifyRequest<{ Params: NodeIdParams; Body: MoveNodeBody }>) => {
      const params: NodeMoveParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
        newParentId: request.body.newParentId,
      };
      return services.node.move(params);
    }
  );
}
