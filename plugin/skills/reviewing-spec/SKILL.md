---
name: reviewing-spec
description: Validates execution results against requirements and acceptance criteria. Use when performing Spec Review to verify implementation completeness.
---

# Reviewing Spec

## Core Thinking

**Verify** - Systematically validate each acceptance criterion. Evidence-based verdicts only.

## Typical Actions

- Verify acceptance criteria (WHEN/THEN)
- Check requirement coverage
- Identify implementation gaps
- Deliver pass/fail verdict

## SOP

### 1. Gather Review Context

**Goal**: Understand what needs to be reviewed.

- **Target node**: Which execution node to review?
- **Requirements**: What was the node supposed to do?
- **Acceptance criteria**: What are the WHEN/THEN conditions?
- **Execution conclusion**: What did the executor claim to complete?

**Output**: Clear understanding of review scope

### 2. Systematic Criterion Verification

**Goal**: Check each acceptance criterion individually.

For each criterion (WHEN/THEN format):
1. **Understand the condition** (WHEN)
2. **Identify how to verify** (code inspection, test execution, manual check)
3. **Execute verification**
4. **Record evidence** (code location, test output, observation)
5. **Determine status** (pass/fail)

**Output**: Criterion-by-criterion results with evidence

### 3. Requirement Coverage Check

**Goal**: Verify all requirements are addressed.

- **Completeness**: All aspects of requirement implemented?
- **Correctness**: Implementation matches intent?
- **Scope adherence**: No unauthorized additions/omissions?

**Output**: Coverage assessment

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

**Output**: Verdict with detailed findings

## Checklist

### Context Gathering
- [ ] Target execution node identified
- [ ] Requirements understood
- [ ] Acceptance criteria extracted
- [ ] Execution conclusion reviewed

### Criterion Verification
- [ ] Each WHEN/THEN criterion checked
- [ ] Evidence collected for each
- [ ] Status recorded (pass/fail)

### Coverage
- [ ] All requirements addressed
- [ ] No scope deviation
- [ ] Implementation matches intent

### Verdict
- [ ] Pass/fail determined
- [ ] Findings documented
- [ ] Actionable feedback provided (if fail)

## Output Template

```markdown
## Spec Review Report

**Target Node**: [node-id] - [title]
**Review Node**: [review-node-id]
**Verdict**: PASS / FAIL

## Acceptance Criteria Results

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | WHEN [condition] THEN [result] | PASS/FAIL | [evidence] |
| 2 | WHEN [condition] THEN [result] | PASS/FAIL | [evidence] |

## Requirement Coverage

- **Covered**: [list of covered aspects]
- **Missing**: [list of missing aspects, if any]
- **Scope Issues**: [deviations, if any]

## Findings

### Issues (if any)
1. [Issue description with evidence]
2. [Issue description with evidence]

### Suggestions (if fail)
1. [Specific action to fix issue 1]
2. [Specific action to fix issue 2]

## Conclusion

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
2. **No evidence** - Passing without verifiable proof
3. **Subjective judgment** - Opinion-based instead of evidence-based
4. **Partial pass** - Passing when some criteria fail

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Assumption** | "Looks complete" | Check each criterion explicitly |
| **Leniency** | Pass despite missing feature | Fail with clear feedback |
| **Vague feedback** | "Needs improvement" | "Criterion 2 fails: no error handling in line 45" |
| **Scope creep** | Review code style in spec review | Focus only on requirements/criteria |
