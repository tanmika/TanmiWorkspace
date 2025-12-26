---
title: 工具层 (Utils Layer)
description: 通用工具函数，包含 ID 生成、时间格式化、验证和端口检测四个模块
category: utils
---

# 工具层 (Utils Layer)

## 概述

工具层提供 TanmiWorkspace 的通用工具函数，被各层共同依赖。

```
┌─────────────────────────────────────────────────────────────┐
│                      src/utils/                              │
├───────────────┬───────────────┬───────────────┬─────────────┤
│    id.ts      │   time.ts     │ validation.ts │   port.ts   │
│  ID 生成      │  时间格式化   │   输入验证    │  端口检测   │
└───────────────┴───────────────┴───────────────┴─────────────┘
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

## 依赖关系

```
Services / Storage
        │
        ▼
┌───────────────────┐
│      Utils        │
├───────────────────┤
│ - id.ts           │
│ - time.ts         │
│ - validation.ts   │  ← 依赖 types/errors.ts
│ - port.ts         │
└───────────────────┘
```

## 导出

**文件**: `src/utils/index.ts`

```typescript
export * from "./id.js";
export * from "./time.js";
export * from "./validation.js";
export * from "./port.js";
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
