---
name: starting-info-flow
description: Use when user requests research, analysis, or summary in an existing workspace. Guides capability-based info node creation.
---

# Starting Info Flow

## When to Use

User says things like:
- "我想实现一下 xxx"
- "帮我调研一下 xxx"
- "分析一下这个问题"
- "总结一下 xxx"
- "研究一下 xxx 的实现"
- "整理一下目前的讨论"

In an **existing workspace**, when user wants to start a new info collection or summary task.

## Core Flow

```
User requests research/analysis
    ↓
capability_list()  ← Get recommended capabilities
    ↓
Show user and ask for selection
    ↓
capability_select(infoType=?, selected=[...])  ← Create info node + capability children
    ↓
Execute capability tasks (call corresponding Skill)
```

## SOP

### 1. Identify Task Type

| User Request | infoType |
|--------------|----------|
| 调研、探索、研究、分析问题、排查 | `info_collection` |
| 总结、整理、提炼、归纳、梳理 | `info_summary` |

**Decision rule**:
- Need to **actively explore** codebase/docs → `info_collection`
- Need to **organize existing info** from conversation → `info_summary`

### 2. Call capability_list

Get capabilities for the workspace scenario:

```typescript
capability_list({ workspaceId: "ws-xxx" })  // Uses workspace's scenario
```

**Returns**:
- `basePack`: Required capabilities (**ALL must be selected**)
- `optionalPack`: Optional capabilities (user chooses)

### 3. Show User and Ask for Selection

**Template**:
```
要进行「{用户目标}」，这是一个**{收集/总结}**任务。

我将执行以下能力：
- **{能力名}**: {在此任务语境下的具体作用}
- **{能力名}**: {在此任务语境下的具体作用}

还可以选择：
  a. **{能力名}** - {语境下描述}
  b. **{能力名}** - {语境下描述}

需要添加哪些？（输入序号如 a、ab，或回车跳过）
```

**Rules**:
- basePack: 直接说"我将执行"，不问用户
- optionalPack: 用 **abc 序号**，方便用户输入
- 描述: **根据任务语境定制**，不用通用描述
- **MUST** wait for user response before capability_select

### 4. Call capability_select

```typescript
capability_select({
  workspaceId: "ws-xxx",
  infoType: "info_collection",  // or "info_summary"
  selected: ["intent_alignment", "context_discovery", ...]
})
```

**Returns**: `actionRequired` with Skill list for each capability.

### 5. Execute Capability Tasks

`capability_select` returns skills to execute:

```
- Skill(discovering-context) → 节点「上下文探索」
- Skill(designing-solutions) → 节点「方案设计」
```

Call each Skill **in order** to complete the tasks.

## Mandatory Rules

1. **MUST call capability_list first** - Get available capabilities for this scenario
2. **MUST show user and ask** - Never decide capabilities alone
3. **MUST use capability_select** - Never node_create info nodes directly
4. **MUST include all basePack** - selected must contain all basePack capabilities
5. **MUST choose correct infoType** - Based on task nature (collect vs summarize)

## Red Flags

1. **Direct node_create for info tasks** - Should use capability flow
2. **Skip user confirmation** - Decide capabilities without asking
3. **Wrong infoType** - Using collection when summary is appropriate
4. **Partial basePack** - Missing required capabilities from basePack
5. **Skip capability Skill** - Complete capability_select but not call the Skill

## Anti-Patterns

| Wrong | Right |
|-------|-------|
| `node_create(role="info_collection")` | `capability_list` → `capability_select` |
| Decide all capabilities yourself | Show user and ask for selection |
| Always use info_collection | Match infoType to task nature |
| Skip the returned Skill list | Call each Skill in order |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "User already knows what they want" | User may not know all capability options | Show capabilities and ask |
| "node_create is faster" | Loses Skill guidance and structure | Use capability flow |
| "info_collection covers everything" | Wrong type wastes exploration effort | Match task nature |
| "I'll just start working" | Skipping capability flow loses guidance | Follow the SOP |
