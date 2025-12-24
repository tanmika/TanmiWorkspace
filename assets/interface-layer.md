---
title: 接口层 (Interface Layer)
description: 对外接口层，包含 MCP Server、HTTP Server 和 Tools 定义三个模块
category: interface
---

# 接口层 (Interface Layer)

## 概述

接口层是 TanmiWorkspace 的对外暴露层，提供两种访问方式：
- **MCP Server**: 通过 stdio 与 AI 客户端（如 Claude）通信
- **HTTP Server**: 提供 RESTful API 供 Web 前端和其他客户端调用

两者共享同一套服务实例，保证数据一致性。

```
┌─────────────────────────────────────────────────────────────┐
│                     外部客户端                               │
│  ┌─────────────┐                    ┌─────────────────┐     │
│  │ AI (Claude) │                    │ Web UI / curl   │     │
│  └──────┬──────┘                    └────────┬────────┘     │
└─────────│───────────────────────────────────│───────────────┘
          │ stdio                              │ HTTP
          ▼                                    ▼
┌─────────────────┐                  ┌─────────────────┐
│   MCP Server    │                  │   HTTP Server   │
│  (index.ts)     │                  │  (server.ts)    │
└────────┬────────┘                  └────────┬────────┘
         │                                    │
         │     ┌──────────────────────┐       │
         └────▶│   Services (共享)    │◀──────┘
               └──────────────────────┘
```

## 模块组成

### MCP Server

**文件**: `src/index.ts`

**职责**: 实现 MCP 协议，处理 AI 客户端的工具调用

**核心功能**:

| 功能 | 说明 |
|------|------|
| ListTools | 返回所有可用工具定义 |
| CallTool | 执行工具调用，路由到对应 Service |
| ListPrompts | 返回可用提示模板 |
| GetPrompt | 获取提示内容 |

**工具注册**:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...workspaceTools,
    ...nodeTools,
    ...stateTools,
    ...contextTools,
    ...logTools,
    ...helpTools,
  ],
}));
```

**启动模式**:

| 环境变量 | 说明 |
|---------|------|
| `TANMI_DEV=true` | 开发模式，数据存储在 `.tanmi-workspace-dev/` |
| `DISABLE_HTTP=true` | 禁用内嵌 HTTP Server |
| `HTTP_PORT` / `PORT` | 自定义 HTTP 端口 |

**错误处理**: 捕获 `TanmiError`，返回结构化错误响应：

```json
{
  "error": {
    "code": "WORKSPACE_NOT_FOUND",
    "message": "工作区 \"xxx\" 不存在",
    "availableWorkspaces": [...]
  }
}
```

### HTTP Server

**文件**: `src/http/server.ts`, `src/http/index.ts`

**职责**: 提供 RESTful API，托管 Web 前端

**技术栈**: Fastify + CORS + Static Files

**API 路由**:

| 前缀 | 路由模块 | 说明 |
|------|---------|------|
| `/api` | workspaceRoutes | 工作区 CRUD |
| `/api` | nodeRoutes | 节点操作 |
| `/api` | stateRoutes | 状态转换 |
| `/api` | contextRoutes | 上下文和引用 |
| `/api` | logRoutes | 日志和问题 |
| `/` | static | Web UI 静态文件 |

**Workspace API 示例**:

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workspaces` | 创建工作区 |
| GET | `/api/workspaces` | 列出工作区 |
| GET | `/api/workspaces/:id` | 获取详情 |
| GET | `/api/workspaces/:id/status` | 获取状态 |
| DELETE | `/api/workspaces/:id` | 删除工作区 |

**请求验证**: 使用 JSON Schema 验证请求参数

```typescript
const createWorkspaceSchema = {
  body: {
    type: "object",
    required: ["name", "goal"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      goal: { type: "string", minLength: 1, maxLength: 1000 },
      // ...
    },
  },
};
```

**端口配置**:

| 模式 | 默认端口 | 数据目录 |
|------|---------|---------|
| 开发 | 3001 | `~/.tanmi-workspace-dev/` |
| 生产 | 3000 | `~/.tanmi-workspace/` |

### Tools 定义

**目录**: `src/tools/`

**职责**: 定义 MCP 工具的 schema 和描述

**工具分类**:

| 文件 | 工具 | 说明 |
|------|------|------|
| `workspace.ts` | workspace_init, workspace_list, workspace_get, workspace_delete, workspace_status | 工作区生命周期 |
| `node.ts` | node_create, node_get, node_list, node_delete, node_split, node_update, node_move | 节点操作 |
| `state.ts` | node_transition | 状态转换 |
| `context.ts` | context_get, context_focus, node_isolate, node_reference | 上下文管理 |
| `log.ts` | log_append, problem_update, problem_clear | 日志和问题 |
| `help.ts` | tanmi_help, tanmi_prompt | 帮助系统 |

**工具定义结构**:

```typescript
export const workspaceInitTool: Tool = {
  name: "workspace_init",
  description: "初始化新工作区...",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "工作区名称" },
      goal: { type: "string", description: "工作区目标描述" },
      // ...
    },
    required: ["name", "goal"],
  },
};
```

## 依赖关系

```
MCP Server ──┬── Tools 定义
             │
             └── Services (共享)
                      ▲
HTTP Server ─────────┘
     │
     └── Routes（调用 Services）
```

## 服务共享机制

**文件**: `src/http/services.ts`

两种接口共享同一个 `Services` 实例：

```typescript
// 创建共享服务
const services = createServices();

// MCP Server 使用
const mcpServer = createMcpServer(services);

// HTTP Server 使用（通过 getServices()）
const httpServer = await createServer();
```

## 启动流程

### 统一入口 (src/index.ts)

```
1. 创建共享 Services 实例
2. 启动 HTTP Server（后台，检测端口占用）
3. 创建 MCP Server
4. 连接 stdio transport
5. 注册退出信号处理
```

### 独立 HTTP 入口 (src/http/index.ts)

```
1. 判断开发/生产模式
2. 确定端口
3. 启动 Fastify Server
```

## 使用示例

### MCP 调用

```typescript
// 工具调用请求
{
  "method": "tools/call",
  "params": {
    "name": "workspace_init",
    "arguments": {
      "name": "我的项目",
      "goal": "完成功能开发"
    }
  }
}
```

### HTTP 调用

```bash
# 创建工作区
curl -X POST http://localhost:3000/api/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name": "我的项目", "goal": "完成功能开发"}'

# 获取工作区状态
curl http://localhost:3000/api/workspaces/ws-xxx/status
```

## Prompts 支持

MCP Server 还提供 Prompts 功能：

| Prompt | 说明 |
|--------|------|
| `tanmi-instructions` | 完整使用指南 |
| `tanmi-quick-start` | 快速开始指南 |

```typescript
// 获取指南
{
  "method": "prompts/get",
  "params": { "name": "tanmi-instructions" }
}
```
