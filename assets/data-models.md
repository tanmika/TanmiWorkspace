# TanmiWorkspace 数据模型

> 数据结构定义与状态机规则

## 存储结构

工作区数据存储在用户目录下的 `.tanmi-workspace` 文件夹中（全局存储）：

```
~/.tanmi-workspace/
├── index.json                     # 全局工作区索引
├── sessions.json                  # 会话绑定信息
├── {名称}_{短ID}/                  # 工作区目录（可读格式）
│   ├── workspace.json             # 工作区配置
│   ├── graph.json                 # 节点图
│   ├── Workspace.md               # 工作区元数据
│   ├── nodes/
│   │   ├── root/
│   │   │   ├── Info.md            # 根节点需求和结论
│   │   │   ├── Log.md             # 根节点日志
│   │   │   └── Problem.md         # 根节点问题
│   │   └── {标题}_{短ID}/          # 子节点目录（可读格式）
│   │       ├── Info.md
│   │       ├── Log.md
│   │       └── Problem.md
│   ├── memos/                     # 备忘目录
│   │   └── {标题}_{短ID}/
│   │       └── content.md         # 备忘内容
│   └── .backups/                  # 本地备份目录
│       └── {时间戳}.tar.gz
└── archive/                       # 归档目录
    └── {名称}_{短ID}/              # 归档的工作区
```

---

## 工作区 (Workspace)

### 数据结构

```typescript
interface WorkspaceConfig {
  id: string;                      // 工作区 ID，格式: ws-{timestamp}-{random}
  name: string;                    // 工作区名称
  dirName: string;                 // 目录名（可读格式：名称_短ID）
  status: WorkspaceStatus;         // 状态
  rootNodeId: string;              // 根节点 ID，默认 "root"
  scenario?: TaskScenario;         // 任务场景类型
  dispatch?: DispatchConfig;       // 派发配置（可选）
  pendingManualChanges?: ManualChange[]; // 待处理的手动变更
  createdAt: string;               // ISO 8601 时间戳
  updatedAt: string;
}

type WorkspaceStatus = "active" | "archived" | "error";

type TaskScenario =
  | "feature"   // 新功能开发
  | "summary"   // 总结分析
  | "optimize"  // 优化重构
  | "debug"     // 查错修复
  | "misc";     // 其他
```

### 派发配置

```typescript
interface DispatchConfig {
  enabled: boolean;                 // 是否启用派发模式
  useGit: boolean;                  // 是否使用 Git 功能
  enabledAt: number;                // 启用时间戳
  originalBranch?: string;          // 派发前的原分支（Git 模式）
  processBranch?: string;           // 当前派发分支（Git 模式）
  backupBranches?: string[];        // 备份分支列表（Git 模式）
  limits?: DispatchLimits;          // 资源限制
  review?: ReviewConfig;            // Review 配置
}

interface DispatchLimits {
  timeoutMs?: number;               // 单节点执行超时，默认 300000 (5分钟)
  maxRetries?: number;              // 最大重试次数，默认 3
}

interface ReviewConfig {
  specReviewEnabled: boolean;       // 是否启用规格审查（默认 true）
  qualityReviewEnabled: boolean;    // 是否启用质量审查（默认 false）
}
```

### 文档引用

```typescript
interface DocRef {
  path: string;                     // 文档路径（支持 memo://memo-xxx 格式）
  description: string;              // 文档描述
  memoMeta?: MemoMeta;              // memo:// 引用时的元信息
  status?: "active" | "expired";    // 引用状态
}

interface MemoMeta {
  id: string;
  title: string;
  summary: string;
  tags: string[];
}
```

### Workspace.md 文件格式

```markdown
---
name: 工作区名称
createdAt: 2024-01-01T10:00:00Z
updatedAt: 2024-01-01T10:00:00Z
---

## Rules

- 规则1
- 规则2

## Docs

- /path/to/doc1: 文档描述1
- memo://memo-xxx: 备忘描述

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

### 节点图数据结构

```typescript
interface NodeGraph {
  version: string;                  // Schema 版本
  currentFocus: string | null;      // 当前聚焦的节点 ID
  nodes: Record<string, NodeMeta>;  // 节点元数据映射
  memos?: Record<string, MemoListItem>; // 备忘索引（可选）
  lastWriteCodeVersion?: string;    // 最后写入时的代码版本
}

interface NodeMeta {
  id: string;
  dirName: string;                  // 目录名（可读格式：标题_短ID）
  type: NodeType;
  parentId: string | null;
  children: string[];
  status: NodeStatus;
  isolate: boolean;
  references: string[];
  conclusion: string | null;
  conclusionStale?: boolean;        // 结论是否过期
  role?: NodeRole;
  acceptanceCriteria?: AcceptanceCriteria[];  // 验收标准
  dispatch?: NodeDispatchInfo;      // 派发信息（派发子节点）
  dispatchParent?: NodeDispatchParent; // 派发母节点信息
  createdAt: string;
  updatedAt: string;
}
```

### 节点类型

```typescript
type NodeType = "planning" | "execution";
```

| 类型 | 说明 | 可有子节点 | 状态集合 |
|------|------|:----------:|----------|
| `planning` | 规划节点，负责分析、分解、派发、汇总 | ✅ | pending, planning, monitoring, completed, cancelled |
| `execution` | 执行节点，负责具体执行任务 | ❌ | pending, implementing, validating, completed, failed |

### 节点角色 (5 种)

```typescript
type NodeRole =
  | "info_collection"   // 信息收集：调研、分析，完成时自动归档
  | "info_summary"      // 信息总结：从已有信息中提取结构化内容
  | "dispatch_exec"     // 派发执行：派发母节点创建的执行子节点
  | "dispatch_spec"     // 派发规格审查：验证执行结果是否符合需求
  | "dispatch_quality"; // 派发质量审查：检查代码质量和最佳实践
```

| 角色 | 说明 | 特殊行为 |
|------|------|----------|
| `info_collection` | 信息收集节点 | 完成时自动归档规则和文档到工作区 |
| `info_summary` | 信息总结节点 | 从已有信息中提取结构化内容 |
| `dispatch_exec` | 派发执行节点 | 由子代理执行，完成后触发审查 |
| `dispatch_spec` | 规格审查节点 | 由子代理执行，验证执行结果 |
| `dispatch_quality` | 质量审查节点 | 由子代理执行，检查代码质量 |

### 验收标准

```typescript
/**
 * 动态键值对格式，支持任意列结构
 * 如：{ when, then } 或 { given, when, then }
 */
type AcceptanceCriteria = Record<string, string>;
```

### 派发相关数据结构

```typescript
// 派发子节点信息
interface NodeDispatchInfo {
  startMarker?: string;             // 开始标记（Git commit 或时间戳）
  endMarker?: string;               // 结束标记
  status: NodeDispatchStatus;       // pending | executing | passed | failed
  attempts?: DispatchAttempt[];     // 执行尝试历史
}

// 派发尝试记录
interface DispatchAttempt {
  attemptNumber: number;            // 尝试次数（从 1 开始）
  startMarker: string;
  endMarker?: string;
  status: "executing" | "passed" | "failed";
  failureReason?: string;
  conclusion?: string;
}

// 派发母节点信息
interface NodeDispatchParent {
  children: {
    execId: string;                 // 执行子节点 ID
    specId: string;                 // 规格审查子节点 ID
    qualityId?: string;             // 质量审查子节点 ID（可选）
  };
}
```

### Info.md 文件格式

```markdown
---
id: node-xxx
type: execution
title: 节点标题
status: implementing
createdAt: 2024-01-01T10:00:00Z
updatedAt: 2024-01-01T10:00:00Z
---

## Requirement

需求描述内容

## Conclusion

结论内容（完成后填写）

## Docs

- /path/to/doc: 文档描述
- memo://memo-xxx: 备忘描述

## Notes

备注内容
```

---

## 备忘 (Memo)

### 数据结构

```typescript
interface Memo {
  id: string;                       // 格式：memo-{shortId}
  title: string;                    // 标题
  summary: string;                  // 摘要（用于列表显示）
  content: string;                  // 完整内容（Markdown 格式）
  tags: string[];                   // 标签列表
  createdAt: string;                // ISO 8601
  updatedAt: string;
}

interface MemoListItem {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  contentLength: number;            // 内容长度
  dirName: string;                  // 目录名：{title}_{shortId}
  createdAt: string;
  updatedAt: string;
}
```

### 存储位置

备忘存储在工作区的 `memos/` 目录下：

```
memos/
└── {标题}_{短ID}/
    └── content.md
```

### content.md 格式

```markdown
---
id: memo-xxx
title: 备忘标题
summary: 简短摘要
tags:
  - tag1
  - tag2
createdAt: 2024-01-01T10:00:00Z
updatedAt: 2024-01-01T10:00:00Z
---

完整内容...
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
  time: string;                     // 时间戳，格式: YYYY-MM-DD HH:mm:ss
  operator: string;                 // 操作者: AI 或 Human
  event: string;                    // 事件描述
}
```

### 日志格式

日志存储在 Log.md 文件中：

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
interface ProblemData {
  currentProblem: string;           // 问题描述
  nextStep: string;                 // 下一步计划
}
```

### 问题格式

问题存储在 Problem.md 文件中：

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
  sessionId: string;                // Claude Code 会话 ID
  workspaceId: string;              // 绑定的工作区 ID
  focusedNodeId: string | null;     // 聚焦的节点 ID
  boundAt: number;                  // 绑定时间戳
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

## 全局索引 (Index)

### 数据结构

```typescript
interface WorkspaceIndex {
  version: string;                  // Schema 版本，当前 "2.0"
  workspaces: WorkspaceEntry[];
}

interface WorkspaceEntry {
  id: string;
  name: string;
  dirName: string;                  // 目录名：名称_短ID
  projectRoot: string;              // 项目根目录绝对路径
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
  errorInfo?: WorkspaceErrorInfo;   // 错误信息
  hasUnresolvedIssues?: boolean;    // 是否有未解决问题
  lastWarningAt?: string;
  pinned?: boolean;                 // 是否置顶
}

interface WorkspaceErrorInfo {
  message: string;
  detectedAt: string;
  type?: "dir_missing" | "config_corrupted" | "graph_corrupted" |
         "version_too_high" | "node_corrupted" | "unknown";
  previousStatus?: "active" | "archived";
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

当节点设置 `isolate: true` 时：
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

---

## ActionRequired 机制

### 数据结构

```typescript
type ActionRequiredType =
  | "invoke_skill"           // 强制调用指定 Skill
  | "ask_user"               // 询问用户
  | "show_plan"              // 展示计划并等待确认
  | "check_docs"             // 提醒检查文档是否需要更新
  | "review_structure"       // reopen 时先查看现有结构
  | "ask_dispatch"           // 询问是否启用派发模式
  | "dispatch_task"          // 指示派发任务
  | "dispatch_complete_choice"; // 派发完成，选择合并策略

interface ActionRequired {
  type: ActionRequiredType;
  message: string;                  // 给 AI 的指令说明
  data?: Record<string, unknown>;   // 附加数据
  confirmationToken?: string;       // Confirmation Token
}
```

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

### 备忘 ID

```
memo-{shortId}

示例: memo-abc123
```

- `timestamp`: Base36 编码的时间戳
- `random` / `shortId`: 6位随机字符串

### 根节点 ID

根节点 ID 固定为 `"root"`。

---

## 目录命名格式

从 Storage 版本 5.0 开始，目录使用可读格式：

```
{名称/标题}_{短ID}

示例:
- 工作区: "用户认证功能_u02rz9"
- 节点: "数据库设计_ync1cu"
- 备忘: "技术调研_abc123"
```

特殊字符会被过滤：`/ \ : * ? " < > |`
