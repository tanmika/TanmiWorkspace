# Changelog

本文件记录 TanmiWorkspace 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 版本号规则

- **x.y.Z (Patch)**: Bug 修复、小功能优化
- **x.Y.z (Minor)**: 新功能引入、较大改进
- **X.y.z (Major)**: 破坏性变更、架构重构

## [1.9.0] - 2025-12-26

### Added

- **MEMO 功能**: 支持节点级长篇内容记录，草稿机制防丢失，WebUI 完整编辑体验
- **验收标准**: 节点可定义验收条件(acceptanceCriteria)，WebUI 显示验收状态
- **场景化能力包**: AI 智能引导系统，根据任务场景(feature/debug/optimize等)推荐执行流程
- **版本跟踪**: 组件级版本检测，前端状态展示，插件更新提醒

### Fixed

- **SSE 事件通知**: MCP 调用触发 SSE 事件通知前端刷新
- **结论验证事务性**: 修复 node_transition 结论验证的事务性 bug
- **DEV 标识显示**: 修复生产环境 DEV 标识显示问题
- **版本文件路径**: 修复版本文件路径和 Git 分支清理问题

## [1.8.2] - 2025-12-24

### Fixed

- **npm 包前端资源**: 添加 `web/.npmignore` 覆盖 `web/.gitignore`，确保 `web/dist` 被正确包含

## [1.8.1] - 2025-12-24

### Fixed

- **npm 包前端资源**: 添加 `.npmignore` 确保 `web/dist` 被正确包含（未生效）
- **生产环境日志**: 修复 pino-pretty 开发依赖在生产环境报错问题

### Improved

- **Settings 版本信息**: 生产环境显示基本版本信息，调试信息仅开发模式可见

### Added

- **发布脚本**: `scripts/release.sh` 自动化发布流程，确保前后端同步编译

## [1.8.0] - 2025-12-24

### Added

- **WebUI 独立启动命令**: `tanmi-workspace webui [start|stop|restart|status]` 支持独立管理 WebUI 服务
- **进程管理与版本检测**: PID 文件跟踪、旧进程自动替换、前后端版本不匹配警告
- **端口迁移**: 3000/3001 → 19540/19541，启动时自动检测并关闭旧端口服务
- **索引重建脚本**: `scripts/rebuild-index.cjs` 用于恢复损坏的工作区索引
- **MCP 工具参数容错**: 自动修复常见参数错误（如 nodeId 误传为 workspaceId）
- **tanmi_help server 主题**: 服务器状态与自检指南，帮助 AI 诊断服务问题

### Changed

- **移除文档 active/expired 状态机制**: 简化文档引用管理，文档生命周期随节点状态自动管理

### Fixed

- **HTTP 路由 dirName 解析**: 修复版本比较和目录名解析导致的 404 错误
- **dirName 参数规范化**: 统一使用 dirName 替代 workspaceId 作为目录名参数

## [1.7.2] - 2025-12-22

### Added

- **SSE 实时更新**: 后端操作（节点变更、日志追加等）自动推送到前端，无需手动刷新
- **CompactMarkdown 组件**: 子节点结论紧凑渲染，换行转分隔符，21行压缩为数行
- **Noto Emoji 单色字体**: 统一 emoji 风格，符合构成主义设计语言

### Improved

- **夜间模式优化**: 柔和文字颜色(#E0E0E0)、平滑主题切换过渡
- **Markdown 样式增强**: 红色点缀（列表■、代码块边框等）统一
- **版本更新弹窗**: 新版本提示改为弹窗形式，点击跳转查看

## [1.7.1] - 2025-12-22

### Fixed

- **Claude Code MCP 配置路径修复**: 修正 setup 命令写入正确的配置文件路径
  - MCP 服务器配置 → `~/.claude.json`
  - 权限配置 → `~/.claude/settings.local.json`
- **文档配置路径修复**: 更新 README.md 和配置方式.md 中的配置文件路径说明

## [1.7.0] - 2025-12-22

### Added

- **新手教程工作区**: 自动为新用户创建教程工作区，介绍核心概念和使用方法
- **版本更新提示系统**: 升级后自动创建版本更新工作区，展示新版本功能变更
- **主页刷新按钮**: WebUI 主页新增 SYNC 按钮，支持手动刷新工作区列表
- **前后端版本一致性检测**: 设置页面显示编译时间差异警告，提醒重新编译

### Changed

- **WebUI 设计系统全面升级**: 从 Element Plus 迁移到基于构成主义的设计系统，统一视觉风格
- **Logo 与空状态优化**: 全新 Logo 设计，404 页面和服务未启动页面适配新风格
- **节点详情样式优化**: NodeDetail、NodeIcon、日志显示等组件样式修复

## [1.6.4] - 2025-12-21

### Fixed

- **updateRules dirName 修复**: 修复 `workspace_update_rules` 方法中仍使用 workspaceId 导致的 WORKSPACE_NOT_FOUND 错误

## [1.6.3] - 2025-12-21

### Fixed

- **dirName 全面修复**: 修复 SessionService、DispatchService、WorkspaceService 中仍使用 workspaceId 作为目录名的遗留问题
- **新增 getWorkspaceLocation 方法**: JsonStorage 新增统一获取 projectRoot 和 dirName 的方法，避免后续出错
- **私有方法参数命名统一**: WorkspaceService 私有方法参数从 workspaceId 改为 wsDirName，提升代码可读性

## [1.6.2] - 2025-12-21

### Added

- **派发节点自动完成**: `node_dispatch_complete` 成功时自动将节点标记为 completed，失败时标记为 failed
- **父节点完成提醒**: 完成子节点时，检测父规划节点是否所有子任务已完成，给出完成提醒
- **派发测试套件**: 新增 `tests/dispatch.test.ts`，15 个测试覆盖派发模式核心逻辑

### Fixed

- **派发冲突检测优化**: 无 Git 模式不再检查冲突，允许多工作区并行派发；Git 模式仅检查同仓库冲突
- **节点目录解析修复**: 修复使用 nodeId 而非 dirName 导致的 ENOENT 错误（迁移后目录名变化场景）
- **派发状态检测修复**: `dispatch_disable` 只检查 executing 状态，passed/failed 不再阻塞关闭

### Changed

- **派发状态语义**: 执行完成后 `dispatch.status` 改为 `passed/failed`（原 `testing`），保留对象供 WebUI 显示历史

## [1.6.1] - 2025-12-21

### Added

- **旧数据目录迁移**: 存储版本升级到 5.0，自动将旧工作区和节点目录从 UUID 格式迁移为可读格式

### Fixed

- **节点标题同步目录名**: `node_update` 修改标题时自动同步更新目录名

## [1.6.0] - 2025-12-21

### Added

- **可读目录名**: 工作区和节点目录从 UUID 格式改为 `名称_短ID` 格式（如 `UI优化_mjb65az5`），提升本地查看体验
- **统一版本管理**: 合并 index.json 和 graph.json 版本号为 STORAGE_VERSION 4.0
- **版本降级保护**: 高版本数据自动备份，工作区标记错误状态并在 WebUI 显示

### Changed

- **全量迁移策略**: 读取 index.json 时一次性升级所有工作区的 graph.json
- **向后兼容**: 使用 `dirName || id` 回退机制兼容旧数据

## [1.5.1] - 2025-12-21

### Added

- **WebUI 手动操作感知**: AI 可感知用户在 WebUI 的手动操作，新增 `get_pending_changes` 工具

### Fixed

- **前端 API 错误提示**: 修复错误响应未显示后端具体错误信息的问题

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
