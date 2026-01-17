---
title: 核心层 (Core Layer)
description: 业务逻辑层，包含 21 个服务模块
category: core
---

# 核心层 (Core Layer)

## 概述

核心层实现 TanmiWorkspace 的业务逻辑，采用服务化架构。所有服务依赖存储层，通过 MCP Handler 组合调用。

```
┌──────────────────────────────────────────────────────────────┐
│                     MCP Handler                               │
└──────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  核心服务 (7)  │    │  功能服务 (8)  │    │  辅助服务 (6)  │
│               │    │               │    │               │
│ Workspace     │    │ Dispatch      │    │ Guidance      │
│ Node          │    │ Memo          │    │ Detection     │
│ State         │    │ Search        │    │ Installation  │
│ Context       │    │ Backup        │    │ Tutorial      │
│ Log           │    │ Health        │    │ OpenSpecParser│
│ Reference     │    │ Capability    │    │ Repair        │
│ Session       │    │ Config        │    │               │
│               │    │ Event         │    │               │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         JsonStorage    MarkdownStorage  FileSystemAdapter
```

## 服务分类

### 核心服务（7 个）

直接支持工作区和节点核心功能。

| 服务 | 职责 | 依赖 |
|------|------|------|
| WorkspaceService | 工作区生命周期管理 | JsonStorage, MarkdownStorage, EventService |
| NodeService | 节点 CRUD 和层级操作 | JsonStorage, MarkdownStorage, GuidanceService, EventService |
| StateService | 状态机和状态转换 | JsonStorage, MarkdownStorage, GuidanceService, EventService |
| ContextService | 上下文聚合和焦点管理 | JsonStorage, MarkdownStorage, GuidanceService, WorkspaceService, MemoService |
| LogService | 日志追加和问题管理 | JsonStorage, MarkdownStorage, EventService |
| ReferenceService | 节点隔离和引用管理 | JsonStorage, MarkdownStorage, EventService |
| SessionService | 会话绑定和状态查询 | JsonStorage, MarkdownStorage, InstallationService |

### 功能服务（8 个）

提供独立功能模块。

| 服务 | 职责 | 依赖 |
|------|------|------|
| DispatchService | 多 Agent 任务派发协调 | JsonStorage, ConfigService, EventService, Git |
| MemoService | 备忘录 CRUD | JsonStorage, MarkdownStorage, EventService |
| SearchService | 全文搜索 | JsonStorage, MarkdownStorage |
| BackupService | 备份创建和恢复 | JsonStorage, FileSystemAdapter |
| HealthService | 健康检测 | JsonStorage, WorkspaceService |
| CapabilityService | 能力包管理 | 无（配置文件） |
| ConfigService | 全局配置管理 | 无（文件存储） |
| EventService | SSE 事件广播 | 无 |

### 辅助服务（6 个）

提供检测、修复、教程等辅助功能。

| 服务 | 职责 | 依赖 |
|------|------|------|
| GuidanceService | 场景化引导生成 | 无 |
| DetectionService | 组件安装状态检测 | 无（文件检测） |
| InstallationService | 安装元数据管理 | 无（文件存储） |
| TutorialService | 演示工作区生成 | 所有核心服务 |
| OpenSpecParser | OpenSpec 规范解析 | 无（文件解析） |
| RepairService | 诊断和自动修复 | JsonStorage |

---

## 核心服务详解

### WorkspaceService

**文件**: `src/services/WorkspaceService.ts`

**职责**: 工作区生命周期管理

**核心方法**:

| 方法 | 说明 |
|------|------|
| `init(params)` | 创建工作区，初始化目录结构和根节点 |
| `list(params)` | 列出工作区，支持按状态过滤和路径优先排序 |
| `get(params)` | 获取工作区详情，包含配置、节点图、Markdown 内容 |
| `delete(params)` | 删除工作区，活动状态需 force=true |
| `archive(params)` | 归档工作区到 archive/ 目录 |
| `restore(params)` | 恢复归档的工作区 |
| `status(params)` | 生成工作区状态可视化（box/markdown 格式） |
| `updateRules(params)` | 动态更新规则（add/remove/replace） |
| `exportAsTwsp(params)` | 导出工作区为 .twsp 格式 |
| `importFromTwsp(params)` | 从 .twsp 文件导入工作区 |

**初始化流程**:
1. 生成唯一 workspaceId（`ws-{timestamp}-{random}`）
2. 创建目录结构（可读目录名格式：`名称_短ID`）
3. 初始化配置文件和根节点
4. 更新全局索引
5. 返回 webUrl 供浏览器访问

### NodeService

**文件**: `src/services/NodeService.ts`

**职责**: 节点 CRUD 和层级操作

**核心方法**:

| 方法 | 说明 |
|------|------|
| `create(params)` | 创建子节点，验证 rulesHash，触发父节点状态更新 |
| `get(params)` | 获取节点详情，合并 graph + Info.md |
| `list(params)` | 获取节点树，支持指定起点和深度 |
| `delete(params)` | 递归删除节点及其子树，清理悬空引用 |
| `update(params)` | 更新节点信息（标题、需求、备注、结论） |
| `move(params)` | 移动节点到新父节点，防止循环依赖 |
| `reorderChildren(params)` | 重新排序子节点顺序 |

**节点 ID 格式**: `node-{timestamp}-{random}`

**节点目录格式**: `{title}_{shortId}`（可读格式）

### StateService

**文件**: `src/services/StateService.ts`

**职责**: 状态机和状态转换

**状态流转图（执行节点）**:

```
                    ┌─────────────────────────────────┐
                    │                                 │
                    ▼                                 │
┌─────────┐ start ┌─────────────┐ submit ┌───────────┴─┐
│ pending │──────▶│implementing │───────▶│  validating │
└─────────┘       └──────┬──────┘        └──────┬──────┘
                         │                      │
                         │ complete             │ complete/fail
                         ▼                      ▼
                  ┌───────────┐          ┌───────────┐
                  │ completed │◀─────────│  failed   │
                  └─────┬─────┘   retry  └───────────┘
                        │
                        │ reopen
                        ▼
                  ┌─────────────┐
                  │implementing │
                  └─────────────┘
```

**状态流转图（规划节点）**:

```
┌─────────┐ start ┌──────────┐  创建子节点  ┌────────────┐
│ pending │──────▶│ planning │────────────▶│ monitoring │
└─────────┘       └────┬─────┘             └─────┬──────┘
                       │                         │
                       │ cancel                  │ complete（子节点全部终态）
                       ▼                         ▼
                 ┌───────────┐            ┌───────────┐
                 │ cancelled │            │ completed │
                 └───────────┘            └─────┬─────┘
                                                │
                                                │ reopen
                                                ▼
                                          ┌──────────┐
                                          │ planning │
                                          └──────────┘
```

**核心方法**:

| 方法 | 说明 |
|------|------|
| `transition(params)` | 执行状态转换，验证合法性，处理级联更新 |
| `createPendingConfirmation(params)` | 创建待确认 token（30 分钟过期） |
| `validateConfirmation(params)` | 验证并消耗确认 token |
| `clearExpiredTokens()` | 清理过期的确认 token |

**执行节点状态转换表**:

| Action | From | To | 说明 |
|--------|------|-----|------|
| start | pending | implementing | 开始执行 |
| submit | implementing | validating | 提交验证 |
| complete | implementing/validating | completed | 完成（需 conclusion） |
| fail | implementing/validating | failed | 失败（需 conclusion） |
| retry | failed | implementing | 重试 |
| reopen | completed | implementing | 重新激活 |

**规划节点状态转换表**:

| Action | From | To | 说明 |
|--------|------|-----|------|
| start | pending | planning | 开始规划 |
| complete | planning/monitoring | completed | 完成汇总（需 conclusion，子节点需全部终态） |
| cancel | planning/monitoring | cancelled | 取消规划（需 conclusion） |
| reopen | completed/cancelled | planning | 重新规划 |

**级联更新**:
- start/reopen 自动将父规划节点从 pending/completed 更新为 planning/monitoring
- 创建子节点时，父规划节点自动从 pending/planning 转为 monitoring
- 在 completed 父节点下创建子节点时，自动 reopen 父节点

### ContextService

**文件**: `src/services/ContextService.ts`

**职责**: 上下文聚合和焦点管理

**核心方法**:

| 方法 | 说明 |
|------|------|
| `get(params)` | 获取聚焦上下文，构建完整上下文链 |
| `focus(params)` | 切换当前焦点节点，检测结论过期 |

**context_get 返回内容**:

```typescript
{
  workspace: {
    goal: string;           // 工作区目标
    rules: string[];        // 规则列表
    rulesHash: string;      // 规则哈希
    docs: DocRef[];         // 活跃文档引用
  },
  chain: ContextChainItem[];     // 上下文链（根→当前）
  references: ContextChainItem[]; // 跨节点引用
  childConclusions: [];          // 子节点结论冒泡
  hint: string;                  // 工作流提示
  memos?: MemoSummary[];         // 相关备忘摘要
}
```

**上下文链构建**:
1. 从当前节点向上遍历到根节点
2. 遇到 `isolate=true` 的节点时截断
3. 每个节点包含：需求、文档、日志、问题

### LogService

**文件**: `src/services/LogService.ts`

**职责**: 日志追加和问题管理

**核心方法**:

| 方法 | 说明 |
|------|------|
| `append(params)` | 追加日志条目到节点或工作区 |
| `updateProblem(params)` | 更新当前问题和下一步计划 |
| `clearProblem(params)` | 清空问题（问题已解决） |

**日志格式**: `| 时间戳 | 操作者 | 事件 |`

**操作者类型**: `AI` 或 `Human`

### ReferenceService

**文件**: `src/services/ReferenceService.ts`

**职责**: 节点隔离和引用管理

**核心方法**:

| 方法 | 说明 |
|------|------|
| `isolate(params)` | 设置/取消节点隔离状态 |
| `reference(params)` | 管理文档/节点/备忘引用（add/remove） |

**引用类型**:
- 节点引用：`node-xxx`
- 文档引用：`/path/to/file`
- 备忘引用：`memo://memo-xxx`

**隔离机制**: `isolate=true` 时，上下文链在该节点截断，不继承父节点信息

### SessionService

**文件**: `src/services/SessionService.ts`

**职责**: 会话绑定和状态查询

**核心方法**:

| 方法 | 说明 |
|------|------|
| `bind(params)` | 绑定会话到工作区 |
| `unbind(params)` | 解除会话绑定 |
| `status(params)` | 查询会话状态和可用工作区 |
| `getPendingChanges(params)` | 获取待处理的手动变更 |

---

## 功能服务详解

### DispatchService

**文件**: `src/services/DispatchService.ts`

**职责**: 多 Agent 任务派发协调

**核心方法**:

| 方法 | 说明 |
|------|------|
| `enableDispatch(params)` | 启用派发模式（Git/无 Git） |
| `disableDispatch(params)` | 禁用派发模式，执行合并策略 |
| `dispatchNode(params)` | 升级节点为派发母节点 |
| `createDispatch(params)` | 创建派发子节点组（exec + spec + quality） |
| `completeDispatch(params)` | 完成派发任务，处理结果 |
| `cleanupBranches(params)` | 清理派发相关分支 |

**派发模式**:
- **无 Git 模式**（推荐）：仅更新元数据
- **Git 模式**：自动创建分支、提交、回滚

**派发节点角色**:
- `dispatch_exec`：执行节点
- `dispatch_spec`：规格审查节点
- `dispatch_quality`：质量审查节点

### MemoService

**文件**: `src/services/MemoService.ts`

**职责**: 备忘录 CRUD

**核心方法**:

| 方法 | 说明 |
|------|------|
| `create(params)` | 创建备忘（需至少 2 个标签） |
| `get(params)` | 获取备忘完整内容 |
| `list(params)` | 列出备忘，支持标签过滤 |
| `update(params)` | 更新备忘（支持追加内容） |
| `delete(params)` | 删除备忘 |

**存储位置**: `{workspace}/memos/{memoId}.md`

### SearchService

**文件**: `src/services/SearchService.ts`

**职责**: 全文搜索

**核心方法**:

| 方法 | 说明 |
|------|------|
| `workspaceSearch(params)` | 搜索工作区（名称、目标、规则） |
| `contentSearch(params)` | 搜索工作区内容（节点、备忘、日志） |

**返回内容**: 匹配结果 + 上下文片段

### BackupService

**文件**: `src/services/BackupService.ts`

**职责**: 备份创建和恢复

**核心方法**:

| 方法 | 说明 |
|------|------|
| `createBackup(params)` | 创建工作区备份（tar.gz） |
| `listBackups(params)` | 列出工作区备份 |
| `restoreBackup(params)` | 恢复工作区备份 |
| `createGlobalBackup(params)` | 创建全局备份（.twbak） |
| `listGlobalBackups()` | 列出全局备份 |
| `restoreGlobalBackup(params)` | 恢复全局备份 |

**备份策略**: 最多保留 10 个备份，自动轮转删除最旧的

### HealthService

**文件**: `src/services/HealthService.ts`

**职责**: 健康检测

**核心方法**:

| 方法 | 说明 |
|------|------|
| `checkHealth(params)` | 执行完整健康检测 |
| `checkWorkspace(params)` | 检测单个工作区 |

**检测内容**: 目录完整性、配置有效性、节点文件完整性

### CapabilityService

**文件**: `src/services/CapabilityService.ts`

**职责**: 能力包管理

**核心方法**:

| 方法 | 说明 |
|------|------|
| `getCapabilitiesForScenario(params)` | 获取场景对应的能力包列表 |
| `getCapabilityInfo(params)` | 获取能力包详情 |
| `getAcceptanceCriteria(params)` | 获取能力包验收标准 |

**配置文件**: `config/scenarioCapabilities.json`

### ConfigService

**文件**: `src/services/ConfigService.ts`

**职责**: 全局配置管理

**核心方法**:

| 方法 | 说明 |
|------|------|
| `get()` | 获取全局配置 |
| `set(params)` | 设置配置项 |

**配置文件**: `~/.tanmi-workspace/config.json`

### EventService

**文件**: `src/services/EventService.ts`

**职责**: SSE 事件广播

**核心方法**:

| 方法 | 说明 |
|------|------|
| `addClient(params)` | 添加 SSE 客户端 |
| `broadcast(params)` | 广播事件到所有客户端 |
| `emitWorkspaceUpdate(params)` | 发送工作区更新事件 |
| `emitNodeUpdate(params)` | 发送节点更新事件 |
| `emitLogUpdate(params)` | 发送日志更新事件 |

**事件类型**: workspace, node, log, memo, dispatch, context, reference

---

## 辅助服务详解

### GuidanceService

**文件**: `src/services/GuidanceService.ts`

**职责**: 场景化引导生成

**核心方法**:

| 方法 | 说明 |
|------|------|
| `detectScenario(params)` | 检测当前场景 |
| `generate(params)` | 生成引导内容（L0/L1/L2 级别） |
| `generateFromContext(params)` | 根据上下文生成引导 |

**引导级别**:

| 级别 | 说明 | Token 消耗 |
|------|------|-----------|
| L0 | 提示词（总是返回） | ~20 token |
| L1 | 简要引导（按需展开） | ~50 token |
| L2 | 详细引导（按需展开） | ~100 token |

### DetectionService

**文件**: `src/services/DetectionService.ts`

**职责**: 组件安装状态检测

**核心方法**:

| 方法 | 说明 |
|------|------|
| `detectClaudeCode()` | 检测 Claude Code 安装状态 |
| `detectCursor()` | 检测 Cursor 安装状态 |
| `detectCodex()` | 检测 Codex 安装状态 |
| `detectAll()` | 检测所有平台安装状态 |

**检测内容**: Hook 脚本、Subagent、Skill 安装情况

### InstallationService

**文件**: `src/services/InstallationService.ts`

**职责**: 安装元数据管理

**核心方法**:

| 方法 | 说明 |
|------|------|
| `read()` | 读取安装元数据 |
| `write(params)` | 写入安装元数据 |
| `getPackageVersion()` | 获取当前包版本 |

**元数据文件**: `~/.tanmi-workspace/installation-meta.json`

### TutorialService

**文件**: `src/services/TutorialService.ts`

**职责**: 演示工作区生成

**核心方法**:

| 方法 | 说明 |
|------|------|
| `createTutorialWorkspace()` | 创建演示工作区 |
| `deleteTutorialWorkspace()` | 删除演示工作区 |
| `updateIfNeeded()` | 版本更新时重建演示工作区 |

### OpenSpecParser

**文件**: `src/services/OpenSpecParser.ts`

**职责**: OpenSpec 规范解析

**核心方法**:

| 方法 | 说明 |
|------|------|
| `parseOpenSpec(params)` | 解析 OpenSpec 目录 |
| `generateImportGuide(params)` | 生成导入引导 |

### RepairService

**文件**: `src/services/RepairService.ts`

**职责**: 诊断和自动修复

**核心方法**:

| 方法 | 说明 |
|------|------|
| `diagnose(params)` | 诊断工作区问题 |
| `repair(params)` | 执行自动修复 |
| `diagnoseWorkspace(params)` | 诊断单个工作区 |

---

## 依赖关系

```
所有 Service
    │
    ├── JsonStorage      （结构数据）
    ├── MarkdownStorage  （内容数据）
    └── FileSystemAdapter（文件操作）
```

**设计原则**:
- Service 之间尽量不直接依赖
- 通过存储层共享数据
- MCP Handler 负责组合调用
- EventService 作为单例提供跨服务事件通知

## 数据源分工

| 数据类型 | 权威来源 | Service |
|---------|---------|---------|
| 工作区配置 | workspace.json | WorkspaceService |
| 节点结构/状态 | graph.json | NodeService, StateService |
| 节点内容 | Info.md | NodeService |
| 日志 | Log.md | LogService |
| 问题 | Problem.md | LogService |
| 引用状态 | graph.json + Info.md | ReferenceService |
| 备忘内容 | memos/{id}.md | MemoService |
| 备忘索引 | graph.json | MemoService |
| 场景引导 | guidanceContent.ts | GuidanceService |
| 确认 Token | 内存（StateService） | StateService |
| 全局配置 | config.json | ConfigService |
| 备份元数据 | backup-meta.json | BackupService |

## 使用示例

```typescript
import { WorkspaceService } from "./services/WorkspaceService";
import { NodeService } from "./services/NodeService";
import { StateService } from "./services/StateService";
import { ContextService } from "./services/ContextService";

// 初始化服务
const workspaceService = new WorkspaceService(json, md, fs);
const nodeService = new NodeService(json, md, fs);
const stateService = new StateService(json, md, fs);
const contextService = new ContextService(json, md, fs);

// 创建工作区
const ws = await workspaceService.init({
  name: "我的项目",
  goal: "完成功能开发",
  scenario: "feature",
});

// 创建子节点
const node = await nodeService.create({
  workspaceId: ws.workspaceId,
  parentId: ws.rootNodeId,
  type: "execution",
  title: "实现登录功能",
  requirement: "使用 JWT 认证",
  rulesHash: ws.rulesHash,
});

// 开始执行
await stateService.transition({
  workspaceId: ws.workspaceId,
  nodeId: node.nodeId,
  action: "start",
});

// 获取上下文
const ctx = await contextService.get({
  workspaceId: ws.workspaceId,
  nodeId: node.nodeId,
});
```
