# TanmiWorkspace 开发指南

## 数据存储

```
~/.tanmi-workspace/
├── index.json                     # workspaceId → projectRoot 映射
├── session-bindings.json          # 会话绑定记录（Hook 系统）

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
npm run start:http:dev   # 后端 HTTP API (端口 19541)
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
- [docs/user-guide.md](docs/user-guide.md) - 用户指南
- [docs/architecture.md](docs/architecture.md) - 系统架构
- [docs/core-layer.md](docs/core-layer.md) - 核心服务层
- [docs/storage-layer.md](docs/storage-layer.md) - 存储层
- [docs/reference-system.md](docs/reference-system.md) - 引用系统
- [docs/prompts-reference.md](docs/prompts-reference.md) - Prompts 参考文档
- [docs/tanmi-workspace-hook-design.md](docs/tanmi-workspace-hook-design.md) - Hook 系统设计

## TODO

### 功能

- [x] **归档功能完善** - ~~目前仅有 UI 界面，需实现后端归档逻辑~~ 已实现：workspace_archive/restore MCP 工具 + HTTP API + WebUI 归档/恢复按钮
- [ ] **删除优化** - 增加删除确认提示，支持软删除/回收站机制，允许找回误删数据
- [ ] **工作区模板** - 支持将工作区保存为模板，快速创建相似结构的新工作区
- [ ] **文档生命周期管理** - 基于继承生命周期的文档管理和派发机制，支持自动清理过期文档
- [ ] **对话恢复增强** - 更稳定的会话恢复机制，支持工作区 UUID 匹配，避免 ID 变化导致恢复失败
- [ ] **AI 任务派发** - 支持主 AI 将执行节点派发给其他 AI 执行，根据返回结果进行下一步操作（多 Agent 协作）
- [x] **MCP 权限自动配置** - ~~自动化 MCP 权限配置流程，减少手动编辑配置文件的步骤~~ 已实现：`tanmi-workspace setup` 自动检测环境并配置 MCP 服务器和权限
- [x] **OpenSpec 集成** - ~~接管 OpenSpec 流程、导入 OpenSpec 结果、同步生成 OpenSpec 跟踪，提供开关启用/禁用~~ 已实现导入功能：workspace_import_guide/list + openspec-import.cjs 脚本
- [x] **新手教程系统** - 自动为新用户创建教程工作区，介绍核心概念和使用方法
- [x] **版本更新提示** - 升级后自动创建版本更新工作区，展示新版本功能变更
- [x] **WebUI 设计系统升级** - 从 Element Plus 迁移到基于构成主义的自定义设计系统
- [ ] **智能验证节点** - 加强验证节点能力，让 AI 能更智能地判断是否需要验证，并自动执行验证流程
- [x] **场景感知引导系统** - ~~将部分静态 prompt 改为 Hook 动态注入~~ 已实现：5 种任务场景的引导系统，自动嵌入工具返回 + Confirmation Token 防止 AI 编造确认
- [ ] **WebUI 编辑与 AI 同步** - 实现 WebUI 中的节点编辑功能（需求、结论等），变更能实时同步给 AI 会话
- [ ] **重命名功能** - 支持工作区和节点的重命名，保持引用关系不变
- [ ] **Patch 机制** - 每个任务生成 patch，方便检查审计、回退和方案对比选择
- [ ] **节点日志目录** - 每个节点下增加目录存放日志，支持日志分析报告和技术方案细化
- [ ] **版本对比视图** - WebUI 支持查看不同阶段版本的优化情况
- [ ] **文档超链接** - 代码路径（如 `src/tools/log.ts:1-50`）增加可点击的超链接
- [ ] **双向关联系统** - 参考 Obsidian 结构实现双向链接，支持通过 Obsidian 打开 `.tanmi-workspace`
- [ ] **设计方案节点** - WebUI 增加"程序设计/实现方案"展示区域，结构化保存设计信息
- [ ] **项目层级管理** - 增强项目概念，支持项目模块结构和任务完成后回流更新项目模块
- [ ] **工作区归类与引用** - 支持按逻辑结构自动归类工作区，或允许节点引用其他工作区
- [x] **目录命名优化** - ~~工作区和节点目录从 UUID 改为「名称+日期」形式~~ 已实现：改为 `名称_短ID` 格式（如 `UI优化_mjb65az5`），支持自动迁移旧数据

### 待修复问题

- [ ] **Git 模式冲突检测基于 projectRoot** - 当前基于 projectRoot 判断"同仓库"，但如果工作区目录与实际代码目录不同（如 projectRoot=/A 但修改 /B 代码），会导致误判。应改为检测实际 git root（`git rev-parse --show-toplevel`）
- [ ] **已完成工作区追加需求处理不当** - 根节点完成后补充/更新需求时，AI 倾向于直接修改代码而非 reopen 工作区继续跟踪
- [ ] **并发安全** - 多个 API 调用同时到达时可能导致数据不一致，缺少乐观锁机制
- [x] **completed 节点自动 reopen** - ~~在已完成节点下创建子节点会自动 reopen 并清空 conclusion~~ 已修复：保留原有结论作为历史引用（引用格式 + 时间戳标注）
- [x] **聚焦节点不同步** - ~~`context_focus` 和 `session_bind` 的 focusedNodeId 可能不一致~~ 已修复：统一以 graph.currentFocus 为权威来源（含 Hook 智能提醒）
- [x] **并发执行控制缺失** - ~~同级执行节点可同时启动~~ 已修复：start 时检查同级节点状态，阻止并发执行
- [ ] **规则提醒改用 Hook 实现** - 弃用 rulesHash 验证机制，改用 PreToolUse Hook（Claude Code）或 beforeMCPExecution（Cursor）在 node_create 前主动注入规则
- [ ] **操作幂等性缺失** - 网络重试时同一操作可能失败，缺少 request ID 去重机制
- [ ] **信息收集检查不完善** - 只检查 info_collection 节点存在，不验证 conclusion 有效性和规则/文档是否真正归档
- [x] **Hook 提醒场景遗漏** - ~~缺少执行节点 fail 后引导、文档派发不足提醒~~ 已修复：新增 P6_FAILED_NODE 和 P7_NO_DOCS 提醒
- [ ] **文档派发验证缺失** - `node_create` 派发的文档路径不验证是否存在
- [ ] **Hint 信息碎片化** - 各服务返回的 hint 没有统一格式，异常情况下提示不清晰
- [ ] **日志缺少结构化** - 缺少决策日志类型，难以回溯"为什么选这个方案"
- [ ] **Instructions 关键步骤强调不足** - 信息收集必须、规划需确认等关键步骤视觉强调不够
- [ ] **规则时间敏感性不清** - 规则变化后对已执行/未执行节点的影响没有明确定义
- [x] **WebUI 启动偶发问题** - ~~正式环境下 MCP 服务正常但 WebUI 提示"加载列表失败"~~ 已修复：统一 host 配置
- [ ] **WebUI 开始按钮无效** - 网页上的"开始执行"按钮点击后无响应
- [ ] **任务自动开始** - 有时任务会在未触发的情况下自动开始执行
- [ ] **actionRequired 状态不可见** - 需要用户确认时，WebUI 上看不到确认状态
- [ ] **需求描述过于简略** - 节点需求只有一句话，AI 无法准确理解完整需求导致实现偏差（提示词优化）

### 2.0 版本规划：统一事件机制

当前架构存在平台碎片化问题：各平台 Hook 时机、注册方式、启用状态不同，导致适配逻辑分散。
2.0 版本将引入**事件驱动的统一架构**：

```
事件源（Hook / MCP / API）
         ↓
    统一事件格式
         ↓
┌─────────────────────┐
│     决策引擎         │  ← 状态 + 配置 + 规则
│  - 会话状态管理       │
│  - 平台配置感知       │
│  - 可插拔规则系统     │
└─────────────────────┘
         ↓
    响应分发（按平台格式化）
```

**核心改进**：
- **调用与结果分离**：事件收集层只负责上报，决策引擎统一处理
- **平台无关决策**：根据配置自动判断"是否响应"及"响应内容"
- **Hook 优先级保障**：有 Hook 的平台保持最佳体验，无 Hook 平台通过 MCP 主动调用达到 70-80% 效果
- **用户自定义规则**：支持工作区级、项目级、全局级的自定义决策规则
