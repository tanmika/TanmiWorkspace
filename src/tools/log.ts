// src/tools/log.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * log_append 工具定义
 * nodeId 必填：AI 日志记录在具体节点上，工作区级日志由系统内部管理
 */
export const logAppendTool: Tool = {
  name: "log_append",
  description: "追加日志记录到节点。必须指定 nodeId，工作区级日志由系统自动管理。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "节点 ID（必填）",
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
    required: ["workspaceId", "nodeId", "operator", "event"],
  },
};

/**
 * problem_update 工具定义
 * nodeId 必填：问题记录在具体节点上，工作区级问题由系统内部管理
 */
export const problemUpdateTool: Tool = {
  name: "problem_update",
  description: "更新节点问题，记录遇到的阻碍和下一步计划。必须指定 nodeId。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "节点 ID（必填）",
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
    required: ["workspaceId", "nodeId", "problem"],
  },
};

/**
 * problem_clear 工具定义
 * nodeId 必填：问题记录在具体节点上，工作区级问题由系统内部管理
 */
export const problemClearTool: Tool = {
  name: "problem_clear",
  description: "清空节点问题（问题已解决）。必须指定 nodeId。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "节点 ID（必填）",
      },
    },
    required: ["workspaceId", "nodeId"],
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
