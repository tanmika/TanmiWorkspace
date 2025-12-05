// src/tools/context.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * context_get 工具定义
 */
export const contextGetTool: Tool = {
  name: "context_get",
  description: `获取节点的聚焦上下文，包含：
- 工作区信息（目标、规则、活跃文档引用）
- 上下文链（从根到当前节点的祖先路径，支持 isolate 截断）
- 跨节点引用（显式引用的其他节点）
- 子节点结论（已完成/失败的直接子节点结论冒泡）`,
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
      includeLog: {
        type: "boolean",
        description: "是否包含日志（默认 true）",
      },
      maxLogEntries: {
        type: "number",
        description: "最大日志条数（默认 20，Tail-First 截断）",
      },
      reverseLog: {
        type: "boolean",
        description: "是否倒序日志（默认 false）",
      },
      includeProblem: {
        type: "boolean",
        description: "是否包含问题（默认 true）",
      },
    },
    required: ["workspaceId", "nodeId"],
  },
};

/**
 * context_focus 工具定义
 */
export const contextFocusTool: Tool = {
  name: "context_focus",
  description: "设置当前聚焦节点，切换 AI 的工作上下文。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "要聚焦的节点 ID",
      },
    },
    required: ["workspaceId", "nodeId"],
  },
};

/**
 * node_isolate 工具定义
 */
export const nodeIsolateTool: Tool = {
  name: "node_isolate",
  description: `设置节点的隔离状态。
- isolate=true: 切断上下文继承，不从父节点获取信息
- isolate=false: 恢复上下文继承`,
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
      isolate: {
        type: "boolean",
        description: "是否隔离",
      },
    },
    required: ["workspaceId", "nodeId", "isolate"],
  },
};

/**
 * node_reference 工具定义
 */
export const nodeReferenceTool: Tool = {
  name: "node_reference",
  description: `管理文档/节点引用的生命周期：
- add: 添加新引用（status=active）
- remove: 删除引用
- expire: 标记引用过期（移出上下文窗口，保留审计记录）
- activate: 重新激活过期引用`,
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
      targetIdOrPath: {
        type: "string",
        description: "目标节点 ID 或文档路径",
      },
      action: {
        type: "string",
        enum: ["add", "remove", "expire", "activate"],
        description: "操作类型",
      },
      description: {
        type: "string",
        description: "引用说明（add 时建议填写）",
      },
    },
    required: ["workspaceId", "nodeId", "targetIdOrPath", "action"],
  },
};

/**
 * 所有上下文工具
 */
export const contextTools: Tool[] = [
  contextGetTool,
  contextFocusTool,
  nodeIsolateTool,
  nodeReferenceTool,
];
