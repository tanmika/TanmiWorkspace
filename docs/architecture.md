# TanmiWorkspace 架构文档

## 服务架构

TanmiWorkspace 采用统一入口设计，同时提供 MCP 和 HTTP 两种访问方式。

```
┌─────────────────────────────────────────────────────────┐
│                    统一入口 (index.ts)                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐         ┌─────────────────────────┐   │
│  │  MCP Server │         │     HTTP Server         │   │
│  │   (stdio)   │         │  ┌─────────────────┐    │   │
│  └──────┬──────┘         │  │   API (/api/*)  │    │   │
│         │                │  ├─────────────────┤    │   │
│         │                │  │  Web UI (静态)   │    │   │
│         │                │  └─────────────────┘    │   │
│         │                └──────────┬──────────────┘   │
│         │                           │                   │
│         └───────────┬───────────────┘                   │
│                     ↓                                   │
│           共享服务层 (services.ts)                       │
│           - FileSystemAdapter                           │
│           - WorkspaceService                            │
│           - NodeService                                 │
│           - ...                                         │
└─────────────────────────────────────────────────────────┘
```

## 环境配置

### 环境变量

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| PORT | 3000 | HTTP API 端口 |
| TANMI_DEV | false | 开发模式（使用独立数据目录） |
| DISABLE_HTTP | false | 禁用 HTTP server（纯 MCP 模式） |

### 数据目录隔离

| 环境 | 全局索引 | 项目数据 |
|------|---------|---------|
| **正式环境** | `~/.tanmi-workspace/` | `{project}/.tanmi-workspace/` |
| **开发环境** (TANMI_DEV=true) | `~/.tanmi-workspace-dev/` | `{project}/.tanmi-workspace-dev/` |

### 端口分配

| 环境 | HTTP API | Web UI (开发) | Web UI (生产) |
|------|----------|---------------|---------------|
| **正式环境** | 3000 | - | 3000（静态托管） |
| **开发环境** | 3001 | 5173（Vite） | - |

**重要**：MCP 会根据 `TANMI_DEV` 环境变量自动选择端口：
- `TANMI_DEV=true`：HTTP 服务器启动在 3001
- 未设置 `TANMI_DEV`：HTTP 服务器启动在 3000

这样可以同时运行正式环境和开发环境，互不干扰。

## 启动脚本

| 命令 | MCP | HTTP | 端口 | 数据目录 | 用途 |
| --- | :---: | :---: | :---: | --- | --- |
| `npm start` | ✅ | ✅ | 3000 | 正式 | 生产模式 |
| `npm run start:mcp` | ✅ | ❌ | - | 正式 | 纯 MCP |
| `npm run start:mcp:dev` | ✅ | ❌ | - | 开发 | 开发 MCP |
| `npm run start:http` | ❌ | ✅ | 3000 | 正式 | 独立 HTTP |
| `npm run start:http:dev` | ❌ | ✅ | 3001 | 开发 | 开发 HTTP |
| `npm run dev:all` | ❌ | ✅ | 3001+5173 | 开发 | 全栈开发 |

## Web UI 访问

### 生产模式

HTTP 服务器同时托管 API 和前端静态文件：

```
http://localhost:3000/                    → Web UI 首页
http://localhost:3000/workspace/{id}      → 工作区详情（SPA）
http://localhost:3000/api/*               → API 接口
```

### 开发模式

Vite 开发服务器 + HTTP API 分离：

```
http://localhost:5173/                    → Web UI（Vite HMR）
http://localhost:5173/api/* → 代理到 → http://localhost:3001/api/*
```

## 多会话并发

同时运行多个 Claude 会话时：

```
第一个 Claude              第二个 Claude
      │                         │
   MCP + HTTP(:3000)         仅 MCP（端口已占用，跳过 HTTP）
      │                         │
      └───────┬─────────────────┘
              ↓
        共享 HTTP Server
              │
    ┌─────────┴─────────┐
    ↓                   ↓
浏览器标签页 A      浏览器标签页 B
/workspace/ws-a    /workspace/ws-b
```

**关键行为**：端口占用时静默跳过 HTTP，MCP 继续正常工作。

## 日志规范

| 标签 | 输出 | 示例 |
| --- | --- | --- |
| `[mcp]` | stderr | `[mcp] Server started` |
| `[http]` | stderr | `[http] Listening on :3000` |

所有日志输出到 stderr，避免污染 MCP stdio 通道。
