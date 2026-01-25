# Hook 系统参考文档

> Claude Code 与 Cursor 的 Hook 系统对比和使用指南

## 概述

Hook 系统允许在 AI 工作流程的关键节点插入自定义逻辑，实现上下文注入、权限控制、日志记录等功能。

---

## Claude Code Hook 系统

### 可用事件（10 种）

| 事件 | 触发时机 | Matcher | 用途 |
|------|---------|:-------:|------|
| **SessionStart** | 会话启动/恢复 | ✅ | 环境初始化、上下文注入 |
| **SessionEnd** | 会话结束 | ❌ | 清理、日志保存 |
| **UserPromptSubmit** | 用户提交消息前 | ❌ | 验证、上下文注入 |
| **PreToolUse** | 工具执行前 | ✅ | 权限控制、参数修改 |
| **PostToolUse** | 工具执行后 | ✅ | 日志记录、格式化 |
| **PermissionRequest** | 权限对话框显示 | ✅ | 自动允许/拒绝 |
| **Stop** | Claude 完成响应 | ❌ | 决定是否继续 |
| **SubagentStop** | 子代理完成 | ❌ | 评估任务完成 |
| **PreCompact** | Compact 操作前 | ✅ | 预处理 |
| **Notification** | 发送通知时 | ✅ | 自定义通知 |

### Matcher 说明

**SessionStart matcher**：
- `startup` - 新会话启动
- `resume` - 从 `--resume`/`--continue`/`/resume` 恢复
- `clear` - 从 `/clear` 清除
- `compact` - 从自动或手动 compact

**PreToolUse/PostToolUse/PermissionRequest matcher**：
- `Bash` - 精确匹配
- `Edit|Write` - 正则匹配
- `mcp__tanmi-workspace__.*` - MCP 工具匹配
- `*` - 匹配所有工具

**PreCompact matcher**：
- `manual` - 从 `/compact` 命令
- `auto` - 自动 compact

**Notification matcher**：
- `permission_prompt` - 权限请求
- `idle_prompt` - 空闲超过 60 秒
- `auth_success` - 认证成功
- `elicitation_dialog` - MCP 工具需要输入

### 配置位置（优先级从高到低）

1. `.claude/settings.local.json` - 项目本地（不提交）
2. `.claude/settings.json` - 项目级
3. `~/.claude/settings.json` - 用户级
4. 企业托管策略 - 企业级

### 配置格式

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/hook.js SessionStart",
            "timeout": 10000
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "node_create",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/hook.js PreToolUse",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

### 输入格式

Hook 通过 stdin 接收 JSON 输入：

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "permission_mode": "default|plan|acceptEdits|bypassPermissions",
  "hook_event_name": "EventName",
  "prompt": "用户输入内容（UserPromptSubmit）",
  "tool_name": "工具名称（PreToolUse/PostToolUse）",
  "tool_input": { "参数": "值" }
}
```

### 输出格式

**通用响应**：
```json
{
  "hookSpecificOutput": {
    "hookEventName": "EventName",
    "additionalContext": "注入给 AI 的上下文"
  }
}
```

**PreToolUse 决策**：
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask",
    "permissionDecisionReason": "原因说明",
    "updatedInput": { "参数": "修改后的值" }
  }
}
```

**阻止执行**：
```json
{
  "decision": "block",
  "reason": "阻止原因"
}
```

### 退出码

| 退出码 | 含义 |
|-------|------|
| `0` | 成功，stdout 作为 JSON 处理 |
| `2` | 阻止操作，stderr 反馈给 Claude |
| 其他 | 非阻止错误，继续执行 |

### 特殊功能

**环境变量持久化**（SessionStart）：
```bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
fi
```

---

## Cursor Hook 系统

> 更新时间：2026-01-20，基于 Cursor 官方文档 https://cursor.com/docs/agent/hooks

### 可用事件（15 种）

**Agent Hooks（13 种）**：

| 事件 | 触发时机 | 用途 |
|------|---------|------|
| **sessionStart** | 会话创建时 | 环境初始化、上下文注入、阻止会话 |
| **sessionEnd** | 会话结束时 | 审计、日志、清理 |
| **beforeSubmitPrompt** | 用户提交消息前 | 验证、阻止提交 |
| **beforeShellExecution** | Shell 命令执行前 | 权限控制、命令验证 |
| **afterShellExecution** | Shell 命令执行后 | 日志记录、结果处理 |
| **beforeMCPExecution** | MCP 工具调用前 | 权限控制、参数验证 |
| **afterMCPExecution** | MCP 工具调用后 | 日志记录、结果处理 |
| **beforeReadFile** | 读取文件前 | 权限控制、路径验证 |
| **afterFileEdit** | 文件编辑后 | 格式化、验证 |
| **preCompact** | 上下文压缩前 | 通知用户、审计 |
| **stop** | Agent 完成响应 | 后续消息提交（最多 5 次自动重试） |
| **afterAgentResponse** | Agent 响应后 | 响应后处理 |
| **afterAgentThought** | Agent 思考后 | 思考过程监控 |

**Tab Hooks（2 种）**：

| 事件 | 触发时机 | 用途 |
|------|---------|------|
| **beforeTabFileRead** | Tab 读取文件前 | 权限控制、秘密脱敏 |
| **afterTabFileEdit** | Tab 编辑文件后 | 格式化、验证 |

### 与 Claude Code 的差异

| 特性 | Claude Code | Cursor |
|------|------------|--------|
| 事件数量 | 10 种 | 15 种 |
| 会话标识 | `session_id` | `conversation_id`（`session_id` 等同） |
| SessionStart | ✅ 支持 | ✅ **支持**（`sessionStart`） |
| SessionEnd | ✅ 支持 | ✅ **支持**（`sessionEnd`） |
| PreToolUse | ✅ 支持 | ✅ before* 系列 |
| PostToolUse | ✅ 支持 | ✅ after* 系列 |
| PreCompact | ✅ 支持 | ✅ **支持**（`preCompact`） |
| Matcher | ✅ 正则匹配 | ❌ 不支持 |
| 工具参数修改 | ✅ updatedInput | ❌ 不支持 |
| 上下文注入 | ✅ additionalContext | ✅ `additional_context` / `agent_message` |
| MCP 工具拦截 | ✅ 通过 matcher | ✅ beforeMCPExecution |
| Shell 命令拦截 | ✅ matcher="Bash" | ✅ beforeShellExecution |

### 配置位置（优先级从高到低）

1. **企业级**（Enterprise-managed）：
   - macOS: `/Library/Application Support/Cursor/hooks.json`
   - Linux/WSL: `/etc/cursor/hooks.json`
   - Windows: `C:\ProgramData\Cursor\hooks.json`
2. **项目级**：`<project-root>/.cursor/hooks.json`
3. **用户级**：`~/.cursor/hooks.json`

### 配置格式

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "./hooks/session-init.sh" }
    ],
    "sessionEnd": [
      { "command": "./hooks/audit.sh" }
    ],
    "beforeSubmitPrompt": [
      { "command": "./hooks/validate-prompt.sh" }
    ],
    "beforeShellExecution": [
      { "command": "./hooks/audit.sh" },
      { "command": "./hooks/block-git.sh" }
    ],
    "afterShellExecution": [
      { "command": "./hooks/audit.sh" }
    ],
    "beforeMCPExecution": [
      { "command": "./hooks/audit.sh" }
    ],
    "afterMCPExecution": [
      { "command": "./hooks/audit.sh" }
    ],
    "afterFileEdit": [
      { "command": "./hooks/format.sh" }
    ],
    "preCompact": [
      { "command": "./hooks/audit.sh" }
    ],
    "stop": [
      { "command": "./hooks/track-stop.sh" }
    ],
    "beforeTabFileRead": [
      { "command": "./hooks/redact-secrets-tab.sh" }
    ],
    "afterTabFileEdit": [
      { "command": "./hooks/format-tab.sh" }
    ]
  }
}
```

### 输入格式

**通用字段**（所有 Hook 都包含）：
```json
{
  "conversation_id": "string",
  "generation_id": "string",
  "model": "string",
  "hook_event_name": "string",
  "cursor_version": "string",
  "workspace_roots": ["<path>"],
  "user_email": "string | null"
}
```

**sessionStart**：
```json
{
  "session_id": "<unique session identifier>",
  "is_background_agent": true | false,
  "composer_mode": "agent" | "ask" | "edit"
}
```

**sessionEnd**：
```json
{
  "session_id": "<unique session identifier>",
  "reason": "completed" | "aborted" | "error" | "window_close" | "user_close",
  "duration_ms": 45000,
  "is_background_agent": true | false,
  "final_status": "<status string>",
  "error_message": "<error details if reason is 'error'>"
}
```

**beforeSubmitPrompt**：
```json
{
  "prompt": "<user prompt text>",
  "attachments": [
    { "type": "file" | "rule", "filePath": "<absolute path>" }
  ]
}
```

**beforeShellExecution**：
```json
{
  "command": "<full terminal command>",
  "cwd": "<current working directory>"
}
```

**afterShellExecution**：
```json
{
  "command": "<full terminal command>",
  "output": "<full terminal output>",
  "duration": 1234
}
```

**beforeMCPExecution**：
```json
{
  "tool_name": "<tool name>",
  "tool_input": "<json params>",
  "url": "<server url>"  // 或 "command": "<command string>"
}
```

**afterMCPExecution**：
```json
{
  "tool_name": "<tool name>",
  "tool_input": "<json params>",
  "result_json": "<tool result json>",
  "duration": 1234
}
```

**afterFileEdit**：
```json
{
  "file_path": "<absolute path>",
  "edits": [
    { "old_string": "<search>", "new_string": "<replace>" }
  ]
}
```

**preCompact**：
```json
{
  "trigger": "auto" | "manual",
  "context_usage_percent": 85,
  "context_tokens": 120000,
  "context_window_size": 128000,
  "message_count": 45,
  "messages_to_compact": 30,
  "is_first_compaction": true | false
}
```

**stop**：
```json
{
  "status": "completed" | "aborted" | "error",
  "loop_count": 0  // 已触发自动 follow-up 次数，最多 5 次
}
```

**afterAgentResponse**：
```json
{
  "text": "<assistant final text>"
}
```

**afterAgentThought**：
```json
{
  "text": "<fully aggregated thinking text>",
  "duration_ms": 5000
}
```

**beforeReadFile**：
```json
{
  "file_path": "<absolute path>",
  "attachments": [
    { "type": "file" | "rule", "filePath": "<absolute path>" }
  ]
}
```

**beforeTabFileRead**：
```json
{
  "file_path": "<absolute path>",
  "content": "<file contents>"
}
```

**afterTabFileEdit**：
```json
{
  "file_path": "<absolute path>",
  "edits": [
    {
      "old_string": "<search>",
      "new_string": "<replace>",
      "range": {
        "start_line_number": 10,
        "start_column": 5,
        "end_line_number": 10,
        "end_column": 20
      },
      "old_line": "<line before edit>",
      "new_line": "<line after edit>"
    }
  ]
}
```

### 输出格式

**sessionStart 输出**：
```json
{
  "env": { "<key>": "<value>" },
  "additional_context": "<context to add to conversation>",
  "continue": true | false,
  "user_message": "<message shown if blocked>"
}
```

**sessionEnd 输出**：
```json
// 无输出字段 - fire and forget
```

**权限决策**（before* 事件）：
```json
{
  "permission": "allow" | "deny" | "ask",
  "user_message": "显示给用户的消息（可选）",
  "agent_message": "注入给 AI 的上下文（可选）"
}
```

**beforeSubmitPrompt 输出**：
```json
{
  "continue": true | false,
  "user_message": "<message shown to user when blocked>"
}
```

**preCompact 输出**：
```json
{
  "user_message": "<message to show when compaction occurs>"
}
```

**stop 输出**：
```json
{
  "followup_message": "<message text>"  // 自动提交的后续消息
}
```

**beforeTabFileRead 输出**：
```json
{
  "permission": "allow" | "deny"
}
```

**afterTabFileEdit / afterAgentResponse / afterAgentThought 输出**：
```json
// 无输出字段
```

> **注意**：
> - `loop_count` 表示已触发自动 follow-up 次数，最多 5 次以防止无限循环
> - Tab Hooks 和 Agent Hooks 使用不同的事件，可以设置不同的策略
> - `afterTabFileEdit` 比 `afterFileEdit` 提供更详细的编辑信息（range、old_line、new_line）

---

## OpenCode Hook 系统

> 更新时间：2026-01-25
>
> 项目地址：https://github.com/anomalyco/opencode
> 官网：https://opencode.ai/

OpenCode 使用基于 **Plugin** 的 Hook 系统，通过 JavaScript/TypeScript 模块实现，与 Claude Code 的外部脚本模式有本质区别。

### 架构概述

| 特性 | Claude Code | OpenCode |
|------|-------------|----------|
| **架构方式** | 独立 Hook 配置 (settings.json) | 插件系统内嵌 |
| **实现语言** | 外部脚本（任意语言） | JavaScript/TypeScript 模块 |
| **配置格式** | JSON | JSON + JS/TS 代码 |
| **执行方式** | 外部进程，stdin/stdout 通信 | 内嵌模块，直接修改对象 |

### 可用 Hook 事件

#### 事件监听 Hooks

通过 `event` hook 订阅的事件类型：

**Session 事件**：
| 事件类型 | 触发时机 | 对应 Claude Code |
|----------|----------|------------------|
| `session.created` | 会话创建 | SessionStart |
| `session.idle` | 会话空闲/完成 | Stop |
| `session.error` | 会话错误 | - |
| `session.deleted` | 会话删除 | SessionEnd |
| `session.compacted` | 上下文压缩后 | - |
| `session.updated` | 会话更新 | - |
| `session.status` | 会话状态变更（idle/retry/busy） | - |
| `session.diff` | 会话差异信息 | - |

**Tool 事件**：
| 事件类型 | 触发时机 | 对应 Claude Code |
|----------|----------|------------------|
| `tool.execute.before` | 工具执行前 | PreToolUse |
| `tool.execute.after` | 工具执行后 | PostToolUse |

**File 事件**：
| 事件类型 | 触发时机 | 对应 Claude Code |
|----------|----------|------------------|
| `file.edited` | 文件被修改 | - |
| `file.watcher.updated` | 文件系统变更（add/change/unlink） | - |

**Message 事件**：
| 事件类型 | 触发时机 | 对应 Claude Code |
|----------|----------|------------------|
| `message.updated` | 消息更新 | - |
| `message.removed` | 消息移除 | - |
| `message.part.updated` | 消息部件更新 | - |
| `message.part.removed` | 消息部件移除 | - |

**Permission 事件**：
| 事件类型 | 触发时机 | 对应 Claude Code |
|----------|----------|------------------|
| `permission.replied` | 权限请求响应 | PermissionRequest |
| `permission.updated` | 权限设置变更 | - |

**TUI 事件**：
| 事件类型 | 触发时机 | 对应 Claude Code |
|----------|----------|------------------|
| `tui.toast.show` | Toast 通知显示 | Notification |
| `tui.prompt.append` | TUI 提示追加 | - |
| `tui.command.execute` | TUI 命令执行 | - |

**其他事件**：
| 事件类型 | 触发时机 | 对应 Claude Code |
|----------|----------|------------------|
| `command.executed` | 命令执行完成 | - |
| `lsp.client.diagnostics` | LSP 诊断信息 | - |
| `lsp.updated` | LSP 更新 | - |
| `todo.updated` | 任务列表变更 | - |
| `server.connected` | 服务器连接 | - |
| `vcs.branch.updated` | VCS 分支更新 | - |
| `installation.updated` | 安装更新 | - |

#### 可拦截/修改的 Hooks

| Hook 名称 | 触发时机 | 可修改内容 | 对应 Claude Code |
|-----------|----------|------------|------------------|
| `tool.execute.before` | 工具执行前 | **工具参数 (args)** | PreToolUse |
| `tool.execute.after` | 工具执行后 | title, output, metadata | PostToolUse |
| `chat.message` | 收到新消息时 | 消息内容和部件 | UserPromptSubmit（部分） |
| `chat.params` | 发送 LLM 请求前 | temperature, topP, topK, options | - |
| `chat.headers` | 发送 LLM 请求前 | HTTP 请求头 | - |
| `permission.ask` | 请求权限时 | 权限状态 (ask/deny/allow) | PermissionRequest |
| `command.execute.before` | 命令执行前 | 消息部件 | - |
| `config` | 配置加载后 | 配置对象 | - |
| `auth` | 认证时 | 认证方法 | - |

**实验性 Hooks**：
| Hook 名称 | 触发时机 | 可修改内容 |
|-----------|----------|------------|
| `experimental.chat.system.transform` | 系统提示转换 | 系统提示数组 |
| `experimental.chat.messages.transform` | 消息转换 | 消息列表 |
| `experimental.session.compacting` | 会话压缩前 | context 数组, prompt |
| `experimental.text.complete` | 文本补全 | text |

### 与 Claude Code 的功能对比

| 功能 | Claude Code | OpenCode | 说明 |
|------|-------------|----------|------|
| **SessionStart** | ✅ 支持 | ✅ `session.created` 事件 | 功能等效 |
| **SessionEnd** | ✅ 支持 | ✅ `session.deleted` 事件 | 功能等效 |
| **UserPromptSubmit** | ✅ 支持 | ⚠️ `chat.message` | 部分等效 |
| **PreToolUse** | ✅ 支持 | ✅ `tool.execute.before` | 功能等效 |
| **PostToolUse** | ✅ 支持 | ✅ `tool.execute.after` | 功能等效 |
| **Stop** | ✅ 支持 | ✅ `session.idle` 事件 | 功能等效 |
| **PreCompact** | ✅ 支持 | ✅ `experimental.session.compacting` | 实验性功能 |
| **PermissionRequest** | ✅ 支持 | ✅ `permission.ask` | 功能等效 |
| **Notification** | ✅ 支持 | ✅ `tui.toast.show` 事件 | 功能等效 |
| **SubagentStop** | ✅ 支持 | ❌ 不支持 | - |
| **Matcher 模式** | ✅ 正则匹配 | ❌ 代码内判断 | 需手动实现 |
| **工具参数修改** | ✅ updatedInput | ✅ 直接修改 output.args | 功能等效 |
| **LLM 参数修改** | ❌ 不支持 | ✅ `chat.params` | OpenCode 独有 |
| **HTTP 头修改** | ❌ 不支持 | ✅ `chat.headers` | OpenCode 独有 |
| **系统提示修改** | ❌ 不支持 | ✅ `experimental.chat.system.transform` | OpenCode 独有 |
| **消息转换** | ❌ 不支持 | ✅ `experimental.chat.messages.transform` | OpenCode 独有 |

### 配置位置

**全局配置**：
- 配置文件：`~/.config/opencode/opencode.json`
- 插件目录：`~/.config/opencode/plugins/`

**项目配置**：
- 配置文件：`opencode.json`（项目根目录）
- 插件目录：`.opencode/plugins/`

### 配置格式

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-helicone-session",
    "@my-org/custom-plugin"
  ]
}
```

### 插件格式

```typescript
// .opencode/plugins/my-plugin.ts
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory }) => {
  return {
    // 事件监听
    event: async ({ event }) => {
      if (event.type === "session.created") {
        // 会话开始
      }
      if (event.type === "session.idle") {
        // 会话完成
      }
    },

    // 工具执行前拦截（可修改参数）
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        // 修改命令参数
        output.args.command = sanitize(output.args.command)
      }
    },

    // 工具执行后处理
    "tool.execute.after": async (input, output) => {
      // 修改输出
      output.title = `[Modified] ${output.title}`
    },

    // 自定义工具
    tool: {
      mytool: tool({
        description: "Custom tool",
        args: { foo: tool.schema.string() },
        async execute(args, ctx) {
          return `Hello ${args.foo}!`
        },
      }),
    },
  }
}
```

### Hook 函数签名

```typescript
// 拦截型 Hook（可修改）
"hook.name": (
  input: InputType,   // 只读的上下文信息
  output: OutputType  // 可修改的输出对象
) => Promise<void>

// 事件型 Hook（只监听）
event: ({ event }: { event: Event }) => Promise<void>
```

### TanmiWorkspace 兼容性

| Hook 功能 | Claude Code | OpenCode | 兼容策略 |
|-----------|-------------|----------|----------|
| 会话上下文注入 | SessionStart | ✅ `session.created` 事件 | 可完整实现 |
| 用户输入检测 | UserPromptSubmit | ⚠️ `chat.message` | 部分支持 |
| 工具调用监控 | PreToolUse | ✅ `tool.execute.before` | 可完整实现 |
| 工具参数修改 | updatedInput | ✅ 直接修改 output.args | 可完整实现 |
| 结果处理 | PostToolUse | ✅ `tool.execute.after` | 可完整实现 |
| MCP 调用拦截 | Matcher 匹配 | ❌ 无 Matcher | 需在代码中手动过滤 |
| 子代理监控 | SubagentStop | ❌ 不支持 | 无法实现 |
| 智能提醒 | Hook 注入 | ✅ 事件系统 | 可完整实现 |

### TanmiWorkspace OpenCode 插件

TanmiWorkspace 提供了完整的 OpenCode 插件实现，位于 `plugin/opencode/index.ts`。

#### 功能特性

| 功能 | Hook | 说明 |
|------|------|------|
| **会话初始化** | `session.created` 事件 | 获取 sessionId，加载绑定和工作区上下文 |
| **上下文注入** | `experimental.chat.system.transform` | 将工作区上下文注入系统提示 |
| **权限控制** | `tool.execute.before` | 三层检查：绑定/阶段约束/写入限制 |
| **智能提醒** | `tool.execute.after` | 节点完成提醒、日志记录提醒 |
| **用户消息提醒** | `chat.message` | 未绑定时的绑定提醒 |
| **会话空闲检测** | `session.idle` 事件 | 检测未提交问题、进行中节点 |

#### 使用方式

1. **配置 opencode.json**：
   ```json
   {
     "plugin": [
       "./path/to/tanmi-workspace/plugin/opencode/index.ts"
     ]
   }
   ```

2. **或者全局安装后配置**：
   ```json
   {
     "plugin": ["tanmi-workspace/plugin/opencode"]
   }
   ```

#### 与 Claude Code 版本的差异

| 功能 | Claude Code | OpenCode | 差异说明 |
|------|-------------|----------|----------|
| **上下文注入** | additionalContext | 系统提示追加 | 使用 `experimental.chat.system.transform` |
| **用户消息拦截** | UserPromptSubmit | chat.message | 无法阻止，只能事后提醒 |
| **会话结束处理** | Stop | session.idle | 只读事件，无法阻止会话结束 |
| **Matcher 匹配** | 正则配置 | 代码内判断 | 需手动实现过滤逻辑 |

#### 代码结构

```typescript
// plugin/opencode/index.ts 主要导出
export const TanmiWorkspacePlugin: Plugin = async (ctx) => {
  return {
    // 1. 事件监听
    event: async ({ event }) => {
      // session.created: 初始化会话状态
      // session.idle: 检测未完成的工作
      // session.deleted: 清理会话状态
    },

    // 2. 系统提示注入（OpenCode 独有）
    'experimental.chat.system.transform': async (input, output) => {
      // 追加 TanmiWorkspace 上下文到系统提示
    },

    // 3. 权限控制
    'tool.execute.before': async (input, output) => {
      // 绑定检查、阶段约束、写入限制
    },

    // 4. 智能提醒
    'tool.execute.after': async (input, output) => {
      // 节点完成提醒、日志记录提醒
    },

    // 5. 用户消息提醒
    'chat.message': async (input, output) => {
      // 未绑定时检测关键词并提醒
    },
  }
}
```

#### 降级功能说明

1. **chat.message vs UserPromptSubmit**
   - Claude Code：用户发送前触发，可阻止或修改
   - OpenCode：消息发送后触发，只能追加提醒

2. **session.idle vs Stop**
   - Claude Code：可阻止会话结束，强制用户处理
   - OpenCode：只读事件，只能记录警告日志

---

## 最佳实践

### 1. 规则提醒时机选择

| 时机 | 适用场景 | 推荐方式 |
|------|---------|---------|
| SessionStart | 会话初始化 | 完整规则注入 |
| UserPromptSubmit | 每次对话 | 规则摘要提醒 |
| PreToolUse | 特定工具调用前 | 针对性规则强调 |

### 2. PreToolUse 精准控制（Claude Code 专属）

```json
{
  "PreToolUse": [
    {
      "matcher": "mcp__tanmi-workspace__node_create",
      "hooks": [{
        "type": "command",
        "command": "node /path/to/rule-reminder.js"
      }]
    }
  ]
}
```

### 3. 错误处理

- 所有错误静默处理，不干扰用户
- 超时设置合理（建议 5-10 秒）
- 输出格式严格遵守规范

### 4. 调试方法

**Claude Code**：
```bash
claude --debug  # 查看 Hook 执行详情
/hooks          # 可视化 Hook 编辑器
```

---

## 附录：常用工具名称

| 工具 | 说明 |
|------|------|
| `Bash` | 执行 shell 命令 |
| `Read` | 读取文件 |
| `Write` | 写入文件 |
| `Edit` | 编辑文件 |
| `Glob` | 文件模式匹配 |
| `Grep` | 内容搜索 |
| `Task` | 子代理任务 |
| `WebFetch` | 网页获取 |
| `WebSearch` | 网页搜索 |
| `mcp__<server>__<tool>` | MCP 工具 |
