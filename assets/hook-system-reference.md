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

> ⚠️ OpenCode 使用不同的 Hook 机制，需要适配

### 可用事件（25+ 种）

OpenCode 使用 **插件系统** 而非配置文件来实现 Hooks，按类别分为 8 大类。

#### Command 事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `command.executed` | 命令执行完成 | - |

#### File 事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `file.edited` | 文件被修改 | - |
| `file.watcher.updated` | 文件系统变更 | - |

#### Installation 事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `installation.updated` | 安装状态变更 | - |

#### LSP 事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `lsp.client.diagnostics` | LSP 诊断信息 | - |
| `lsp.updated` | LSP 服务器更新 | - |

#### Message 事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `message.part.removed` | 消息组件删除 | - |
| `message.part.updated` | 消息组件更新 | - |
| `message.removed` | 整条消息删除 | - |
| `message.updated` | 消息更新 | - |

#### Permission 事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `permission.replied` | 权限请求响应 | PermissionRequest |
| `permission.updated` | 权限设置变更 | - |

#### Server 事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `server.connected` | 服务器连接建立 | - |

#### Session 事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `session.created` | 会话创建 | SessionStart |
| `session.compacted` | 上下文压缩 | PreCompact |
| `session.deleted` | 会话删除 | SessionEnd |
| `session.diff` | 会话差异 | - |
| `session.error` | 会话错误 | - |
| `session.idle` | 会话空闲 | Stop（部分） |
| `session.status` | 会话状态变更 | - |
| `session.updated` | 会话更新 | - |

#### Todo 事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `todo.updated` | 任务列表变更 | - |

#### Tool 事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `tool.execute.before` | 工具执行前 | PreToolUse |
| `tool.execute.after` | 工具执行后 | PostToolUse |

#### TUI 事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `tui.prompt.append` | 提示追加 | - |
| `tui.command.execute` | TUI 命令执行 | - |
| `tui.toast.show` | Toast 通知显示 | Notification |

#### 实验性事件
| 事件 | 触发时机 | 对应 Claude Code |
|------|---------|------------------|
| `experimental.session.compacting` | 压缩前注入上下文 | PreCompact（增强）|

### 与 Claude Code 的差异

| 特性 | Claude Code | OpenCode |
|------|------------|----------|
| 配置方式 | JSON 配置文件 | JS/TS 插件代码 |
| 事件数量 | 10 种 | 25+ 种 |
| Matcher | ✅ 正则匹配 | ❌ 不支持 |
| 工具参数修改 | ✅ updatedInput | ❌ 不支持 |
| **UserPromptSubmit** | ✅ 支持 | ❌ **无对应** |
| 会话标识 | `session_id` | `event.session.id` |
| 热加载 | ❌ 需重启 | ✅ 支持 |

### 配置位置

**插件目录**：
- `.opencode/plugin/` - 项目级
- `~/.config/opencode/plugin/` - 全局

### 插件格式

```typescript
// .opencode/plugin/tanmi-hooks.ts
export default function tanmiPlugin(ctx) {
  return {
    // session.created → SessionStart
    "session.created": async (event) => {
      const sessionId = event.session.id;
      // 注入上下文
      return { context: "..." };
    },

    // tool.execute.after → PostToolUse
    "tool.execute.after": async (event) => {
      if (event.tool.name === 'edit') {
        return { message: "提醒记录日志" };
      }
    },

    // OpenCode 独有：文件编辑后
    "file.edited": async (event) => {
      console.log(`文件已编辑: ${event.path}`);
    }
  };
}
```

### TanmiWorkspace 兼容性

| Hook 功能 | 兼容性 | 说明 |
|-----------|--------|------|
| 会话上下文注入 | ⚠️ 部分 | 通过 session.created 实现 |
| MCP 调用错误提醒 | ✅ | 通过 tool.execute.after |
| 文件变更提醒 | ✅ | 通过 file.edited |
| 用户输入检测 | ❌ | 无 UserPromptSubmit 替代 |
| 智能提醒 | ⚠️ 降级 | 需要其他机制替代 |

### 适配建议

1. **环境变量检测平台**：
   ```typescript
   const isOpenCode = process.env.OPENCODE === "true";
   ```

2. **双模式输出**：
   ```typescript
   function outputResponse(context) {
     if (isOpenCode) {
       return { context, continue: true };
     } else {
       // Claude Code 格式
       console.log(JSON.stringify({ hookSpecificOutput: { ... } }));
     }
   }
   ```

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
