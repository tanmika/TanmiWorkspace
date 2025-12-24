# TanmiWorkspace 数据模型

> 数据结构定义与状态机规则

## 存储结构

工作区数据存储在项目目录下的 `.tanmi-workspace` 文件夹中：

```
.tanmi-workspace/
├── sessions.json              # 会话绑定信息
└── ws-{id}/                   # 工作区目录
    ├── Workspace.md           # 工作区元数据
    └── nodes/
        ├── root/
        │   └── Node.md        # 根节点数据
        └── node-{id}/
            └── Node.md        # 子节点数据
```

---

## 工作区 (Workspace)

### 数据结构

```typescript
interface Workspace {
  id: string;                  // 工作区 ID，格式: ws-{timestamp}-{random}
  name: string;                // 工作区名称
  goal: string;                // 目标描述
  status: WorkspaceStatus;     // 状态
  rules: string[];             // 规则列表
  rulesHash: string;           // 规则哈希（8位，用于验证）
  docs: DocReference[];        // 文档引用列表
  focusedNodeId: string | null;// 当前聚焦节点
  createdAt: number;           // 创建时间戳
  updatedAt: number;           // 更新时间戳
}

type WorkspaceStatus = "active" | "archived";

interface DocReference {
  path: string;                // 文档路径
  description: string;         // 文档描述
  status: "active" | "expired";// 引用状态
}
```

### Workspace.md 文件格式

```markdown
---
id: ws-xxx
name: 工作区名称
goal: 工作区目标
status: active
rulesHash: ff280711
focusedNodeId: node-xxx
createdAt: 1234567890
updatedAt: 1234567890
---

## Rules

- 规则1
- 规则2

## Docs

- /path/to/doc1: 文档描述1
- /path/to/doc2: 文档描述2

## Log

- [2024-01-01 10:00:00] [AI] 创建工作区
- [2024-01-01 10:01:00] [AI] 开始信息收集

## Problem

当前问题描述（如有）

### Next Step

下一步计划（如有）
```

---

## 节点 (Node)

### 数据结构

```typescript
interface Node {
  id: string;                  // 节点 ID，格式: node-{timestamp}-{random} 或 "root"
  title: string;               // 节点标题
  type: NodeType;              // 节点类型
  status: NodeStatus;          // 节点状态
  role: NodeRole | null;       // 节点角色（可选）
  requirement: string;         // 需求描述
  conclusion: string | null;   // 结论（完成后填写）
  note: string;                // 备注
  parentId: string | null;     // 父节点 ID（根节点为 null）
  isolated: boolean;           // 是否隔离上下文
  docs: DocReference[];        // 派发的文档引用
  references: Reference[];     // 跨节点引用
  createdAt: number;
  updatedAt: number;
}

type NodeType = "planning" | "execution";

type NodeRole = "info_collection" | "validation" | "summary";

interface Reference {
  targetId: string;            // 目标节点 ID 或文档路径
  type: "node" | "doc";        // 引用类型
  description: string;         // 引用说明
  status: "active" | "expired";
}
```

### 节点类型说明

| 类型 | 说明 | 可有子节点 | 状态集合 |
|------|------|:----------:|----------|
| `planning` | 规划节点，负责分析、分解、派发、汇总 | ✅ | pending, planning, monitoring, completed, cancelled |
| `execution` | 执行节点，负责具体执行任务 | ❌ | pending, implementing, validating, completed, failed |

### 节点角色说明

| 角色 | 说明 | 特殊行为 |
|------|------|----------|
| `info_collection` | 信息收集节点 | 完成时自动归档规则和文档到工作区 |
| `validation` | 验证节点 | 预留，暂未使用 |
| `summary` | 汇总节点 | 预留，暂未使用 |

### Node.md 文件格式

```markdown
---
id: node-xxx
title: 节点标题
type: execution
status: implementing
role: null
parentId: root
isolated: false
createdAt: 1234567890
updatedAt: 1234567890
---

## Requirement

需求描述内容

## Conclusion

结论内容（完成后填写）

## Note

备注内容

## Docs

- /path/to/doc: 文档描述

## References

- node-yyy: 引用说明

## Log

- [2024-01-01 10:00:00] [AI] 开始执行
- [2024-01-01 10:05:00] [AI] 完成第一步

## Problem

当前问题（如有）

### Next Step

下一步计划
```

---

## 状态机

### 规划节点状态机

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌─────────┐  start  ┌──────────┐  [创建子节点]  ┌────────────┐
│ pending │ ──────► │ planning │ ────────────► │ monitoring │
└─────────┘         └──────────┘               └────────────┘
                         │                           │
                         │ cancel                    │ complete
                         ▼                           ▼
                    ┌───────────┐              ┌───────────┐
                    │ cancelled │              │ completed │
                    └───────────┘              └───────────┘
                         │                           │
                         │         reopen            │
                         └───────────┬───────────────┘
                                     │
                                     ▼
                              ┌──────────┐
                              │ planning │
                              └──────────┘
```

**状态转换规则**

| 当前状态 | 动作 | 目标状态 | 条件 |
|----------|------|----------|------|
| pending | start | planning | - |
| planning | [创建子节点] | monitoring | 自动转换 |
| planning | cancel | cancelled | 需提供 conclusion |
| monitoring | complete | completed | 所有子节点已完成，需提供 conclusion |
| monitoring | cancel | cancelled | 需提供 conclusion |
| completed | reopen | planning | - |
| cancelled | reopen | planning | - |

---

### 执行节点状态机

```
┌─────────┐  start   ┌──────────────┐  submit   ┌────────────┐
│ pending │ ───────► │ implementing │ ────────► │ validating │
└─────────┘          └──────────────┘           └────────────┘
                            │                         │
                            │ complete                │ complete
                            ▼                         ▼
                     ┌───────────┐             ┌───────────┐
                     │ completed │◄────────────│ completed │
                     └───────────┘             └───────────┘
                            ▲                         │
                            │ reopen                  │ fail
                            │                         ▼
                     ┌──────┴──────┐           ┌──────────┐
                     │             │◄──────────│  failed  │
                     │             │   retry   └──────────┘
                     │ implementing│                 │
                     │             │◄────────────────┘
                     └─────────────┘      fail
```

**状态转换规则**

| 当前状态 | 动作 | 目标状态 | 条件 |
|----------|------|----------|------|
| pending | start | implementing | - |
| implementing | submit | validating | - |
| implementing | complete | completed | 需提供 conclusion |
| implementing | fail | failed | 需提供 conclusion |
| validating | complete | completed | 需提供 conclusion |
| validating | fail | failed | 需提供 conclusion |
| failed | retry | implementing | - |
| completed | reopen | implementing | - |

---

### 状态说明

| 状态 | 类型 | 说明 |
|------|------|------|
| `pending` | 通用 | 待开始，初始状态 |
| `planning` | 规划节点 | 规划中，分析任务、创建子节点 |
| `monitoring` | 规划节点 | 监控中，等待子节点完成 |
| `implementing` | 执行节点 | 执行中，正在处理任务 |
| `validating` | 执行节点 | 验证中，检查执行结果 |
| `completed` | 通用 | 已完成 |
| `failed` | 执行节点 | 失败，可重试 |
| `cancelled` | 规划节点 | 已取消 |

---

## 日志 (Log)

### 数据结构

```typescript
interface LogEntry {
  timestamp: string;           // 时间戳，格式: YYYY-MM-DD HH:mm:ss
  operator: "AI" | "Human";    // 操作者
  event: string;               // 事件描述
}
```

### 日志格式

日志存储在 Node.md 或 Workspace.md 的 `## Log` 部分：

```markdown
## Log

- [2024-01-01 10:00:00] [AI] 开始执行任务
- [2024-01-01 10:05:00] [AI] 完成数据库设计
- [2024-01-01 10:10:00] [Human] 确认设计方案
```

---

## 问题 (Problem)

### 数据结构

```typescript
interface Problem {
  description: string;         // 问题描述
  nextStep: string | null;     // 下一步计划
  updatedAt: number;           // 更新时间
}
```

### 问题格式

问题存储在 Node.md 或 Workspace.md 的 `## Problem` 部分：

```markdown
## Problem

数据库连接超时，无法完成迁移

### Next Step

检查数据库配置，尝试增加连接超时时间
```

---

## 会话绑定 (Session)

### 数据结构

```typescript
interface SessionBinding {
  sessionId: string;           // Claude Code 会话 ID
  workspaceId: string;         // 绑定的工作区 ID
  focusedNodeId: string | null;// 聚焦的节点 ID
  boundAt: number;             // 绑定时间戳
}

// sessions.json 文件结构
interface SessionsFile {
  bindings: Record<string, SessionBinding>;
}
```

### sessions.json 文件格式

```json
{
  "bindings": {
    "session-abc-123": {
      "sessionId": "session-abc-123",
      "workspaceId": "ws-xxx",
      "focusedNodeId": "node-yyy",
      "boundAt": 1234567890
    }
  }
}
```

---

## 上下文聚焦

### 聚焦机制

当聚焦到某个节点时，`context_get` 返回的上下文包含：

```
┌─────────────────────────────────────────────────────────────┐
│                     工作区信息                               │
│  goal, rules, rulesHash, docs                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      祖先链 (chain)                          │
│  root → ... → parent → current                              │
│  每个节点包含: title, requirement, docs, note, log          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   子节点结论 (childConclusions)              │
│  已完成/失败的直接子节点的结论（冒泡）                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   跨节点引用 (references)                    │
│  显式引用的其他节点或文档                                     │
└─────────────────────────────────────────────────────────────┘
```

### 隔离机制

当节点设置 `isolated: true` 时：
- 祖先链在该节点截断
- 不继承父节点的上下文
- 仅包含自身和子节点的信息

---

## 规则哈希 (rulesHash)

### 计算方式

```typescript
function calculateRulesHash(rules: string[]): string {
  const content = rules.join('\n');
  const hash = md5(content);
  return hash.substring(0, 8);  // 取前8位
}
```

### 验证流程

```
node_create(rulesHash="ff280711")
         │
         ▼
┌─────────────────────────────┐
│ 计算当前规则的 hash          │
│ currentHash = calc(rules)   │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ rulesHash == currentHash ?  │
└─────────────────────────────┘
    │              │
    │ Yes          │ No
    ▼              ▼
┌────────┐    ┌──────────────────────┐
│ 创建成功 │    │ 返回 RULES_HASH_MISMATCH │
└────────┘    │ 错误，提示重新获取       │
              └──────────────────────┘
```

### 设计目的

- 确保 AI 在创建节点前已读取最新规则
- 防止规则更新后 AI 仍按旧规则操作
- 工作区无规则时，rulesHash 为空字符串，不强制验证

---

## 信息收集自动归档

### 触发条件

当满足以下条件时触发自动归档：
1. 节点 `role === "info_collection"`
2. 节点状态转换为 `completed`
3. `conclusion` 包含特定格式的内容

### 归档格式

```markdown
## 规则
- 规则1
- 规则2

## 文档
- /path/to/doc1: 文档描述1
- /path/to/doc2: 文档描述2
```

### 归档行为

- `## 规则` 下的列表项追加到工作区的 `rules`
- `## 文档` 下的条目追加到工作区的 `docs`
- 自动更新 `rulesHash`

---

## ID 生成规则

### 工作区 ID

```
ws-{timestamp}-{random}

示例: ws-mj2hy912-u02rz9
```

### 节点 ID

```
node-{timestamp}-{random}

示例: node-mj2hz4gy-ync1cu
```

- `timestamp`: Base36 编码的时间戳
- `random`: 6位随机字符串

### 根节点 ID

根节点 ID 固定为 `"root"`。
