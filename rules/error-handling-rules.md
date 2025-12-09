---
title: 错误处理规范
description: 错误处理规范，包括 TanmiError 使用、错误码定义、错误消息规范
scope: global
---

# 错误处理规范

## 适用范围

本规范适用于所有 Service 层和接口层的错误处理。

## TanmiError 类

### 定义

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

### 使用

```typescript
// 正确：使用 TanmiError 抛出业务错误
throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);

// 正确：包含上下文信息
throw new TanmiError("INVALID_TRANSITION",
  `非法状态转换: ${currentStatus} --[${action}]--> ? (不允许)`);

// 错误：使用普通 Error
throw new Error("工作区不存在");
```

## 错误码规范

### 命名规则

- 使用 `UPPER_SNAKE_CASE`
- 格式：`{领域}_{具体错误}`
- 简洁明确，避免冗余

### 错误码分类

| 分类 | 前缀 | 示例 |
|------|------|------|
| 工作区 | `WORKSPACE_` | `WORKSPACE_NOT_FOUND` |
| 节点 | `NODE_` / `PARENT_` | `NODE_NOT_FOUND`, `PARENT_NOT_FOUND` |
| 状态 | - | `INVALID_TRANSITION`, `CONCLUSION_REQUIRED` |
| 引用 | `REFERENCE_` | `REFERENCE_NOT_FOUND` |
| 验证 | `INVALID_` | `INVALID_NAME`, `INVALID_PATH` |
| 操作 | - | `CANNOT_DELETE_ROOT`, `SPLIT_REQUIRES_IMPLEMENTING` |
| 数据 | - | `GRAPH_CORRUPTED`, `NODE_DIR_MISSING` |

### 新增错误码

在 `src/types/errors.ts` 中添加：

```typescript
export const ErrorCodes = {
  // 1. 添加错误码常量
  NEW_ERROR_CODE: "NEW_ERROR_CODE",
  // ...
} as const;

// 2. 添加错误消息
export const ErrorMessages: Record<ErrorCode, string> = {
  NEW_ERROR_CODE: "错误描述",
  // ...
};
```

## 错误消息规范

### 消息内容

```typescript
// 正确：包含具体信息
throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);

// 正确：包含操作上下文
throw new TanmiError("INVALID_TRANSITION",
  `非法状态转换: ${from} --[${action}]--> ? (不允许)。请先调用 node_transition(action="start") 开始执行节点`);

// 错误：过于笼统
throw new TanmiError("NODE_NOT_FOUND", "节点不存在");
```

### 消息格式

- 使用中文
- 包含关键变量值（用引号包裹）
- 可选：附加操作建议

```typescript
// 带操作建议的错误消息
throw new TanmiError("WORKSPACE_ACTIVE",
  "工作区处于活动状态，无法删除（使用 force 强制删除）");

throw new TanmiError("CONCLUSION_REQUIRED",
  "complete/fail 动作必须提供 conclusion");
```

## 错误处理层级

### Service 层

负责抛出业务错误：

```typescript
async get(params: NodeGetParams): Promise<NodeGetResult> {
  const graph = await this.json.readGraph(projectRoot, workspaceId);

  // 验证并抛出明确错误
  if (!graph.nodes[nodeId]) {
    throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
  }

  // 继续处理...
}
```

### 接口层（MCP）

捕获并格式化错误响应：

```typescript
try {
  result = await services.node.get(params);
} catch (error) {
  if (error instanceof TanmiError) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: {
            code: error.code,
            message: error.message,
          },
        }, null, 2),
      }],
      isError: true,
    };
  }
  // 未知错误
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        error: {
          code: "INTERNAL_ERROR",
          message: error.message,
        },
      }, null, 2),
    }],
    isError: true,
  };
}
```

### 接口层（HTTP）

使用错误处理中间件：

```typescript
// src/http/middleware/errorHandler.ts
export function errorHandler(error: Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof TanmiError) {
    return reply.status(400).send({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  // 未知错误返回 500
  return reply.status(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: error.message,
    },
  });
}
```

## 错误响应格式

### 标准格式

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

### 扩展格式（可选附加信息）

```json
{
  "error": {
    "code": "WORKSPACE_NOT_FOUND",
    "message": "工作区 \"ws-xxx\" 不存在",
    "availableWorkspaces": [
      { "id": "ws-yyy", "name": "其他工作区" }
    ]
  }
}
```

## 验证错误处理

### 输入验证

在处理前验证，快速失败：

```typescript
async create(params: NodeCreateParams): Promise<NodeCreateResult> {
  // 1. 先验证输入
  validateNodeTitle(params.title);

  // 2. 验证依赖存在
  const graph = await this.json.readGraph(projectRoot, workspaceId);
  if (!graph.nodes[params.parentId]) {
    throw new TanmiError("PARENT_NOT_FOUND", `父节点 "${params.parentId}" 不存在`);
  }

  // 3. 执行操作
  // ...
}
```

### 状态验证

```typescript
// 状态转换验证
const allowed = TRANSITION_TABLE[currentStatus]?.[action];
if (!allowed) {
  throw new TanmiError("INVALID_TRANSITION",
    `非法状态转换: ${currentStatus} --[${action}]--> ? (不允许)`);
}
```

## 最佳实践

1. **明确错误类型**：使用 `TanmiError` 而非普通 `Error`
2. **包含上下文**：错误消息包含关键变量值
3. **快速失败**：在函数开头验证输入
4. **单一职责**：Service 抛错，接口层格式化
5. **可恢复提示**：消息中包含如何修复的建议
