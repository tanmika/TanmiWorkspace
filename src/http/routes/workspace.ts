// src/http/routes/workspace.ts
// 工作区相关 API 路由

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getServices } from "../services.js";
import type {
  WorkspaceInitParams,
  WorkspaceListParams,
  WorkspaceGetParams,
  WorkspaceDeleteParams,
  WorkspaceStatusParams,
} from "../../types/index.js";

// 请求类型定义
interface CreateWorkspaceBody {
  name: string;
  goal: string;
  projectRoot?: string;
  rules?: string[];
  docs?: Array<{ path: string; description: string }>;
}

interface WorkspaceIdParams {
  id: string;
}

interface ListWorkspacesQuery {
  status?: "active" | "archived" | "all";
}

interface StatusQuery {
  format?: "box" | "markdown";
}

interface DeleteQuery {
  force?: string;
}

// JSON Schema 定义
const createWorkspaceSchema = {
  body: {
    type: "object",
    required: ["name", "goal"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      goal: { type: "string", minLength: 1, maxLength: 1000 },
      projectRoot: { type: "string", maxLength: 500 },
      rules: {
        type: "array",
        maxItems: 50,
        items: { type: "string", maxLength: 500 }
      },
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
      }
    },
    additionalProperties: false
  }
};

const workspaceIdParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string", minLength: 1, maxLength: 50 }
    }
  }
};

const listWorkspacesSchema = {
  querystring: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["active", "archived", "all"] }
    },
    additionalProperties: false
  }
};

const statusQuerySchema = {
  ...workspaceIdParamsSchema,
  querystring: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["box", "markdown"] }
    },
    additionalProperties: false
  }
};

const deleteQuerySchema = {
  ...workspaceIdParamsSchema,
  querystring: {
    type: "object",
    properties: {
      force: { type: "string", enum: ["true", "false"] }
    },
    additionalProperties: false
  }
};

export async function workspaceRoutes(fastify: FastifyInstance): Promise<void> {
  const services = getServices();

  /**
   * POST /api/workspaces - 创建工作区
   */
  fastify.post<{ Body: CreateWorkspaceBody }>(
    "/workspaces",
    { schema: createWorkspaceSchema },
    async (request: FastifyRequest<{ Body: CreateWorkspaceBody }>, reply: FastifyReply) => {
      const params: WorkspaceInitParams = {
        name: request.body.name,
        goal: request.body.goal,
        projectRoot: request.body.projectRoot,
        rules: request.body.rules,
        docs: request.body.docs,
      };
      const result = await services.workspace.init(params);
      reply.status(201).send(result);
    }
  );

  /**
   * GET /api/workspaces - 列出工作区
   */
  fastify.get<{ Querystring: ListWorkspacesQuery }>(
    "/workspaces",
    { schema: listWorkspacesSchema },
    async (request: FastifyRequest<{ Querystring: ListWorkspacesQuery }>) => {
      const params: WorkspaceListParams = {
        status: request.query.status,
      };
      return services.workspace.list(params);
    }
  );

  /**
   * GET /api/workspaces/:id - 获取工作区详情
   */
  fastify.get<{ Params: WorkspaceIdParams }>(
    "/workspaces/:id",
    { schema: workspaceIdParamsSchema },
    async (request: FastifyRequest<{ Params: WorkspaceIdParams }>) => {
      const params: WorkspaceGetParams = {
        workspaceId: request.params.id,
      };
      return services.workspace.get(params);
    }
  );

  /**
   * GET /api/workspaces/:id/status - 获取工作区状态
   */
  fastify.get<{ Params: WorkspaceIdParams; Querystring: StatusQuery }>(
    "/workspaces/:id/status",
    { schema: statusQuerySchema },
    async (request: FastifyRequest<{ Params: WorkspaceIdParams; Querystring: StatusQuery }>) => {
      const params: WorkspaceStatusParams = {
        workspaceId: request.params.id,
        format: request.query.format,
      };
      return services.workspace.status(params);
    }
  );

  /**
   * DELETE /api/workspaces/:id - 删除工作区
   */
  fastify.delete<{ Params: WorkspaceIdParams; Querystring: DeleteQuery }>(
    "/workspaces/:id",
    { schema: deleteQuerySchema },
    async (request: FastifyRequest<{ Params: WorkspaceIdParams; Querystring: DeleteQuery }>) => {
      const params: WorkspaceDeleteParams = {
        workspaceId: request.params.id,
        force: request.query.force === "true",
      };
      return services.workspace.delete(params);
    }
  );
}
