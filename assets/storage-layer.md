---
title: 存储层 (Storage Layer)
description: 数据持久化层，包含文件系统抽象、JSON存储、Markdown存储和会话存储四个模块
category: storage
---

# 存储层 (Storage Layer)

## 概述

存储层负责 TanmiWorkspace 的数据持久化，封装所有文件系统交互。采用四层结构：

```
┌─────────────────────────────────────────┐
│           服务层 (Services)              │
└──────────────────┬──────────────────────┘
                   │
     ┌─────────────┼─────────────────┐
     ▼             ▼                 ▼
┌─────────┐  ┌──────────┐  ┌────────────────┐
│  Json   │  │ Markdown │  │ SessionBinding │
│ Storage │  │ Storage  │  │    Storage     │
└────┬────┘  └────┬─────┘  └───────┬────────┘
     │            │                │
     └────────────┴────────────────┘
                  │
           ┌──────┴──────┐
           │ FileSystem  │
           │   Adapter   │
           └──────┬──────┘
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
| `getGlobalBasePath()` | 全局存储根路径（~/.tanmi-workspace） |
| `getIndexPath()` | 全局索引路径 |
| `getWorkspacePath(dirName)` | 工作区目录路径 |
| `getNodePath(wsDirName, nodeDirName)` | 节点目录路径 |
| `getMemoPath(wsDirName, memoDirName)` | 备忘目录路径 |
| `exists(path)` | 检查路径是否存在 |
| `mkdir(path)` | 创建目录（递归） |
| `readFile(path)` | 读取文件 |
| `writeFile(path, content)` | 原子写入文件 |
| `remove(path)` | 删除文件或目录 |
| `rename(oldPath, newPath)` | 重命名/移动 |

**环境隔离**:
- 正式环境: `~/.tanmi-workspace/`
- 开发环境: `~/.tanmi-workspace-dev/`（`TANMI_DEV=true`）

### JsonStorage

**文件**: `src/storage/JsonStorage.ts`

**职责**: JSON 数据读写，提供类型安全的接口，处理版本迁移

**存储版本**: `5.0`

版本历史:
| 版本 | 说明 |
|------|------|
| 1.0 | 初始版本 |
| 2.0 | index 添加 projectRoot |
| 3.0 | 添加节点 type 字段 |
| 4.0 | 添加 dirName 字段（UUID 格式） |
| 5.0 | dirName 改为可读格式（名称_短ID） |

**管理文件**:

| 文件 | 位置 | 内容 |
|------|------|------|
| `index.json` | `~/.tanmi-workspace[-dev]/` | 全局工作区索引 |
| `workspace.json` | `{wsDirName}/` | 工作区配置 |
| `graph.json` | `{wsDirName}/` | 节点图结构 |

**核心方法**:

```typescript
// 全局索引
readIndex(): Promise<WorkspaceIndex>
writeIndex(index): Promise<void>
getProjectRoot(workspaceId): Promise<string | null>
getDirNameFromIndex(workspaceId): Promise<string | null>

// 工作区配置
readWorkspaceConfig(wsDirName): Promise<WorkspaceConfig>
writeWorkspaceConfig(wsDirName, config): Promise<void>

// 节点图
readGraph(wsDirName): Promise<NodeGraph>
writeGraph(wsDirName, graph): Promise<void>

// 版本管理
getCurrentCodeVersion(): string
migrateAll(index): Promise<void>
```

### MarkdownStorage

**文件**: `src/storage/MarkdownStorage.ts`

**职责**: Markdown 文件读写，处理 frontmatter 和结构化内容

**管理文件**:

| 文件 | 位置 | 内容 |
|------|------|------|
| `Workspace.md` | `{wsDirName}/` | 规则、文档引用、日志、问题 |
| `Info.md` | `{wsDirName}/nodes/{nodeDirName}/` | 节点需求、结论、备注 |
| `Log.md` | `{wsDirName}/` 或 `.../nodes/{nodeDirName}/` | 操作日志 |
| `Problem.md` | `{wsDirName}/` 或 `.../nodes/{nodeDirName}/` | 当前问题和下一步 |
| `content.md` | `{wsDirName}/memos/{memoDirName}/` | 备忘内容 |

**核心方法**:

```typescript
// Workspace.md
readWorkspaceMd(wsDirName): Promise<WorkspaceMdData>
writeWorkspaceMd(wsDirName, data): Promise<void>

// Info.md
readNodeInfo(wsDirName, nodeDirName): Promise<NodeInfoData>
writeNodeInfo(wsDirName, nodeDirName, data): Promise<void>

// Log.md
readLog(wsDirName, nodeDirName?): Promise<LogEntry[]>
appendLog(wsDirName, entry, nodeDirName?): Promise<void>

// Problem.md
readProblem(wsDirName, nodeDirName?): Promise<ProblemData>
writeProblem(wsDirName, data, nodeDirName?): Promise<void>

// Memo content.md
readMemo(wsDirName, memoDirName): Promise<Memo>
writeMemo(wsDirName, memoDirName, memo): Promise<void>
```

### SessionBindingStorage

**文件**: `src/storage/SessionBindingStorage.ts`

**职责**: 会话绑定数据的持久化

**管理文件**:

| 文件 | 位置 | 内容 |
|------|------|------|
| `session-bindings.json` | `~/.tanmi-workspace[-dev]/` | 会话绑定索引 |

**核心方法**:

```typescript
readBindings(): Promise<SessionBindingIndex>
writeBindings(index): Promise<void>
getBinding(sessionId): Promise<SessionBinding | null>
setBinding(binding): Promise<void>
removeBinding(sessionId): Promise<void>
```

## 数据源规范

TanmiWorkspace 采用**分层数据源**设计：

| 数据类型 | 权威来源 | 说明 |
|---------|---------|------|
| **内容数据** | `Info.md` | requirement, conclusion, notes |
| **结构数据** | `graph.json` | status, children, references, dispatch |
| **配置数据** | `workspace.json` | scenario, dispatch config |

**设计原则**:
1. 用户可直接编辑 Markdown 文件
2. 状态转换由 API 控制
3. 两者同步更新，Info.md 的 frontmatter 中 status 仅展示用

## 目录结构

```
~/.tanmi-workspace[-dev]/
├── index.json                    # 全局工作区索引
├── session-bindings.json         # 会话绑定
├── {名称}_{短ID}/                 # 工作区目录（可读格式）
│   ├── workspace.json            # 工作区配置
│   ├── graph.json                # 节点图
│   ├── Workspace.md              # 工作区描述（规则、文档）
│   ├── Log.md                    # 全局日志
│   ├── Problem.md                # 全局问题
│   ├── nodes/
│   │   ├── root/                 # 根节点（固定目录名）
│   │   │   ├── Info.md
│   │   │   ├── Log.md
│   │   │   └── Problem.md
│   │   └── {标题}_{短ID}/         # 子节点目录
│   │       ├── Info.md
│   │       ├── Log.md
│   │       └── Problem.md
│   ├── memos/                    # 备忘目录
│   │   └── {标题}_{短ID}/
│   │       └── content.md
│   └── .backups/                 # 本地备份
│       └── {时间戳}.tar.gz
└── archive/                      # 归档目录
    └── {名称}_{短ID}/             # 归档的工作区
```

## 依赖关系

```
FileSystemAdapter  ←─┬─ JsonStorage
                     ├─ MarkdownStorage
                     └─ SessionBindingStorage
```

- `FileSystemAdapter` 无依赖
- `JsonStorage` 依赖 `FileSystemAdapter`
- `MarkdownStorage` 依赖 `FileSystemAdapter`
- `SessionBindingStorage` 依赖 `FileSystemAdapter`

## 使用示例

```typescript
import { FileSystemAdapter } from "./storage/FileSystemAdapter";
import { JsonStorage } from "./storage/JsonStorage";
import { MarkdownStorage } from "./storage/MarkdownStorage";
import { SessionBindingStorage } from "./storage/SessionBindingStorage";

// 初始化
const fs = new FileSystemAdapter();
const json = new JsonStorage(fs);
const md = new MarkdownStorage(fs);
const session = new SessionBindingStorage(fs);

// 读取工作区
const index = await json.readIndex();
const entry = index.workspaces.find(w => w.id === workspaceId);
const config = await json.readWorkspaceConfig(entry.dirName);
const graph = await json.readGraph(entry.dirName);

// 读取节点
const nodeMeta = graph.nodes[nodeId];
const nodeInfo = await md.readNodeInfo(entry.dirName, nodeMeta.dirName);

// 追加日志
await md.appendLog(entry.dirName, {
  time: new Date().toISOString(),
  operator: "AI",
  event: "执行某操作"
}, nodeMeta.dirName);

// 会话绑定
const binding = await session.getBinding(sessionId);
await session.setBinding({
  sessionId,
  workspaceId,
  focusedNodeId: null,
  boundAt: Date.now()
});
```

## 版本迁移

JsonStorage 支持自动版本迁移：

```typescript
// 读取时自动检测并迁移
const index = await json.readIndex();

// 如果数据版本高于代码版本
// - 备份原 index
// - 创建空索引
// - 提示用户升级

// 如果数据版本低于代码版本
// - 自动执行迁移逻辑
// - 更新 index.version
// - 遍历所有工作区的 graph.json 执行迁移
```

迁移路径：
- 4.0 → 5.0: 将 dirName 从 UUID 格式迁移为可读格式（名称_短ID）
