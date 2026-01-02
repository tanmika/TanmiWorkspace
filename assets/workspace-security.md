# TanmiWorkspace 安全性与数据保护

本文档详细说明 TanmiWorkspace 的数据安全机制，包括版本兼容性、数据完整性检测、备份系统和恢复工具。

## 目录

- [一、数据保护机制](#一数据保护机制)
- [二、备份系统](#二备份系统)
- [三、健康监控](#三健康监控)
- [四、恢复工具](#四恢复工具)
- [五、错误处理](#五错误处理)
- [六、最佳实践](#六最佳实践)

---

## 一、数据保护机制

### 1.1 版本兼容性检测

TanmiWorkspace 使用双重版本检测机制，防止新旧版本数据不兼容导致的数据损坏。

#### 存储版本 (Storage Version)

`graph.json` 和 `index.json` 中的 `version` 字段，用于数据结构迁移：

```json
{
  "version": "5.0",
  "nodes": { ... }
}
```

| 版本 | 变更内容 |
|------|----------|
| 1.0 | 初始版本 |
| 2.0 | index 添加 projectRoot |
| 3.0 | 添加节点 type 字段 |
| 4.0 | 添加 dirName 字段（UUID 格式）|
| 5.0 | dirName 改为可读格式（名称_短ID）|

#### 代码版本 (Code Version)

`graph.json` 中的 `lastWriteCodeVersion` 字段，记录写入数据的 package.json 版本：

```json
{
  "version": "5.0",
  "lastWriteCodeVersion": "1.10.4",
  "nodes": { ... }
}
```

**版本检测规则**：

| 场景 | 行为 |
|------|------|
| 数据版本 major.minor > 代码版本 | 设为只读模式，禁止写入 |
| 数据版本 major.minor < 代码版本 | 允许操作，自动迁移数据结构 |
| 仅 patch 版本差异 | 允许操作，记录日志 |

**只读模式**：

当检测到高版本数据时，会设置运行时标记（不写入文件）：

```typescript
graph.__readOnly = true;
graph.__versionMismatch = {
  dataVersion: "1.11.0",
  currentVersion: "1.10.4",
  message: "数据由 v1.11.0 写入，当前版本 v1.10.4 可能不兼容，已设为只读"
};
```

尝试写入只读数据时，抛出 `VERSION_READONLY` 错误。

### 1.2 数据完整性检测

#### 启动时检测（轻量级）

MCP 服务启动时自动检测所有工作区：

- 工作区目录是否存在
- workspace.json 是否可读
- graph.json 是否可读
- 必要字段是否完整

检测到问题时调用 `markAsError()` 标记工作区状态。

#### 运行时检测（全量）

每次调用 `workspace_get` 时并行检测所有节点：

- 节点目录是否存在
- Info.md 文件是否存在

检测到问题时在返回结果中添加 `warning` 字段：

```json
{
  "config": { ... },
  "graph": { ... },
  "warning": {
    "message": "检测到 2 个节点完整性问题",
    "issues": [
      {
        "type": "node_corrupt",
        "severity": "warning",
        "target": "node-abc123",
        "message": "节点 Info.md 缺失: 功能分析_abc123",
        "suggestion": "可尝试重建节点信息文件"
      }
    ],
    "suggestion": "可使用 workspace_health 工具查看详情并进行修复"
  }
}
```

---

## 二、备份系统

TanmiWorkspace 提供两级备份系统：全局索引备份和工作区备份。

### 2.1 全局索引备份

**位置**：`~/.tanmi-workspace[-dev]/backups/`

**触发时机**：
- `--verify` 执行前
- `--scan` 执行前
- 任何可能修改索引的操作前

**保留策略**：最多保留 10 个备份，自动删除最旧的。

**命令**：

```bash
# 列出索引备份
tanmi-workspace rebuild --list

# 还原索引备份
tanmi-workspace rebuild --restore index.2024-12-27T10-30-00.json
```

### 2.2 工作区备份

**位置**：`{workspace}/.backups/`

**格式**：`backup_{ISO时间戳}.tar.gz`

**触发时机**：
- 手动触发 (`trigger: "manual"`)
- 自动触发 (`trigger: "auto"`)，5 分钟防抖
- 操作前触发 (`trigger: "pre_operation"`)，如恢复前

**保留策略**：最多保留 10 个备份，自动轮转删除最旧的。

**元数据文件**：`backup-meta.json`

```json
[
  {
    "name": "backup_2026-01-02T16-41-47.358Z.tar.gz",
    "workspaceId": "ws-abc123",
    "workspaceName": "我的工作区",
    "createdAt": "2026-01-02T16:41:47.434Z",
    "trigger": "manual",
    "codeVersion": "1.10.4",
    "size": 49343,
    "verified": true
  }
]
```

**备份内容**：
- workspace.json（工作区配置）
- graph.json（节点图）
- Workspace.md、Log.md、Problem.md
- nodes/ 目录（所有节点）
- memos/ 目录（所有备忘录）

**不包含**：`.backups/` 目录本身

**命令**：

```bash
# 列出工作区备份
tanmi-workspace rebuild --list-ws-backups <workspaceId>

# 恢复工作区备份
tanmi-workspace rebuild --restore-workspace <workspaceId> <backupName>
```

---

## 三、健康监控

### 3.1 workspace_health 工具

MCP 工具，用于执行完整健康检测。

**令牌保护机制**：

首次调用需要先阅读诊断指南获取令牌，确保 AI 了解修复方案：

```typescript
// 首次调用
workspace_health()
// 返回：actionRequired，包含诊断指南路径

// 阅读指南后调用
workspace_health({ diagnosticToken: "HEALTH_CHECK_2025" })
// 返回：完整健康报告
```

**健康报告结构**：

```typescript
interface HealthReport {
  status: "healthy" | "warning" | "error";
  checkedAt: string;           // ISO 时间戳
  codeVersion: string;         // 当前代码版本
  issues: HealthIssue[];       // 问题列表
  summary: {
    totalWorkspaces: number;
    healthyWorkspaces: number;
    warningWorkspaces: number;
    errorWorkspaces: number;
  };
}
```

**问题类型**：

| 类型 | 说明 | 严重级别 |
|------|------|----------|
| `version_mismatch` | 版本不匹配（数据可读但只读） | warning |
| `dir_missing` | 目录缺失 | error |
| `config_corrupt` | 配置文件损坏 | error |
| `graph_corrupt` | 图文件损坏 | error |
| `node_corrupt` | 节点损坏（目录缺失为 error，Info.md 缺失为 warning） | error/warning |
| `index_corrupt` | 索引损坏 | error |

### 3.2 警告机制

**警告标记**：

检测到问题时在 `WorkspaceEntry` 中设置标记：

```typescript
interface WorkspaceEntry {
  // ... 其他字段
  hasUnresolvedIssues?: boolean;  // 是否有未解决问题
  lastWarningAt?: string;         // 上次警告时间
}
```

**24 小时防抖**：同一工作区 24 小时内只警告一次。

**自动清除**：检测通过后自动清除警告标记。

**workspace_list 显示**：列表接口返回 `hasWarning` 状态。

---

## 四、恢复工具

### 4.1 CLI 命令一览

```bash
# 索引管理
tanmi-workspace rebuild --list              # 列出索引备份（别名 -l）
tanmi-workspace rebuild --restore <name>    # 还原索引备份（别名 -r）
tanmi-workspace rebuild --verify            # 验证并清理无效工作区（别名 -v）
tanmi-workspace rebuild --diagnose          # 诊断索引问题（别名 -d）
tanmi-workspace rebuild --scan <path>       # 扫描目录重建索引（别名 -s）

# 工作区备份
tanmi-workspace rebuild --list-ws-backups <id>           # 列出工作区备份（别名 -lwb）
tanmi-workspace rebuild --restore-workspace <id> <name>  # 恢复工作区备份（别名 -rw）
```

### 4.2 恢复流程

#### 恢复索引

```bash
# 1. 查看可用备份
tanmi-workspace rebuild --list

# 2. 选择备份恢复
tanmi-workspace rebuild --restore index.2024-12-27T10-30-00.json
```

#### 恢复工作区

```bash
# 1. 查看可用备份
tanmi-workspace rebuild --list-ws-backups ws-abc123

# 2. 恢复指定备份（恢复前自动创建当前状态备份）
tanmi-workspace rebuild --restore-workspace ws-abc123 backup_2026-01-02T16-41-47.358Z.tar.gz
```

#### 重建索引

当索引严重损坏时：

```bash
# 扫描项目目录重建索引
tanmi-workspace rebuild --scan ~/projects
```

### 4.3 诊断指南

诊断指南位于 `plugin/docs/diagnostic-guide.md`，包含：

1. 常见问题与解决方案
2. 紧急恢复流程
3. 预防措施

---

## 五、错误处理

### 5.1 错误状态管理

工作区有以下状态：

| 状态 | 说明 |
|------|------|
| `active` | 正常活跃 |
| `archived` | 已归档 |
| `error` | 有错误，需要修复 |

**标记错误**：

```typescript
await workspaceService.markAsError(workspaceId, "dir_missing", "工作区目录不存在: /path/to/workspace");
```

**清除错误**：

```typescript
await workspaceService.clearError(workspaceId);
```

### 5.2 错误日志

错误日志位于工作区的 `error.log` 文件和全局 `~/.tanmi-workspace[-dev]/logs/` 目录。

### 5.3 错误码

| 错误码 | 说明 |
|--------|------|
| `VERSION_TOO_HIGH` | 数据版本高于代码版本 |
| `VERSION_READONLY` | 尝试写入只读数据 |
| `WORKSPACE_NOT_FOUND` | 工作区不存在 |
| `NODE_NOT_FOUND` | 节点不存在 |
| `INVALID_STATE` | 无效状态转换 |

---

## 六、最佳实践

### 6.1 日常使用

1. **保持版本一致**：所有客户端使用相同版本的 tanmi-workspace
2. **定期健康检查**：运行 `workspace_health` 检测潜在问题
3. **避免手动修改**：不要直接编辑 `.tanmi-workspace` 目录下的 JSON 文件

### 6.2 升级前

1. 手动备份重要工作区
2. 检查 CHANGELOG 了解破坏性变更
3. 在测试环境验证后再升级生产环境

### 6.3 问题排查

1. 运行 `--diagnose` 查看索引状态
2. 运行 `workspace_health` 查看详细问题
3. 根据诊断指南选择修复方案
4. 如果无法修复，从备份恢复

### 6.4 数据迁移

多台机器共享数据时：

1. 确保所有机器使用相同版本
2. 使用文件同步服务前先关闭 MCP
3. 冲突时以最新版本数据为准

---

## 附录：类型定义

```typescript
// 健康问题类型
type HealthIssueType =
  | "version_mismatch"
  | "index_corrupt"
  | "node_corrupt"
  | "dir_missing"
  | "graph_corrupt"
  | "config_corrupt";

// 问题严重级别
type IssueSeverity = "error" | "warning";

// 健康问题
interface HealthIssue {
  type: HealthIssueType;
  severity: IssueSeverity;
  target?: string;      // 问题目标（如工作区ID、节点ID）
  message: string;      // 问题描述
  suggestion: string;   // 修复建议
}

// 备份元数据
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
```
