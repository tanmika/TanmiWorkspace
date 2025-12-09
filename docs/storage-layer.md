---
title: 存储层 (Storage Layer)
description: 数据持久化层，包含文件系统抽象、JSON存储和Markdown存储三个模块
category: storage
---

# 存储层 (Storage Layer)

## 概述

存储层负责 TanmiWorkspace 的数据持久化，封装所有文件系统交互。采用三层结构：

```
┌─────────────────────────────────────────┐
│           服务层 (Services)              │
└──────────────────┬──────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌─────────┐  ┌──────────┐  ┌──────────────┐
│  Json   │  │ Markdown │  │ FileSystem   │
│ Storage │  │ Storage  │  │  Adapter     │
└────┬────┘  └────┬─────┘  └──────────────┘
     │            │               ▲
     └────────────┴───────────────┘
                  │
           ┌──────┴──────┐
           │  文件系统    │
           └─────────────┘
```

## 模块组成

### FileSystemAdapter

**文件**: `src/storage/FileSystemAdapter.ts`

**职责**: 文件系统抽象，封装路径管理和底层文件操作

**核心功能**:

| 方法 | 说明 |
|------|------|
| `getIndexPath()` | 全局索引路径 |
| `getWorkspacePath(projectRoot, wsId)` | 工作区目录路径 |
| `getNodePath(projectRoot, wsId, nodeId)` | 节点目录路径 |
| `exists(path)` | 检查路径是否存在 |
| `mkdir(path)` | 创建目录（递归） |
| `readFile(path)` | 读取文件 |
| `writeFile(path, content)` | 原子写入文件 |

**环境隔离**:
- 正式环境: `.tanmi-workspace/`
- 开发环境: `.tanmi-workspace-dev/`（`TANMI_DEV=true`）

### JsonStorage

**文件**: `src/storage/JsonStorage.ts`

**职责**: JSON 数据读写，提供类型安全的接口

**管理文件**:

| 文件 | 位置 | 内容 |
|------|------|------|
| `index.json` | `~/.tanmi-workspace[-dev]/` | 全局工作区索引 |
| `workspace.json` | `{ws}/` | 工作区配置 |
| `graph.json` | `{ws}/` | 节点图结构 |

**核心方法**:

```typescript
// 全局索引
readIndex(): Promise<WorkspaceIndex>
writeIndex(index): Promise<void>
getProjectRoot(workspaceId): Promise<string | null>

// 工作区配置
readWorkspaceConfig(projectRoot, wsId): Promise<WorkspaceConfig>
writeWorkspaceConfig(projectRoot, wsId, config): Promise<void>

// 节点图
readGraph(projectRoot, wsId): Promise<NodeGraph>
writeGraph(projectRoot, wsId, graph): Promise<void>
```

### MarkdownStorage

**文件**: `src/storage/MarkdownStorage.ts`

**职责**: Markdown 文件读写，处理 frontmatter 和结构化内容

**管理文件**:

| 文件 | 位置 | 内容 |
|------|------|------|
| `Workspace.md` | `{ws}/` | 工作区目标、规则、文档 |
| `Info.md` | `{ws}/nodes/{nodeId}/` | 节点需求、结论、备注 |
| `Log.md` | `{ws}/` 或 `{ws}/nodes/{nodeId}/` | 操作日志表格 |
| `Problem.md` | `{ws}/` 或 `{ws}/nodes/{nodeId}/` | 当前问题和下一步 |

**核心方法**:

```typescript
// 解析
parse(content): { frontmatter, content }
serialize(data): string

// Workspace.md
readWorkspaceMd(projectRoot, wsId): Promise<WorkspaceMdData>
writeWorkspaceMd(projectRoot, wsId, data): Promise<void>

// Info.md
readNodeInfo(projectRoot, wsId, nodeId): Promise<NodeInfoData>
writeNodeInfo(projectRoot, wsId, nodeId, data): Promise<void>

// Log.md
readLog(projectRoot, wsId, nodeId?): Promise<LogEntry[]>
appendLog(projectRoot, wsId, entry, nodeId?): Promise<void>

// Problem.md
readProblem(projectRoot, wsId, nodeId?): Promise<ProblemData>
writeProblem(projectRoot, wsId, data, nodeId?): Promise<void>
```

## 数据源规范

TanmiWorkspace 采用**分层数据源**设计：

| 数据类型 | 权威来源 | 说明 |
|---------|---------|------|
| **内容数据** | `Info.md` | requirement, conclusion, notes |
| **结构数据** | `graph.json` | status, children, references |

**设计原则**:
1. 用户可直接编辑 Markdown 文件
2. 状态转换由 API 控制
3. 两者同步更新，Info.md 的 frontmatter 中 status 仅展示用

## 目录结构

```
~/.tanmi-workspace[-dev]/
└── index.json                    # 全局索引

{projectRoot}/.tanmi-workspace[-dev]/
└── {workspaceId}/
    ├── workspace.json            # 工作区配置
    ├── graph.json                # 节点图
    ├── Workspace.md              # 工作区描述
    ├── Log.md                    # 全局日志
    ├── Problem.md                # 全局问题
    └── nodes/
        └── {nodeId}/
            ├── Info.md           # 节点信息
            ├── Log.md            # 节点日志
            └── Problem.md        # 节点问题
```

## 依赖关系

```
FileSystemAdapter  ←─┬─ JsonStorage
                     └─ MarkdownStorage
```

- `FileSystemAdapter` 无依赖
- `JsonStorage` 依赖 `FileSystemAdapter`
- `MarkdownStorage` 依赖 `FileSystemAdapter`

## 使用示例

```typescript
import { FileSystemAdapter } from "./storage/FileSystemAdapter";
import { JsonStorage } from "./storage/JsonStorage";
import { MarkdownStorage } from "./storage/MarkdownStorage";

// 初始化
const fs = new FileSystemAdapter();
const json = new JsonStorage(fs);
const md = new MarkdownStorage(fs);

// 读取工作区
const projectRoot = await json.getProjectRoot(workspaceId);
const config = await json.readWorkspaceConfig(projectRoot, workspaceId);
const graph = await json.readGraph(projectRoot, workspaceId);

// 读取节点
const nodeInfo = await md.readNodeInfo(projectRoot, workspaceId, nodeId);

// 追加日志
await md.appendLog(projectRoot, workspaceId, {
  time: new Date().toISOString(),
  operator: "AI",
  event: "执行某操作"
}, nodeId);
```
