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

### 可用事件（12 种）

**Agent Hooks**：

| 事件 | 触发时机 | 用途 |
|------|---------|------|
| **beforeShellExecution** | Shell 命令执行前 | 权限控制、命令验证 |
| **afterShellExecution** | Shell 命令执行后 | 日志记录、结果处理 |
| **beforeMCPExecution** | MCP 工具调用前 | 权限控制、参数验证 |
| **afterMCPExecution** | MCP 工具调用后 | 日志记录、结果处理 |
| **beforeReadFile** | 读取文件前 | 权限控制、路径验证 |
| **afterFileEdit** | 文件编辑后 | 格式化、验证 |
| **beforeSubmitPrompt** | 用户提交消息前 | 上下文注入、验证 |
| **stop** | Agent 完成响应 | 后续消息提交 |
| **afterAgentResponse** | Agent 响应后 | 响应后处理 |
| **afterAgentThought** | Agent 思考后 | 思考过程监控 |

**Tab Hooks**：

| 事件 | 触发时机 | 用途 |
|------|---------|------|
| **beforeTabFileRead** | Tab 读取文件前 | 权限控制 |
| **afterTabFileEdit** | Tab 编辑文件后 | 格式化、验证 |

### 与 Claude Code 的差异

| 特性 | Claude Code | Cursor |
|------|------------|--------|
| 事件数量 | 10 种 | 12 种 |
| 会话标识 | `session_id` | `conversation_id` |
| SessionStart | ✅ 支持 | ❌ 不支持 |
| PreToolUse | ✅ 支持 | ✅ before* 系列 |
| PostToolUse | ✅ 支持 | ✅ after* 系列 |
| Matcher | ✅ 正则匹配 | ❌ 不支持 |
| 工具参数修改 | ✅ updatedInput | ❌ 不支持 |
| MCP 工具拦截 | ✅ 通过 matcher | ✅ beforeMCPExecution |
| Shell 命令拦截 | ✅ matcher="Bash" | ✅ beforeShellExecution |

### 配置位置

`~/.cursor/hooks.json`

### 配置格式

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [
      {
        "command": "./path/to/hook.sh"
      }
    ],
    "beforeShellExecution": [
      {
        "command": "node /path/to/validator.js"
      }
    ],
    "afterFileEdit": [
      {
        "command": "prettier --write"
      }
    ]
  }
}
```

### 输入格式

**通用字段**：
```json
{
  "conversation_id": "abc123",
  "hook_event_name": "beforeSubmitPrompt",
  "prompt": "用户输入内容"
}
```

**beforeShellExecution**：
```json
{
  "conversation_id": "abc123",
  "hook_event_name": "beforeShellExecution",
  "command": "npm install lodash"
}
```

**beforeMCPExecution**：
```json
{
  "conversation_id": "abc123",
  "hook_event_name": "beforeMCPExecution",
  "server_name": "tanmi-workspace",
  "tool_name": "node_create",
  "arguments": { "...": "..." }
}
```

**afterFileEdit**：
```json
{
  "conversation_id": "abc123",
  "hook_event_name": "afterFileEdit",
  "file_path": "/path/to/file.ts",
  "content": "文件内容"
}
```

### 输出格式

**权限决策**（before* 事件）：
```json
{
  "permission": "allow",
  "user_message": "显示给用户的消息（可选）",
  "agent_message": "注入给 AI 的上下文（可选）"
}
```

`permission` 取值：
- `allow` - 允许执行
- `deny` - 拒绝执行
- `ask` - 让用户决定

**stop 事件后续消息**：
```json
{
  "followup_message": "自动提交的后续消息"
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
