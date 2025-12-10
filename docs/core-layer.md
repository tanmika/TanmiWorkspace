---
title: 核心层 (Core Layer)
description: 业务逻辑层，包含工作区、节点、状态、上下文、日志、引用六大服务
category: core
---

# 核心层 (Core Layer)

## 概述

核心层实现 TanmiWorkspace 的业务逻辑，采用服务化架构。所有服务依赖存储层，彼此独立，通过 MCP Handler 组合调用。

```
┌──────────────────────────────────────────────────────────────┐
│                     MCP Handler                               │
└──────────────────────────────────────────────────────────────┘
     │         │         │         │         │         │
     ▼         ▼         ▼         ▼         ▼         ▼
┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│Workspace│  Node   │  State  │ Context │   Log   │Reference│
│ Service │ Service │ Service │ Service │ Service │ Service │
└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
     │         │         │         │         │         │
     └─────────┴─────────┴─────────┴─────────┴─────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         JsonStorage    MarkdownStorage  FileSystemAdapter
```

## 服务组成

### WorkspaceService

**文件**: `src/services/WorkspaceService.ts`

**职责**: 工作区生命周期管理

**核心方法**:

| 方法 | 说明 |
|------|------|
| `init(params)` | 创建工作区，初始化目录结构和根节点 |
| `list(params)` | 列出工作区，支持按状态过滤 |
| `get(params)` | 获取工作区详情，包含配置、节点图、Markdown 内容、rulesHash |
| `delete(params)` | 删除工作区，活动状态需 force=true |
| `status(params)` | 生成工作区状态可视化（box/markdown 格式） |
| `updateRules(params)` | 动态更新规则（add/remove/replace），返回新 rulesHash |

**初始化流程**:
1. 生成唯一 workspaceId（`ws-{timestamp}-{random}`）
2. 创建目录结构和配置文件
3. 创建根节点（title 同工作区名称）
4. 更新全局索引
5. 返回 webUrl 供浏览器访问

### NodeService

**文件**: `src/services/NodeService.ts`

**职责**: 节点 CRUD 和层级操作

**核心方法**:

| 方法 | 说明 |
|------|------|
| `create(params)` | 创建子节点，继承父节点上下文 |
| `get(params)` | 获取节点详情，合并 graph + Info.md |
| `list(params)` | 获取节点树，支持指定起点和深度 |
| `delete(params)` | 递归删除节点及其子树，清理悬空引用 |
| `update(params)` | 更新节点信息（标题、需求、备注、结论） |
| `split(params)` | 执行中分裂子任务，清空父节点 Problem |
| `move(params)` | 移动节点到新父节点，防止循环依赖 |
| `buildNodeTree(params)` | 构建节点树结构，支持深度限制 |

**节点 ID 格式**: `node-{timestamp}-{random}`

**split 场景**: 执行过程中发现需要前置任务时，将问题转化为子节点

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

**终态定义**: completed、failed、cancelled 均为终态

### ContextService

**文件**: `src/services/ContextService.ts`

**职责**: 上下文聚合和焦点管理

**核心方法**:

| 方法 | 说明 |
|------|------|
| `get(params)` | 获取聚焦上下文，构建完整上下文链 |
| `focus(params)` | 切换当前焦点节点 |

**context_get 返回内容**:

```typescript
{
  workspace: {
    goal: string;           // 工作区目标
    rules: string[];        // 规则列表
    rulesHash: string;      // 规则哈希（用于 node_create 验证）
    docs: DocRef[];         // 活跃文档引用
  },
  chain: ContextChainItem[];     // 上下文链（根→当前）
  references: ContextChainItem[]; // 跨节点引用
  childConclusions: [];          // 子节点结论冒泡
  hint: string;                  // 工作流提示
}
```

**上下文链构建**:
1. 从当前节点向上遍历到根节点
2. 遇到 `isolate=true` 的节点时截断
3. 每个节点包含：需求、文档、日志、问题

**工作流提示（hint）**: 根据节点状态生成操作建议

### LogService

**文件**: `src/services/LogService.ts`

**职责**: 日志追加和问题管理

**核心方法**:

| 方法 | 说明 |
|------|------|
| `append(params)` | 追加日志条目到节点或全局 |
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
| `reference(params)` | 管理文档/节点引用生命周期 |

**引用操作**:

| Action | 说明 |
|--------|------|
| add | 添加新引用（status=active） |
| remove | 删除引用 |
| expire | 标记引用过期（移出上下文窗口） |
| activate | 重新激活过期引用 |

**隔离机制**: `isolate=true` 时，上下文链在该节点截断，不继承父节点信息

## 依赖关系

```
所有 Service
    │
    ├── JsonStorage      （结构数据）
    ├── MarkdownStorage  （内容数据）
    └── FileSystemAdapter（文件操作）
```

**设计原则**:
- Service 之间不直接依赖
- 通过存储层共享数据
- MCP Handler 负责组合调用

## 数据源分工

| 数据类型 | 权威来源 | Service |
|---------|---------|---------|
| 工作区配置 | workspace.json | WorkspaceService |
| 节点结构/状态 | graph.json | NodeService, StateService |
| 节点内容 | Info.md | NodeService |
| 日志 | Log.md | LogService |
| 问题 | Problem.md | LogService |
| 引用状态 | Info.md/Workspace.md | ReferenceService |

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
});

// 创建子节点
const node = await nodeService.create({
  workspaceId: ws.workspaceId,
  parentId: ws.rootNodeId,
  title: "实现登录功能",
  requirement: "使用 JWT 认证",
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
