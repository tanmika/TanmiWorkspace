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

**Observable** - Code without logs is blind code. Every key operation, error, and state change needs logging.

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

**Goal**: Implement while tracking progress AND ensuring code observability.

#### Workspace Progress Logging

**For each step**:
1. Log start: `log_append("Starting: [step description]")`
2. Implement the change
3. Verify the step (run tests, check types)
4. Log completion: `log_append("Completed: [step] - [result]")`

**On error**:
- Log the error immediately
- Assess if recoverable
- If not recoverable → fail with details

#### Code Logging Requirements (MANDATORY)

**When implementing code, MUST add logs for**:

| Scenario | Log Requirement | Example |
|----------|-----------------|---------|
| **Key operations** | Entry, exit, parameters | `logger.info("Creating user", { userId })` |
| **State changes** | Before/after values | `logger.debug("Status changed", { from, to })` |
| **Error handling** | Error type, context, action | `logger.error("Failed to save", { error, context })` |
| **External calls** | Request/response summary | `logger.info("API called", { endpoint, status })` |

**Iron Law: NO SILENT CODE**

If the design specifies logging requirements, you MUST implement them. If not specified, apply reasonable defaults for key flows and error scenarios.

**Output**: All steps completed with logs + Code includes appropriate logging

### 4. Verify Against Criteria (Gate Function)

**Goal**: Execute verification commands and collect evidence.

**Iron Law: NO DISPATCH_COMPLETE WITHOUT RUNNING VERIFICATION**

**For each criterion with Verify column**:

#### If `[cmd]` - Run Command
```bash
# Actually execute the command
npm test -- --grep 'xxx'
# or
pytest tests/test_main.py
# or any specified command
```
1. **RUN** the command (fresh, not cached)
2. **CHECK** exit code and output
3. **LOG** result: `log_append("验证 [cmd]: <command> → exit <code>")`

#### If `[manual]` - Document Manual Check
1. **EXECUTE** the manual steps
2. **OBSERVE** the result
3. **LOG** evidence: `log_append("验证 [manual]: <steps> → <observed result>")`

#### If `[check]` - Inspect Code
1. **INSPECT** the specified target
2. **CONFIRM** condition is met
3. **LOG** result: `log_append("验证 [check]: <target> → <status>")`

**Verification Evidence Table** (MUST include in conclusion):
```markdown
| Criterion | Verify | Command/Check | Result |
|-----------|--------|---------------|--------|
| 1. WHEN... | [cmd] | npm test | exit 0, 3/3 pass |
| 2. WHEN... | [check] | no TODO | 0 found |
```

**If any criterion fails**:
- Try to fix if straightforward
- Otherwise fail with specific criterion AND evidence

**Output**: All criteria verified with evidence

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
- [ ] Each step logged (workspace)
- [ ] Errors handled
- [ ] Progress tracked

### Code Observability (MANDATORY)
- [ ] **Key operations logged**: Entry/exit for important functions
- [ ] **Errors logged**: All catch blocks have context logging
- [ ] **State changes logged**: Important state transitions captured
- [ ] **Design requirements met**: Logging from design phase implemented

### Verification (Gate Function)
- [ ] Each `[cmd]` verification command executed
- [ ] Each `[manual]` step performed and documented
- [ ] Each `[check]` inspection completed
- [ ] Evidence collected for ALL criteria
- [ ] Verification Evidence Table prepared

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

Verification Evidence:
| Criterion | Verify | Command/Check | Result |
|-----------|--------|---------------|--------|
| 1. WHEN... | [cmd] | npm test | exit 0, 3/3 pass |
| 2. WHEN... | [check] | no TODO | 0 found |

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
2. **Silent changes** - No workspace logs for modifications
3. **Assumed pass** - Complete without running verification commands
4. **Skip [cmd]** - "I know it works" without actually running the command
5. **No evidence** - dispatch_complete without Verification Evidence Table
6. **Heroic debugging** - Spending too long on unclear issues
7. **Silent code** - New code has no logging for key operations or errors
8. **Ignore logging design** - Design specified logging requirements but code doesn't implement them

## Mandatory Rules

1. **MUST assess readiness first** - NEVER start coding without checking requirements
2. **MUST stay in scope** - Fix ONLY what's specified, nothing more
3. **MUST log as you go** - Silent execution is unverifiable execution
4. **MUST RUN verification commands** - "Should work" is not verification, RUN the `[cmd]`
5. **MUST collect evidence** - Every criterion needs proof (command output, screenshot, inspection result)
6. **MUST fail fast on uncertainty** - Don't guess, fail with clear reason
7. **MUST add code logging** - Key operations and errors need logs for debugging and observability

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Scope expansion** | Fix unrelated issues | Stick to requirement |
| **Skip assessment** | Start coding immediately | Check readiness first |
| **Batch logging** | Log everything at end | Log as you go |
| **Optimistic completion** | "Should work" | Verify each criterion |
| **Silent code** | No logs in new code | Add logs for key ops and errors |
| **Log afterthought** | "I'll add logs later" | Add logs while implementing |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "I'll also fix this while I'm here" | Scope creep causes verification gaps | Stay in scope, note other issues |
| "The requirement is clear enough" | Unclear requirements cause rework | Fail with info_insufficient if unclear |
| "Logging slows me down" | No logs = no debugging when things fail | Log is cheap, retry is expensive |
| "It obviously works, no need to verify" | Obvious != verified | Check each criterion with evidence |
| "This edge case won't happen" | Edge cases cause production bugs | If in criteria, verify it |
| "Code is self-explanatory, no logs needed" | Silent code = blind debugging | Key operations always need logs |
| "I'll add logs when we need to debug" | By then you don't know WHERE to add | Add logs during implementation |
