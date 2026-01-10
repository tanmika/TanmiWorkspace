// src/tools/search.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * workspace_search 工具定义
 */
export const workspaceSearchTool: Tool = {
  name: "workspace_search",
  description: `在所有工作区中搜索关键词，返回匹配的工作区列表。

**搜索范围**:
- 工作区名称
- 工作区目标
- 工作区规则

**返回**:
- workspaces: 匹配的工作区列表（id, name, goal, matchedIn）
- hasMore: 是否有更多结果`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词",
      },
      limit: {
        type: "number",
        description: "最大结果数（默认 10）",
      },
    },
    required: ["query"],
  },
};

/**
 * content_search 工具定义
 */
export const contentSearchTool: Tool = {
  name: "content_search",
  description: `在指定工作区中搜索节点和 memo 内容。

**参数**:
- workspaceId: 工作区 ID（必填）
- query: 搜索关键词（必填）
- id: 限定范围（可选）
  - 节点 ID: 仅搜索该节点子树
  - memo ID: 仅搜索该 memo
- target: 搜索目标 all/node/memo（默认 all）
- context: 上下文行数（默认 1）

**返回**:
- matches: 匹配列表
  - type: node/memo
  - nodeId/nodeTitle 或 memoId/memoTitle
  - source: 匹配字段（title/requirement/conclusion/content 等）
  - line: 行号（仅 memo content）
  - snippet: 匹配片段
- hasMore: 是否有更多结果`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      query: {
        type: "string",
        description: "搜索关键词",
      },
      id: {
        type: "string",
        description: "限定范围：节点 ID（搜索子树）或 memo ID（搜索该 memo）",
      },
      target: {
        type: "string",
        enum: ["all", "node", "memo"],
        description: "搜索目标（默认 all）",
      },
      limit: {
        type: "number",
        description: "最大结果数（默认 20）",
      },
      context: {
        type: "number",
        description: "上下文行数（默认 1）",
      },
    },
    required: ["workspaceId", "query"],
  },
};

/**
 * 搜索相关工具列表
 */
export const searchTools: Tool[] = [
  workspaceSearchTool,
  contentSearchTool,
];
