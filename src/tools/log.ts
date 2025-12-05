// src/tools/log.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * log_append 工具定义
 */
export const logAppendTool: Tool = {
  name: "log_append",
  description: "追加日志记录到节点或全局日志。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "节点 ID（为空则追加到全局日志）",
      },
      operator: {
        type: "string",
        enum: ["AI", "Human"],
        description: "操作者",
      },
      event: {
        type: "string",
        description: "事件描述",
      },
    },
    required: ["workspaceId", "operator", "event"],
  },
};

/**
 * problem_update 工具定义
 */
export const problemUpdateTool: Tool = {
  name: "problem_update",
  description: "更新当前问题，记录遇到的阻碍和下一步计划。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "节点 ID（为空则更新全局问题）",
      },
      problem: {
        type: "string",
        description: "问题描述",
      },
      nextStep: {
        type: "string",
        description: "下一步计划（可选）",
      },
    },
    required: ["workspaceId", "problem"],
  },
};

/**
 * problem_clear 工具定义
 */
export const problemClearTool: Tool = {
  name: "problem_clear",
  description: "清空当前问题（问题已解决）。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "节点 ID（为空则清空全局问题）",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * 所有日志工具
 */
export const logTools: Tool[] = [
  logAppendTool,
  problemUpdateTool,
  problemClearTool,
];
