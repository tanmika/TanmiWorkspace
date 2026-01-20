// src/tools/context.ts

import type { TanmiTool } from "../types/tool.js";

/**
 * context_get 工具定义
 */
export const contextGetTool: TanmiTool = {
  name: "context_get",
  description: `获取节点的聚焦上下文，包含：
- 工作区信息（目标、规则、活跃文档引用）
- 上下文链（从根到当前节点的祖先路径，支持 isolate 截断）
- 跨节点引用（显式引用的其他节点）
- 子节点结论（已完成/失败的直接子节点结论冒泡）
- conclusionsHash（子节点结论的哈希值，用于 node_transition/node_update 验证）`,
  readonly: true,
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
export const contextFocusTool: TanmiTool = {
  name: "context_focus",
  description: `设置当前聚焦节点，切换 AI 的工作上下文。

**阻断机制**：当祖先链中存在 conclusionStale=true 的节点时，切换到该节点子树外会被阻断，需先更新过期结论。`,
  readonly: true,
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
export const nodeIsolateTool: TanmiTool = {
  name: "node_isolate",
  description: `设置节点的隔离状态。
- isolate=true: 切断上下文继承，不从父节点获取信息
- isolate=false: 恢复上下文继承`,
  readonly: false,
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
export const nodeReferenceTool: TanmiTool = {
  name: "node_reference",
  description: `管理节点的文档/节点引用：
- add: 添加新引用
- remove: 删除引用`,
  readonly: false,
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
        enum: ["add", "remove"],
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
export const contextTools: TanmiTool[] = [
  contextGetTool,
  contextFocusTool,
  nodeIsolateTool,
  nodeReferenceTool,
];
