# TanmiWorkspace 架构文档

## 服务架构

TanmiWorkspace 采用统一入口设计，同时提供 MCP 和 HTTP 两种访问方式，共享 21 个核心服务。

```
┌─────────────────────────────────────────────────────────────────┐
│                    统一入口 (index.ts)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐           ┌─────────────────────────────┐ │
│  │   MCP Server    │           │       HTTP Server           │ │
│  │    (stdio)      │           │  ┌───────────────────────┐  │ │
│  │                 │           │  │   API (/api/*)        │  │ │
│  │  50+ Tools      │           │  ├───────────────────────┤  │ │
│  │  2 Prompts      │           │  │   SSE (/api/events)   │  │ │
│  └────────┬────────┘           │  ├───────────────────────┤  │ │
│           │                    │  │   Web UI (静态)        │  │ │
│           │                    │  └───────────────────────┘  │ │
│           │                    └────────────┬────────────────┘ │
│           │                                 │                   │
│           └─────────────┬───────────────────┘                   │
│                         ↓                                       │
│               共享服务层 (21 Services)                           │
│               ┌─────────────────────────────────────────────┐   │
│               │ Core: Workspace, Node, State, Context,      │   │
│               │       Reference, Log, Session               │   │
│               │ Functional: Memo, Dispatch, Health,         │   │
│               │             Capability, Search, Import,     │   │
│               │             Help, Config                    │   │
│               │ Auxiliary: Event, Guidance, Installation,   │   │
│               │            Detection, JSON, FileSystem      │   │
│               └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## SSE 事件广播

EventService 提供实时事件广播，支持本地和远程模式：

```
┌─────────────────────────────────────────────────────────────────┐
│                       EventService                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  本地模式（启动 HTTP Server）          远程模式（复用已有 HTTP）  │
│  ┌──────────────────────┐             ┌─────────────────────┐   │
│  │  HTTP Server :19540  │             │  MCP 进程（无 HTTP）│   │
│  │        ↓             │             │        ↓            │   │
│  │  SSE /api/events     │             │  HTTP 转发到 :19540 │   │
│  │        ↓             │             │        ↓            │   │
│  │  浏览器客户端        │             │  SSE /api/events    │   │
│  └──────────────────────┘             └─────────────────────┘   │
│                                                                 │
│  事件类型：                                                      │
│  - workspace_updated    工作区更新                               │
│  - node_updated         节点更新                                 │
│  - focus_changed        焦点切换                                 │
│  - graph_changed        节点图变更                               │
│  - memo_updated         备忘更新                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 环境配置

### 环境变量

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| HTTP_PORT | 19540 | HTTP API 端口（开发模式默认 19541） |
| TANMI_DEV | false | 开发模式（使用独立数据目录） |
| TANMI_HOST | 127.0.0.1 | HTTP 监听地址 |
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
http://localhost:19540/api/events          → SSE 事件流
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
      │                         ├── 检测 PID 文件
      │                         │   └── 发现同版本运行中
      │                         │
      │                         └── 配置事件转发到 :19540
      │                              │
      └───────────┬──────────────────┘
                  ↓
            共享 HTTP Server
                  │
        ┌─────────┴─────────┐
        ↓                   ↓
  浏览器标签页 A       浏览器标签页 B
  /workspace/ws-a     /workspace/ws-b
```

**关键行为**：
- 端口占用时静默跳过 HTTP，MCP 继续正常工作
- 自动检测并复用现有 HTTP 服务
- 事件通过 HTTP 转发保持实时同步

## 数据源规范

TanmiWorkspace 采用**分层数据源**设计，不同类型的数据有不同的权威来源：

| 数据类型 | 权威来源 | 字段 | 说明 |
|---------|---------|------|------|
| **内容数据** | Info.md | requirement, conclusion, notes | 用户可直接编辑 Markdown 文件 |
| **结构数据** | graph.json | status, children, references, dispatch | 状态机逻辑由 API 控制 |

### 设计原则

1. **本地编辑友好**：用户打开 `Info.md` 修改需求/结论，保存即生效
2. **Web 编辑一致**：Web UI 编辑也是修改 `Info.md`，与本地编辑走同一条路
3. **结构可控**：状态转换有业务逻辑约束，必须通过 API 控制

### 读取优先级

```
内容数据（requirement, conclusion, notes）
└── 读取来源：Info.md
└── 写入目标：Info.md（+ graph.json 作为缓存）

结构数据（status, children, references, dispatch）
└── 读取来源：graph.json
└── 写入目标：graph.json（+ Info.md frontmatter 同步）
```

### 编辑方式对照

| 编辑方式 | 内容数据 | 结构数据 |
|---------|---------|---------|
| 本地编辑 Info.md | ✅ 生效 | ⚠️ frontmatter 中的 status 仅展示用 |
| Web UI 编辑 | ✅ 通过 API 修改 Info.md | ✅ 通过 API 修改 graph.json |
| MCP 工具 | ✅ 调用 node_update | ✅ 调用 node_transition |

## 派发模式

支持 Git 和非 Git 两种派发模式，用于将执行节点派发给 subagent：

```
┌─────────────────────────────────────────────────────────────────┐
│                         派发模式                                 │
├────────────────────────────────┬────────────────────────────────┤
│          Git 模式              │         非 Git 模式            │
├────────────────────────────────┼────────────────────────────────┤
│ - 创建 tanmi-process 分支      │ - 使用时间戳标记              │
│ - 每次执行前后自动提交          │ - 无分支管理                  │
│ - 支持 diff 对比变更           │ - 适用于非 git 项目           │
│ - 支持多种合并策略             │ - 轻量级追踪                  │
│   (sequential/squash/cherry)  │                               │
└────────────────────────────────┴────────────────────────────────┘
```

## 版本管理

### 启动流程

1. **版本检查**：入口脚本 `check-node-version.js` 确保 Node.js 版本 >= 20
2. **平台检测**：启动时检测 Claude Code、Cursor、Codex 等平台的安装状态
3. **组件同步**：将检测到的组件状态同步到 `installation.json`

### 数据版本兼容

| 场景 | 行为 |
|------|------|
| 数据版本 < 代码版本 | 自动迁移 |
| 数据版本 = 代码版本 | 正常读写 |
| 数据版本 > 代码版本 | 只读模式（VERSION_READONLY 错误） |

## 日志规范

| 标签 | 输出 | 示例 |
| --- | --- | --- |
| `[mcp]` | stderr | `[mcp][PROD] Server started` |
| `[http]` | stderr | `[http][PROD] Listening on :19540` |

所有日志输出到 stderr，避免污染 MCP stdio 通道。开发模式标签为 `[DEV]`，生产模式标签为 `[PROD]`。
