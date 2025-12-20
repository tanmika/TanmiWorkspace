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

  /**
   * POST /api/workspaces/:id/archive - 归档工作区
   */
  fastify.post<{ Params: WorkspaceIdParams }>(
    "/workspaces/:id/archive",
    { schema: workspaceIdParamsSchema },
    async (request: FastifyRequest<{ Params: WorkspaceIdParams }>) => {
      return services.workspace.archive({ workspaceId: request.params.id });
    }
  );

  /**
   * POST /api/workspaces/:id/restore - 恢复归档的工作区
   */
  fastify.post<{ Params: WorkspaceIdParams }>(
    "/workspaces/:id/restore",
    { schema: workspaceIdParamsSchema },
    async (request: FastifyRequest<{ Params: WorkspaceIdParams }>) => {
      return services.workspace.restore({ workspaceId: request.params.id });
    }
  );

  /**
   * POST /api/workspaces/:id/dispatch/enable - 启用派发模式
   */
  fastify.post<{ Params: WorkspaceIdParams; Body: { useGit?: boolean } }>(
    "/workspaces/:id/dispatch/enable",
    { schema: workspaceIdParamsSchema },
    async (request: FastifyRequest<{ Params: WorkspaceIdParams; Body: { useGit?: boolean } }>) => {
      return services.dispatch.enable({
        workspaceId: request.params.id,
        useGit: request.body?.useGit,
      });
    }
  );

  /**
   * POST /api/workspaces/:id/dispatch/disable - 查询禁用派发选项
   */
  fastify.post<{ Params: WorkspaceIdParams }>(
    "/workspaces/:id/dispatch/disable",
    { schema: workspaceIdParamsSchema },
    async (request: FastifyRequest<{ Params: WorkspaceIdParams }>) => {
      return services.dispatch.queryDisable({
        workspaceId: request.params.id,
      });
    }
  );

  /**
   * POST /api/workspaces/:id/dispatch/disable/execute - 执行禁用派发
   */
  fastify.post<{
    Params: WorkspaceIdParams;
    Body: {
      mergeStrategy: "sequential" | "squash" | "cherry-pick" | "skip";
      keepBackupBranch?: boolean;
      keepProcessBranch?: boolean;
      commitMessage?: string;
    };
  }>(
    "/workspaces/:id/dispatch/disable/execute",
    { schema: workspaceIdParamsSchema },
    async (
      request: FastifyRequest<{
        Params: WorkspaceIdParams;
        Body: {
          mergeStrategy: "sequential" | "squash" | "cherry-pick" | "skip";
          keepBackupBranch?: boolean;
          keepProcessBranch?: boolean;
          commitMessage?: string;
        };
      }>
    ) => {
      return services.dispatch.executeDisable({
        workspaceId: request.params.id,
        mergeStrategy: request.body.mergeStrategy,
        keepBackupBranch: request.body.keepBackupBranch,
        keepProcessBranch: request.body.keepProcessBranch,
        commitMessage: request.body.commitMessage,
      });
    }
  );

  /**
   * POST /api/workspaces/:id/dispatch/switch - 切换派发模式
   */
  fastify.post<{ Params: WorkspaceIdParams; Body: { useGit: boolean } }>(
    "/workspaces/:id/dispatch/switch",
    { schema: workspaceIdParamsSchema },
    async (request: FastifyRequest<{ Params: WorkspaceIdParams; Body: { useGit: boolean } }>) => {
      return services.dispatch.switchMode({
        workspaceId: request.params.id,
        useGit: request.body.useGit,
      });
    }
  );
}
