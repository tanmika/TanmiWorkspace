---
title: 类型层 (Types Layer)
description: TypeScript 类型定义，包含节点、工作区、上下文、错误等 9 个模块
category: types
---

# 类型层 (Types Layer)

## 概述

类型层定义 TanmiWorkspace 的核心数据结构和 API 类型，为整个系统提供类型安全保障。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             src/types/                                       │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────────────┤
│   node.ts   │workspace.ts │ context.ts  │  errors.ts  │  confirmation.ts    │
│   节点类型   │  工作区类型  │  上下文类型  │   错误定义   │    确认令牌         │
├─────────────┼─────────────┼─────────────┼─────────────┼─────────────────────┤
│ guidance.ts │  memo.ts    │capability.ts│  health.ts  │                     │
│   引导类型   │   备忘类型   │  能力包类型  │  健康检测    │                     │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────────────┘
```

## 模块组成

### node.ts

**职责**: 节点相关类型定义

**核心类型**:

#### 节点类型与角色

```typescript
// 节点类型
type NodeType =
  | "planning"    // 规划节点：负责分析、分解、派发、汇总
  | "execution";  // 执行节点：负责具体执行，不能有子节点

// 节点角色
type NodeRole =
  | "info_collection"   // 信息收集：调研、分析，完成时自动归档
  | "info_summary"      // 信息总结：从已有信息中提取结构化内容
  | "dispatch_exec"     // 派发执行：派发母节点自动创建的执行子节点
  | "dispatch_spec"     // 派发规格审查：验证执行结果是否符合需求规格
  | "dispatch_quality"; // 派发质量审查：检查代码质量、最佳实践
```

#### 状态类型

```typescript
// 执行节点状态
type ExecutionStatus =
  | "pending"       // 待执行
  | "implementing"  // 执行中
  | "validating"    // 验证中
  | "completed"     // 已完成
  | "failed";       // 失败

// 规划节点状态
type PlanningStatus =
  | "pending"       // 待执行
  | "planning"      // 规划中：分析需求、创建子节点
  | "monitoring"    // 监控中：子节点执行中，等待结果
  | "completed"     // 已完成
  | "cancelled";    // 已取消

// 节点状态（联合类型）
type NodeStatus = ExecutionStatus | PlanningStatus;
```

#### 状态转换

```typescript
// 执行节点状态转换动作
type ExecutionAction =
  | "start"      // pending → implementing
  | "submit"     // implementing → validating
  | "complete"   // implementing/validating → completed
  | "fail"       // implementing/validating → failed
  | "retry"      // failed → implementing
  | "reopen";    // completed → implementing

// 规划节点状态转换动作
type PlanningAction =
  | "start"      // pending → planning
  | "complete"   // monitoring/planning → completed
  | "cancel"     // planning/monitoring → cancelled
  | "reopen";    // completed/cancelled → planning

// 状态转换动作（联合类型）
type TransitionAction = ExecutionAction | PlanningAction;
```

#### 验收标准

```typescript
// 动态键值对格式，支持任意列结构
// 如：{ when, then } 或 { given, when, then } 或 { scenario, input, expected }
type AcceptanceCriteria = Record<string, string>;
```

#### 派发相关类型

```typescript
// 派发状态
type NodeDispatchStatus =
  | "pending"     // 等待派发
  | "executing"   // subagent 执行中
  | "passed"      // 执行通过
  | "failed";     // 执行失败

// 派发尝试记录
interface DispatchAttempt {
  attemptNumber: number;              // 尝试次数（从 1 开始）
  startMarker: string;                // Git=commit hash，无Git=时间戳
  endMarker?: string;
  status: "executing" | "passed" | "failed";
  failureReason?: string;
  conclusion?: string;
}

// 派发信息（派发子节点使用）
interface NodeDispatchInfo {
  startMarker?: string;
  endMarker?: string;
  status: NodeDispatchStatus;
  attempts?: DispatchAttempt[];
}

// 派发母节点信息
interface NodeDispatchParent {
  children: {
    execId: string;
    specId: string;
    qualityId?: string;
  };
}
```

#### 数据结构

| 类型 | 说明 | 存储位置 |
|------|------|---------|
| `NodeGraph` | 节点图，包含所有节点元数据 | `graph.json` |
| `NodeMeta` | 节点元数据（状态、角色、派发信息） | `graph.json` |
| `NodeInfoData` | 节点内容数据（需求、结论、备注） | `Info.md` |
| `NodeTreeItem` | 节点树结构（用于展示） | API 输出 |

#### API 类型

| 输入类型 | 输出类型 | 对应工具 |
|---------|---------|---------|
| `NodeCreateParams` | `NodeCreateResult` | node_create |
| `NodeGetParams` | `NodeGetResult` | node_get |
| `NodeListParams` | `NodeListResult` | node_list |
| `NodeDeleteParams` | `NodeDeleteResult` | node_delete |
| `NodeUpdateParams` | `NodeUpdateResult` | node_update |
| `NodeMoveParams` | `NodeMoveResult` | node_move |
| `NodeReorderParams` | `NodeReorderResult` | node_reorder |
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
  dispatch?: DispatchConfig;    // 派发配置
}

// 派发配置
interface DispatchConfig {
  enabled: boolean;
  useGit: boolean;
  enabledAt: number;
  originalBranch?: string;
  processBranch?: string;
  activeDispatch?: {
    nodeId: string;
    startedAt: number;
  };
}
```

#### 任务场景

```typescript
type TaskScenario =
  | "feature"    // 功能开发
  | "summary"    // 文档总结
  | "optimize"   // 性能优化
  | "debug"      // 问题调试
  | "misc";      // 杂项
```

#### ActionRequired 机制

```typescript
interface ActionRequired {
  action: ActionRequiredAction;
  message: string;
  confirmationToken?: string;
  data?: Record<string, unknown>;
}

type ActionRequiredAction =
  | "ask_user"               // 需要询问用户
  | "show_plan"              // 展示计划
  | "confirm_reopen"         // 确认 reopen
  | "confirm_create_child"   // 确认创建子节点
  | "report_and_return"      // 汇报并返回
  | "sync_conclusion";       // 同步结论
```

#### API 类型

| 输入类型 | 输出类型 | 对应工具 |
|---------|---------|---------|
| `WorkspaceInitParams` | `WorkspaceInitResult` | workspace_init |
| `WorkspaceListParams` | `WorkspaceListResult` | workspace_list |
| `WorkspaceGetParams` | `WorkspaceGetResult` | workspace_get |
| `WorkspaceDeleteParams` | `WorkspaceDeleteResult` | workspace_delete |
| `WorkspaceUpdateRulesParams` | `WorkspaceUpdateRulesResult` | workspace_update_rules |
| `WorkspaceArchiveParams` | `WorkspaceArchiveResult` | workspace_archive |
| `WorkspaceRestoreParams` | `WorkspaceRestoreResult` | workspace_restore |
| `WorkspaceHealthParams` | `HealthReport` | workspace_health |

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
  docs: DocRefWithStatus[];
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
  workspace: { goal, rules, docs, rulesHash };
  chain: ContextChainItem[];
  references: ContextChainItem[];
  childConclusions: ChildConclusionItem[];
  conclusionsHash?: string;
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
| **工作区** | WORKSPACE_EXISTS | 工作区已存在 |
| | WORKSPACE_NOT_FOUND | 工作区不存在 |
| | WORKSPACE_ACTIVE | 活动状态无法删除 |
| | WORKSPACE_ARCHIVED | 状态不符合操作要求 |
| | WORKSPACE_ERROR | 工作区处于错误状态 |
| | INVALID_NAME | 名称包含非法字符 |
| | INVALID_PATH | 路径不合法 |
| | INIT_FAILED | 初始化失败 |
| **节点** | NODE_NOT_FOUND | 节点不存在 |
| | PARENT_NOT_FOUND | 父节点不存在 |
| | INVALID_TITLE | 标题包含非法字符 |
| | INVALID_CONTENT | 内容格式不合法 |
| | CANNOT_DELETE_ROOT | 无法删除根节点 |
| | INVALID_NODE_TYPE | 节点类型无效 |
| | INVALID_NODE_ROLE | 节点角色无效 |
| | EXECUTION_CANNOT_HAVE_CHILDREN | 执行节点不能有子节点 |
| **状态** | INVALID_TRANSITION | 非法状态转换 |
| | CONCLUSION_REQUIRED | 缺少结论 |
| | CONCLUSION_TOO_LONG | 结论过长 |
| | CONCLUSION_STALE | 结论已过期 |
| | CONCLUSIONS_HASH_REQUIRED | 缺少结论哈希 |
| | CONCLUSIONS_HASH_MISMATCH | 结论哈希不匹配 |
| | INFO_COLLECTION_REQUIRED | 缺少信息收集节点 |
| | INVALID_CONFIRMATION_TOKEN | 确认令牌无效 |
| **引用** | REFERENCE_NOT_FOUND | 引用不存在 |
| | REFERENCE_EXISTS | 引用已存在 |
| **备忘** | MEMO_NOT_FOUND | 备忘不存在 |
| **派发** | GIT_NOT_FOUND | 不是 git 仓库 |
| | DISPATCH_CONFLICT | 派发冲突 |
| | DISPATCH_NOT_ENABLED | 派发未启用 |
| | DISPATCH_REQUIRED | 必须通过派发执行 |
| | DISPATCH_IN_PROGRESS | 派发执行中 |
| | DISPATCH_ALREADY_ENABLED | 派发已启用 |
| | DISPATCH_MODE_CONFLICT | 派发模式冲突 |
| | GIT_ENVIRONMENT_LOST | Git 环境丢失 |
| | INVALID_DISPATCH_PARENT | 非派发母节点 |
| | INVALID_DISPATCH_STATUS | 派发状态不正确 |
| **校验** | GRAPH_CORRUPTED | 节点图损坏 |
| | NODE_DIR_MISSING | 节点目录缺失 |
| | NODE_INFO_MISSING | Info.md 缺失 |
| | CONTENT_CHANGED | 内容已变更 |
| | RULES_HASH_MISMATCH | 规则哈希不匹配 |
| **版本** | VERSION_TOO_HIGH | 数据版本过高 |
| | VERSION_READONLY | 禁止写入高版本数据 |

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

### confirmation.ts

**职责**: Confirmation Token 确认机制类型

**核心类型**:

```typescript
// 确认令牌
interface ConfirmationToken {
  token: string;                    // 唯一标识符
  createdAt: string;
  expiresAt: string;
  context: string;                  // 关联的上下文描述
}

// 待确认状态
interface PendingConfirmation {
  workspaceId: string;
  nodeId?: string;
  token: ConfirmationToken;
  actionType: string;               // 如 ask_user, show_plan
  message: string;
  data?: Record<string, unknown>;
}

// 确认结果
interface ConfirmationResult {
  token: string;
  valid: boolean;
  userInput?: string;
  reason?: string;                  // expired, not_found, already_used
}

// Token 验证状态
type TokenValidationStatus =
  | "valid"
  | "expired"
  | "not_found"
  | "already_used";
```

### guidance.ts

**职责**: 层级式引导内容结构定义

**核心类型**:

```typescript
// 引导级别
// L0: 简短提示（1-2 句话）
// L1: 工作流片段（3-5 个要点）
// L2: 完整指南（详细说明含示例）
type GuidanceLevel = 0 | 1 | 2;

// 触发场景类型
type GuidanceScenario =
  // 工作区相关
  | "workspace_init"
  | "workspace_first_planning"
  | "workspace_archived"
  // 任务场景
  | "scenario_feature"
  | "scenario_summary"
  | "scenario_optimize"
  | "scenario_debug"
  // 节点创建
  | "node_create_planning"
  | "node_create_execution"
  | "node_create_info_collection"
  // 节点状态转换
  | "execution_start"
  | "execution_complete"
  | "planning_start"
  | "planning_monitoring"
  // 特殊行为
  | "actionRequired_triggered"
  | "confirmation_required"
  // 错误场景
  | "error_invalid_transition"
  | "error_workspace_not_found"
  | "unknown";

// 引导内容
interface Guidance {
  level: GuidanceLevel;
  scenario: GuidanceScenario;
  content: string;
  expandable: boolean;
  expandTo?: GuidanceScenario;
  relatedHelpTopics?: string[];
  metadata?: {
    priority?: number;
    frequencyLimit?: "once" | "session" | "always";
    critical?: boolean;
  };
}
```

### memo.ts

**职责**: 备忘（Memo）类型定义

**核心类型**:

```typescript
// 备忘数据结构
interface Memo {
  id: string;                       // memo-{shortId}
  title: string;
  summary: string;                  // 用于列表显示
  content: string;                  // Markdown 格式
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// 列表项（精简信息）
interface MemoListItem {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  contentLength: number;
  dirName: string;                  // {title}_{shortId}
  createdAt: string;
  updatedAt: string;
}
```

#### API 类型

| 输入类型 | 输出类型 | 对应工具 |
|---------|---------|---------|
| `MemoCreateParams` | `MemoCreateResult` | memo_create |
| `MemoListParams` | `MemoListResult` | memo_list |
| `MemoGetParams` | `MemoGetResult` | memo_get |
| `MemoUpdateParams` | `MemoUpdateResult` | memo_update |
| `MemoDeleteParams` | `MemoDeleteResult` | memo_delete |

### capability.ts

**职责**: 能力包类型定义

**核心类型**:

```typescript
// 能力 ID
type CapabilityId =
  | "intent_alignment"      // 意图对齐
  | "context_discovery"     // 上下文探索
  | "diagnosis"             // 诊断分析
  | "tech_research"         // 技术调研
  | "measurement_analysis"  // 度量分析
  | "solution_design"       // 方案设计
  | "verification_strategy"; // 验证策略

// 能力信息
interface CapabilityInfo {
  id: CapabilityId;
  name: string;
  description: string;
  type: "collection" | "summary";
}

// 能力包配置
interface CapabilityPackConfig {
  basePack: CapabilityId[];        // 基础包
  optionalPack: CapabilityId[];    // 选装包
}

// 场景能力映射
type ScenarioCapabilities = Record<TaskScenario, CapabilityPackConfig>;
```

### health.ts

**职责**: 健康检测和备份类型定义

**核心类型**:

```typescript
// 健康问题类型
type HealthIssueType =
  | "version_mismatch"
  | "index_corrupt"
  | "node_corrupt"
  | "dir_missing"
  | "graph_corrupt"
  | "config_corrupt";

// 问题严重程度
type IssueSeverity = "error" | "warning";

// 健康问题详情
interface HealthIssue {
  type: HealthIssueType;
  severity: IssueSeverity;
  target?: string;                  // workspaceId 或 nodeId
  message: string;
  suggestion: string;
}

// 健康报告
interface HealthReport {
  status: "healthy" | "warning" | "error";
  checkedAt: string;
  codeVersion: string;
  issues: HealthIssue[];
  summary: {
    totalWorkspaces: number;
    healthyWorkspaces: number;
    warningWorkspaces: number;
    errorWorkspaces: number;
  };
}

// 备份元信息
interface BackupMeta {
  name: string;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
  trigger: "manual" | "auto" | "pre_operation";
  codeVersion: string;
  size: number;
  verified: boolean;
}

// 全局备份触发类型
type GlobalBackupTrigger = "beta_update" | "manual" | "pre_restore";
```

## 类型导出

**文件**: `src/types/index.ts`

统一导出所有类型：

```typescript
export * from "./workspace.js";
export * from "./node.js";
export * from "./context.js";
export * from "./errors.js";
export * from "./confirmation.js";
export * from "./guidance.js";
export * from "./memo.js";
export * from "./capability.js";
export * from "./health.js";
```

## 设计原则

### 数据源分层

| 数据类型 | 权威来源 | 说明 |
|---------|---------|------|
| 结构数据 | `graph.json` | status, children, references, dispatch |
| 内容数据 | `Info.md` | requirement, conclusion, notes |

### API 类型命名

- 输入：`{Tool}Params`（如 `NodeCreateParams`）
- 输出：`{Tool}Result`（如 `NodeCreateResult`）

### 可选字段

- API 输入的可选参数使用 `?` 标记
- 输出的可选字段同样使用 `?` 标记
- `hint` 字段用于工作流提示，仅在特定场景返回
- `guidance` 字段用于场景感知引导内容
- `actionRequired` 字段用于强制 AI 执行特定行为

## 使用示例

```typescript
import type {
  NodeType,
  NodeStatus,
  NodeRole,
  NodeGraph,
  NodeMeta,
  AcceptanceCriteria,
  NodeDispatchInfo,
  WorkspaceConfig,
  ContextGetResult,
  Memo,
  HealthReport,
  TanmiError,
} from "./types/index.js";

// 类型安全的状态检查
function isCompleted(status: NodeStatus): boolean {
  return status === "completed";
}

// 类型安全的角色检查
function isDispatchRole(role?: NodeRole): boolean {
  return role === "dispatch_exec" ||
         role === "dispatch_spec" ||
         role === "dispatch_quality";
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
