---
name: bootstrapping-workspace
description: Guides TanmiWorkspace startup flow after workspace_init. Use when workspace is created and needs capability selection and info node setup.
---

# Bootstrapping Workspace

## Core Flow

```
workspace_init(scenario=?)
    ↓
capability_list()  ← Get recommended capabilities
    ↓
capability_select(infoType=?, selected=[...])  ← Create info node + capability children
    ↓
Execute capability tasks
```

## SOP

### 1. Tell User WebUI URL

The `webUrl` from workspace_init is the visualization interface. **MUST tell user**.

```
webUrl: http://localhost:port/workspace/ws-xxx
```

### 2. Call capability_list

Get recommended capabilities for the scenario:

```typescript
capability_list({ scenario: "feature" })  // Pass scenario type
```

**Returns**:
- `basePack`: Required capabilities (**ALL must be selected**)
- `optionalPack`: Optional capabilities (user chooses)

### 3. Show User and Ask for Selection

**MUST** show capability list to user in natural dialogue:

**Template**:
```
当前任务是「{用户目标}」，属于 **{scenario}** 场景。

我将执行以下能力：
- **{能力名}**: {在此任务语境下的具体作用}
- **{能力名}**: {在此任务语境下的具体作用}

除此之外，还可以选择：
  a. **{能力名}** - {语境下描述}
  b. **{能力名}** - {语境下描述}
  c. **{能力名}** - {语境下描述}

💡 推荐：{基于具体任务的推荐理由}

需要添加哪些？（输入序号如 a、ab，或回车跳过）
```

**Example** (optimize scenario):
```
当前任务是「优化派发模式」，属于 **optimize** 场景。

我将执行以下能力：
- **意图对齐**: 明确你想优化的具体方面和期望效果
- **上下文探索**: 分析当前派发模式的实现和依赖
- **度量分析**: 建立当前性能基准，量化优化效果

除此之外，还可以选择：
  a. **诊断分析** - 深入分析现有问题的根因
  b. **方案设计** - 设计具体的优化方案
  c. **验证策略** - 制定测试用例确保优化有效

💡 推荐：b（方案设计），研究优化通常需要输出具体方案

需要添加哪些？（输入序号如 a、ab，或回车跳过）
```

**Rules**:
- basePack: 直接说"我将执行"，不问用户
- optionalPack: 用 **abc 序号**，方便用户输入
- 描述: **根据任务语境定制**，不用通用描述
- 推荐: 基于具体任务给出理由
- **MUST** wait for user response before capability_select

### 4. Call capability_select

Select capabilities and create info node:

```typescript
capability_select({
  workspaceId: "ws-xxx",
  infoType: "info_collection",  // or "info_summary"
  selected: ["intent_alignment", "context_discovery"]
})
```

**infoType Selection**:

| Type | Use When | Action |
|------|----------|--------|
| `info_collection` | Need active research: scan project, read docs | Read, explore, collect |
| `info_summary` | Have info to organize: extract from conversation | Summarize, extract |

### 5. Execute Capability Tasks

Read corresponding Skill for SOP guidance.

## Scenario-Capability Mapping

| scenario | basePack | optionalPack |
|----------|----------|--------------|
| feature | intent_alignment, context_discovery | tech_research, solution_design, verification_strategy |
| debug | intent_alignment, context_discovery, diagnosis | solution_design, verification_strategy |
| optimize | intent_alignment, context_discovery, measurement_analysis | diagnosis, solution_design, verification_strategy |
| summary | intent_alignment, context_discovery | - |
| misc | intent_alignment | context_discovery, tech_research, measurement_analysis, diagnosis, solution_design, verification_strategy |

## Mandatory Rules

1. **NEVER skip capability_list** - Must get capability list first
2. **NEVER manually node_create info node** - Must use capability_select
3. **MUST tell user webUrl** - Only entry for user to view progress
4. **MUST choose correct infoType** - Based on task nature
5. **MUST show capabilities to user** - Ask for confirmation, never decide alone
6. **MUST include all basePack** - selected must contain all basePack capabilities

## Anti-Patterns

| Wrong | Right |
|-------|-------|
| node_create after workspace_init | capability_list first, then capability_select |
| Skip capabilities, start task | Follow capability SOP |
| Forget to tell webUrl | Tell user immediately |
| Always use info_collection | Choose collection/summary based on scenario |
| Decide capabilities yourself | Show user and ask |
| Only include partial basePack | Include ALL basePack |
