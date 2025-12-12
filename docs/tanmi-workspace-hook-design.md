# Tanmi-Workspace Hook 设计文档

## 概述

### 这是什么？

为 Tanmi-Workspace 设计的 **Hook 插件**，用于在 AI 对话过程中自动注入工作区上下文。支持 **Claude Code** 和 **Cursor** 两个平台。

### 支持平台

| 平台 | 会话标识 | 触发事件 | 配置文件 |
|------|---------|---------|---------|
| Claude Code | `session_id` | SessionStart, UserPromptSubmit | `~/.claude/settings.json` |
| Cursor | `conversation_id` | beforeSubmitPrompt | `~/.cursor/hooks.json` |

### 能实现什么功能？

| 功能 | 说明 | 当前状态 → 实现后 |
|------|------|------------------|
| **自动提醒工作区** | 每次对话开始时注入当前工作区信息 | AI 经常忘记 → AI 始终知道 |
| **自动提醒规则** | 注入工作区规则，AI 不会遗漏 | 规则容易被忽略 → 规则始终可见 |
| **自动提醒聚焦节点** | 注入当前任务状态和需求 | 需要手动查询 → 自动获知 |
| **多窗口隔离** | 不同窗口可绑定不同工作区 | 无法区分 → 精确控制 |
| **按需启用** | 只有绑定后才激活，不干扰普通对话 | - |

### 用户视角的效果

**绑定工作区前**：
```
用户: 帮我看看这个 bug
AI: （正常对话，不涉及工作区）
```

**绑定工作区后**：
```
用户: 帮我看看这个 bug

AI 自动收到注入的上下文：
┌─────────────────────────────────────────┐
│ 当前工作区: 重构认证模块                  │
│ 目标: 将 session 认证替换为 JWT          │
│ 规则:                                    │
│ - 所有 API 必须添加认证中间件             │
│ - 密钥必须从环境变量读取                  │
│ 聚焦节点: 实现 token 验证 (implementing)  │
└─────────────────────────────────────────┘

AI: 我来帮你看这个 bug。根据工作区规则，我需要确保...
    [自动遵守规则，自动更新节点状态]
```

---

## 问题背景

### 当前问题：AI 容易"忘记"工作区

Tanmi-Workspace 作为 MCP 服务运行时，AI 容易"忘记"：
- 忘记调用工作区 API 更新节点状态
- 忘记记录日志
- 忘记遵守工作区规则
- 长对话后完全忘记工作区的存在

### 为什么会忘记？

MCP 工具是**被动的**——AI 必须主动调用才能获取信息。随着对话变长，工作区相关的指令被"稀释"，AI 的注意力转移到当前任务上。

### 借鉴：Claude-Mem 的解决方案

Claude-Mem 使用 Claude Code 的 **Hooks 机制**，在关键时刻**主动向 AI 注入信息**：

```
SessionStart     → 自动注入历史记忆
UserPromptSubmit → 每次用户输入时刷新上下文
PostToolUse      → 每次工具调用后自动记录
```

这样 AI 不需要"记得调用"，系统会自动提醒。

---

## 核心挑战

### 挑战 1：Tanmi-Workspace 不是必须启用的

与 Claude-Mem（总是运行）不同，Tanmi-Workspace 是可选的：
- 用户可能安装了但没有创建工作区
- 用户可能暂时不想使用工作区功能
- 用户可能同时安装了多个类似插件

**需求**：Hook 必须能够判断"现在是否需要我"

### 挑战 2：多窗口/多任务场景

用户可能同时开多个 Claude Code 窗口：

```
┌─────────────────────┐    ┌─────────────────────┐
│      窗口 A         │    │      窗口 B         │
│                     │    │                     │
│  正在执行工作区任务   │    │   随便聊天/做别的    │
│  "重构认证模块"      │    │   不需要工作区       │
│                     │    │                     │
│  ✓ 需要 Hook 注入   │    │  ✗ 不要 Hook 干扰   │
└─────────────────────┘    └─────────────────────┘
```

**问题**：如果只检查"是否有活跃工作区"，两个窗口都会被注入！

### 挑战 3：同目录多工作区（目录绑定的致命问题）

```
/projects/my-app/
  ├── 工作区 A: "重构认证模块" (active)
  ├── 工作区 B: "优化性能" (active)
  └── 工作区 C: "修复 Bug" (active)
```

如果用目录自动绑定，无法确定绑定哪个。而且用户可能只是想在这个目录随便问个问题，不想被工作区打扰。

**结论**：目录绑定不可靠，放弃这个方案。

### 挑战 4：AI 如何知道 sessionId？

`session_bind` 需要 `sessionId` 参数，但：
- MCP 工具调用时**无法获取** sessionId（MCP 协议不传递会话信息）
- sessionId 只在 Hook 的 stdin 中提供
- AI 本身不知道这个值

```
┌─────────────────────────────────────────────────────────────┐
│  问题：AI 想绑定工作区，但不知道自己的 sessionId              │
│                                                             │
│  AI: session_bind(sessionId=???, workspaceId="ws-xxx")      │
│                         ↑                                   │
│                     不知道填什么                              │
└─────────────────────────────────────────────────────────────┘
```

**解决方案**：在 SessionStart Hook 中**始终注入 sessionId**，让 AI 知道自己的会话 ID。

```
SessionStart Hook 触发
    ↓
读取 stdin 中的 session_id
    ↓
注入给 AI: "你的会话 ID 是 abc123，可以用它调用 session_bind"
    ↓
AI 获得 sessionId，可以正常绑定工作区
```

---

## 解决方案：纯显式会话绑定

### 核心思想

**不做任何自动绑定**，只有用户/AI 显式调用 `session_bind` 时才激活 Hook。

把控制权完全交给用户。

### 绑定流程

```
用户想用工作区时：

用户: 帮我继续工作区任务
      ↓
AI: （收到 Hook 注入的 sessionId: "abc123"）
    [调用 session_status(sessionId: "abc123")]
    您有以下工作区：
    1. 重构认证模块
    2. 优化性能
    要激活哪个？
      ↓
用户: 第一个
      ↓
AI: [调用 session_bind(sessionId: "abc123", workspaceId: "ws-xxx")]
      ↓
    当前会话与工作区绑定
    后续所有 Hook 自动注入该工作区上下文
```

### Hook 检查逻辑

**SessionStart 事件**（始终注入 sessionId）：

```
Hook 被触发时：

    ┌─────────────────────────────────┐
    │  Hook 收到 session_id           │
    └───────────────┬─────────────────┘
                    ↓
    ┌─────────────────────────────────┐
    │  查询：这个 session 绑定了工作区吗？│
    └───────────────┬─────────────────┘
                    ↓
            ┌───────┴───────┐
            ↓               ↓
          绑定了          没绑定
            ↓               ↓
       注入工作区上下文   注入 sessionId 信息
       (目标/规则/节点)   (让 AI 知道如何绑定)
```

**UserPromptSubmit 事件**（关键词检测）：

```
Hook 被触发时：

    ┌─────────────────────────────────┐
    │  Hook 收到 session_id + prompt  │
    └───────────────┬─────────────────┘
                    ↓
    ┌─────────────────────────────────┐
    │  查询：这个 session 绑定了工作区吗？│
    └───────────────┬─────────────────┘
                    ↓
            ┌───────┴───────┐
            ↓               ↓
          绑定了          没绑定
            ↓               ↓
        静默退出        检测 prompt 中的关键词
       (已在SessionStart  (工作区/任务/节点等)
        注入上下文)           ↓
                      ┌──────┴──────┐
                      ↓             ↓
                   有关键词      无关键词
                      ↓             ↓
                  注入绑定提醒   静默退出
```

---

## 数据模型

### 会话绑定表（新增）

```typescript
interface SessionBinding {
  sessionId: string;       // Claude Code 的 session_id
  workspaceId: string;     // 绑定的工作区
  focusedNodeId?: string;  // 当前聚焦的节点（可选）
  boundAt: number;         // 绑定时间戳
  lastReminder?: {         // 最后一次智能提醒记录（用于节流）
    type: string;          // 提醒类型（如 'log_timeout', 'problem'）
    time: number;          // 提醒时间戳
  }
}
```

### 存储方式

推荐：文件存储 `~/.tanmi-workspace/session-bindings.json`

```json
{
  "abc123": {
    "workspaceId": "ws-xxx",
    "focusedNodeId": "node-yyy",
    "boundAt": 1699564800000,
    "lastReminder": {
      "type": "log_timeout",
      "time": 1699565000000
    }
  },
  "xyz789": {
    "workspaceId": "ws-zzz",
    "boundAt": 1699564900000
  }
}
```

---

## API 设计

### `session_bind` - 绑定会话到工作区

```typescript
session_bind({
  sessionId: string,       // 必填：Claude Code 会话 ID（由 Hook 注入）
  workspaceId: string,     // 必填：要绑定的工作区
  nodeId?: string          // 可选：同时聚焦到某个节点
})

// 返回
{
  success: true,
  message: "已绑定到工作区「重构认证模块」",
  binding: {
    sessionId: "abc123",
    workspaceId: "ws-xxx",
    focusedNodeId: "node-yyy"
  }
}
```

**使用场景**：
- 用户说"帮我激活/切换到 XX 工作区"
- AI 开始执行复杂任务前主动询问

### `session_unbind` - 解除会话绑定

```typescript
session_unbind({
  sessionId: string        // 必填：Claude Code 会话 ID
})

// 返回
{
  success: true,
  message: "已解除工作区绑定，Hook 将不再注入上下文"
}
```

**使用场景**：
- 用户说"先停一下工作区"
- 用户说"我要做点别的事"
- 工作区任务全部完成后

### `session_status` - 查询当前会话状态

```typescript
session_status({
  sessionId: string        // 必填：Claude Code 会话 ID
})

// 返回（已绑定）
{
  bound: true,
  workspace: {
    id: "ws-xxx",
    name: "重构认证模块",
    goal: "将旧的 session 认证替换为 JWT"
  },
  focusedNode: {
    id: "node-yyy",
    title: "实现 JWT 认证",
    status: "implementing"
  }
}

// 返回（未绑定）
{
  bound: false,
  availableWorkspaces: [
    { id: "ws-xxx", name: "重构认证模块", status: "active" },
    { id: "ws-yyy", name: "前端优化", status: "active" }
  ]
}
```

**使用场景**：
- Hook 内部检查是否应该激活
- AI 查询当前状态
- 用户询问"现在在哪个工作区"

---

## Hook 实现

### 文件结构

```
tanmi-workspace/
├── plugin/
│   └── scripts/
│       ├── hook-entry.cjs           # Claude Code 入口脚本
│       ├── cursor-hook-entry.cjs    # Cursor 入口脚本
│       └── shared/                  # 共享模块
│           ├── config.cjs           # 配置常量
│           ├── utils.cjs            # 工具函数
│           ├── binding.cjs          # 会话绑定逻辑 + 节流控制
│           ├── workspace.cjs        # 工作区数据读取 + 日志/问题解析
│           ├── context.cjs          # 上下文生成
│           ├── reminder.cjs         # 智能提醒分析模块
│           └── index.cjs            # 统一导出
```

### 安装后的目录

```
~/.tanmi-workspace/
├── scripts/
│   ├── hook-entry.cjs               # Claude Code 入口
│   ├── cursor-hook-entry.cjs        # Cursor 入口
│   └── shared/                      # 共享模块
│       └── *.cjs
```

### Claude Code 配置 (~/.claude/settings.json)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [{
          "type": "command",
          "command": "node ~/.tanmi-workspace/scripts/hook-entry.cjs SessionStart",
          "timeout": 10000
        }]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [{
          "type": "command",
          "command": "node ~/.tanmi-workspace/scripts/hook-entry.cjs UserPromptSubmit",
          "timeout": 5000
        }]
      }
    ]
  }
}
```

### Cursor 配置 (~/.cursor/hooks.json)

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [
      {
        "command": "node ~/.tanmi-workspace/scripts/cursor-hook-entry.cjs"
      }
    ]
  }
}
```

### 输出格式对比

**Claude Code**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<tanmi-workspace-context>...</tanmi-workspace-context>"
  }
}
```

**Cursor**:
```json
{
  "continue": true,
  "agent_message": "<tanmi-workspace-context>...</tanmi-workspace-context>"
}
```

---

## 智能提醒

### 概述

智能提醒功能在 **UserPromptSubmit**（Claude Code）或 **beforeSubmitPrompt**（Cursor）事件中触发，基于当前节点状态向 AI 注入提醒信息，帮助 AI 养成良好的工作习惯。

### 提醒优先级

按优先级从高到低排列，**只会触发最高优先级的提醒**：

| 优先级 | 类型 | 触发条件 | 提醒内容 |
|--------|------|---------|---------|
| P0 | `problem` | 节点有未解决的问题 | 提醒解决问题或调用 `problem_clear` |
| P1 | `log_timeout` | implementing 状态 + 最后日志 > 3 分钟 | 提醒记录工作进展 |
| P2 | `children_completed` | monitoring 状态 + 所有子节点已完成 | 提醒汇总结论并完成节点 |
| P3 | `plan_completed` | planning 状态 + 有子节点 + 是根的直接子节点 | 提醒向用户确认计划 |
| P4 | `no_log_start` | implementing 状态 + 无日志 + 已开始 > 1 分钟 | 提醒开始记录工作日志 |
| P5 | `no_problem` | implementing 状态 + 无问题记录 + 已开始 > 5 分钟 | 提醒使用 `problem_update` 记录问题和计划 |

### 节流机制

为避免提醒过于频繁，实现了节流机制：

| 规则 | 说明 |
|------|------|
| 节流间隔 | 3 分钟内同类型提醒只触发一次 |
| P0 豁免 | `problem` 类型的提醒不受节流限制 |
| 按会话隔离 | 不同会话的提醒相互独立 |

### 触发逻辑

```
UserPromptSubmit 触发
    ↓
检查是否已绑定工作区
    ↓
已绑定？
    ├─ 是 → 获取聚焦节点
    │       ↓
    │   有聚焦节点？
    │       ├─ 是 → 分析节点状态
    │       │       ↓
    │       │   有需要提醒的情况？
    │       │       ├─ 是 → 检查节流
    │       │       │       ├─ 未节流 → 注入提醒 + 更新 lastReminder
    │       │       │       └─ 已节流 → 静默
    │       │       └─ 否 → 静默
    │       └─ 否 → 静默
    │
    └─ 否 → 原有关键词检测逻辑
```

### 输出格式

提醒内容通过 `<tanmi-smart-reminder>` 标签包裹：

```xml
<tanmi-smart-reminder>
⏰ 距离上次日志已超过 3 分钟。
建议：使用 log_append 记录当前工作进展，保持工作可追溯性。
</tanmi-smart-reminder>
```

### 提醒消息模板

| 类型 | 消息模板 |
|------|---------|
| `problem` | `⚠️ 当前节点存在问题记录。\n建议：先解决问题再继续，或使用 problem_clear 清除已解决的问题。` |
| `log_timeout` | `⏰ 距离上次日志已超过 3 分钟。\n建议：使用 log_append 记录当前工作进展，保持工作可追溯性。` |
| `children_completed` | `✅ 所有子节点已完成。\n建议：汇总子节点结论，调用 node_transition(action='complete', conclusion='...') 完成当前节点。` |
| `plan_completed` | `📋 计划节点已创建完子任务。\n建议：向用户展示完整计划并等待确认，再开始执行第一个任务。` |
| `no_log_start` | `📝 节点已开始 1 分钟但尚无日志记录。\n建议：使用 log_append 开始记录工作日志。` |
| `no_problem` | `💭 节点执行超过 5 分钟，建议记录当前状态。\n建议：使用 problem_update 记录遇到的问题和下一步计划，即使没有问题也可以记录下一步意图。` |

---

## 平台差异

### Claude Code vs Cursor

| 特性 | Claude Code | Cursor |
|------|-------------|--------|
| 会话标识 | `session_id` | `conversation_id` |
| 启动事件 | SessionStart ✅ | 无 ❌ |
| 提交事件 | UserPromptSubmit | beforeSubmitPrompt |
| 上下文注入 | `additionalContext` 字段 | `agent_message` 字段 |
| 执行控制 | 无 | `permission` 字段 |

### 行为差异

**Claude Code**:
```
SessionStart 触发
    ↓
已绑定？→ 注入工作区上下文
未绑定？→ 注入 sessionId（让 AI 知道自己的会话 ID）

UserPromptSubmit 触发
    ↓
已绑定？→ 智能提醒分析
         有需提醒项？→ 检查节流 → 注入提醒
         无需提醒？  → 静默
未绑定？→ 检测关键词，有则提醒绑定
```

**Cursor**:
```
beforeSubmitPrompt 触发
    ↓
已绑定？→ 注入工作区上下文 + 智能提醒（追加到上下文末尾）
未绑定？→ 检测关键词
         有关键词？→ 注入 conversation_id + 绑定提醒
         无关键词？→ 静默
```

**关键差异**：
- Cursor 没有 SessionStart 事件，所以未绑定时只有检测到关键词才会注入 conversation_id
- Claude Code 的智能提醒在 UserPromptSubmit 单独注入；Cursor 则追加到 beforeSubmitPrompt 的上下文末尾

---

## 用户体验示例

### 场景 1：用户想用工作区

```
用户: 帮我继续之前的重构任务

AI: （收到 Hook 注入的 sessionId: "abc123"）
    让我查看一下您的工作区状态...
    [调用 session_status(sessionId: "abc123")]

    您有以下活跃工作区：
    1. 重构认证模块 - 进度 3/5 节点完成
    2. 前端性能优化 - 进度 1/3 节点完成

    要激活哪个工作区？

用户: 第一个

AI: [调用 session_bind(sessionId: "abc123", workspaceId: "ws-xxx")]

    已激活工作区「重构认证模块」

    当前进度：
    - ✅ 设计 JWT 结构
    - ✅ 实现 token 生成
    - 🔄 实现 token 验证 ← 当前
    - ⏳ 添加刷新机制
    - ⏳ 迁移旧接口

    要继续「实现 token 验证」吗？

用户: 好的

AI: [调用 node_transition(action='start')]
    开始执行...
```

### 场景 2：用户不想用工作区

```
用户: Python 的 list 和 tuple 有什么区别？

AI: （session_status 返回 bound: false，Hook 静默跳过）

    list 和 tuple 的主要区别是...
    （正常回答，不涉及工作区）
```

### 场景 3：用户暂停工作区

```
用户: 先停一下，我要处理个紧急问题

AI: [调用 session_unbind(sessionId: "abc123")]

    已暂停工作区「重构认证模块」
    当前节点「实现 token 验证」保持在 implementing 状态

    您可以随时说"继续工作区"来恢复

用户: 帮我看看这个报错...

AI: （Hook 静默，正常对话）
```

### 场景 4：新任务创建工作区

```
用户: 帮我重构这个支付模块，这是个大工程

AI: 这是一个复杂的多步骤任务，建议创建工作区来跟踪进度。

    要创建工作区吗？
    - 是，帮我规划并创建
    - 否，直接开始

用户: 好，创建一个

AI: [调用 workspace_init(...)]
    [调用 session_bind(...)]

    已创建并激活工作区「重构支付模块」

    我来分析一下任务并创建执行计划...
```

---

## AI 行为指南

在 CLAUDE.md 或系统提示中添加：

```markdown
## Tanmi-Workspace 使用指南

### 何时询问是否使用工作区

当用户请求涉及以下情况时，主动询问是否需要工作区：
1. 复杂的多步骤任务（预计超过 3 个步骤）
2. 用户提及"继续之前的任务"、"上次做到哪了"
3. 涉及项目规划、架构设计、重构
4. 用户主动提及"工作区"

### 何时不要打扰用户

以下情况直接回答，不提工作区：
1. 简单问答（概念解释、语法问题）
2. 单文件的小修改
3. 用户明确说"快速帮我看一下"
4. 已经解绑工作区后的对话

### 绑定工作区后的行为

1. 开始任务前：调用 node_transition(action='start')
2. 重要进展时：调用 log_append 记录
3. 完成任务后：调用 node_transition(action='complete', conclusion='...')
4. 遇到问题时：调用 problem_update 记录
```

---

## 总结

### 设计原则

| 原则 | 说明 |
|------|------|
| **显式绑定** | 只有调用 session_bind 才激活 Hook |
| **静默失败** | 未绑定时 exit 0，不干扰用户 |
| **用户控制** | 用户决定何时启用/停用工作区 |
| **按需激活** | 不强制，不自动，不打扰 |
| **智能提醒** | 绑定后根据节点状态自动提醒，帮助 AI 养成好习惯 |
| **节流控制** | 避免提醒过于频繁，3分钟间隔，P0 问题提醒豁免 |

### API 清单

| API | 作用 |
|-----|------|
| `session_bind` | 绑定当前会话到工作区 |
| `session_unbind` | 解除绑定 |
| `session_status` | 查询绑定状态 |

### Hook 行为

**SessionStart 事件**：

| 会话状态 | Hook 行为 |
|---------|----------|
| 已绑定工作区 | 注入工作区上下文（目标、规则、聚焦节点） |
| 未绑定 | 注入 sessionId 信息（让 AI 知道如何绑定） |

**UserPromptSubmit 事件**：

| 会话状态 | Hook 行为 |
|---------|----------|
| 已绑定 + 有智能提醒需求 | 注入智能提醒（日志超时、问题未解决等） |
| 已绑定 + 无需提醒 | 静默退出 |
| 未绑定 + 有工作区关键词 | 注入绑定提醒 |
| 未绑定 + 普通消息 | 静默退出 |

### 智能提醒优先级

| 级别 | 触发条件 | 节流 |
|------|---------|------|
| P0 | 节点有未解决问题 | 不节流 |
| P1 | implementing + 日志超时 > 3分钟 | 3分钟 |
| P2 | monitoring + 子节点全完成 | 3分钟 |
| P3 | planning + 计划完成 | 3分钟 |
| P4 | implementing + 无日志 > 1分钟 | 3分钟 |
| P5 | implementing + 无问题 > 5分钟 | 3分钟 |

### 与其他插件共存

由于只有显式绑定才激活，tanmi-workspace 的 Hook 不会与其他插件冲突：
- 用户没调用 session_bind → Hook 静默
- 用户使用其他插件 → 互不干扰
- 用户切换工作区 → 只影响当前会话

### 为什么不用目录绑定？

| 问题 | 说明 |
|------|------|
| 同目录多工作区 | 无法确定绑定哪个 |
| 用户不想用 | 强制绑定打扰用户 |
| 子目录/父目录匹配 | 规则复杂，边界情况多 |
| 临时切换目录 | 意外触发或丢失绑定 |

**结论**：目录绑定看似智能，实则问题多多。显式绑定虽然需要用户/AI 主动触发，但更可控、更可靠。

---

## 附录

### 已知限制

| 限制 | 说明 | 影响 |
|------|------|------|
| 非正常退出不触发 Hook | 用户关闭窗口时 SessionEnd 不触发 | 绑定记录会残留，但不影响功能 |
| Hook 不能动态注册 | 需要重启 Claude Code 生效 | 首次安装后需重启 |

### 多窗口支持

支持多个窗口绑定同一个工作区：
- 每个窗口有独立的 session_id
- 可以聚焦不同的节点
- 状态实时同步（每次 Hook 触发时获取最新状态）

### 与 Claude-Mem 的关系

| 项目 | 目的 | Hook 激活条件 |
|------|------|--------------|
| Claude-Mem | 自动记忆所有会话 | 总是激活 |
| Tanmi-Workspace | 结构化任务管理 | 显式绑定后激活 |

两者可以共存，互不干扰。
