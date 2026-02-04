# Change Tracking Hook 调研

## 目的

验证通过 Claude Code Hook 实现「透明变更追踪」的可行性。

## 预期数据

根据 `assets/hook-system-reference.md`，PostToolUse Hook 通过 stdin 接收：

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "PostToolUse",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "old_string": "原内容",
    "new_string": "新内容"
  }
}
```

## 测试步骤

### 1. 配置 Hook

编辑 `~/.claude/settings.json` 或项目的 `.claude/settings.json`：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/tanmika/WebProject/TanmiWorkspace/tanmi-workspace/scripts/hooks/test-change-tracker.sh",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

### 2. 重启 Claude Code

```bash
# 退出当前会话，重新启动
claude
```

### 3. 触发文件修改

在 Claude Code 中执行任何 Edit 或 Write 操作，例如：

```
请在 /tmp/test-hook.txt 中写入 "Hello World"
```

### 4. 查看日志

```bash
# 查看汇总
cat ~/.tanmi-workspace-dev/hook-test/summary.log

# 查看最新的详细日志
ls -la ~/.tanmi-workspace-dev/hook-test/
cat ~/.tanmi-workspace-dev/hook-test/*.json | jq .
```

## 需要验证的点

| 验证项 | 预期 | 实际 |
|--------|------|------|
| `tool_name` | `Edit` 或 `Write` | ? |
| `tool_input.file_path` | 绝对路径 | ? |
| `tool_input.old_string` (Edit) | 原内容 | ? |
| `tool_input.new_string` (Edit) | 新内容 | ? |
| `tool_input.content` (Write) | 完整文件内容 | ? |
| `session_id` | 会话标识 | ? |

## 关键问题

1. **Edit 工具能拿到完整的 old_string/new_string 吗？**
   - 如果能，可以直接记录 diff
   - 如果只有部分，需要在 Hook 中读取文件补全

2. **Write 工具能拿到完整的 content 吗？**
   - 如果能，可以直接记录新内容
   - 需要 Hook 记录写入前的文件内容（如果存在）

3. **session_id 是否稳定？**
   - 用于关联到 TanmiWorkspace 的 binding

## 后续工作

如果验证通过，需要：

1. 实现正式的 Hook 脚本，调用 MCP 记录变更
2. 设计 `.changes/` 存储格式
3. 实现与节点的关联机制
