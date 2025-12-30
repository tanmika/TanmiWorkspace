---
name: preparing-dispatch
description: Use when creating task nodes that will be dispatched to subagents. Prepares execution nodes for dispatch with complete requirements and acceptance criteria.
---

# Preparing Dispatch

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **派发准备** 技能来准备执行节点、完善需求和验收标准以供派发。」

This creates a commitment checkpoint. Proceed only after announcing.

## Core Thinking

**Complete** - A well-prepared node reduces executor confusion and retry cycles. Invest time upfront.

## Typical Actions

- Define clear requirements
- Write acceptance criteria (WHEN/THEN)
- Attach relevant references
- Verify readiness before dispatch

## SOP

### 1. Define Clear Requirement

**Goal**: Write unambiguous task description.

**Requirement checklist**:
- **What**: Specific deliverable (not vague goal)
- **Where**: Files/modules affected
- **How**: Technical approach (if constrained)
- **Constraints**: What NOT to do

**Good vs Bad examples**:
```
❌ "Improve performance"
✅ "Reduce API response time for /users endpoint from 500ms to <100ms by adding Redis caching"

❌ "Fix the bug"
✅ "Fix login failure when email contains '+' character by URL-encoding the email parameter in AuthService.ts"
```

**Output**: Clear, specific requirement text

### 2. Write Acceptance Criteria

**Goal**: Define verifiable success conditions.

**Format**: WHEN/THEN pairs
```
WHEN [trigger condition] THEN [expected result]
```

**Coverage requirements**:
- At least 1 criterion per main feature
- Include edge cases for critical paths
- Include error scenarios

**Examples**:
```
WHEN user clicks login button with valid credentials
THEN user is redirected to dashboard within 2 seconds

WHEN user clicks login button with invalid password
THEN error message "Invalid credentials" is displayed

WHEN API request times out
THEN retry is attempted up to 3 times with exponential backoff
```

**Output**: List of WHEN/THEN acceptance criteria

### 3. Attach References

**Goal**: Provide context the executor needs.

**Reference types**:
- **Code files**: Related source files
- **Documentation**: API docs, design docs
- **Other nodes**: Related completed work
- **External**: URLs, specs

**Use node_reference**:
```
node_reference(nodeId, targetPath, action="add", description="...")
```

**Output**: Node has relevant references attached

### 4. Verify Readiness

**Goal**: Confirm node is ready for dispatch.

**Readiness checklist**:
- [ ] Requirement is specific and actionable
- [ ] At least 2 acceptance criteria defined
- [ ] References attached for context
- [ ] No ambiguous terms (define them if used)
- [ ] Scope fits single execution

**If not ready**:
- Add missing information
- Split if scope too large
- Clarify ambiguous parts

**Output**: Node passes readiness check

## Checklist

### Requirement
- [ ] Specific deliverable stated
- [ ] Affected files/modules identified
- [ ] Constraints documented
- [ ] No vague terms

### Acceptance Criteria
- [ ] At least 2 WHEN/THEN pairs
- [ ] Main feature covered
- [ ] Edge cases included
- [ ] Error scenarios included

### References
- [ ] Relevant code files linked
- [ ] Related nodes referenced
- [ ] Documentation attached (if applicable)

### Readiness
- [ ] Requirement is unambiguous
- [ ] Criteria are testable
- [ ] Scope is appropriate
- [ ] Context is sufficient

## Output Template

### Node Creation Call

```typescript
node_create({
  workspaceId: "...",
  parentId: "...",
  type: "execution",
  title: "[Action verb] [specific target]",
  requirement: `[Clear, specific task description]

## Affected Files
- [file1]
- [file2]

## Approach
[Technical approach if constrained]

## Constraints
- [What NOT to do]
- [Boundaries to respect]`,
  acceptanceCriteria: [
    { when: "[condition 1]", then: "[result 1]" },
    { when: "[condition 2]", then: "[result 2]" },
    { when: "[error condition]", then: "[error handling]" }
  ]
})
```

### After Creation

```typescript
// Attach references
node_reference({
  nodeId: "[created-node-id]",
  targetPath: "src/relevant/file.ts",
  action: "add",
  description: "Main file to modify"
})
```

## Recording to Workspace

**Principle**: Preparation quality determines execution quality.

### What to Record (in parent node)

| Content | Where | Example |
|---------|-------|---------|
| Dispatched node | log | "Created exec node node-xxx for [task]" |
| Preparation notes | log | "Added 3 acceptance criteria" |
| Readiness status | log | "Node ready for dispatch" |

---

## Red Flags

1. **Vague requirements** - "Make it better" without specifics
2. **No acceptance criteria** - No way to verify completion
3. **Missing context** - Executor will need to guess
4. **Scope too large** - Should be split into multiple nodes

## Mandatory Rules

1. **MUST write specific requirements** - Vague requirements cause executor confusion
2. **MUST have at least 2 acceptance criteria** - No criteria = no way to verify done
3. **MUST attach references** - Context-free tasks lead to wrong assumptions
4. **MUST verify readiness before dispatch** - Unclear nodes waste retry cycles
5. **NEVER dispatch scope-too-large tasks** - Split first, dispatch smaller units

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Lazy prep** | "Just implement feature X" | Full requirement with criteria |
| **Assumed context** | Expect executor to know codebase | Attach relevant references |
| **Perfectionism** | 10 criteria for simple task | 2-4 criteria matching complexity |
| **Premature dispatch** | Dispatch unclear node | Verify readiness first |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "Executor will figure it out" | Guessing leads to wrong implementation | Provide clear requirements |
| "Adding criteria takes too long" | Retry cycles take longer | 5 min criteria saves 30 min retry |
| "The task is self-explanatory" | What's obvious to you isn't to executor | Write explicit requirements |
| "References aren't needed for simple tasks" | Simple tasks still need context | Always attach relevant files |
| "I'll clarify if executor asks" | Async clarification is slow | Front-load all context |

## Scope Guidelines

| Task Size | Criteria Count | Example |
|-----------|----------------|---------|
| Small (1-2 files) | 2-3 | Add a helper function |
| Medium (3-5 files) | 3-5 | Implement a feature |
| Large (5+ files) | Split first | Refactor module → split into parts |

**Rule of thumb**: If you can't write 2-4 clear criteria, the task is likely too vague or too large.
