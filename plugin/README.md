# TanmiWorkspace Plugin 系统

本目录包含 TanmiWorkspace 的插件资源，供 AI 代理在执行任务时使用。

## 目录结构

```
plugin/
├── agents/          # 代理定义
├── hooks/           # 钩子配置（已废弃）
├── scripts/         # 钩子脚本
└── skills/          # 技能定义
```

## Skills（技能）

Skills 是指导 AI 执行特定任务的 SOP（标准操作流程）文档。系统根据流程自动触发相应的 Skill，**用户无需手动调用**。

### 分类概览

| 大类 | 触发方式 | 数量 |
|------|----------|------|
| 流程引导 | actionRequired 强制触发 | 3 |
| 能力执行 | capability_select 创建能力节点 | 7 |
| 派发角色 | 派发系统分配角色 | 4 |

### 流程引导类（3 个）

在特定流程节点强制触发，引导 AI 完成流程。

| Skill | 触发场景 | 作用 |
|-------|----------|------|
| `bootstrapping-workspace` | workspace_init 后 | 引导工作区启动流程 |
| `dispatching-parent` | dispatch_node 后 | 协调派发执行流程 |
| `starting-info-flow` | 现有工作区中用户请求新任务 | 引导能力选择、创建信息节点 |

### 能力执行类（7 个）

与 `scenarioCapabilities.json` 中的 CapabilityId 一一对应，在创建能力节点时触发。

| CapabilityId | Skill | 说明 |
|--------------|-------|------|
| intent_alignment | `aligning-intent` | 意图对齐：澄清需求、确认验收标准 |
| context_discovery | `discovering-context` | 上下文发现：探索代码库、理解现有状态 |
| tech_research | `researching-tech` | 技术调研：评估技术选型、多维度比较 |
| diagnosis | `diagnosing-issues` | 问题诊断：追踪根因、分析错误和性能瓶颈 |
| measurement_analysis | `analyzing-measurements` | 度量分析：建立基准、对比数据、验证优化 |
| solution_design | `designing-solutions` | 方案设计：定义接口、数据结构、实现路径 |
| verification_strategy | `planning-verification` | 验证规划：设计测试用例、定义验收步骤 |

**场景分布**（basePack = 必选，optionalPack = 可选）：

| 场景 | basePack | optionalPack |
|------|----------|--------------|
| feature | intent_alignment, context_discovery | tech_research, solution_design, verification_strategy |
| summary | intent_alignment, context_discovery | - |
| optimize | intent_alignment, context_discovery, measurement_analysis | diagnosis, solution_design, verification_strategy |
| debug | intent_alignment, context_discovery, diagnosis | solution_design, verification_strategy |
| misc | intent_alignment | 全部可选 |

### 派发角色类（4 个）

在派发执行流程中，根据节点角色触发。

| Skill | 角色 | 作用 |
|-------|------|------|
| `preparing-dispatch` | 准备者 | 准备派发节点，拆分任务 |
| `executing-task` | dispatch_exec | 执行具体任务 |
| `reviewing-spec` | dispatch_spec | 规格审查，验证是否满足需求 |
| `reviewing-quality` | dispatch_quality | 质量审查，检查代码质量 |

## Agents（代理）

定义 Claude Code 的子代理行为规范。

| Agent | 用途 |
|-------|------|
| `tanmi-executor` | 任务执行代理，严格遵循 scope 执行任务 |
| `tanmi-reviewer` | 审查代理，执行规格审查和质量审查 |

## Scripts（脚本）

| 脚本 | 用途 |
|------|------|
| `hook-entry.cjs` | Claude Code 钩子入口脚本 |
| `cursor-hook-entry.cjs` | Cursor 钩子入口脚本 |
| `openspec-import.cjs` | OpenSpec 导入脚本 |
| `shared/` | 共享工具模块 |

## Skill 文件规范

每个 Skill 是一个 Markdown 文件，结构如下：

```markdown
---
name: skill-name
description: Use when [触发条件]. [能力说明]
---

# Skill Name

## Announcement (MANDATORY)
[执行前必须向用户宣布]

## Core Thinking
[核心思维模式]

## SOP
[标准操作流程]

## Checklist
[检查清单]

## Mandatory Rules
[强制规则]
```

### 命名规范

- 目录名：使用动名词形式 + 连字符（如 `aligning-intent`）
- 文件：`SKILL.md`

### 关键约束

1. **Recording**：对话输出对用户不可见，必须记录到工作区节点
2. **Progressive Recording**：长任务必须中途记录，防止上下文丢失
3. **Present before proceed**：完成后必须向用户展示结果，等待确认

## 相关配置

- `config/scenarioCapabilities.json` - 场景能力包配置
- `src/services/CapabilityService.ts` - CapabilityId 到 Skill 目录的映射
