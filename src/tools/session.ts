// src/tools/session.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * session_bind 工具定义
 */
export const sessionBindTool: Tool = {
  name: "session_bind",
  description: `绑定当前会话到工作区。

绑定后，Hook 会在每次对话时自动注入工作区上下文（目标、规则、聚焦节点等）。

**使用场景**：
- 用户说"帮我激活/切换到 XX 工作区"
- AI 开始执行复杂任务前主动询问是否绑定
- 用户要求继续之前的工作区任务`,
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Claude Code 会话 ID（从环境变量或 Hook 输入获取）",
      },
      workspaceId: {
        type: "string",
        description: "要绑定的工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "同时聚焦到某个节点（可选）",
      },
    },
    required: ["sessionId", "workspaceId"],
  },
};

/**
 * session_unbind 工具定义
 */
export const sessionUnbindTool: Tool = {
  name: "session_unbind",
  description: `解除当前会话与工作区的绑定。

解绑后，Hook 将不再注入工作区上下文。

**使用场景**：
- 用户说"先停一下工作区"
- 用户说"我要做点别的事"
- 工作区任务全部完成后`,
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Claude Code 会话 ID",
      },
    },
    required: ["sessionId"],
  },
};

/**
 * session_status 工具定义
 */
export const sessionStatusTool: Tool = {
  name: "session_status",
  description: `查询当前会话的绑定状态。

返回：
- 如果已绑定：工作区信息、聚焦节点、规则列表
- 如果未绑定：可用的活跃工作区列表

**使用场景**：
- Hook 内部检查是否应该激活
- AI 查询当前状态
- 用户询问"现在在哪个工作区"`,
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "Claude Code 会话 ID",
      },
    },
    required: ["sessionId"],
  },
};

/**
 * 所有 session 工具
 */
export const sessionTools: Tool[] = [
  sessionBindTool,
  sessionUnbindTool,
  sessionStatusTool,
];
