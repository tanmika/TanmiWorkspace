---
title: 工具层 (Utils Layer)
description: 通用工具函数，包含 ID 生成、时间格式化、验证、日志、Git 操作等 15 个模块
category: utils
---

# 工具层 (Utils Layer)

## 概述

工具层提供 TanmiWorkspace 的通用工具函数，被各层共同依赖。

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           src/utils/                                     │
├───────────────┬───────────────┬───────────────────┬────────────────────┤
│    id.ts      │   time.ts     │ validation.ts     │   port.ts          │
│  ID 生成      │  时间格式化   │   输入验证        │  端口检测          │
├───────────────┼───────────────┼───────────────────┼────────────────────┤
│ paramValidator│ contentValid. │ git.ts            │ hash.ts            │
│ 参数自动纠错  │ 内容验证      │ Git 操作          │ 哈希生成           │
├───────────────┼───────────────┼───────────────────┼────────────────────┤
│  logger.ts    │   devLog.ts   │ errorLogger.ts    │ sessionLogger.ts   │
│  生产日志     │  开发日志     │ 错误日志          │ 会话日志           │
├───────────────┼───────────────┼───────────────────┴────────────────────┤
│ processManager│ manualChange- │                                        │
│ 进程管理      │ Formatter     │                                        │
└───────────────┴───────────────┴────────────────────────────────────────┘
```

## 模块组成

### id.ts

**职责**: 唯一 ID 生成

**函数**:

| 函数 | 返回值 | 说明 |
|------|--------|------|
| `generateId()` | `{timestamp}-{random}` | 基础 ID 生成 |
| `generateWorkspaceId()` | `ws-{timestamp}-{random}` | 工作区 ID |
| `generateNodeId()` | `node-{timestamp}-{random}` | 节点 ID |

**实现**:

```typescript
function generateId(): string {
  const timestamp = Date.now().toString(36);     // 时间戳 base36
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomPart}`;
}
```

**ID 格式示例**:
- 工作区: `ws-miy7irh2-nns4xy`
- 节点: `node-miy7jlch-9yuh3m`

### time.ts

**职责**: 时间格式化

**函数**:

| 函数 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `now()` | - | `2024-01-15T14:30:25.123Z` | ISO 8601 格式 |
| `formatShort(iso)` | ISO 字符串 | `2024-01-15 14:30:25` | 完整日期时间 |
| `formatHHmm(iso?)` | ISO 字符串 | `14:30` | 时分格式 |

**使用场景**:
- `now()`: 创建/更新时间戳
- `formatShort()`: 日志显示
- `formatHHmm()`: 简短时间显示

### validation.ts

**职责**: 输入验证和路径安全检查

**函数**:

| 函数 | 验证内容 | 抛出错误 |
|------|---------|---------|
| `validateWorkspaceName(name)` | 非空、无特殊字符 | `INVALID_NAME` |
| `validateNodeTitle(title)` | 非空、无特殊字符 | `INVALID_TITLE` |
| `validateId(id, type)` | 非空 | `WORKSPACE_NOT_FOUND` / `NODE_NOT_FOUND` |
| `validateProjectRoot(path, base?)` | 路径安全性 | `INVALID_PATH` |

**禁止字符**: `/ \ : * ? " < > |`

**路径验证流程**:

```
1. 检查输入非空
2. 检查无目录穿越 (../)
3. 解析为绝对路径
4. 验证在用户主目录或基准目录下
5. 验证目录存在
6. 验证是目录而非文件
```

**安全防护**:
- 防止路径穿越攻击
- 限制访问范围在用户目录内
- 验证目标确实是目录

### port.ts

**职责**: 端口检测

**函数**:

| 函数 | 返回值 | 说明 |
|------|--------|------|
| `isPortInUse(port)` | `Promise<boolean>` | 检测端口是否被占用 |

**实现原理**:
1. 创建 TCP 服务器尝试监听端口
2. 如果报 `EADDRINUSE` 错误，端口已占用
3. 如果监听成功，端口可用

**使用场景**:
- MCP Server 启动时检测 HTTP 端口
- 避免端口冲突

```typescript
if (await isPortInUse(port)) {
  logHttp(`端口 ${port} 已被占用，跳过 HTTP 启动`);
  return null;
}
```

### paramValidator.ts

**职责**: MCP 工具参数验证与自动纠错

**函数**:

| 函数 | 说明 |
|------|------|
| `levenshteinDistance(a, b)` | 计算两个字符串的编辑距离 |
| `similarity(a, b)` | 计算相似度 (0-1) |
| `getSchemaProperties(tool)` | 从 Tool schema 提取有效参数名 |
| `validateAndCorrectParams(toolName, args, tool)` | 验证并纠正参数 |

**纠正阈值**:
- `>= 0.8`: 自动纠正 + 警告
- `>= 0.5`: 报错 + 建议
- `< 0.5`: 报错 + 列出支持参数

### contentValidation.ts

**职责**: Markdown 内容格式验证

**函数**:

| 函数 | 说明 |
|------|------|
| `validateMultilineContent(content, fieldName)` | 禁止 `## ` 二级标题 |
| `validateSingleLineContent(content, fieldName)` | 禁止换行符 |
| `escapeTableCell(content)` | 转义表格单元格（换行→`<br>`，`\|`→`｜`） |
| `unescapeTableCell(content)` | 还原表格单元格 |
| `validateRules(rules)` | 验证规则列表 |

### git.ts

**职责**: Git 操作封装

**函数**:

| 函数 | 说明 |
|------|------|
| `isGitRepo(dir)` | 检测是否为 Git 仓库 |
| `getCurrentBranch(dir)` | 获取当前分支名 |
| `hasUncommittedChanges(dir)` | 检测是否有未提交变更 |
| `createBranch(dir, name)` | 创建分支 |
| `switchBranch(dir, name)` | 切换分支 |
| `commitAll(dir, message)` | 提交所有变更 |
| `getBranchDiff(dir, base, target)` | 获取分支差异 |
| `cherryPick(dir, commit)` | Cherry-pick 提交 |
| `squashMerge(dir, branch)` | Squash 合并 |

**使用场景**: 派发系统的 Git 模式

### hash.ts

**职责**: 内容哈希生成

**函数**:

| 函数 | 说明 |
|------|------|
| `generateContentHash(content)` | 生成 SHA256 哈希（前 12 位） |

**使用场景**: 乐观锁并发控制（memo、node 内容）

### logger.ts

**职责**: 生产环境日志（输出到 stderr）

**函数**:

| 函数 | 说明 |
|------|------|
| `logMcp(message, data?)` | MCP 层日志 `[mcp]` |
| `logHttp(message, data?)` | HTTP 层日志 `[http]` |

**特点**: 所有输出到 stderr，避免污染 MCP stdio 通道

### devLog.ts

**职责**: 开发环境调试日志

**函数**:

| 函数 | 说明 |
|------|------|
| `devLog.debug(message, data?)` | 调试级别 |
| `devLog.info(message, data?)` | 信息级别 |
| `devLog.warn(message, data?)` | 警告级别 |
| `devLog.error(message, error?, data?)` | 错误级别 |

**特点**: 仅在 `TANMI_DEV=true` 时输出

### errorLogger.ts

**职责**: 错误日志记录

**函数**:

| 函数 | 说明 |
|------|------|
| `logError(error, context?)` | 记录错误到文件 |
| `getErrorLogPath()` | 获取错误日志路径 |

**位置**: `~/.tanmi-workspace[-dev]/logs/`

### sessionLogger.ts

**职责**: 会话操作日志

**函数**:

| 函数 | 说明 |
|------|------|
| `logSessionOperation(op, sessionId, data?)` | 记录会话操作 |

**操作类型**: `bind`, `unbind`, `status`

### processManager.ts

**职责**: 进程管理与 PID 文件

**函数**:

| 函数 | 说明 |
|------|------|
| `writePidFile()` | 写入 PID 文件 |
| `removePidFile()` | 删除 PID 文件 |
| `readPidFile()` | 读取 PID 文件 |
| `isProcessRunning(pid)` | 检测进程是否运行 |
| `checkExistingProcess()` | 检测现有进程 |

**使用场景**: 多会话并发检测、HTTP 服务器共享

### manualChangeFormatter.ts

**职责**: 格式化手动操作提示

**函数**:

| 函数 | 说明 |
|------|------|
| `formatManualChange(change)` | 格式化单个变更提示 |

**使用场景**: WebUI 显示需要手动操作的变更

## 依赖关系

```
Services / Storage
        │
        ▼
┌───────────────────────────────┐
│           Utils               │
├───────────────────────────────┤
│ 核心工具                      │
│ - id.ts                       │
│ - time.ts                     │
│ - hash.ts                     │
│ - port.ts                     │
├───────────────────────────────┤
│ 验证工具                      │
│ - validation.ts         ← 依赖 types/errors.ts
│ - contentValidation.ts  ← 依赖 types/errors.ts
│ - paramValidator.ts     ← 依赖 @modelcontextprotocol/sdk
├───────────────────────────────┤
│ 日志工具                      │
│ - logger.ts                   │
│ - devLog.ts                   │
│ - errorLogger.ts              │
│ - sessionLogger.ts            │
├───────────────────────────────┤
│ 系统工具                      │
│ - git.ts                      │
│ - processManager.ts           │
│ - manualChangeFormatter.ts    │
└───────────────────────────────┘
```

## 导出

**文件**: `src/utils/index.ts`

```typescript
export * from "./id.js";
export * from "./time.js";
export * from "./validation.js";
export * from "./port.js";
// 注意：其他模块按需直接导入
```

**按需导入示例**:

```typescript
// 参数验证
import { validateAndCorrectParams } from "./utils/paramValidator.js";

// 内容验证
import { validateMultilineContent, escapeTableCell } from "./utils/contentValidation.js";

// Git 操作
import { isGitRepo, commitAll } from "./utils/git.js";

// 日志
import { devLog } from "./utils/devLog.js";
import { logMcp, logHttp } from "./utils/logger.js";
```

## 使用示例

```typescript
import {
  generateWorkspaceId,
  generateNodeId,
  now,
  formatShort,
  validateWorkspaceName,
  validateProjectRoot,
  isPortInUse,
} from "./utils/index.js";

// 生成 ID
const wsId = generateWorkspaceId();    // ws-miy7irh2-nns4xy
const nodeId = generateNodeId();        // node-miy7jlch-9yuh3m

// 时间格式化
const timestamp = now();                // 2024-01-15T14:30:25.123Z
const display = formatShort(timestamp); // 2024-01-15 14:30:25

// 输入验证
validateWorkspaceName("My Project");    // OK
validateWorkspaceName("My/Project");    // throws INVALID_NAME

// 路径验证
const root = validateProjectRoot("./my-project");  // 返回绝对路径
validateProjectRoot("../../etc");       // throws INVALID_PATH

// 端口检测
if (await isPortInUse(19540)) {
  console.log("端口已占用");
}
```

## 设计原则

1. **无状态**: 所有函数都是纯函数（除端口检测外）
2. **类型安全**: 完整的 TypeScript 类型定义
3. **错误明确**: 使用 `TanmiError` 提供明确错误码
4. **安全优先**: 路径验证防止目录穿越攻击
