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

### 2.5. Define Verification Method (MANDATORY)

**Goal**: Specify HOW each criterion will be verified.

**Format**: Add Verify column to each criterion

| WHEN | THEN | Verify |
|------|------|--------|
| 调用 API | 返回正确数据 | `[cmd] npm test` |
| 编译项目 | 无错误 | `[cmd] make build` |
| 打开页面 | 显示组件 | `[manual] 打开浏览器检查` |
| 添加函数 | 函数可用 | `[check] file:function exists` |

**Verify 列格式**:

| 前缀 | 含义 | 示例 |
|------|------|------|
| `[cmd]` | 运行命令验证 | `[cmd] pytest tests/` |
| `[manual]` | 手动验证步骤 | `[manual] 打开页面检查 UI` |
| `[check]` | 代码检查 | `[check] no TODO/FIXME` |

**Examples by project type**:

```markdown
# Node.js 项目
| WHEN | THEN | Verify |
|------|------|--------|
| 调用 createUser | 返回用户 ID | `[cmd] npm test -- --grep 'createUser'` |
| 编译项目 | 无类型错误 | `[cmd] npx tsc --noEmit` |

# Python 项目
| WHEN | THEN | Verify |
|------|------|--------|
| 运行脚本 | 输出正确 | `[cmd] pytest tests/test_main.py` |
| 导入模块 | 无错误 | `[cmd] python -c "import mymodule"` |

# 无测试框架
| WHEN | THEN | Verify |
|------|------|--------|
| 添加函数 | 可被调用 | `[check] src/utils.ts:newFunction exists` |
| 修改配置 | 格式正确 | `[cmd] cat config.json | jq .` |

# UI/文档任务
| WHEN | THEN | Verify |
|------|------|--------|
| 打开设置页 | 显示新选项 | `[manual] 1.打开设置 2.检查新选项` |
| 阅读文档 | 内容清晰 | `[manual] 检查文档完整性` |
```

**Required verifications** (至少包含一个):
- 如果有构建步骤：`[cmd] <build command>`
- 如果有自动化测试：`[cmd] <test command>`
- 如果是代码任务：`[check] no TODO/FIXME in changed files`

**Output**: Each criterion has a Verify method defined

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

### Verification Method
- [ ] Each criterion has Verify column defined
- [ ] At least one `[cmd]` verification (if applicable)
- [ ] `[check] no TODO/FIXME` included for code tasks

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
3. **No verification method** - Criteria without Verify column = untestable
4. **Missing context** - Executor will need to guess
5. **Scope too large** - Should be split into multiple nodes

## Mandatory Rules

1. **MUST write specific requirements** - Vague requirements cause executor confusion
2. **MUST have at least 2 acceptance criteria** - No criteria = no way to verify done
3. **MUST define verification method for each criterion** - No verification = no way to prove done
4. **MUST attach references** - Context-free tasks lead to wrong assumptions
5. **MUST verify readiness before dispatch** - Unclear nodes waste retry cycles
6. **NEVER dispatch scope-too-large tasks** - Split first, dispatch smaller units

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
