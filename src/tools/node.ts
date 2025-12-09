// src/tools/node.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * node_create 工具定义
 */
export const nodeCreateTool: Tool = {
  name: "node_create",
  description: "在指定父节点下创建新的子节点。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      parentId: {
        type: "string",
        description: "父节点 ID",
      },
      title: {
        type: "string",
        description: "节点标题（不能包含特殊字符: / \\ : * ? \" < > |）",
      },
      requirement: {
        type: "string",
        description: "节点需求描述，详细说明该节点要完成的任务（必填）",
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
    required: ["workspaceId", "parentId", "title", "requirement"],
  },
};

/**
 * node_get 工具定义
 */
export const nodeGetTool: Tool = {
  name: "node_get",
  description: "获取节点详情，包含元数据和所有 Markdown 内容。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "节点 ID",
      },
    },
    required: ["workspaceId", "nodeId"],
  },
};

/**
 * node_list 工具定义
 */
export const nodeListTool: Tool = {
  name: "node_list",
  description: "获取节点树结构，支持指定起始节点和深度。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      rootId: {
        type: "string",
        description: "起始节点 ID（默认为工作区根节点）",
      },
      depth: {
        type: "number",
        description: "最大深度（默认无限）",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * node_delete 工具定义
 */
export const nodeDeleteTool: Tool = {
  name: "node_delete",
  description: "删除节点及其所有子节点。根节点无法删除。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "要删除的节点 ID",
      },
    },
    required: ["workspaceId", "nodeId"],
  },
};

// ========== Phase 3: 节点分裂与更新 ==========

/**
 * node_split 工具定义
 */
export const nodeSplitTool: Tool = {
  name: "node_split",
  description: `将当前执行中的步骤升级为独立子节点。
用于执行阶段发现需要前置任务时使用。
- 父节点必须处于 implementing 状态
- 分裂后自动聚焦到新节点
- 父节点的 Problem.md 会被清空（问题已转化为子任务）`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      parentId: {
        type: "string",
        description: "当前节点 ID（将成为父节点）",
      },
      title: {
        type: "string",
        description: "新节点标题",
      },
      requirement: {
        type: "string",
        description: "从父节点拆分出的需求",
      },
      inheritContext: {
        type: "boolean",
        description: "是否继承上下文，默认 true",
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
        description: "派发给子节点的文档引用（可选）",
      },
    },
    required: ["workspaceId", "parentId", "title", "requirement"],
  },
};

/**
 * node_update 工具定义
 */
export const nodeUpdateTool: Tool = {
  name: "node_update",
  description: "更新节点信息（标题、需求、备注）。只更新提供的字段，保留其他字段不变。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "节点 ID",
      },
      title: {
        type: "string",
        description: "新标题（可选）",
      },
      requirement: {
        type: "string",
        description: "新需求描述（可选）",
      },
      note: {
        type: "string",
        description: "新备注（可选）",
      },
    },
    required: ["workspaceId", "nodeId"],
  },
};

/**
 * node_move 工具定义
 */
export const nodeMoveTool: Tool = {
  name: "node_move",
  description: `移动节点到新的父节点下，用于重组节点层级结构。
- 根节点无法移动
- 不能将节点移动到其自身的子节点下（防止循环依赖）
- 节点本身的数据（标题、需求、状态等）保持不变`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "要移动的节点 ID",
      },
      newParentId: {
        type: "string",
        description: "目标父节点 ID",
      },
    },
    required: ["workspaceId", "nodeId", "newParentId"],
  },
};

/**
 * 所有节点工具
 */
export const nodeTools: Tool[] = [
  nodeCreateTool,
  nodeGetTool,
  nodeListTool,
  nodeDeleteTool,
  nodeSplitTool,
  nodeUpdateTool,
  nodeMoveTool,
];
