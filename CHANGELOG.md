# Changelog

本文件记录 TanmiWorkspace 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 版本号规则

- **x.y.Z (Patch)**: Bug 修复、小功能优化
- **x.Y.z (Minor)**: 新功能引入、较大改进
- **X.y.z (Major)**: 破坏性变更、架构重构

## [1.5.0] - 2025-12-20

### Added

- **npm 包发布支持**: 可通过 `npm install -g tanmi-workspace` 全局安装
- **setup 配置向导**: `tanmi-workspace setup` 交互式配置命令，支持 `--claude-code`、`--cursor`、`--status` 参数
- **版本更新通知**: CLI 启动时检测新版本提醒，WebUI 显示版本更新通知
- **Hook 脚本打包**: npm 包包含 `tanmi-workspace-hooks` 命令

### Changed

- **MCP 权限简化**: 支持通配符 `mcp__tanmi-workspace` 替代 30+ 条独立权限规则
- **文档优化**: 更新 README 和配置指南，简化安装流程

## [1.4.1] - 2025-12-20

### Added

- **派发模式切换功能**: 支持在已启用派发模式时切换 Git/无Git 模式
- **Git 派发鲁棒性优化**: 自动将工作区目录添加到 `.git/info/exclude`，防止元数据干扰 Git 操作

### Fixed

- **派发分支已存在处理**: 修复 createProcessBranch 无法处理已存在分支的问题
- **派发权限控制优化**: 完善派发模式下的状态变更权限检查

## [1.4.0] - 2025-12-19

### Added

- **Confirmation Token 机制**: 关键操作需用户确认时生成一次性 token，防止 AI 编造用户确认
- **场景感知引导系统**: 22 个场景的三级引导（L0 提示词 / L1 简要 / L2 详细），自动嵌入工具返回
- **提示式工作区绑定**: 检测 cwd 匹配的工作区，自动提示绑定建议
- **UI 信息展示优化**: WebUI 界面信息展示增强

### Fixed

- **completed 节点 reopen 保留历史结论**: 重开节点时将原有结论转换为引用格式保留
- **日志换行符处理**: 修复日志内容包含换行符时 Markdown 表格格式错乱问题
- **工作区索引错误处理优化**: 增强索引文件损坏时的容错能力

## [1.3.0] - 2025-12-17

### Added

- **派发功能**: `dispatch_enable`/`dispatch_disable` 工具，支持多 Agent 协作
- **派发模式 Git 可选化**: 派发时可选择是否创建 Git 分支
- **多种合并策略**: `dispatch_disable` 支持 merge/rebase/squash 等合并策略

### Fixed

- **派发分支创建**: 派发分支应基于备份分支创建
- **workspace_init 参数验证**: 修复参数验证和 undefined 输出问题

## [1.2.0] - 2025-12-16

### Added

- **OpenSpec 导入功能**: 将 OpenSpec 变更规范导入为 TanmiWorkspace 工作区
- **actionRequired 机制**: 结构化字段强制 AI 执行特定行为（询问用户、展示计划、检查文档）
- **文档扫描功能**: `workspace_init` 时自动扫描项目文档
- **Prompt 结构优化**: `review_structure` 支持，Prompts 参考文档

### Changed

- **Hook 智能提醒增强**: 新增代码变更提醒、Bash 错误检测、MCP 参数错误提醒
- **文档自然语言化**: 用户指南改为自然语言风格

### Fixed

- **ask_user 触发逻辑**: 完善用户询问触发条件
- **Hook 智能提醒修复**: 修复提醒场景遗漏问题
- **workspace_list updatedAt 同步**: 修复更新时间不同步问题

## [1.1.0] - 2025-12-14

### Added

- **Cursor Hooks 支持**: `beforeSubmitPrompt` 事件，支持 Cursor 编辑器
- **Hook 智能提醒功能**: 日志超时、问题未解决、计划确认等多种提醒场景
- **执行节点并发控制**: 阻止同级执行节点同时启动
- **聚焦节点同步**: `context_focus` 和 `session_bind` 统一以 `graph.currentFocus` 为权威来源
- **归档功能**: `workspace_archive`/`workspace_restore` 工具，支持工作区归档与恢复
- **Dev 模式日志系统**: 开发环境调试日志增强
- **WebUI 服务状态检测**: 前端自动检测后端服务状态
- **工作区列表筛选增强**: 支持按状态筛选工作区

### Changed

- **workspace_list 优先显示当前路径**: 当前项目的工作区排在列表前面
- **根节点 start 改为友好提醒**: 不再强制报错，改为提示建议

### Docs

- 完善安装引导文档
- 添加架构与交互指南文档体系
- 添加 Hook 系统参考文档
- 添加 2.0 版本规划：统一事件机制

## [1.0.0] - 2025-12-10

### Added

- **核心 MCP 工具**: 工作区管理（init/list/get/delete/status）、节点管理（create/get/list/update/delete/move）
- **分形任务结构**: 支持任务的无限层级嵌套
- **双节点类型**: 规划节点（planning）和执行节点（execution）
- **状态流转系统**: pending → implementing → validating → completed/failed
- **聚焦上下文**: 执行特定节点时自动过滤无关信息
- **日志系统**: `log_append`、`problem_update`、`problem_clear`
- **引用系统**: `node_reference`、`node_isolate`
- **信息收集机制**: `info_collection` 角色节点，自动归档规则和文档
- **rulesHash 验证**: 确保 AI 遵守工作区规则
- **Hook 系统基础**: SessionStart、UserPromptSubmit、PostToolUse、Stop 事件
- **会话管理**: `session_bind`/`session_unbind`/`session_status`
- **Web 界面**: 工作区列表、节点树可视化、详情面板
- **AI 使用指南**: `tanmi_help`、`tanmi_prompt` 工具
- **项目级存储隔离**: 数据写入项目内 `.tanmi-workspace`
