---
title: 数据存储规范
description: 数据存储规范，包括 JSON/Markdown 数据源分工、文件命名、目录结构
scope: storage
---

# 数据存储规范

## 适用范围

本规范适用于 `src/storage/` 模块和所有数据持久化操作。

## 数据源分层

### 权威来源原则

| 数据类型 | 权威来源 | 说明 |
|---------|---------|------|
| **结构数据** | `graph.json` | status, children, references, parentId |
| **内容数据** | `Info.md` | requirement, conclusion, notes, title |
| **配置数据** | `workspace.json` | id, name, status, rootNodeId |

### 同步规则

- 状态转换时：先更新 `graph.json`，再同步 `Info.md` frontmatter
- 内容更新时：只更新 `Info.md`，不影响 `graph.json`
- `Info.md` 的 frontmatter status 仅用于展示，以 `graph.json` 为准

## 目录结构

### 全局索引

```
~/.tanmi-workspace[-dev]/
└── index.json              # 全局工作区索引
```

### 工作区目录

```
{projectRoot}/.tanmi-workspace[-dev]/
└── {workspaceId}/
    ├── workspace.json      # 工作区配置
    ├── graph.json          # 节点图（结构数据）
    ├── Workspace.md        # 工作区描述
    ├── Log.md              # 全局日志
    ├── Problem.md          # 全局问题
    └── nodes/
        └── {nodeId}/
            ├── Info.md     # 节点信息（内容数据）
            ├── Log.md      # 节点日志
            └── Problem.md  # 节点问题
```

### 环境隔离

| 环境 | 目录 | 触发条件 |
|------|------|---------|
| 生产 | `.tanmi-workspace/` | 默认 |
| 开发 | `.tanmi-workspace-dev/` | `TANMI_DEV=true` |

## JSON 文件规范

### index.json

```json
{
  "version": "2.0",
  "workspaces": [
    {
      "id": "ws-xxx",
      "name": "工作区名称",
      "projectRoot": "/absolute/path",
      "status": "active",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

### workspace.json

```json
{
  "id": "ws-xxx",
  "name": "工作区名称",
  "status": "active",
  "rootNodeId": "root",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

### graph.json

```json
{
  "version": "1.0",
  "currentFocus": "node-xxx",
  "nodes": {
    "root": {
      "id": "root",
      "parentId": null,
      "children": ["node-xxx"],
      "status": "implementing",
      "isolate": false,
      "references": [],
      "conclusion": null,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

## Markdown 文件规范

### Frontmatter 格式

使用 YAML frontmatter：

```markdown
---
key: value
---

# 正文内容
```

### Workspace.md

```markdown
---
name: 工作区名称
createdAt: 2024-01-15T10:00:00.000Z
updatedAt: 2024-01-15T10:00:00.000Z
---

# 工作区名称

## 目标

工作区目标描述

## 规则

- 规则 1
- 规则 2

## 文档引用

| 路径 | 说明 | 状态 |
|------|------|------|
| /path/to/doc | 文档描述 | active |
```

### Info.md

```markdown
---
id: node-xxx
title: 节点标题
status: implementing
createdAt: 2024-01-15T10:00:00.000Z
updatedAt: 2024-01-15T10:00:00.000Z
---

# 节点标题

## 需求

节点需求描述

## 文档引用

| 路径 | 说明 | 状态 |
|------|------|------|
| /path/to/doc | 文档描述 | active |

## 备注

备注内容

## 结论

（节点完成后填写）
```

### Log.md

```markdown
# 日志

| 时间 | 操作者 | 事件 |
|------|--------|------|
| 2024-01-15 14:30:25 | AI | 开始执行任务 |
| 2024-01-15 14:35:10 | AI | 完成代码编写 |
```

### Problem.md

```markdown
# 当前问题

问题描述

# 下一步

计划的下一步操作
```

## 文件操作规范

### 原子写入

使用写入临时文件 + 重命名的方式：

```typescript
async writeFile(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, filePath);
}
```

### 目录创建

创建文件前确保目录存在：

```typescript
async mkdir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}
```

### 路径构建

使用 FileSystemAdapter 统一管理路径：

```typescript
// 正确：使用适配器方法
const nodePath = fs.getNodePath(projectRoot, wsId, nodeId);

// 错误：手动拼接路径
const nodePath = `${projectRoot}/.tanmi-workspace/${wsId}/nodes/${nodeId}`;
```

## ID 格式

### 工作区 ID

```
ws-{timestamp36}-{random6}
```

示例：`ws-miy7irh2-nns4xy`

### 节点 ID

```
node-{timestamp36}-{random6}
```

示例：`node-miy7jlch-9yuh3m`

### 根节点 ID

固定为 `root`

## 时间格式

### 存储格式

使用 ISO 8601：

```
2024-01-15T10:00:00.000Z
```

### 日志显示格式

```
2024-01-15 14:30:25
```

## 最佳实践

1. **单一来源**：每种数据只有一个权威来源
2. **原子操作**：使用临时文件确保写入原子性
3. **路径抽象**：通过 FileSystemAdapter 管理所有路径
4. **环境隔离**：开发和生产使用不同目录
5. **格式一致**：JSON 使用 2 空格缩进，Markdown 使用标准格式
