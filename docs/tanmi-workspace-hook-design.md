# Tanmi-Workspace Hook 设计文档

## 概述

### 这是什么？

为 Tanmi-Workspace 设计的 **Claude Code Hook 插件**，用于在 AI 对话过程中自动注入工作区上下文。

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
}
```

### 存储方式

推荐：文件存储 `~/.tanmi-workspace/session-bindings.json`

```json
{
  "abc123": {
    "workspaceId": "ws-xxx",
    "focusedNodeId": "node-yyy",
    "boundAt": 1699564800000
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
│   ├── hooks/
│   │   └── hooks.json           # Hook 配置
│   └── scripts/
│       └── hook-entry.js        # 统一入口脚本
```

### hooks.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [{
          "type": "command",
          "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hook-entry.js SessionStart",
          "timeout": 10
        }]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [{
          "type": "command",
          "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/hook-entry.js UserPromptSubmit",
          "timeout": 5
        }]
      }
    ]
  }
}
```

### hook-entry.js

```javascript
#!/usr/bin/env node

const MCP_URL = 'http://localhost:YOUR_PORT';

async function main() {
  // 1. 读取 Hook 输入
  const input = await readStdin();
  const sessionId = input.session_id;
  const eventType = process.argv[2];

  // 2. 检查会话绑定
  let binding;
  try {
    const res = await fetch(`${MCP_URL}/session_status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    binding = await res.json();
  } catch (e) {
    // MCP 服务未启动或出错，静默退出
    process.exit(0);
  }

  // 3. 未绑定则静默退出
  if (!binding.bound) {
    process.exit(0);
  }

  // 4. 已绑定，根据事件类型处理
  switch (eventType) {
    case 'SessionStart':
      await handleSessionStart(binding);
      break;
    case 'UserPromptSubmit':
      await handlePromptSubmit(binding);
      break;
  }

  process.exit(0);
}

async function handleSessionStart(binding) {
  const context = generateContext(binding);

  // 输出 Hook 响应，注入上下文
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context
    }
  }));
}

async function handlePromptSubmit(binding) {
  // 可以在这里刷新状态提醒
  // 或者静默处理（只记录日志）
}

function generateContext(binding) {
  const { workspace, focusedNode } = binding;

  let context = `
<tanmi-workspace-context>
## 当前工作区: ${workspace.name}

**目标**: ${workspace.goal}
`;

  if (workspace.rules && workspace.rules.length > 0) {
    context += `
**规则**:
${workspace.rules.map(r => `- ${r}`).join('\n')}
`;
  }

  if (focusedNode) {
    context += `
**聚焦节点**: ${focusedNode.title}
- 状态: ${focusedNode.status}
- 需求: ${focusedNode.requirement || '无'}
`;
  }

  context += `
---
请在执行任务时：
- 开始前调用 node_transition(action='start')
- 完成后调用 node_transition(action='complete', conclusion='...')
- 重要事件调用 log_append 记录
</tanmi-workspace-context>
`;

  return context;
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

main().catch(() => process.exit(0));
```

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
| 已绑定工作区 | 静默退出（上下文已在 SessionStart 注入） |
| 未绑定 + 有工作区关键词 | 注入绑定提醒 |
| 未绑定 + 普通消息 | 静默退出 |

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
