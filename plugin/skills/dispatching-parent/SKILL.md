---
name: dispatching-parent
description: Use when your node has been upgraded to a dispatch parent via dispatch_node. Coordinates dispatch execution flow as a parent orchestrator.
---

# Dispatching Parent

## ⚠️ CRITICAL: Complete the Full Flow

**YOU MUST COMPLETE THE ENTIRE DISPATCH FLOW:**
1. Dispatch exec node → Wait for result
2. **Dispatch spec node** → Wait for result (DO NOT SKIP!)
3. (Optional) Dispatch quality node
4. Complete parent node

**NEVER stop after exec completes. ALWAYS dispatch spec for verification.**

---

## Core Thinking

**Orchestrate** - You are no longer an executor. You coordinate subagents, analyze results, and make decisions based on their outcomes.

## Role Transition

When `dispatch_node` upgrades your node:
- **Before**: execution node (do the work yourself)
- **After**: planning node (orchestrate subagents to do the work)

Your responsibilities shift from implementation to:
- Preparing clear requirements for subagents
- Dispatching tasks via Task tool
- Analyzing execution results
- Handling failures with context enrichment
- Summarizing outcomes for the parent node

## Dispatch Flow Overview

```
dispatch_node (upgrade)
    |
    v
dispatch_create (create children: exec + spec + [quality])
    |
    v
Dispatch exec node (Task tool + tanmi-executor)
    |
    v
Handle exec result
    |-- Success --> Dispatch spec node (Task tool + tanmi-tester)
    |-- Failure --> Analyze, enrich context, retry or escalate
    |
    v
Handle spec result
    |-- Pass --> (Optional) Dispatch quality node
    |-- Fail --> Analyze, fix requirements, re-dispatch exec
    |
    v
(Optional) Handle quality result
    |
    v
Summarize all results --> Complete parent node
```

## SOP

### 1. Prepare Dispatch Children

**Goal**: Create well-defined child nodes for execution and review.

**Call dispatch_create**:
```typescript
dispatch_create({
  workspaceId: "...",
  parentId: "[current-node-id]",  // Your node ID
  exec: {
    requirement: "[Clear, specific task description]",
    acceptanceCriteria: [
      { when: "[condition]", then: "[expected result]" },
      // ... more criteria
    ]
  },
  includeQuality: true  // Optional, default true
})
```

**Requirement writing principles**:
- Be specific about WHAT to change
- List affected files explicitly
- Define technical approach if constrained
- State what NOT to do (constraints)

**Acceptance criteria principles**:
- Each criterion must be independently verifiable
- Cover main functionality
- Include edge cases and error scenarios
- Use WHEN/THEN format

**Output**: Created child nodes (execId, specId, qualityId)

### 2. Dispatch Exec Node

**Goal**: Execute the implementation task via subagent.

**Use Task tool**:
```typescript
Task({
  subagent_type: "tanmi-executor",
  description: "执行派发任务",
  prompt: actionRequired.data.prompt  // 完整复制 dispatch_create 返回的 prompt
})
```

**Important**:
- Pass the COMPLETE prompt from `actionRequired.data.prompt`
- Do NOT modify or simplify the prompt
- Wait for Task completion before proceeding

**Output**: Exec node execution result (success/failure with conclusion)

### 3. Handle Exec Result

**Goal**: Process execution outcome and determine next steps.

**On Success**:
- Log success: "exec node completed successfully"
- Proceed to dispatch spec node

**On Failure**:
- Analyze the failure reason from conclusion
- Categorize failure type:
  - `info_insufficient`: Missing information
  - `scope_too_large`: Task needs splitting
  - `execution_error`: Technical error
  - `blocked`: External dependency

**Failure handling strategies**:

| Failure Type | Action |
|--------------|--------|
| `info_insufficient` | Enrich requirement, add references, retry |
| `scope_too_large` | Split into smaller tasks (recreate children) |
| `execution_error` | Analyze root cause, adjust approach, retry |
| `blocked` | Escalate to user for resolution |

**Retry logic**:
- Maximum 3 attempts per exec node
- Each retry should ADD context, not replace
- Log what was added for each retry

**Output**: Decision to proceed or retry/escalate

### 4. Dispatch Spec Node

**Goal**: Verify execution meets requirements.

**Build spec prompt**:
```typescript
// 读取 spec 节点信息构建 prompt
const specNode = await node_get({ workspaceId, nodeId: specId });

// 使用 Task 工具派发
Task({
  subagent_type: "tanmi-reviewer",
  description: "规格审查",
  prompt: `# Spec Review Task

**Workspace**: ${workspaceId}
**Node ID**: ${specId}
**Target**: ${execId}

## Requirement
${specNode.requirement}

## Acceptance Criteria
${specNode.acceptanceCriteria.map(c => `- WHEN ${c.when} THEN ${c.then}`).join('\n')}

## Instructions
1. Review the execution result against acceptance criteria
2. Verify INDEPENDENTLY - do not trust exec's conclusion
3. Call dispatch_complete with success=true if ALL criteria pass
4. Call dispatch_complete with success=false if ANY criterion fails
`
})
```

**Key points**:
- Spec review is INDEPENDENT verification
- Spec does NOT trust exec's conclusion
- Spec verifies against original requirements

**Output**: Spec review result (pass/fail with findings)

### 5. Handle Spec Result

**Goal**: Process review outcome.

**On Pass**:
- Log success
- Decide whether to dispatch quality review
- If no quality review needed, proceed to completion

**On Fail**:
- Analyze spec findings
- Identify what was missed/wrong
- Update requirements with clarifications
- Re-dispatch exec node
- Do NOT simply retry with same requirements

**Output**: Decision to proceed, retry exec, or escalate

### 6. Dispatch Quality Node (Optional)

**Goal**: Verify code quality and best practices.

**When to include**:
- Complex implementations
- Critical code paths
- New patterns being introduced
- User explicitly requested

**When to skip**:
- Simple bug fixes
- Configuration changes
- Documentation updates

**Output**: Quality review result

### 7. Complete Parent Node

**Goal**: Summarize all outcomes and finalize.

**Compile conclusion**:
```
## Dispatch Summary

**Exec**: [execId] - [status]
**Spec**: [specId] - [status]
**Quality**: [qualityId] - [status] (if applicable)

## What Was Done
- [Summary of implementation]

## Files Changed
- [List of files modified]

## Verification
- Spec Review: [PASS/FAIL]
- Quality Review: [PASS/FAIL/SKIPPED]

## Notes
- [Any observations for parent node]
```

**Call node_transition**:
```typescript
node_transition({
  workspaceId: "...",
  nodeId: "[your-node-id]",
  action: "complete",
  conclusion: "[compiled conclusion]"
})
```

## Checklist

### Preparation
- [ ] Requirements are clear and specific
- [ ] Acceptance criteria cover key scenarios
- [ ] dispatch_create called successfully
- [ ] All child node IDs recorded

### Execution
- [ ] Exec node dispatched with complete prompt
- [ ] Exec result analyzed
- [ ] Failures handled appropriately

### Verification
- [ ] Spec node dispatched
- [ ] Spec result analyzed
- [ ] Quality node dispatched (if needed)

### Completion
- [ ] All child nodes processed
- [ ] Conclusion compiled
- [ ] Parent node completed

## Failure Handling Decision Tree

```
Failure received
    |
    ├── Is it info_insufficient?
    |       Yes --> Can you provide more context?
    |               Yes --> Add context, retry
    |               No  --> Escalate to user
    |
    ├── Is it scope_too_large?
    |       Yes --> Can you split the task?
    |               Yes --> Create new smaller children
    |               No  --> Escalate to user
    |
    ├── Is it execution_error?
    |       Yes --> Is root cause understood?
    |               Yes --> Adjust approach, retry
    |               No  --> Escalate to user
    |
    └── Is it blocked?
            Yes --> Escalate to user immediately
```

## Context Enrichment Strategies

When retrying after failure:

1. **Add missing references**
   ```typescript
   node_reference({
     nodeId: "[exec-node-id]",
     targetPath: "[relevant-file]",
     action: "add",
     description: "[why this helps]"
   })
   ```

2. **Update requirement with clarifications**
   ```typescript
   node_update({
     workspaceId: "...",
     nodeId: "[exec-node-id]",
     requirement: "[original requirement]\n\n## Additional Context\n[new info]"
   })
   ```

3. **Add note for specific guidance**
   ```typescript
   node_update({
     workspaceId: "...",
     nodeId: "[exec-node-id]",
     note: "[specific hints for the executor]"
   })
   ```

## Recording to Workspace

**Principle**: Log decisions and state transitions for traceability.

### What to Log

| Event | Log Entry |
|-------|-----------|
| Children created | "Created dispatch children: exec=[id], spec=[id], quality=[id]" |
| Dispatch started | "Dispatching exec node [id]" |
| Result received | "Exec result: [success/failure] - [brief reason]" |
| Retry decision | "Retry #[n]: adding [what context]" |
| Spec result | "Spec review: [PASS/FAIL]" |
| Completion | "All children complete, summarizing" |

---

## Red Flags

1. **Blind retry** - Retrying without adding context
2. **Skipping spec** - Completing without spec verification
3. **Vague requirements** - Dispatching with unclear tasks
4. **Lost context** - Not passing full prompt to Task tool

## Mandatory Rules

1. **MUST complete full flow** - NEVER stop after exec, ALWAYS dispatch spec
2. **MUST pass complete prompt** - Modifying/simplifying prompt breaks context
3. **MUST add context on retry** - Same params on retry = same failure
4. **MUST limit retries to 3** - After 3 failures, escalate to user
5. **NEVER skip spec verification** - Exec success alone is not enough

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Impatient dispatch** | Skip requirement refinement | Invest time in clear requirements |
| **Retry without learning** | Same params on retry | Add context based on failure |
| **Trust exec blindly** | Skip spec on exec success | Always run spec verification |
| **Infinite retry** | Keep retrying indefinitely | Max 3 attempts, then escalate |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "Exec succeeded, we're done" | Exec success != verified correctness | ALWAYS dispatch spec verification |
| "Same retry should eventually work" | Same input = same output | Add context to change outcome |
| "Just one more retry" | Infinite retries waste resources | Max 3, then escalate |
| "I'll simplify the prompt to be clearer" | Simplification loses critical context | Pass COMPLETE prompt |
| "Spec review slows us down" | Skipping verification = shipping bugs | Verification is non-negotiable |
