# TanmiWorkspace Prompts 参考文档

本文档描述 TanmiWorkspace 中用于指导 AI 行为的 prompts 结构和用途。

## 文件结构

```
src/prompts/
├── index.ts          # 模块导出
├── instructions.ts   # Prompt 内容定义
└── guidanceContent.ts # 层级引导内容配置
```

## Prompt 模块概览

### instructions.ts

| 导出名称 | 类型 | 用途 | 使用场景 |
|---------|------|------|----------|
| `CRITICAL_PROTOCOLS` | string | 关键协议（最高优先级） | tanmi_prompt（置顶） |
| `SYSTEM_OVERVIEW` | string | 系统概述 | AI 首次连接、tanmi_help("overview") |
| `CORE_WORKFLOW` | string | 核心工作流程 | tanmi_prompt、tanmi_help("workflow") |
| `TOOLS_QUICK_REFERENCE` | string | 工具速查表 | tanmi_prompt、tanmi_help("tools") |
| `SCENARIO_GUIDANCE` | Record | 任务场景指导（按 TaskScenario） | workspace_init 后的引导 |
| `SCENARIO_GUIDES` | Record | 场景化指导（详细） | tanmi_help(场景名) |
| `USER_PROMPTS` | object | 用户话术模板 | AI 生成用户交互文本 |
| `SERVER_STATUS_GUIDE` | string | 服务器状态指南 | tanmi_help("server") |
| `HELP_TOPICS` | Record | 帮助主题映射 | tanmi_help 工具 |
| `getFullInstructions()` | function | 获取完整指令 | tanmi_prompt 工具 |
| `getScenarioGuidance()` | function | 获取任务场景指导 | workspace_init |

### guidanceContent.ts

| 导出名称 | 类型 | 用途 |
|---------|------|------|
| `GUIDANCE_CONFIGS` | Record | 层级引导内容配置（L0/L1/L2） |
| `getGuidanceConfig()` | function | 获取指定场景的引导配置 |
| `taskScenarioToGuidance()` | function | 任务场景到引导场景的映射 |

## 详细说明

### 0. CRITICAL_PROTOCOLS

关键协议，最高优先级指令，AI 必须无条件遵守。

**包含 5 项关键协议：**
1. actionRequired 必须立即执行
2. workspace_init 后必须告知 webUrl
3. 根节点 start 前必须完成信息收集
4. 禁止跳步
5. 子节点不继承文档（必须显式派发）

### 1. SYSTEM_OVERVIEW

系统概述，介绍 TanmiWorkspace 的核心价值和 AI 角色定位。

**内容要点：**
- 系统是什么：分形任务跟踪系统
- 核心价值：分形结构、聚焦上下文、过程可追溯、动态管理、可视化界面
- Web UI 说明 + **边界说明**（AI 无法看到/控制浏览器）
- AI 角色定义

### 2. CORE_WORKFLOW

核心工作流程，描述创建工作区、节点管理、状态流转等关键流程。

**主要章节：**
1. 创建工作区流程
2. 节点类型与执行流程
   - 执行节点流程（含 context_get 建议）
   - 规划节点流程
   - 禁止跳步行为
3. **工具调用错误处理**（5 步策略）
4. **actionRequired 必须执行指令**
5. 结论记录原则
6. 状态流转规则
7. 任务分解原则

### 3. TOOLS_QUICK_REFERENCE

工具速查表，提供所有 MCP 工具的快速参考。

**工具分类：**
- 工作区管理：workspace_init, workspace_list, workspace_get, workspace_delete, workspace_archive, workspace_restore, workspace_health
- 节点管理：node_create, node_get, node_list, node_update, node_delete, node_move, node_reorder
- 状态转换：node_transition (执行节点/规划节点)
- 上下文管理：context_get, context_focus, node_isolate, node_reference
- 日志与问题：log_append, problem_update, problem_clear
- 派发工具：dispatch_enable, dispatch_disable, dispatch_node, dispatch_create, dispatch_complete
- 备忘工具：memo_create, memo_list, memo_get, memo_update, memo_delete
- 能力包工具：capability_list, capability_select, plugin_path
- 搜索工具：workspace_search, content_search
- 配置工具：config_get, config_set
- 会话工具：session_bind, session_unbind, session_status, get_pending_changes

### 4. SCENARIO_GUIDANCE

按任务场景类型（TaskScenario）分类的引导内容。

| 场景 | 说明 |
|------|------|
| `feature` | 功能开发场景指导 |
| `summary` | 文档总结场景指导 |
| `optimize` | 性能优化场景指导 |
| `debug` | 问题调试场景指导 |
| `misc` | 杂项场景指导 |

### 5. SCENARIO_GUIDES

详细的场景化指导。

| 场景 Key | 场景名称 | 说明 |
|---------|---------|------|
| `start_task` | 开始新任务 | 从用户提出需求到创建工作区、信息收集、展示计划的完整流程 |
| `resume_task` | 继续任务 | 恢复之前中断的任务 |
| `session_restore` | 会话恢复 | 从摘要恢复时的 ID 验证流程 |
| `task_blocked` | 任务受阻 | 遇到问题时的处理流程 |
| `split_task` | 分解任务 | 规划节点分解任务和执行节点回退的流程 |
| `complete_task` | 完成任务 | 节点完成时的操作流程 |
| `check_progress` | 查看进度 | 获取和展示工作区状态 |
| `docs_management` | 文档管理 | 文档引用的管理和派发机制 |
| `user_guide` | 用户引导 | 向不熟悉系统的用户介绍 |
| `reopen_task` | 重开任务 | 重开节点/追加需求时的处理流程 |
| `dispatch_guide` | 派发指南 | 派发模式的使用流程 |

### 6. USER_PROMPTS

用户话术模板，提供 AI 与用户交互的标准话术。

| 模板名 | 用途 |
|--------|------|
| `welcome` | 首次使用欢迎语 |
| `confirmWorkspace(name, goal)` | 确认创建工作区 |
| `confirmPlan(tasks)` | 确认任务计划 |
| `statusReport(status, current, problem?)` | 状态报告 |
| `completionReport(conclusion, outputs)` | 完成报告 |

### 7. SERVER_STATUS_GUIDE

服务器状态指南，提供端口检查、CLI 命令、常见问题排查等信息。

### 8. HELP_TOPICS

tanmi_help 工具的帮助主题映射。

**可用主题：**
- `overview` → 系统概述
- `workflow` → 核心工作流程
- `tools` → 工具速查表
- `start` → 开始新任务
- `resume` → 继续任务
- `session_restore` → 会话恢复
- `blocked` → 任务受阻
- `split` → 分解任务
- `complete` → 完成任务
- `progress` → 查看进度
- `guide` → 用户引导
- `docs` → 文档管理
- `dispatch` → 派发模式
- `status` → 安装状态
- `server` → 服务器状态
- `all` → 完整指南

### 9. getFullInstructions()

返回完整的 AI 指令，包含（按顺序）：
1. **CRITICAL_PROTOCOLS**（最高优先级，置顶）
2. SYSTEM_OVERVIEW
3. CORE_WORKFLOW
4. TOOLS_QUICK_REFERENCE
5. 工作原则（精简版）
6. 获取帮助（tanmi_help 强化提示）

## 层级引导系统 (Guidance)

### 引导级别

| 级别 | 说明 | 内容长度 |
|------|------|---------|
| L0 | 简短提示 | 1-2 句话，嵌入 hint |
| L1 | 工作流片段 | 3-5 个要点 |
| L2 | 完整指南 | 详细说明含示例 |

### 引导场景 (GuidanceScenario)

```typescript
type GuidanceScenario =
  // 工作区相关
  | "workspace_init"
  | "workspace_first_planning"
  | "workspace_archived"
  // 任务场景
  | "scenario_feature"
  | "scenario_summary"
  | "scenario_optimize"
  | "scenario_debug"
  // 节点创建
  | "node_create_planning"
  | "node_create_execution"
  | "node_create_info_collection"
  // 状态转换
  | "execution_start"
  | "execution_complete"
  | "planning_start"
  | "planning_monitoring"
  // 特殊行为
  | "actionRequired_triggered"
  | "confirmation_required"
  // 错误场景
  | "error_invalid_transition"
  | "error_workspace_not_found";
```

## actionRequired 机制

当 MCP 工具返回值包含 `actionRequired` 字段时，AI **必须**执行指定行为。

### 类型定义

```typescript
type ActionRequiredAction =
  | "ask_user"               // 询问用户
  | "show_plan"              // 展示计划并等待确认
  | "confirm_reopen"         // 确认 reopen
  | "confirm_create_child"   // 确认创建子节点
  | "report_and_return"      // 汇报并返回
  | "sync_conclusion"        // 同步结论
  | "invoke_skill";          // 调用 Skill

interface ActionRequired {
  action: ActionRequiredAction;
  message: string;
  confirmationToken?: string;
  data?: Record<string, unknown>;
}
```

### 触发场景

| action | 触发工具 | 触发条件 | AI 必须做什么 |
|--------|---------|---------|---------------|
| `ask_user` | workspace_init | 项目无文档 | 询问用户是否有需求/设计/API 文档 |
| `show_plan` | node_create | 在根节点下创建非信息收集的子节点 | 向用户展示计划，等待确认后再执行 |
| `confirm_reopen` | node_transition | reopen 且有子节点 | 先查看现有结构，评估是否调整现有节点 |
| `report_and_return` | node_transition | 派发子节点完成 | 汇报结果给母节点 |
| `sync_conclusion` | node_transition | 结论过期 | 同步更新结论 |
| `invoke_skill` | node_create, capability_select | info 节点创建 | 调用指定的 Skill |

### 相关文件

- 类型定义：`src/types/workspace.ts` (ActionRequired, ActionRequiredAction)
- 类型定义：`src/types/node.ts` (NodeCreateResult, NodeTransitionResult)
- workspace_init 逻辑：`src/services/WorkspaceService.ts`
- node_create 逻辑：`src/services/NodeService.ts`
- node_transition 逻辑：`src/services/StateService.ts`

## 使用方式

### tanmi_prompt 工具

返回 `getFullInstructions()` 的完整内容，用于 AI 获取完整操作指南。

```typescript
// 用户调用
tanmi_prompt()

// 返回
{ content: getFullInstructions() }
```

### tanmi_help 工具

返回特定主题的帮助内容。

```typescript
// 用户调用
tanmi_help({ topic: "start" })

// 返回
{
  title: "如何开始新任务",
  content: SCENARIO_GUIDES["start_task"]
}

// 获取所有内容
tanmi_help({ topic: "all" })
```

## 维护指南

### 添加新场景

1. 在 `SCENARIO_GUIDES` 中添加新的场景内容
2. 在 `HELP_TOPICS` 中添加对应的映射
3. 更新 `getFullInstructions()` 末尾的可用主题列表

### 添加新的 actionRequired 类型

1. 在 `src/types/workspace.ts` 的 `ActionRequiredAction` 中添加新类型
2. 在相应的 Service 中添加触发逻辑
3. 在 `CORE_WORKFLOW` 的 actionRequired 章节添加说明
4. 更新本文档

### 添加新的引导场景

1. 在 `src/types/guidance.ts` 的 `GuidanceScenario` 中添加新类型
2. 在 `guidanceContent.ts` 的 `GUIDANCE_CONFIGS` 中添加 L0/L1/L2 内容
3. 在相应的 Service 中调用 `GuidanceService.generate()`

### 修改工作流程

1. 修改 `CORE_WORKFLOW` 中的相关章节
2. 同步更新相关的 `SCENARIO_GUIDES`
3. 确保 `getFullInstructions()` 包含最新内容
