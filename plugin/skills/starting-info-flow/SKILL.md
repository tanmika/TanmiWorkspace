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

### 5. Execute Capability Tasks (CRITICAL)

**capability_select 返回 `actionRequired`，MUST 遵循其指示调用 Skill。**

```
capability_select 返回
    ↓
actionRequired: { type: "invoke_skill", skills: [...] }
    ↓
Skill(aligning-intent)  ← 第一个能力
    ↓
node_transition(action="start")
    ↓
按 Skill SOP 执行
    ↓
node_transition(action="complete")
    ↓
Skill(discovering-context)  ← 下一个能力
    ↓
...重复...
```

**执行规则**：

| 步骤 | 动作 | 说明 |
|------|------|------|
| 1 | `Skill(xxx)` | 调用对应 Skill 获取 SOP |
| 2 | `node_transition(action="start")` | 启动节点 |
| 3 | 按 SOP 执行 | 遵循 Skill 的 SOP 步骤 |
| 4 | `node_transition(action="complete")` | 完成节点 |

**⚠️ 禁止事项**：
- **NEVER** 跳过 Skill 调用直接 node_transition start
- **NEVER** 在信息收集/总结阶段修改任何代码
- **NEVER** 在能力节点中执行 Write/Edit/Update 操作

**信息收集/总结阶段的职责边界**：

| 允许 | 禁止 |
|------|------|
| Read、Search、Grep、Glob | Write、Edit、Update |
| 分析代码、理解结构 | 修改代码、创建文件 |
| 记录发现到 conclusion | 直接实现功能 |
| 提出方案建议 | 执行方案 |

**为什么必须调用 Skill？**
- Skill 包含该能力的 SOP（标准操作流程）
- Skill 定义了正确的执行步骤和检查清单
- 不读 Skill = 不知道该能力的正确做法

## Mandatory Rules

1. **MUST call capability_list first** - Get available capabilities for this scenario
2. **MUST show user and ask** - Never decide capabilities alone
3. **MUST use capability_select** - Never node_create info nodes directly
4. **MUST include all basePack** - selected must contain all basePack capabilities
5. **MUST choose correct infoType** - Based on task nature (collect vs summarize)
6. **MUST call Skill before node_transition start** - 每个能力节点启动前必须先调用对应 Skill
7. **NEVER modify code in info phase** - 信息收集/总结阶段禁止 Write/Edit/Update
8. **MUST follow Skill SOP** - Skill 定义了正确的执行流程，必须遵循

## Red Flags

1. **Direct node_create for info tasks** - Should use capability flow
2. **Skip user confirmation** - Decide capabilities without asking
3. **Wrong infoType** - Using collection when summary is appropriate
4. **Partial basePack** - Missing required capabilities from basePack
5. **Skip capability Skill** - Complete capability_select but not call the Skill
6. **Skip Skill, direct node_transition** - 没调用 Skill 就直接启动节点 ⚠️ 严重错误
7. **Write/Edit in info phase** - 在信息收集/总结阶段修改代码 ⚠️ 严重错误
8. **Ignore actionRequired** - capability_select 返回的 actionRequired 被忽略

## Anti-Patterns

| Wrong | Right |
|-------|-------|
| `node_create(role="info_collection")` | `capability_list` → `capability_select` |
| Decide all capabilities yourself | Show user and ask for selection |
| Always use info_collection | Match infoType to task nature |
| Skip the returned Skill list | Call each Skill in order |
| node_transition start without Skill | Skill(xxx) first, then node_transition |
| Write/Edit in info_collection node | Only Read/Search, record to conclusion |
| Ignore actionRequired from capability_select | Follow actionRequired instructions exactly |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "User already knows what they want" | User may not know all capability options | Show capabilities and ask |
| "node_create is faster" | Loses Skill guidance and structure | Use capability flow |
| "info_collection covers everything" | Wrong type wastes exploration effort | Match task nature |
| "I'll just start working" | Skipping capability flow loses guidance | Follow the SOP |
| "I know what to do, don't need Skill" | Skill 定义了正确流程，你可能遗漏关键步骤 | 必须先调用 Skill 获取 SOP |
| "Just a quick fix while exploring" | 信息收集阶段禁止修改，会破坏职责边界 | 记录发现，创建执行节点后再修改 |
| "The change is obvious, no need for execution node" | 所有修改必须在执行节点中进行，确保可追踪 | 创建执行节点，按流程执行 |
