---
name: executing-task
description: Use when executing dispatched tasks as tanmi-executor. Guides task execution with scope control and quality delivery.
---

# Executing Task

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **任务执行** 技能来执行派发任务、控制范围、交付高质量成果。」

This creates a commitment checkpoint. Proceed only after announcing.

## Core Thinking

**Focus** - Execute exactly what's required. No more, no less. Fail fast on uncertainty.

## Typical Actions

- Assess task readiness
- Execute within boundaries
- Log progress milestones
- Deliver with clear conclusion

## SOP

### 1. Assess Task Readiness

**Goal**: Verify you have enough information to execute.

**Check**:
- [ ] Requirement is clear and specific
- [ ] Acceptance criteria are defined
- [ ] Referenced files are accessible
- [ ] Scope fits single execution session

**If NOT ready**:
```
FAIL with reason: "info_insufficient"
Details: [What's missing]
Suggestion: [What parent node should provide]
```

**If scope too large**:
```
FAIL with reason: "scope_too_large"
Details: [Why it's too large]
Suggestion: [How to split]
```

**Output**: Proceed or fail with clear reason

### 2. Plan Execution Steps

**Goal**: Break down into verifiable steps.

**Step planning**:
1. List files to modify/create
2. Order by dependencies
3. Identify verification for each step

**Example**:
```
Steps:
1. Add type definition in types.ts → verify: tsc passes
2. Implement function in service.ts → verify: unit test passes
3. Update caller in controller.ts → verify: integration works
```

**Output**: Ordered step list with verifications

### 3. Execute with Logging

**Goal**: Implement while tracking progress.

**For each step**:
1. Log start: `log_append("Starting: [step description]")`
2. Implement the change
3. Verify the step (run tests, check types)
4. Log completion: `log_append("Completed: [step] - [result]")`

**On error**:
- Log the error immediately
- Assess if recoverable
- If not recoverable → fail with details

**Output**: All steps completed with logs

### 4. Verify Against Criteria

**Goal**: Check all acceptance criteria before completing.

**For each WHEN/THEN**:
1. Simulate/test the WHEN condition
2. Verify the THEN result
3. Record evidence

**If any criterion fails**:
- Try to fix if straightforward
- Otherwise fail with specific criterion

**Output**: All criteria verified

### 5. Deliver Conclusion

**Goal**: Complete with actionable summary.

**Conclusion must include**:
- What was done (brief)
- Files changed (list)
- Verification result (tests/checks)
- Any notes for next steps

**Template**:
```
Implemented [feature/fix].
Changed: [file1], [file2].
Verified: [how verified].
Notes: [if any].
```

**Call**:
```
dispatch_complete(
  workspaceId="...",
  nodeId="...",
  success=true,
  conclusion="[conclusion text]"
)
```

## Checklist

### Assessment
- [ ] Requirement understood
- [ ] Criteria are clear
- [ ] References accessible
- [ ] Scope is appropriate

### Execution
- [ ] Steps planned
- [ ] Each step logged
- [ ] Errors handled
- [ ] Progress tracked

### Verification
- [ ] Each criterion checked
- [ ] Evidence collected
- [ ] All tests pass

### Delivery
- [ ] Conclusion is complete
- [ ] Files listed
- [ ] Verification stated
- [ ] dispatch_complete called

## Output Template

### Progress Log Format

```
[HH:mm] Starting: [step description]
[HH:mm] Completed: [step] - [verification result]
[HH:mm] Starting: [next step]
...
[HH:mm] All steps complete, verifying criteria
[HH:mm] Criterion 1: PASS
[HH:mm] Criterion 2: PASS
[HH:mm] Execution complete
```

### Conclusion Format (Success)

```
Implemented [brief description].

Files changed:
- src/path/file1.ts (added function X)
- src/path/file2.ts (updated import)

Verification:
- TypeScript: passes
- Tests: 3/3 pass
- Criteria: 2/2 met

Notes: [optional observations]
```

### Conclusion Format (Failure)

```
Execution failed: [reason category]

Attempted: [what was tried]
Blocked by: [specific issue]

Suggestion for parent node:
- [actionable recommendation]
```

## Recording to Workspace

**Principle**: Logs should tell the execution story.

### What to Record

| Event | Log Entry |
|-------|-----------|
| Start | "开始执行: [task title]" |
| Step complete | "完成: [step] - [result]" |
| Error encountered | "错误: [description]" |
| Verification | "验证: [criterion] - PASS/FAIL" |

---

## Boundary Rules

### DO
- Execute exactly what's specified
- Fail fast on uncertainty
- Log before major operations
- Verify against criteria

### DON'T
- Expand scope ("while I'm here...")
- Make assumptions about unclear requirements
- Skip logging for "small" changes
- Complete without verifying criteria

## Failure Categories

| Reason | When to Use |
|--------|-------------|
| `info_insufficient` | Requirements unclear, missing context |
| `scope_too_large` | Task needs splitting |
| `execution_error` | Technical error during implementation |
| `blocked` | External dependency blocking |

## Red Flags

1. **Scope creep** - "I'll also fix this other thing"
2. **Silent changes** - No logs for modifications
3. **Assumed pass** - Complete without checking criteria
4. **Heroic debugging** - Spending too long on unclear issues

## Mandatory Rules

1. **MUST assess readiness first** - NEVER start coding without checking requirements
2. **MUST stay in scope** - Fix ONLY what's specified, nothing more
3. **MUST log as you go** - Silent execution is unverifiable execution
4. **MUST verify ALL criteria** - "Should work" is not verification
5. **MUST fail fast on uncertainty** - Don't guess, fail with clear reason

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Scope expansion** | Fix unrelated issues | Stick to requirement |
| **Skip assessment** | Start coding immediately | Check readiness first |
| **Batch logging** | Log everything at end | Log as you go |
| **Optimistic completion** | "Should work" | Verify each criterion |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "I'll also fix this while I'm here" | Scope creep causes verification gaps | Stay in scope, note other issues |
| "The requirement is clear enough" | Unclear requirements cause rework | Fail with info_insufficient if unclear |
| "Logging slows me down" | No logs = no debugging when things fail | Log is cheap, retry is expensive |
| "It obviously works, no need to verify" | Obvious != verified | Check each criterion with evidence |
| "This edge case won't happen" | Edge cases cause production bugs | If in criteria, verify it |
