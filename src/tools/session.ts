// src/tools/session.ts

import type { TanmiTool } from "../types/tool.js";

/**
 * session_bind 工具定义
 */
export const sessionBindTool: TanmiTool = {
  name: "session_bind",
  readonly: false,
  description: `绑定当前会话到工作区。

绑定后，Hook 会在每次对话时自动注入工作区上下文（目标、规则、聚焦节点等）。

**sessionId 传入规则**：
- Claude Code / Cursor / OpenCode：由 Hook/Plugin 自动注入，无需手动传入
- Codex / 其他平台：省略 sessionId，服务端将自动生成并在返回结果的 _generatedSessionId 字段中附上，请记住它以便后续调用使用

**使用场景**：
- 用户说"帮我激活/切换到 XX 工作区"
- AI 开始执行复杂任务前主动询问是否绑定
- 用户要求继续之前的工作区任务`,
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description:
          "会话 ID。Claude Code / Cursor / OpenCode 由 Hook 自动注入；Codex 等其他平台可省略，服务端将自动生成并在响应的 _generatedSessionId 字段中返回。",
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
    required: ["workspaceId"],
  },
};

/**
 * session_unbind 工具定义
 */
export const sessionUnbindTool: TanmiTool = {
  name: "session_unbind",
  readonly: false,
  description: `解除当前会话与工作区的绑定。

解绑后，Hook 将不再注入工作区上下文。

**sessionId 传入规则**：
- Claude Code / Cursor / OpenCode：由 Hook/Plugin 自动注入
- Codex / 其他平台：传入 session_bind 返回的 _generatedSessionId

**使用场景**：
- 用户说"先停一下工作区"
- 用户说"我要做点别的事"
- 工作区任务全部完成后`,
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description:
          "会话 ID。Claude Code / Cursor / OpenCode 由 Hook 自动注入；Codex 等平台需传入 session_bind 返回的 _generatedSessionId。",
      },
    },
    required: ["sessionId"],
  },
};

/**
 * session_status 工具定义
 */
export const sessionStatusTool: TanmiTool = {
  name: "session_status",
  description: `查询当前会话的绑定状态。

返回：
- 如果已绑定：工作区信息、聚焦节点、规则列表
- 如果未绑定：可用的活跃工作区列表

**sessionId 传入规则**：
- Claude Code / Cursor / OpenCode：由 Hook/Plugin 自动注入
- Codex / 其他平台：传入 session_bind 返回的 _generatedSessionId

**使用场景**：
- Hook 内部检查是否应该激活
- AI 查询当前状态
- 用户询问"现在在哪个工作区"`,
  readonly: true,
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description:
          "会话 ID。Claude Code / Cursor / OpenCode 由 Hook 自动注入；Codex 等平台需传入 session_bind 返回的 _generatedSessionId。",
      },
    },
    required: ["sessionId"],
  },
};

/**
 * get_pending_changes 工具定义
 */
export const getPendingChangesTool: TanmiTool = {
  name: "get_pending_changes",
  description: `获取工作区的待处理手动变更记录（供 Hook 脚本调用）。

返回：
- 如果有变更：格式化的提醒文本
- 如果无变更：空字符串

**使用场景**：
- Hook 脚本在 UserPromptSubmit 时检查变更
- Hook 脚本在 PreToolUse 时检查变更
- 通过 session_status 获取绑定的工作区 ID

**注意**：
- 此工具不会清除变更记录（由 context_get/workspace_get 负责清除）
- 建议在 Hook 脚本中使用，不建议 AI 直接调用`,
  readonly: true,
  inputSchema: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description:
          "会话 ID（用于获取绑定的工作区）。Claude Code / Cursor / OpenCode 由 Hook 自动注入；Codex 等平台需传入 session_bind 返回的 _generatedSessionId。",
      },
      workspaceId: {
        type: "string",
        description: "工作区 ID（可选，如果不提供则使用 session 绑定的工作区）",
      },
    },
    required: ["sessionId"],
  },
};

/**
 * 所有 session 工具
 */
export const sessionTools: TanmiTool[] = [
  sessionBindTool,
  sessionUnbindTool,
  sessionStatusTool,
  getPendingChangesTool,
];
