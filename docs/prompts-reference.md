# TanmiWorkspace Prompts 参考文档

本文档描述 TanmiWorkspace 中用于指导 AI 行为的 prompts 结构和用途。

## 文件结构

```
src/prompts/
├── index.ts        # 模块导出
└── instructions.ts # Prompt 内容定义
```

## Prompt 模块概览

| 导出名称 | 类型 | 用途 | 使用场景 |
|---------|------|------|----------|
| `SYSTEM_OVERVIEW` | string | 系统概述 | AI 首次连接、tanmi_help("overview") |
| `CORE_WORKFLOW` | string | 核心工作流程 | tanmi_prompt、tanmi_help("workflow") |
| `TOOLS_QUICK_REFERENCE` | string | 工具速查表 | tanmi_prompt、tanmi_help("tools") |
| `SCENARIO_GUIDES` | Record | 场景化指导 | tanmi_help(场景名) |
| `USER_PROMPTS` | object | 用户话术模板 | AI 生成用户交互文本 |
| `HELP_TOPICS` | Record | 帮助主题映射 | tanmi_help 工具 |
| `getFullInstructions()` | function | 获取完整指令 | tanmi_prompt 工具 |

## 详细说明

### 1. SYSTEM_OVERVIEW

系统概述，介绍 TanmiWorkspace 的核心价值和 AI 角色定位。

**内容要点：**
- 系统是什么：分形任务跟踪系统
- 核心价值：分形结构、聚焦上下文、过程可追溯、动态管理、可视化界面
- Web UI 说明
- AI 角色定义

### 2. CORE_WORKFLOW

核心工作流程，描述创建工作区、节点管理、状态流转等关键流程。

**主要章节：**
1. 创建工作区流程
2. 节点类型与执行流程
   - 执行节点流程
   - 规划节点流程
   - 禁止跳步行为
3. **actionRequired 必须执行指令**（v1.0 新增）
4. 结论记录原则
5. 状态流转规则
6. 任务分解原则

### 3. TOOLS_QUICK_REFERENCE

工具速查表，提供所有 MCP 工具的快速参考。

**工具分类：**
- 工作区管理：workspace_init, workspace_list, workspace_get, workspace_delete, workspace_status
- 节点管理：node_create, node_get, node_list, node_update, node_delete
- 状态转换：node_transition (执行节点/规划节点)
- 上下文管理：context_get, context_focus, node_isolate, node_reference
- 日志与问题：log_append, problem_update, problem_clear

### 4. SCENARIO_GUIDES

场景化指导，为特定场景提供详细的操作指南。

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

### 5. USER_PROMPTS

用户话术模板，提供 AI 与用户交互的标准话术。

| 模板名 | 用途 |
|--------|------|
| `welcome` | 首次使用欢迎语 |
| `confirmWorkspace(name, goal)` | 确认创建工作区 |
| `confirmPlan(tasks)` | 确认任务计划 |
| `statusReport(status, current, problem?)` | 状态报告 |
| `completionReport(conclusion, outputs)` | 完成报告 |

### 6. HELP_TOPICS

tanmi_help 工具的帮助主题映射，将主题名映射到对应的内容。

**可用主题：**
- `overview` → SYSTEM_OVERVIEW
- `workflow` → CORE_WORKFLOW
- `tools` → TOOLS_QUICK_REFERENCE
- `start` → SCENARIO_GUIDES["start_task"]
- `resume` → SCENARIO_GUIDES["resume_task"]
- `session_restore` → SCENARIO_GUIDES["session_restore"]
- `blocked` → SCENARIO_GUIDES["task_blocked"]
- `split` → SCENARIO_GUIDES["split_task"]
- `complete` → SCENARIO_GUIDES["complete_task"]
- `progress` → SCENARIO_GUIDES["check_progress"]
- `guide` → SCENARIO_GUIDES["user_guide"]
- `docs` → SCENARIO_GUIDES["docs_management"]

### 7. getFullInstructions()

返回完整的 AI 指令，包含：
- SYSTEM_OVERVIEW
- CORE_WORKFLOW
- TOOLS_QUICK_REFERENCE
- 重要原则（10 条）
- tanmi_help 使用说明

## actionRequired 机制（v1.0 新增）

当 MCP 工具返回值包含 `actionRequired` 字段时，AI **必须**执行指定行为。

### 类型定义

```typescript
type ActionRequiredType =
  | "ask_user"      // 询问用户
  | "show_plan"     // 展示计划并等待确认
  | "check_docs";   // 提醒检查文档更新

interface ActionRequired {
  type: ActionRequiredType;
  message: string;                  // 给 AI 的指令说明
  data?: Record<string, unknown>;   // 附加数据
}
```

### 触发场景

| type | 触发工具 | 触发条件 | AI 必须做什么 |
|------|---------|---------|---------------|
| `ask_user` | workspace_init | 项目无文档 | 询问用户是否有需求/设计/API 文档 |
| `show_plan` | node_create | 在根节点下创建非信息收集的子节点 | 向用户展示计划，等待确认后再执行 |
| `check_docs` | node_transition | 执行节点完成且有文档引用 | 向用户确认文档是否需要更新 |

### 相关文件

- 类型定义：`src/types/workspace.ts` (ActionRequired, ActionRequiredType)
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

1. 在 `src/types/workspace.ts` 的 `ActionRequiredType` 中添加新类型
2. 在相应的 Service 中添加触发逻辑
3. 在 `CORE_WORKFLOW` 的 actionRequired 章节添加说明
4. 更新本文档

### 修改工作流程

1. 修改 `CORE_WORKFLOW` 中的相关章节
2. 同步更新相关的 `SCENARIO_GUIDES`
3. 确保 `getFullInstructions()` 包含最新内容
