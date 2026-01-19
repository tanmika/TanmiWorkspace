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
| ListTools | 返回所有可用工具定义（13 类 50+ 工具） |
| CallTool | 执行工具调用，路由到对应 Service |
| ListPrompts | 返回可用提示模板 |
| GetPrompt | 获取提示内容 |

**工具注册**:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...workspaceTools,    // 8 个工具
    ...nodeTools,         // 7 个工具
    ...stateTools,        // 1 个工具
    ...contextTools,      // 4 个工具
    ...logTools,          // 3 个工具
    ...helpTools,         // 2 个工具
    ...sessionTools,      // 4 个工具
    ...dispatchTools,     // 7 个工具
    ...configTools,       // 2 个工具
    ...importTools,       // 2 个工具
    ...memoTools,         // 5 个工具
    ...capabilityTools,   // 3 个工具
    ...searchTools,       // 2 个工具
  ],
}));
```

**启动模式**:

| 环境变量 | 说明 |
|---------|------|
| `TANMI_DEV=true` | 开发模式，数据存储在 `.tanmi-workspace-dev/` |
| `DISABLE_HTTP=true` | 禁用内嵌 HTTP Server |
| `HTTP_PORT` / `PORT` | 自定义 HTTP 端口 |
| `TANMI_HOST` | 自定义绑定地址（默认 127.0.0.1） |

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

**职责**: 提供 RESTful API，托管 Web 前端，SSE 事件推送

**技术栈**: Fastify + CORS + Static Files + Multipart

**路由模块** (9 个):

| 前缀 | 路由模块 | 说明 |
|------|---------|------|
| `/api` | workspaceRoutes | 工作区 CRUD、归档、恢复 |
| `/api` | nodeRoutes | 节点操作、移动、重排 |
| `/api` | stateRoutes | 状态转换 |
| `/api` | contextRoutes | 上下文和引用 |
| `/api` | logRoutes | 日志和问题 |
| `/api` | configRoutes | 配置管理 |
| `/api` | memoRoutes | 备忘管理 |
| `/api` | backupRoutes | 备份管理 |
| `/api` | adminRoutes | 索引管理、导入导出 |
| `/` | static | Web UI 静态文件 |

**核心端点**:

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/events` | SSE 事件流 |
| POST | `/api/internal/events` | 跨进程事件转发 |
| GET | `/api/version` | 版本信息和更新检查 |

**Workspace API**:

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workspaces` | 创建工作区 |
| GET | `/api/workspaces` | 列出工作区 |
| GET | `/api/workspaces/:id` | 获取详情 |
| DELETE | `/api/workspaces/:id` | 删除工作区 |
| POST | `/api/workspaces/:id/archive` | 归档 |
| POST | `/api/workspaces/:id/restore` | 恢复 |

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
| 开发 | 19541 | `~/.tanmi-workspace-dev/` |
| 生产 | 19540 | `~/.tanmi-workspace/` |

**SSE 事件推送**:

- 客户端通过 `/api/events` 建立 SSE 连接
- 服务端推送工作区变更事件（创建、更新、删除、状态变更）
- 心跳机制保持连接（30 秒间隔）
- 跨进程事件转发支持

### Tools 定义

**目录**: `src/tools/`

**职责**: 定义 MCP 工具的 schema 和描述

**工具文件列表** (13 个模块):

| 文件 | 工具数量 | 工具列表 | 说明 |
|------|---------|---------|------|
| `workspace.ts` | 8 | workspace_init, workspace_list, workspace_get, workspace_delete, workspace_update_rules, workspace_archive, workspace_restore, workspace_health | 工作区生命周期 |
| `node.ts` | 7 | node_create, node_get, node_list, node_delete, node_update, node_move, node_reorder | 节点操作 |
| `state.ts` | 1 | node_transition | 状态转换 |
| `context.ts` | 4 | context_get, context_focus, node_isolate, node_reference | 上下文管理 |
| `log.ts` | 3 | log_append, problem_update, problem_clear | 日志和问题 |
| `help.ts` | 2 | tanmi_help, tanmi_prompt | 帮助系统 |
| `session.ts` | 4 | session_bind, session_unbind, session_status, get_pending_changes | 会话管理 |
| `dispatch.ts` | 7 | dispatch_node, dispatch_complete, dispatch_cleanup, dispatch_enable, dispatch_disable, dispatch_disable_execute, dispatch_create | 任务派发 |
| `config.ts` | 2 | config_get, config_set | 配置管理 |
| `import.ts` | 2 | workspace_import_guide, workspace_import_list | OpenSpec 导入 |
| `memo.ts` | 5 | memo_create, memo_list, memo_get, memo_update, memo_delete | 备忘管理 |
| `capability.ts` | 3 | capability_list, capability_select, plugin_path | 能力包管理 |
| `search.ts` | 2 | workspace_search, content_search | 搜索功能 |

**工具分类详解**:

#### 工作区管理 (8 个)

| 工具 | 说明 |
|------|------|
| `workspace_init` | 初始化新工作区，支持场景类型和文档引用 |
| `workspace_list` | 列出所有工作区，支持状态过滤和 cwd 排序 |
| `workspace_get` | 获取工作区详情，包含拓扑图 |
| `workspace_delete` | 删除工作区，活动工��区需 force=true |
| `workspace_update_rules` | 动态更新工作区规则 |
| `workspace_archive` | 归档工作区 |
| `workspace_restore` | 恢复归档的工作区 |
| `workspace_health` | 检测工作区健康状态 |

#### 节点管理 (7 个)

| 工具 | 说明 |
|------|------|
| `node_create` | 创建子节点，支持类型选择和角色设定 |
| `node_get` | 获取节点详情，返回 nodeHash 用于乐观锁 |
| `node_list` | 获取节点树结构 |
| `node_delete` | 删除节点及其子节点 |
| `node_update` | 更新节点，支持全量替换和精确替换两种模式 |
| `node_move` | 移动节点到新的父节点下 |
| `node_reorder` | 重新排序子节点顺序 |

#### 状态转换 (1 个)

| 工具 | 说明 |
|------|------|
| `node_transition` | 状态转换，支持 start/complete/fail/reopen 等动作 |

#### 上下文管理 (4 个)

| 工具 | 说明 |
|------|------|
| `context_get` | 获取节点执行上下文 |
| `context_focus` | 聚焦到指定节点 |
| `node_isolate` | 隔离查看单个节点 |
| `node_reference` | 管理文档引用（添加/过期/重新激活） |

#### 日志与问题 (3 个)

| 工具 | 说明 |
|------|------|
| `log_append` | 追加日志条目 |
| `problem_update` | 更新问题状态 |
| `problem_clear` | 清除问题 |

#### 帮助系统 (2 个)

| 工具 | 说明 |
|------|------|
| `tanmi_help` | 获取场景化使用指南（16 个主题） |
| `tanmi_prompt` | 获取用户引导话术模板 |

#### 会话管理 (4 个)

| 工具 | 说明 |
|------|------|
| `session_bind` | 绑定会话到工作区 |
| `session_unbind` | 解绑会话 |
| `session_status` | 获取会话状态和可用工作区列表 |
| `get_pending_changes` | 获取待处理的手动变更 |

#### 任务派发 (7 个)

| 工具 | 说明 |
|------|------|
| `dispatch_node` | 派发节点给子代理执行 |
| `dispatch_complete` | 标记派发完成 |
| `dispatch_cleanup` | 清理派发状态 |
| `dispatch_enable` | 启用派发模式 |
| `dispatch_disable` | 禁用派发模式 |
| `dispatch_disable_execute` | 禁用执行派发（仅保留审查） |
| `dispatch_create` | 创建派发节点 |

#### 配置管理 (2 个)

| 工具 | 说明 |
|------|------|
| `config_get` | 获取工作区配置 |
| `config_set` | 设置工作区配置 |

#### OpenSpec 导入 (2 个)

| 工具 | 说明 |
|------|------|
| `workspace_import_guide` | 生成导入指南 |
| `workspace_import_list` | 列出可导入的变更 |

#### 备忘管理 (5 个)

| 工具 | 说明 |
|------|------|
| `memo_create` | 创建工作区备忘 |
| `memo_list` | 列出备忘，支持标签过滤 |
| `memo_get` | 获取备忘内容，支持分页 |
| `memo_update` | 更新备忘，支持全量和精确替换 |
| `memo_delete` | 删除备忘 |

#### 能力包管理 (3 个)

| 工具 | 说明 |
|------|------|
| `capability_list` | 获取指定场景的能力包列表 |
| `capability_select` | 确认选择的能力包 |
| `plugin_path` | 获取插件目录绝对路径 |

#### 搜索功能 (2 个)

| 工具 | 说明 |
|------|------|
| `workspace_search` | 在所有工作区中搜索关键词 |
| `content_search` | 在指定工作区中搜索节点和备忘内容 |

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
      scenario: {
        type: "string",
        enum: ["feature", "summary", "optimize", "debug", "misc"],
        description: "任务场景类型"
      },
      // ...
    },
    required: ["name", "goal", "scenario"],
  },
};
```

## 依赖关系

```
MCP Server ──┬── Tools 定义 (13 模块)
             │
             └── Services (共享, 21 个)
                      ▲
HTTP Server ─────────┘
     │
     └── Routes (9 个路由模块)
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
      "goal": "完成功能开发",
      "scenario": "feature"
    }
  }
}
```

### HTTP 调用

```bash
# 创建工作区
curl -X POST http://localhost:19540/api/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name": "我的项目", "goal": "完成功能开发", "scenario": "feature"}'

# 获取工作区详情
curl http://localhost:19540/api/workspaces/ws-xxx

# SSE 事件订阅
curl -N http://localhost:19540/api/events
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

## tanmi_help 主题列表

| 主题 | 说明 |
|------|------|
| `overview` | 系统概述 |
| `workflow` | 核心工作流程 |
| `tools` | 工具速查表 |
| `start` | 如何开始新任务 |
| `resume` | 如何继续之前的任务 |
| `session_restore` | 会话恢复 |
| `blocked` | 任务遇到问题时怎么办 |
| `split` | 何时以及如何分解任务 |
| `complete` | 如何完成任务 |
| `progress` | 如何查看和报告进度 |
| `guide` | 如何引导不熟悉的用户 |
| `docs` | 文档引用管理 |
| `dispatch` | 派发模式 |
| `status` | 插件安装状态 |
| `server` | 服务器状态与自检 |
| `all` | 获取完整指南 |
