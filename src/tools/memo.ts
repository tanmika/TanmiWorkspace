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
        minItems: 2,
        description: "标签列表（必填，至少2个有效标签，用于分类和过滤）",
      },
    },
    required: ["workspaceId", "title", "summary", "content", "tags"],
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
  description: "获取备忘的完整内容。返回的 contentHash 用于后续 memo_update 校验，确保更新时内容未被其他操作修改。",
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
  description: "更新备忘。支持两种编辑模式：1) 全量替换：直接提供 content/summary/title/tags 替换整个字段；2) 精确替换：指定 field + old_str + new_str 进行字符串替换。更新前需提供 contentHash（从 memo_get 获取）进行校验。",
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
      contentHash: {
        type: "string",
        description: "内容 hash（必填，从 memo_get 获取）",
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
        description: "新内容（可选，替换全部内容）",
      },
      field: {
        type: "string",
        enum: ["content", "summary"],
        description: "要精确替换的字段",
      },
      old_str: {
        type: "string",
        description: "要替换的原文本",
      },
      new_str: {
        type: "string",
        description: "替换后的文本",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "新标签列表（可选，会完全替换现有标签）",
      },
    },
    required: ["workspaceId", "memoId", "contentHash"],
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
