# TanmiWorkspace

面向 AI 编程助手的分形任务跟踪系统，通过 MCP 协议提供结构化的任务管理能力。

## 核心特性

- **分形任务结构**：支持任务的无限层级嵌套，任意步骤可升级为独立子任务
- **双节点类型**：规划节点（planning）负责分解任务，执行节点（execution）负责具体执行
- **聚焦上下文**：执行特定节点时自动过滤无关信息，避免上下文污染
- **过程可追溯**：完整操作历史和试错路径，支持回溯复盘
- **规则防护**：rulesHash 验证 + hint 提醒，确保 AI 遵守工作区规则
- **信息收集机制**：根节点启动前强制完成信息收集，自动归档到工作区规则和文档
- **项目级存储隔离**：数据写入项目内 `.tanmi-workspace`，支持多项目并行
- **AI 引导**：内置使用指南和话术模板，可引导不熟悉的用户

## 快速开始

### 系统要求

- **Node.js >= 20.0.0**

### 安装

```bash
git clone https://github.com/tanmika/TanmiWorkspace.git
cd TanmiWorkspace
npm install
npm run build
```

### 配置 Claude Code（推荐）

1. 运行配置脚本添加 MCP 权限：
```bash
./scripts/setup-claude-code.sh
```

2. 编辑 `~/.claude/settings.json`，添加 MCP 服务器：
```json
{
  "mcpServers": {
    "tanmi-workspace": {
      "command": "node",
      "args": ["/path/to/TanmiWorkspace/dist/index.js"],
      "env": {
        "TANMI_PROJECT_ROOT": "/path/to/TanmiWorkspace"
      }
    }
  }
}
```

3. 启动 Claude Code：
```bash
claude
```

> 详细配置说明见 [配置方式.md](配置方式.md)

### 验证安装

```
调用 tanmi_help(topic="overview") 获取系统概述
```

## 基本用法

```typescript
// 1. 创建工作区
workspace_init({ name: "实现登录功能", goal: "添加用户名密码登录" })

// 2. 创建信息收集节点（根节点启动前必须）
node_create({ workspaceId: "ws-xxx", parentId: "root", type: "planning",
              title: "需求调研", role: "info_collection", rulesHash: "xxx" })

// 3. 完成信息收集后，创建执行任务
node_create({ workspaceId: "ws-xxx", parentId: "root", type: "execution",
              title: "实现登录接口", requirement: "使用 JWT 认证", rulesHash: "xxx" })

// 4. 开始执行
node_transition({ workspaceId: "ws-xxx", nodeId: "node-xxx", action: "start" })

// 5. 记录过程
log_append({ workspaceId: "ws-xxx", nodeId: "node-xxx", operator: "AI", event: "创建表结构" })

// 6. 完成任务
node_transition({ workspaceId: "ws-xxx", nodeId: "node-xxx", action: "complete", conclusion: "完成" })
```

## 节点类型与状态

### 节点类型

| 类型 | 说明 | 可有子节点 |
|------|------|:----------:|
| `planning` | 规划节点：负责分析、分解、派发、汇总 | ✅ |
| `execution` | 执行节点：负责具体执行任务 | ❌ |

### 节点角色（可选）

| 角色 | 说明 |
|------|------|
| `info_collection` | 信息收集节点，完成时自动归档规则和文档到工作区 |
| `validation` | 验证节点（预留） |
| `summary` | 汇总节点（预留） |

### 状态流转

**执行节点**：
```
pending → implementing → validating → completed
                ↓              ↓
              failed ←────────┘
                ↓
           (retry) → implementing
```

**规划节点**：
```
pending → planning → monitoring → completed
              ↓           ↓
          cancelled ←────┘
```

## 工具列表（22 个）

### 工作区
| 工具 | 说明 |
|------|------|
| `workspace_init` | 创建工作区 |
| `workspace_list` | 列出工作区 |
| `workspace_get` | 获取详情（含 rulesHash） |
| `workspace_delete` | 删除工作区 |
| `workspace_status` | 状态概览 |
| `workspace_update_rules` | 动态更新规则 |

### 节点
| 工具 | 说明 |
|------|------|
| `node_create` | 创建子任务（需传 type 和 rulesHash） |
| `node_split` | 分裂子任务 |
| `node_get` | 获取详情 |
| `node_list` | 列出节点树 |
| `node_update` | 更新节点 |
| `node_delete` | 删除节点 |
| `node_move` | 移动节点 |

### 状态
| 工具 | 说明 |
|------|------|
| `node_transition` | 状态转换（start/submit/complete/fail/retry/reopen/cancel） |

### 上下文
| 工具 | 说明 |
|------|------|
| `context_get` | 获取聚焦上下文（含 rulesHash） |
| `context_focus` | 切换焦点 |
| `node_isolate` | 设置隔离 |
| `node_reference` | 管理引用 |

### 日志
| 工具 | 说明 |
|------|------|
| `log_append` | 追加日志 |
| `problem_update` | 更新问题 |
| `problem_clear` | 清除问题 |

### 帮助
| 工具 | 说明 |
|------|------|
| `tanmi_help` | 获取使用指南 |
| `tanmi_prompt` | 获取话术模板 |

## AI 使用指南

```typescript
// 获取完整指南
tanmi_help({ topic: "all" })

// 场景指导
tanmi_help({ topic: "start" })           // 开始新任务
tanmi_help({ topic: "resume" })          // 继续任务
tanmi_help({ topic: "session_restore" }) // 会话恢复
tanmi_help({ topic: "blocked" })         // 任务受阻
tanmi_help({ topic: "split" })           // 分裂任务
tanmi_help({ topic: "complete" })        // 完成任务
tanmi_help({ topic: "docs" })            // 文档引用管理
```

## Web 界面

TanmiWorkspace 提供可视化 Web 界面：

```bash
npm run start:http
```

访问 http://localhost:3000 查看工作区状态。

**功能特性**：
- 工作区列表与状态筛选
- 节点树可视化（含状态图标和角色 emoji）
- 节点详情面板（需求、结论、日志、问题）
- 进度统计（含 failed/cancelled）
- Markdown 渲染支持

## 数据存储

```
~/.tanmi-workspace/
├── index.json                     # workspaceId → projectRoot 映射

{projectRoot}/
└── .tanmi-workspace/
    └── [workspace-id]/
        ├── workspace.json         # 元数据
        ├── graph.json             # 节点拓扑（结构数据）
        ├── Workspace.md           # 规则、文档、目标
        ├── Log.md                 # 全局日志
        └── nodes/[node-id]/
            ├── Info.md            # 节点需求与结论（内容数据）
            ├── Log.md             # 节点日志
            └── Problem.md         # 节点问题
```

### 分层数据源

| 数据类型 | 权威来源 | 可直接编辑 |
|---------|---------|:----------:|
| 内容数据（requirement, conclusion, notes） | Info.md | ✅ |
| 结构数据（status, children, references） | graph.json | ❌ |

## 开发

```bash
# 一键启动（推荐）- 后端 API + 前端开发服务器
npm run dev:all

# 分别启动
npm run start:http:dev   # 后端 HTTP API (端口 3001)
cd web && npm run dev    # 前端 Vite (端口 5173)

# 构建
npm run build            # 后端
npm run build:all        # 后端 + 前端

# 测试
npm test
```

## 项目结构

```
src/
├── index.ts           # MCP Server 入口
├── types/             # 类型定义
├── storage/           # 存储层（JSON/Markdown）
├── services/          # 业务逻辑层
├── tools/             # MCP Tools 定义
├── prompts/           # AI 指南与话术
├── http/              # HTTP 服务器
└── utils/             # 工具函数

web/
├── src/
│   ├── views/         # 页面组件
│   ├── components/    # 通用组件
│   ├── stores/        # Pinia 状态管理
│   ├── api/           # API 客户端
│   └── types/         # 类型定义
```

## 文档

- [配置方式.md](配置方式.md) - 详细配置指南
- [docs/architecture.md](docs/architecture.md) - 系统架构
- [docs/core-layer.md](docs/core-layer.md) - 核心服务层
- [docs/storage-layer.md](docs/storage-layer.md) - 存储层
- [docs/reference-system.md](docs/reference-system.md) - 引用系统

## License

MIT
