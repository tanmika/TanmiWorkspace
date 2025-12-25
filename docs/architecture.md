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
| HTTP_PORT | 19540 | HTTP API 端口（开发模式默认 19541） |
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
| **正式环境** | 19540 | - | 19540（静态托管） |
| **开发环境** | 19541 | 5173（Vite） | - |

**重要**：MCP 会根据 `TANMI_DEV` 环境变量自动选择端口：
- `TANMI_DEV=true`：HTTP 服务器启动在 19541
- 未设置 `TANMI_DEV`：HTTP 服务器启动在 19540

这样可以同时运行正式环境和开发环境，互不干扰。

## 启动脚本

| 命令 | MCP | HTTP | 端口 | 数据目录 | 用途 |
| --- | :---: | :---: | :---: | --- | --- |
| `tanmi-workspace` | ✅ | ❌ | - | 正式 | MCP 服务（供 AI 工具调用） |
| `tanmi-workspace webui` | ❌ | ✅ | 19540 | 正式 | Web 界面 |
| `npm run start:http:dev` | ❌ | ✅ | 19541 | 开发 | 开发 HTTP |
| `npm run dev:all` | ❌ | ✅ | 19541+5173 | 开发 | 全栈开发 |

## Web UI 访问

### 生产模式

HTTP 服务器同时托管 API 和前端静态文件：

```
http://localhost:19540/                    → Web UI 首页
http://localhost:19540/workspace/{id}      → 工作区详情（SPA）
http://localhost:19540/api/*               → API 接口
```

### 开发模式

Vite 开发服务器 + HTTP API 分离：

```
http://localhost:5173/                    → Web UI（Vite HMR）
http://localhost:5173/api/* → 代理到 → http://localhost:19541/api/*
```

## 多会话并发

同时运行多个 Claude 会话时：

```
第一个 Claude              第二个 Claude
      │                         │
   MCP + HTTP(:19540)        仅 MCP（端口已占用，跳过 HTTP）
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

## 数据源规范

TanmiWorkspace 采用**分层数据源**设计，不同类型的数据有不同的权威来源：

| 数据类型 | 权威来源 | 字段 | 说明 |
|---------|---------|------|------|
| **内容数据** | Info.md | requirement, conclusion, notes | 用户可直接编辑 Markdown 文件 |
| **结构数据** | graph.json | status, children, references | 状态机逻辑由 API 控制 |

### 设计原则

1. **本地编辑友好**：用户打开 `Info.md` 修改需求/结论，保存即生效
2. **Web 编辑一致**：Web UI 编辑也是修改 `Info.md`，与本地编辑走同一条路
3. **结构可控**：状态转换有业务逻辑约束，必须通过 API 控制

### 读取优先级

```
内容数据（requirement, conclusion, notes）
└── 读取来源：Info.md
└── 写入目标：Info.md（+ graph.json 作为缓存）

结构数据（status, children, references）
└── 读取来源：graph.json
└── 写入目标：graph.json（+ Info.md frontmatter 同步）
```

### 编辑方式对照

| 编辑方式 | 内容数据 | 结构数据 |
|---------|---------|---------|
| 本地编辑 Info.md | ✅ 生效 | ⚠️ frontmatter 中的 status 仅展示用 |
| Web UI 编辑 | ✅ 通过 API 修改 Info.md | ✅ 通过 API 修改 graph.json |
| MCP 工具 | ✅ 调用 node_update | ✅ 调用 node_transition |

## 日志规范

| 标签 | 输出 | 示例 |
| --- | --- | --- |
| `[mcp]` | stderr | `[mcp] Server started` |
| `[http]` | stderr | `[http] Listening on :19540` |

所有日志输出到 stderr，避免污染 MCP stdio 通道。
