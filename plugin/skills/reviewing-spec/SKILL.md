---
name: reviewing-spec
description: Use when performing Spec Review as dispatch_spec role to verify implementation completeness. Validates execution results against requirements and acceptance criteria.
---

# Reviewing Spec

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **规格评审** 技能来验证实现完整性、检查是否满足需求和验收标准。」

This creates a commitment checkpoint. Proceed only after announcing.

## Core Thinking

**Verify** - Systematically validate each acceptance criterion. Evidence-based verdicts only. Trust nothing - verify everything.

## Role: dispatch_spec

As a `dispatch_spec` node, you are part of the dispatch flow:
- You are a **child** of the dispatch parent node
- You verify the work done by the paired `dispatch_exec` node
- You report back to the parent via `dispatch_complete`

**Critical Principle**: You perform INDEPENDENT verification. You do NOT trust the exec node's conclusion. You verify against the original requirements and acceptance criteria by examining the actual code/output.

## Typical Actions

- Verify acceptance criteria (WHEN/THEN)
- Check requirement coverage
- Identify implementation gaps
- Deliver pass/fail verdict
- Report via dispatch_complete

## SOP

### 1. Gather Review Context

**Goal**: Understand what needs to be reviewed.

- **Target node**: Which execution node to review?
- **Requirements**: What was the node supposed to do?
- **Acceptance criteria**: What are the WHEN/THEN conditions?
- **Execution conclusion**: What did the executor claim to complete?

**Output**: Clear understanding of review scope

### 2. Systematic Criterion Verification (Gate Function)

**Goal**: INDEPENDENTLY verify each criterion by RUNNING verification commands.

**Iron Law: NO PASS WITHOUT RUNNING VERIFICATION COMMANDS**

For each criterion, check its **Verify** column and execute accordingly:

#### If `[cmd]` - RUN the Command (MANDATORY)

```bash
# You MUST actually run the command, not assume it passes
npm test -- --grep 'xxx'
# or
pytest tests/test_main.py
# or whatever command is specified
```

1. **RUN** the command (FRESH - do not trust exec's output)
2. **READ** the full output
3. **CHECK** exit code (0 = success, non-zero = failure)
4. **RECORD** evidence: `"[cmd] npm test → exit 0, 5/5 pass"`

#### If `[manual]` - Verify Manual Steps Were Done

1. **READ** exec's log for manual verification evidence
2. **ASSESS** if steps were actually performed
3. **RECORD** evidence: `"[manual] exec logged: 打开页面 → 组件显示正常"`

#### If `[check]` - Perform Code Inspection

1. **INSPECT** the specified target (file, function, pattern)
2. **CONFIRM** condition is met
3. **RECORD** evidence: `"[check] no TODO → grep found 0 matches"`

#### If No Verify Column

1. **INSPECT** code changes
2. **ASSESS** if WHEN/THEN is logically satisfied
3. **RECORD** reasoning (lower confidence)
4. **⚠️ WARNING**: Flag as "unverified by command"

**Evidence Table** (MUST produce):
```markdown
| # | Criterion | Verify | Command/Action | Result | Status |
|---|-----------|--------|----------------|--------|--------|
| 1 | WHEN... THEN... | [cmd] | npm test | exit 0, 3/3 | PASS |
| 2 | WHEN... THEN... | [check] | grep TODO | 0 found | PASS |
| 3 | WHEN... THEN... | [manual] | exec log | "UI checked" | PASS |
```

**Output**: Evidence table with command outputs for each criterion

### 3. Requirement Coverage Check

**Goal**: Verify all requirements are addressed.

- **Completeness**: All aspects of requirement implemented?
- **Correctness**: Implementation matches intent?
- **Scope adherence**: No unauthorized additions/omissions?

**Output**: Coverage assessment

### 3.3. API Contract Consistency Check (Feature 场景)

**Goal**: Verify implementation follows API contract from test definition.

**Applicable when**: Requirement contains "## API 契约" section.

**Verification steps**:

1. **Extract API contract** from requirement
2. **For each function in contract**:
   - Find the implementation in code
   - Compare signature: parameter names, types, return type
   - Check if signature matches EXACTLY
3. **Record findings**:
   ```markdown
   | API | Contract | Implementation | Match |
   |-----|----------|----------------|-------|
   | findAllCodepacConfigs | (dir): {mainConfig, optionalConfigs} | (dir): {main, optional} | ❌ NO |
   | selectOptionalConfigs | (configs: [{name,path}], opts) | (configs: string[], remembered) | ❌ NO |
   ```

**FAIL conditions**:
- Parameter names differ
- Parameter types differ
- Return type structure differs
- Function not found

**Output**: API consistency verification (PASS if all match, FAIL if any mismatch)

### 3.5. Implementation Completeness Check

**Goal**: Verify no shortcuts or deferred work.

**Search changed files for**:
- `TODO`, `FIXME`, `HACK`, `XXX` comments
- "暂时"、"临时"、"简化实现" in comments or code
- Placeholder values or hardcoded data that should be configurable
- Commented-out code with "later" notes

**If found**: FAIL with specific locations and required fixes.

**Output**: Completeness verification (PASS if no incomplete markers found)

### 4. Compile Verdict

**Goal**: Deliver final review result.

- **PASS conditions**:
  - ALL acceptance criteria passed
  - Requirements fully covered
  - No critical issues found

- **FAIL conditions**:
  - ANY acceptance criterion failed
  - Missing required functionality
  - Critical implementation issues
  - TODO/FIXME/HACK markers found in code
  - Simplified or temporary implementations detected

**Output**: Verdict with detailed findings

## Checklist

### Context Gathering
- [ ] Target execution node identified
- [ ] Requirements understood
- [ ] Acceptance criteria extracted
- [ ] Execution conclusion reviewed

### Criterion Verification (Gate Function)
- [ ] Each `[cmd]` command ACTUALLY RUN (not trusted from exec)
- [ ] Each `[manual]` step verified from exec's log
- [ ] Each `[check]` inspection performed
- [ ] Evidence Table produced with command outputs
- [ ] Status recorded (pass/fail) with evidence

### Coverage
- [ ] All requirements addressed
- [ ] No scope deviation
- [ ] Implementation matches intent

### API Contract (Feature 场景)
- [ ] API 契约 section identified in requirement (if present)
- [ ] Each function signature compared against implementation
- [ ] API Consistency Table produced (if applicable)
- [ ] All signatures match exactly (or FAIL)

### Completeness
- [ ] No TODO/FIXME/HACK markers in changed code
- [ ] No "暂时/临时/简化" workarounds
- [ ] No placeholder or hardcoded values
- [ ] No deferred implementations

### Verdict
- [ ] Pass/fail determined
- [ ] Findings documented
- [ ] Actionable feedback provided (if fail)

## Output Template

```markdown
### Spec Review Report

**Target Node**: [node-id] - [title]
**Review Node**: [review-node-id]
**Verdict**: PASS / FAIL

### Verification Evidence Table (MANDATORY)

| # | Criterion | Verify | Command/Action | Result | Status |
|---|-----------|--------|----------------|--------|--------|
| 1 | WHEN [condition] THEN [result] | [cmd] | `npm test` | exit 0, 3/3 pass | PASS |
| 2 | WHEN [condition] THEN [result] | [check] | `grep TODO` | 0 found | PASS |
| 3 | WHEN [condition] THEN [result] | [manual] | exec log | "verified" | PASS |

### Requirement Coverage

- **Covered**: [list of covered aspects]
- **Missing**: [list of missing aspects, if any]
- **Scope Issues**: [deviations, if any]

### Findings

#### Issues (if any)
1. [Issue description with evidence]
2. [Issue description with evidence]

#### Suggestions (if fail)
1. [Specific action to fix issue 1]
2. [Specific action to fix issue 2]

### Conclusion

[Summary of review result]
```

## Recording to Workspace

**Principle**: Review results must be actionable.

### What to Record

| Content | Where | Example |
|---------|-------|---------|
| Verdict summary | conclusion | "Spec Review PASS: 3/3 criteria met" |
| Failed criteria | conclusion | "FAIL: Criterion 2 not met - [reason]" |
| Full report | conclusion or memo | Detailed findings |

### Conclusion Template (PASS)

```
**Verdict**: PASS
**Criteria**: [X]/[X] passed
**Coverage**: Complete
**Summary**: Implementation fully meets requirements.
```

### Conclusion Template (FAIL)

```
**Verdict**: FAIL
**Criteria**: [X]/[Y] passed, [Z] failed
**Failed**:
- Criterion N: [reason]
**Required Actions**:
1. [specific fix needed]
```

---

## Red Flags

1. **Skip criteria** - Not checking all WHEN/THEN conditions
2. **Trust exec's output** - Using exec's command output instead of running yourself
3. **No evidence** - Passing without verifiable proof
4. **Skip [cmd]** - Not actually running the verification command
5. **Subjective judgment** - Opinion-based instead of evidence-based
6. **No Evidence Table** - Verdict without structured evidence
7. **Partial pass** - Passing when some criteria fail
8. **Ignore incomplete markers** - Passing code with TODO/FIXME/HACK
9. **Accept shortcuts** - Passing simplified implementations
10. **Ignore API contract** - Not checking API signatures when "## API 契约" exists in requirement
11. **Accept signature mismatch** - Passing when implementation signature differs from contract

## Mandatory Rules

1. **MUST verify INDEPENDENTLY** - NEVER trust exec's conclusion, verify yourself
2. **MUST RUN verification commands** - `[cmd]` means YOU run it, not trust exec ran it
3. **MUST check ALL criteria** - Skipping any criterion is review failure
4. **MUST provide evidence** - Every pass/fail needs verifiable proof (command output)
5. **MUST produce Evidence Table** - No table = incomplete review
6. **MUST fail if ANY criterion fails** - Partial pass is not pass
7. **NEVER be lenient** - Pass only when ALL criteria are met
8. **MUST check for incomplete markers** - TODO/FIXME/HACK in code = automatic FAIL
9. **MUST reject simplified implementations** - "暂时/临时/简化" workarounds = FAIL
10. **MUST verify API contract** - If "## API 契约" exists in requirement, check ALL signatures match implementation

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Assumption** | "Looks complete" | Check each criterion explicitly |
| **Leniency** | Pass despite missing feature | Fail with clear feedback |
| **Vague feedback** | "Needs improvement" | "Criterion 2 fails: no error handling in line 45" |
| **Scope creep** | Review code style in spec review | Focus only on requirements/criteria |
| **Trust exec blindly** | "Exec said it's done, so pass" | Verify independently against criteria |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "Exec's conclusion looks thorough" | Exec may have missed something | Verify independently |
| "Exec already ran the test" | You need FRESH evidence, exec may have lied/erred | RUN the command yourself |
| "I can see exec's output in the log" | Logs can be fabricated or outdated | RUN and see output yourself |
| "It mostly works, close enough" | Partial implementation = partial pass = FAIL | ALL criteria must pass |
| "The missing part is minor" | Criteria exist for a reason | Fail and specify what's missing |
| "Code looks good, must work" | Looking good != working correctly | RUN verification command |
| "I'll be lenient this time" | Leniency erodes quality standards | Standards apply equally every time |

---

## Completing the Review

**IMPORTANT**: As a dispatch_spec node, you MUST call `dispatch_complete` to finalize your review.

### On Pass

```typescript
dispatch_complete({
  workspaceId: "...",
  nodeId: "[your-node-id]",
  success: true,
  conclusion: `**Verdict**: PASS
**Criteria**: [X]/[X] passed
**Coverage**: Complete
**Summary**: Implementation fully meets requirements.`
})
```

### On Fail

```typescript
dispatch_complete({
  workspaceId: "...",
  nodeId: "[your-node-id]",
  success: false,
  conclusion: `**Verdict**: FAIL
**Criteria**: [X]/[Y] passed, [Z] failed
**Failed**:
- Criterion N: [specific reason with evidence]
**Required Actions**:
1. [specific fix needed]`
})
```

**Why dispatch_complete?**
- Signals completion to the dispatch parent
- Enables Git commit (on success) or rollback (on failure)
- Provides structured feedback for retry decisions
