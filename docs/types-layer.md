---
title: 类型层 (Types Layer)
description: TypeScript 类型定义，包含节点、工作区、上下文和错误四个模块
category: types
---

# 类型层 (Types Layer)

## 概述

类型层定义 TanmiWorkspace 的核心数据结构和 API 类型，为整个系统提供类型安全保障。

```
┌─────────────────────────────────────────────────────────────┐
│                      src/types/                             │
├───────────────┬───────────────┬───────────────┬─────────────┤
│   node.ts     │ workspace.ts  │  context.ts   │  errors.ts  │
│  节点类型       │  工作区类型    │   上下文类型    │   错误定义   │
└───────────────┴───────────────┴───────────────┴─────────────┘
```

## 模块组成

### node.ts

**职责**: 节点相关类型定义

**核心类型**:

#### 状态类型

```typescript
type NodeStatus =
  | "pending"       // 待执行
  | "implementing"  // 执行中
  | "validating"    // 验证中
  | "completed"     // 已完成
  | "failed";       // 失败

type TransitionAction =
  | "start"      // pending → implementing
  | "submit"     // implementing → validating
  | "complete"   // implementing/validating → completed
  | "fail"       // validating → failed
  | "retry"      // failed → implementing
  | "reopen";    // completed → implementing
```

#### 数据结构

| 类型 | 说明 | 存储位置 |
|------|------|---------|
| `NodeGraph` | 节点图，包含所有节点元数据 | `graph.json` |
| `NodeMeta` | 节点元数据（状态、父子关系、引用） | `graph.json` |
| `NodeInfoData` | 节点内容数据（需求、结论、备注） | `Info.md` |
| `NodeTreeItem` | 节点树结构（用于展示） | API 输出 |

#### API 类型

| 输入类型 | 输出类型 | 对应工具 |
|---------|---------|---------|
| `NodeCreateParams` | `NodeCreateResult` | node_create |
| `NodeGetParams` | `NodeGetResult` | node_get |
| `NodeListParams` | `NodeListResult` | node_list |
| `NodeDeleteParams` | `NodeDeleteResult` | node_delete |
| `NodeSplitParams` | `NodeSplitResult` | node_split |
| `NodeUpdateParams` | `NodeUpdateResult` | node_update |
| `NodeMoveParams` | `NodeMoveResult` | node_move |
| `NodeTransitionParams` | `NodeTransitionResult` | node_transition |

### workspace.ts

**职责**: 工作区相关类型定义

**核心类型**:

#### 索引结构

```typescript
// 全局索引 (~/.tanmi-workspace/index.json)
interface WorkspaceIndex {
  version: string;              // "2.0" 支持多项目
  workspaces: WorkspaceEntry[];
}

interface WorkspaceEntry {
  id: string;
  name: string;
  projectRoot: string;          // 项目根目录
  status: WorkspaceStatus;      // "active" | "archived"
  createdAt: string;
  updatedAt: string;
}
```

#### 配置结构

```typescript
// 工作区配置 ({ws}/workspace.json)
interface WorkspaceConfig {
  id: string;
  name: string;
  status: WorkspaceStatus;
  rootNodeId: string;           // 默认 "root"
  createdAt: string;
  updatedAt: string;
}
```

#### 内容结构

```typescript
// Workspace.md 数据
interface WorkspaceMdData {
  name: string;
  goal: string;
  rules: string[];
  docs: DocRef[];
  createdAt: string;
  updatedAt: string;
}

// 文档引用
interface DocRef {
  path: string;
  description: string;
}
```

#### API 类型

| 输入类型 | 输出类型 | 对应工具 |
|---------|---------|---------|
| `WorkspaceInitParams` | `WorkspaceInitResult` | workspace_init |
| `WorkspaceListParams` | `WorkspaceListResult` | workspace_list |
| `WorkspaceGetParams` | `WorkspaceGetResult` | workspace_get |
| `WorkspaceDeleteParams` | `WorkspaceDeleteResult` | workspace_delete |
| `WorkspaceStatusParams` | `WorkspaceStatusResult` | workspace_status |

### context.ts

**职责**: 上下文和日志相关类型定义

**核心类型**:

#### 上下文结构

```typescript
// 上下文链项
interface ContextChainItem {
  nodeId: string;
  title: string;
  requirement: string;
  docs: DocRefWithStatus[];    // 仅 active 引用
  note: string;
  conclusion?: string;
  problem?: string;
  logEntries?: TypedLogEntry[];
}

// 子节点结论
interface ChildConclusionItem {
  nodeId: string;
  title: string;
  status: NodeStatus;
  conclusion: string;
}

// context_get 结果
interface ContextGetResult {
  workspace: { goal, rules, docs };
  chain: ContextChainItem[];
  references: ContextChainItem[];
  childConclusions: ChildConclusionItem[];
  hint?: string;
}
```

#### 引用状态

```typescript
interface DocRefWithStatus {
  path: string;
  description: string;
  status: "active" | "expired";
}

type ReferenceAction = "add" | "remove" | "expire" | "activate";
```

#### 日志类型

```typescript
interface TypedLogEntry {
  timestamp: string;           // HH:mm 格式
  operator: "AI" | "Human";
  event: string;
}
```

#### API 类型

| 输入类型 | 输出类型 | 对应工具 |
|---------|---------|---------|
| `ContextGetParams` | `ContextGetResult` | context_get |
| `ContextFocusParams` | `ContextFocusResult` | context_focus |
| `NodeIsolateParams` | `NodeIsolateResult` | node_isolate |
| `NodeReferenceParams` | `NodeReferenceResult` | node_reference |
| `LogAppendParams` | `LogAppendResult` | log_append |
| `ProblemUpdateParams` | `ProblemUpdateResult` | problem_update |
| `ProblemClearParams` | `ProblemClearResult` | problem_clear |

### errors.ts

**职责**: 错误码和错误类定义

**错误分类**:

| 分类 | 错误码 | 说明 |
|------|--------|------|
| 工作区 | WORKSPACE_EXISTS | 工作区已存在 |
| | WORKSPACE_NOT_FOUND | 工作区不存在 |
| | WORKSPACE_ACTIVE | 活动状态无法删除 |
| | INVALID_NAME | 名称包含非法字符 |
| | INVALID_PATH | 路径不合法 |
| | INIT_FAILED | 初始化失败 |
| 节点 | NODE_NOT_FOUND | 节点不存在 |
| | PARENT_NOT_FOUND | 父节点不存在 |
| | INVALID_TITLE | 标题包含非法字符 |
| | CANNOT_DELETE_ROOT | 无法删除根节点 |
| 状态 | INVALID_TRANSITION | 非法状态转换 |
| | CONCLUSION_REQUIRED | 缺少结论 |
| 引用 | REFERENCE_NOT_FOUND | 引用不存在 |
| | REFERENCE_EXISTS | 引用已存在 |
| 分裂 | SPLIT_REQUIRES_IMPLEMENTING | 非执行状态无法分裂 |
| 校验 | GRAPH_CORRUPTED | 节点图损坏 |
| | NODE_DIR_MISSING | 节点目录缺失 |
| | NODE_INFO_MISSING | Info.md 缺失 |

**错误类**:

```typescript
class TanmiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = "TanmiError";
  }
}
```

## 类型导出

**文件**: `src/types/index.ts`

统一导出所有类型：

```typescript
export * from "./workspace.js";
export * from "./node.js";
export * from "./context.js";
export * from "./errors.js";
```

## 设计原则

### 数据源分层

| 数据类型 | 权威来源 | 说明 |
|---------|---------|------|
| 结构数据 | `graph.json` | status, children, references |
| 内容数据 | `Info.md` | requirement, conclusion, notes |

### API 类型命名

- 输入：`{Tool}Params`（如 `NodeCreateParams`）
- 输出：`{Tool}Result`（如 `NodeCreateResult`）

### 可选字段

- API 输入的可选参数使用 `?` 标记
- 输出的可选字段同样使用 `?` 标记
- `hint` 字段用于工作流提示，仅在特定场景返回

## 使用示例

```typescript
import type {
  NodeStatus,
  NodeGraph,
  NodeMeta,
  WorkspaceConfig,
  ContextGetResult,
  TanmiError,
} from "./types/index.js";

// 类型安全的状态检查
function isCompleted(status: NodeStatus): boolean {
  return status === "completed";
}

// 类型安全的错误处理
try {
  await service.get(params);
} catch (error) {
  if (error instanceof TanmiError) {
    console.log(`错误码: ${error.code}`);
  }
}
```
