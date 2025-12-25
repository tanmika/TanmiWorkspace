// src/tools/memo.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * memo_create 工具定义
 */
export const memoCreateTool: Tool = {
  name: "memo_create",
  description: "创建工作区备忘。备忘是独立于节点树的草稿区，用于记录灵感、讨论、调研结果。创建后可使用 node_reference 关联到节点。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      title: {
        type: "string",
        description: "备忘标题",
      },
      summary: {
        type: "string",
        description: "备忘摘要（用于列表显示）",
      },
      content: {
        type: "string",
        description: "完整内容（Markdown 格式）",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "标签列表（可选，用于分类和过滤）",
      },
    },
    required: ["workspaceId", "title", "summary", "content"],
  },
};

/**
 * memo_list 工具定义
 */
export const memoListTool: Tool = {
  name: "memo_list",
  description: "列出工作区的所有备忘（精简信息：title+summary+tags），支持按标签过滤。返回所有已使用的标签列表。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "标签列表（可选）。如果指定，仅返回包含任一指定标签的备忘",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * memo_get 工具定义
 */
export const memoGetTool: Tool = {
  name: "memo_get",
  description: "获取备忘的完整内容。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      memoId: {
        type: "string",
        description: "备忘 ID",
      },
    },
    required: ["workspaceId", "memoId"],
  },
};

/**
 * memo_update 工具定义
 */
export const memoUpdateTool: Tool = {
  name: "memo_update",
  description: "更新备忘。可部分更新 title、summary、content、tags。content 替换全部内容，appendContent 追加到末尾（二者互斥）。tags 会完全替换现有标签。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      memoId: {
        type: "string",
        description: "备忘 ID",
      },
      title: {
        type: "string",
        description: "新标题（可选）",
      },
      summary: {
        type: "string",
        description: "新摘要（可选）",
      },
      content: {
        type: "string",
        description: "新内容（可选，替换全部内容，与 appendContent 互斥）",
      },
      appendContent: {
        type: "string",
        description: "追加内容（可选，追加到现有内容末尾，与 content 互斥）",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "新标签列表（可选，会完全替换现有标签）",
      },
    },
    required: ["workspaceId", "memoId"],
  },
};

/**
 * memo_delete 工具定义
 */
export const memoDeleteTool: Tool = {
  name: "memo_delete",
  description: "删除备忘。会同时删除备忘文件和索引。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      memoId: {
        type: "string",
        description: "备忘 ID",
      },
    },
    required: ["workspaceId", "memoId"],
  },
};

/**
 * 导出所有 memo 工具
 */
export const memoTools: Tool[] = [
  memoCreateTool,
  memoListTool,
  memoGetTool,
  memoUpdateTool,
  memoDeleteTool,
];
