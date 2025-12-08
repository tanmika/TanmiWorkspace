// src/tools/workspace.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * workspace_init 工具定义
 */
export const workspaceInitTool: Tool = {
  name: "workspace_init",
  description: "初始化新工作区。创建工作区目录结构和必要的配置文件。返回 webUrl 可在浏览器中查看。",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "工作区名称（不能包含特殊字符: / \\ : * ? \" < > |）",
      },
      goal: {
        type: "string",
        description: "工作区目标描述",
      },
      rules: {
        type: "array",
        items: { type: "string" },
        description: "规则列表（可选）",
      },
      docs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            description: { type: "string" },
          },
          required: ["path", "description"],
        },
        description: "文档引用列表（可选）",
      },
    },
    required: ["name", "goal"],
  },
};

/**
 * workspace_list 工具定义
 */
export const workspaceListTool: Tool = {
  name: "workspace_list",
  description: "列出所有工作区，支持按状态过滤。",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["active", "archived", "all"],
        description: "筛选状态（默认 all）",
      },
    },
  },
};

/**
 * workspace_get 工具定义
 */
export const workspaceGetTool: Tool = {
  name: "workspace_get",
  description: "获取工作区详情，包含配置、节点图和 Workspace.md 内容。返回 webUrl 可在浏览器中查看。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * workspace_delete 工具定义
 */
export const workspaceDeleteTool: Tool = {
  name: "workspace_delete",
  description: "删除工作区。活动状态的工作区需要 force=true 才能删除。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      force: {
        type: "boolean",
        description: "是否强制删除活动状态的工作区（默认 false）",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * workspace_status 工具定义
 */
export const workspaceStatusTool: Tool = {
  name: "workspace_status",
  description: "获取工作区状态的可视化输出，包含节点树和统计信息。返回 webUrl 可在浏览器中查看完整界面。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      format: {
        type: "string",
        enum: ["box", "markdown"],
        description: "输出格式（默认 box）",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * 所有工作区工具
 */
export const workspaceTools: Tool[] = [
  workspaceInitTool,
  workspaceListTool,
  workspaceGetTool,
  workspaceDeleteTool,
  workspaceStatusTool,
];
