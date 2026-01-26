# Changelog

本文件记录 TanmiWorkspace 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 版本号规则

- **x.y.Z (Patch)**: Bug 修复、小功能优化
- **x.Y.z (Minor)**: 新功能引入、较大改进
- **X.y.z (Major)**: 破坏性变更、架构重构

## [1.11.2] - 2026-01-26

### Improved

- **OpenCode 插件自动更新**: 修复 `tw update` 命令遗漏 OpenCode 插件更新的问题
- **flow-design 节点引用强化**: 新增强制规则要求每个节点关联参考文档、exec 节点列出影响文件

### Docs

- 用户手册添加 OpenCode 支持说明

## [1.11.1] - 2026-01-26

### Added

- **OpenCode 全面支持**: 新增 OpenCode 插件、CLI `setup --opencode` 命令、WebUI Settings 页面 OpenCode 平台选项
- **WebUI 交互式安装面板**: 在设置页面提供可视化的插件安装界面，支持一键安装各平台组件
- **工作区重命名功能**: 新增 `workspace_rename` 工具，支持重命名工作区
- **node_transition 先读后写校验**: 新增 nodeHash 参数，防止并发修改冲突
- **Cursor Hook 同步**: Cursor IDE Hook 功能与 Claude Code 对齐

### Improved

- **node_edit 空字段支持**: 支持向空字段添加内容
- **版本检查 UI 统一**: 统一版本检查入口为卡片样式
- **dev-setup.sh 脚本**: 添加开发环境配置脚本，简化本地开发流程
- **setup 命令简化**: 移除安装方式询问，直接安装全部组件
- **flow-info 声明模板优化**: 明确区分任务类型和信息阶段操作类型
- **AI 引导内容优化**: SessionStart 操作指南 + session_bind 完整工作流引导
- **Skill 流程设计优化**: 基于 Superpowers 调研优化设计

### Fixed

- **MEMO 引用刷新**: 修复 Focus 操作后节点详情 MEMO 引用不更新的问题
- **归档工作区扫描**: readWorkspacesFromProject 支持扫描 archive/ 目录恢复归档工作区
- **归档工作区路径错误**: 修复归档工作区路径导致 ENOENT 问题
- **signal 工具死锁**: 修复 signal 工具死锁问题并增强 Hook 测试覆盖
- **Hook 机制修复**: Hook 机制代码审查修复
- **Cursor 组件版本**: 更新 Cursor Agents/Skills 组件版本配置
- **session-bindings 健壮性**: 修复 session-bindings.json 损坏时的崩溃问题

### Docs

- 添加 dev-setup.sh 说明到构建命令
- 更新用户手册 Cursor 支持程度描述

## [1.11.0] - 2026-01-22

### Added

- **工作流三阶段系统**: 新增 `flow-info` / `flow-design` / `flow-impl` 三阶段 Skill，替代原有的 `bootstrapping-workspace` / `starting-info-flow`
- **Cursor IDE 插件支持**: 为 Cursor IDE 添加 Agents 和 Skills 安装支持，与 Claude Code 对等能力
- **子树切换活跃节点拦截**: 切换到其他分支时检测当前分支活跃节点（implementing/monitoring/validating），防止未完成工作被遗忘
- **Memo 工具拆分**: `memo_update` 拆分为 `memo_replace`（全量替换）、`memo_edit`（精确替换/行范围替换）、`memo_insert`（行后插入）
- **Node 工具拆分**: 新增 `node_replace`（全量替换）、`node_edit`（精确替换/行范围替换）
- **搜索功能增强**: 支持正则表达式搜索、ReDoS 防护、相关度排序（标题 > 摘要 > 需求 > 结论）
- **未绑定写入安全检查**: `allowUnboundWrite=false` 时拒绝未绑定会话的写操作
- **工具 readonly 属性**: 新增 `TanmiTool` 类型，标识工具读写属性
- **节点选中状态 URL 持久化**: `?node=xxx` / `?memo=xxx` 参数，页面刷新自动恢复选中状态
- **验收标准格式校验**: 新增 `validateAcceptanceCriteria()` 函数，防止 WebUI 渲染错误
- **搜索 HTTP 路由**: 新增 `/workspaces/:wid/search` 端点

### Improved

- **教程工作区增强**: 添加流程阶段介绍和能力演示，展示所有可用能力
- **plugin_path 参数化查询**: 支持 `type`/`name` 参数直接查询特定资源路径，错误时返回可用选项列表
- **tanmi_help 模糊搜索**: 支持无参调用返回主题列表，前缀匹配 > ID 包含 > 标题包含
- **Hook 系统增强**: 配置深度合并保留用户自定义，自动生成 `write-tools.cjs` 工具分类
- **派发流程引导**: 明确派发状态切换流程，exec 失败时禁止派发 spec 节点
- **前端搜索集成**: WorkspaceView 搜索框 + 结果下拉 + 点击定位
- **用户手册目录跟踪**: 滚动右侧内容时，左侧目录自动平滑滚动使当前高亮项居中显示
- **设置页面整合**: 合并"派发行为配置"和"安全设置"为"偏好设置"

### Fixed

- **版本比较函数**: 修复 prerelease 版本比较错误（beta.9 < beta.10 数值比较）
- **活跃节点收集**: 修复向上遍历时重复收集已访问子树的问题
- **插件卸载逻辑**: 基于 `.tanmi-managed` 标记文件卸载，保护用户自定义文件
- **info_summary 能力筛选**: 修复只选择 summary 类型能力的 bug，现在使用所有能力
- **未绑定写入检查**: 修复只检查 sessionId 导致 85% 写工具被错误拒绝的问题
- **设置持久化**: 修复 TutorialService 覆盖 security 设置的问题
- **conclusionStale 标志**: 修复标志不会被清除的问题
- **BackupService 安全**: spawn 替代 exec 防止命令注入
- **Hook 安装机制**: 正确保留用户自定义 hook
- **测试修复**: 修复 dispatch.test.ts 全部 15 个用例 + 6 个跳过的测试文件（56 用例）

### Refactor

- **impl_continue_mode 简化**: 从持久化配置改为运行时询问，每次执行前选择
- **代码审查修复**: 常量提取、搜索性能优化、日志系统健壮性、SSE 事件服务健壮性
- **废弃 Skill 清理**: 插件安装时自动清理 bootstrapping-workspace / starting-info-flow

### Docs

- **用户手册增强**: 新增「与普通 AI 对话的区别」对比表、「为什么选择 TanmiWorkspace」章节、「最佳实践」章节

## [1.10.10] - 2026-01-15

### Added

- **工作区置顶功能**: 支持将重要工作区固定在列表顶部，悬浮显示 PIN 徽派，功能简介/版本更新工作区默认置顶
- **全局备份管理**: CLI `update --beta` 命令支持更新到 beta 版本，更新前自动备份；WebUI 新增备份管理界面，支持创建/恢复/导入/导出备份

### Improved

- **设置页面优化**: 版本更新检测弹窗、派发配置移至二级弹窗、更新命令改为 `tanmi-workspace update`
- **验收标准动态列**: AcceptanceCriteria 支持任意列结构（when/then、given/when/then、scenario/input/expected 等）

### Fixed

- **node_transition 参数**: 修复 conclusionsHash 参数未正确传递的问题
- **备份功能安全性**: 添加路径遍历防护、前后端类型统一、移除无效代码
- **备份功能代码质量**: restoreGlobalBackup 返回备份信息、添加并发操作防护、文件上传限制 10MB

## [1.10.9] - 2026-01-14

### Fixed

- **版本更新工作区创建失败**: 修复 TutorialService 完成规划节点时缺少 conclusionsHash 导致的 CONCLUSIONS_HASH_REQUIRED 错误
- **前端版本号不同步**: 修复发布脚本顺序问题，确保 web/package.json 版本号在编译前更新

## [1.10.8] - 2026-01-14

### Added

- **Conclusion Stale 机制**: 追踪父节点结论过期状态，子节点完成时自动标记父节点 stale，阻断切出过期子树
- **Skills 测试验证增强**: designing-solutions 新增验证策略步骤，executing-task 新增 Code Logging Requirements，reviewing-quality 新增 Observability/Test Coverage Check
- **CLI update 自动更新插件**: npm 更新成功后自动检测并更新已安装的插件

### Improved

- **Goal 统一到根节点**: Goal 从 Workspace.md 迁移到根节点 requirement 字段，添加懒迁移逻辑
- **日志系统优化**: log_append/problem_update/problem_clear 的 nodeId 改为必填，workspace_get 日志智能压缩
- **CLI update 命令**: 更新成功后显示版本更新内容（最多 3 个版本）
- **插件版本检测**: 改为完整 semver 比较
- **Skills 流程优化**: aligning-intent Quick Scan + 一次一问策略，preparing-dispatch 验证方法定义，reviewing-spec Gate Function 独立验证

### Fixed

- **工作区导入**: 修复 `.twsp` 导入时 `~` 路径未展开、开发环境目录隔离、警告信息编码、导入后自动刷新
- **插件安装**: 排除 CLAUDE.md 文件，避免误安装为 Agent 模板

## [1.10.7] - 2026-01-12

### Added

- **WebUI 工作区诊断修复**: 新增诊断/修复功能，工作区加载失败时自动标记为 error 状态，所有 MCP 工具拒绝操作 error 状态工作区
- **workspace_search/content_search**: 新增跨工作区搜索和全文内容搜索 MCP 工具
- **先读后写机制**: node_update/memo_update 新增 contentHash 参数，防止并发修改冲突
- **工作区修复工具**: 添加 CLI repair 命令和启动时自动修复

### Improved

- **MCP 输出优化**: workspace_get/node_get 日志智能压缩、context_get 子结论软截取、移除冗余 workspace_status、结论长度限制
- **memo_get 分页**: 支持按行分页，默认 500 行限制
- **MCP 日志分离**: 日志按会话 ID 分离存储，便于问题追踪
- **前后端解耦**: 引入 OutputAdapter 统一输出格式
- **CLI 别名**: 新增 tw/tanmiworkspace/tsworkspace 命令别名
- **插件状态检查**: 增加版本匹配检测

### Fixed

- **repair 工具**: 修复无法识别 index 中缺失 dirName 的问题

## [1.10.6] - 2026-01-09

### Added

- **MEMO 导出功能**: 支持将 MEMO 内容导出为独立文件
- **工作区导出/导入**: 支持工作区完整导出和跨项目导入
- **WebUI 索引管理**: 新增索引管理界面，支持查看和重建索引
- **workspace_get topology 字段**: 新增轻量拓扑结构返回，优化大型工作区性能
- **功能介绍生成入口转正**: 设置页面新增功能介绍生成入口

### Fixed

- **首页卡片对齐**: 修复卡片标题换行时底部不对齐问题
- **派发子 agent Skill 调用**: 修复派发子 agent 无法调用 Skill 的问题
- **更新通知缓存**: 修复更新通知缓存滞后及索引验证鲁棒性问题

### Improved

- **工作区导入功能**: 修复导入问题并重构索引管理 UI
- **派发流程增强**: 增强派发流程防止简化实现
- **索引管理健壮性**: 提升索引管理的健壮性和可维护性
- **Hook 日志增强**: 支持追踪完整输出和节流状态

### Docs

- 补充 OpenCode 兼容性文档和 API 参考更新

## [1.10.5] - 2026-01-04

### Added

- **统一日志系统**: 支持生产环境问题排查
- **Mermaid 图表渲染**: WebUI 支持 Mermaid 图表渲染
- **工作区抗风险增强**: 增强工作区自恢复能力
- **CLI 自更新命令**: 添加 `tanmi-workspace update` 命令及开发便捷脚本

### Fixed

- **Hook 脚本路径**: 工作区路径构建使用 dirName 替代 workspaceId
- **memo_update 参数**: 修复参数遗漏及工作区目录路径不一致问题
- **setup 命令**: 允许覆盖已有 MCP 配置
- **配置迁移**: 修复 logLevel 配置项迁移与更新问题

### Docs

- 添加 Plugin 系统和 Skill 系统文档

## [1.10.4] - 2025-12-30

### Added

- **功能简介工作区增强**: 新增版本更新与帮助系统 MEMO
- **WebUI 帮助模块**: 设置弹窗嵌入用户帮助模块
- **Skill Announcement 机制**: 为所有 Skill 添加声明机制，输出时自动展示
- **starting-info-flow Skill**: 新增引导信息流程的 Skill

### Improved

- **memo_create 参数校验**: 新增参数校验
- **Skill 执行规范**: 增强执行规范与参数必填校验
- **Skill 输出规范**: 增强能力 Skill 输出规范与长内容保护机制

### Docs

- 重构用户文档体系

### Component Versions

- skills: 1.10.3 → 1.10.4

## [1.10.3] - 2025-12-29

### Fixed

- **派发节点状态重置**: 修复派发节点 retry/reopen 后状态未重置的问题
- **工具名称修复**: 恢复 dispatch_disable_execute 工具名称

### Improved

- **PostToolUse Hook 增强**: 增强 Hook 功能，提供更精准的上下文提醒
- **工作区生命周期跟踪**: 强调工作区全生命周期跟踪
- **Info 类 Skill 规范**: 增强记录规范，新增展示成果环节
- **setup 命令体验**: 优化插件安装体验

### Component Versions

- skills: 1.10.2 → 1.10.3

## [1.10.2] - 2025-12-29

### Changed

- **派发子代理优化**: 完善派发流程的 Skill 引导与 Prompt 生成
  - 移除冗余的 tanmi-tester（功能由 tanmi-reviewer dispatch_spec 角色覆盖）
  - tanmi-executor/reviewer 添加 Skill 调用引导
  - dispatch_create 返回完整的 execPrompt/specPrompt/qualityPrompt
  - dispatching-parent skill 使用新的 prompt 字段

### Component Versions

- agents: 1.10.0 → 1.10.2
- skills: 1.10.0 → 1.10.2

## [1.10.1] - 2025-12-28

### Fixed

- **capability_list 配置路径**: 修复在用户项目目录下无法找到 scenarioCapabilities.json 的问题

## [1.10.0] - 2025-12-28

### Added

- **派发系统优化**: 完整的任务派发流程重构
  - Review 机制：自动创建 spec/quality 审查节点
  - Skill 化：dispatching-parent、executing-task、reviewing-spec、reviewing-quality 四个核心 Skill
  - AI 引导增强：actionRequired 强制调用 Skill，防止跳过关键步骤
  - 约束增强：dispatch_complete 前必须 start，派发子节点不能再升级为母节点
  - 类型分离：NodeDispatchInfo（子节点）与 NodeDispatchParent（母节点）
- **Memo 引用富卡片展示**: 节点详情中 Memo 引用以卡片形式展示
- **用户入门引导文档**: 新增 `docs/用户入门引导.md`

### Fixed

- **Review 节点创建 Bug**: 修复 spec/quality 节点创建时的两个问题

### Changed

- **插件安装改为动态读取**: 不再硬编码文件列表，自动扫描目录
- **Agents 重写**: executor/reviewer/tester agent 说明更清晰，强调执行顺序和反模式
- **Skills description 格式**: 用途放在前面，便于 AI 理解

### Component Versions

- agents: 1.9.0 → 1.10.0
- skills: 1.9.0 → 1.10.0

## [1.9.2] - 2025-12-28

### Added

- **插件更新提示横幅**: 首页显示插件更新提示，引导用户升级
- **插件「不支持」状态**: 插件检测新增不支持状态，区分未安装和不可用
- **node_reorder 工具**: 支持调整同级节点顺序

### Fixed

- **节点角色徽章显示**: 修复徽章显示不完整问题
- **内部 node_create 规则验证**: 内部调用绕过规则验证

### Changed

- **版本更新工作区逻辑优化**: 改进版本升级时的工作区处理
- **README 重构**: 精简至 ~130 行，新增完整使用流程和跨仓库任务示例

## [1.9.1] - 2025-12-27

### Added

- **SSE 跨进程事件转发**: MCP 进程的事件可转发到 HTTP 服务，实现 WebUI 实时同步刷新
- **workspace_init 流程强化**: scenario 参数改为必填，actionRequired 强制调用 bootstrapping-workspace skill

### Fixed

- **目录名兼容性**: 修复旧版本工作区节点目录名无法正确加载的问题（shortId 提取逻辑修复 + 运行时兜底机制）
- **README logo 路径**: 修复 logo 图片路径错误

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
