---
title: API 设计规范
description: API 设计规范，包括 MCP 工具命名、HTTP 路由设计、参数结构
scope: global
---

# API 设计规范

## 适用范围

本规范适用于 MCP 工具定义和 HTTP API 路由设计。

## MCP 工具命名

### 命名格式

```
{资源}_{动作}
```

### 命名规则

| 规则 | 示例 |
|------|------|
| 使用 `snake_case` | `workspace_init`, `node_create` |
| 资源名使用单数 | `workspace`, `node`, `context` |
| 动作使用动词 | `init`, `create`, `get`, `delete` |

### 工具分组

| 资源 | 工具 |
|------|------|
| workspace | `workspace_init`, `workspace_list`, `workspace_get`, `workspace_delete`, `workspace_status` |
| node | `node_create`, `node_get`, `node_list`, `node_delete`, `node_split`, `node_update`, `node_move`, `node_transition`, `node_isolate`, `node_reference` |
| context | `context_get`, `context_focus` |
| log | `log_append` |
| problem | `problem_update`, `problem_clear` |
| help | `tanmi_help`, `tanmi_prompt` |

### 工具描述

```typescript
const tool: Tool = {
  name: "workspace_init",
  description: "初始化新工作区。创建工作区目录结构和必要的配置文件。返回 webUrl 可在浏览器中查看。",
  inputSchema: { /* ... */ }
};
```

描述规范：
- 第一句说明功能
- 可选：补充说明实现细节
- 可选：说明返回值用途

## HTTP 路由设计

### RESTful 风格

```
{Method} /api/{resources}[/{id}][/{action}]
```

### 路由映射

| MCP 工具 | HTTP 路由 |
|---------|----------|
| `workspace_init` | `POST /api/workspaces` |
| `workspace_list` | `GET /api/workspaces` |
| `workspace_get` | `GET /api/workspaces/:id` |
| `workspace_delete` | `DELETE /api/workspaces/:id` |
| `workspace_status` | `GET /api/workspaces/:id/status` |
| `node_create` | `POST /api/workspaces/:wsId/nodes` |
| `node_get` | `GET /api/workspaces/:wsId/nodes/:id` |
| `node_transition` | `POST /api/workspaces/:wsId/nodes/:id/transition` |

### URL 参数

```typescript
// 路径参数：资源标识
GET /api/workspaces/:id
GET /api/workspaces/:wsId/nodes/:nodeId

// 查询参数：过滤/选项
GET /api/workspaces?status=active
GET /api/workspaces/:id/status?format=markdown
DELETE /api/workspaces/:id?force=true
```

## 参数命名

### 通用参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `workspaceId` | string | 工作区 ID |
| `nodeId` | string | 节点 ID |
| `parentId` | string | 父节点 ID |

### 命名约定

```typescript
// 使用 camelCase
interface NodeCreateParams {
  workspaceId: string;
  parentId: string;
  title: string;
  requirement?: string;
}

// ID 类参数：{资源}Id
workspaceId, nodeId, parentId, newParentId

// 布尔参数：表意明确
force?: boolean;      // 强制操作
isolate?: boolean;    // 是否隔离
includeLog?: boolean; // 是否包含日志
```

### 枚举参数

```typescript
// 状态筛选
status?: "active" | "archived" | "all";

// 输出格式
format?: "box" | "markdown";

// 操作类型
action: "start" | "submit" | "complete" | "fail" | "retry" | "reopen";
```

## 返回值结构

### 成功响应

```typescript
// 创建操作：返回新资源信息
interface NodeCreateResult {
  nodeId: string;
  path: string;
  hint?: string;
}

// 获取操作：返回资源详情
interface NodeGetResult {
  meta: NodeMeta;
  infoMd: string;
  logMd: string;
}

// 列表操作：返回数组
interface WorkspaceListResult {
  workspaces: WorkspaceListItem[];
}

// 状态操作：返回变更信息
interface NodeTransitionResult {
  success: boolean;
  previousStatus: NodeStatus;
  currentStatus: NodeStatus;
  hint?: string;
}

// 删除操作：返回确认
interface NodeDeleteResult {
  success: boolean;
  deletedNodes: string[];
}
```

### hint 字段

用于工作流提示，指导 AI 下一步操作：

```typescript
{
  success: true,
  nodeId: "node-xxx",
  hint: "💡 节点创建成功。建议调用 node_transition(action=\"start\") 开始执行，或继续创建同级节点。"
}
```

使用场景：
- 创建操作后：提示后续操作
- 状态转换后：提示下一状态
- 问题更新后：提示处理方式

### webUrl 字段

指向 Web UI 的访问地址：

```typescript
{
  workspaceId: "ws-xxx",
  webUrl: "http://localhost:3000/workspace/ws-xxx"
}
```

## 输入验证

### JSON Schema

```typescript
const createWorkspaceSchema = {
  body: {
    type: "object",
    required: ["name", "goal"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      goal: { type: "string", minLength: 1, maxLength: 1000 },
      rules: {
        type: "array",
        maxItems: 50,
        items: { type: "string", maxLength: 500 }
      }
    },
    additionalProperties: false
  }
};
```

### 验证规则

| 字段类型 | 验证 |
|---------|------|
| 名称/标题 | 非空、无特殊字符、长度限制 |
| ID | 非空、格式匹配 |
| 路径 | 存在、无穿越、是目录 |
| 数组 | 最大长度限制 |

## 错误响应

### 格式

```json
{
  "error": {
    "code": "NODE_NOT_FOUND",
    "message": "节点 \"node-xxx\" 不存在"
  }
}
```

### HTTP 状态码

| 状态码 | 使用场景 |
|--------|---------|
| 200 | 成功（GET、PUT、DELETE） |
| 201 | 创建成功（POST） |
| 400 | 参数错误、业务错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

## 版本控制

### 当前版本

无显式版本号，所有 API 在 `/api` 路径下。

### 未来扩展

如需版本控制：

```
/api/v1/workspaces
/api/v2/workspaces
```

## 最佳实践

1. **一致性**：MCP 和 HTTP 使用相同的 Service 方法
2. **幂等性**：GET、DELETE 操作应幂等
3. **原子性**：单个 API 完成单个业务操作
4. **可发现**：返回 webUrl 方便用户查看
5. **可操作**：返回 hint 指导下一步
