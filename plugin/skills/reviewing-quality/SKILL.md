---
name: reviewing-quality
description: Use when performing Quality Review to identify potential issues and improvements. Assesses code quality, maintainability, and best practices.
---

# Reviewing Quality

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **质量评审** 技能来评估代码质量、可维护性和最佳实践。」

This creates a commitment checkpoint. Proceed only after announcing.

## Core Thinking

**Assess** - Evaluate code quality objectively. Focus on maintainability, not personal style preferences.

## Typical Actions

- Inspect code readability
- Check error handling
- Verify coding standards
- Identify potential issues

## SOP

### 1. Identify Changed Files

**Goal**: Scope the review to actual changes.

- **Changed files**: What files were modified/created?
- **Change size**: How significant are the changes?
- **Change type**: New feature, refactor, bug fix?

**Output**: List of files to review

### 2. Readability Assessment

**Goal**: Evaluate code clarity and maintainability.

Check for:
- **Naming**: Are variables/functions clearly named?
- **Structure**: Is code logically organized?
- **Comments**: Are complex parts documented?
- **Complexity**: Are functions reasonably sized?

**Output**: Readability findings

### 3. Error Handling Review

**Goal**: Verify robustness of error handling.

Check for:
- **Input validation**: Are inputs properly validated?
- **Error cases**: Are errors caught and handled?
- **Error messages**: Are errors informative?
- **Edge cases**: Are boundary conditions handled?

**Output**: Error handling findings

### 4. Standards Compliance

**Goal**: Verify adherence to project conventions.

Check for:
- **Coding style**: Matches project patterns?
- **Type safety**: Proper use of types (if applicable)?
- **Best practices**: Follows language/framework conventions?
- **Consistency**: Consistent with existing codebase?

**Output**: Standards compliance findings

### 5. Issue Identification

**Goal**: Spot potential problems.

Look for:
- **Performance**: Inefficient algorithms/patterns?
- **Security**: Potential vulnerabilities?
- **Memory**: Resource leaks?
- **Concurrency**: Race conditions?

**Output**: Potential issues list

### 6. Compile Assessment

**Goal**: Deliver quality verdict.

- **PASS conditions**:
  - No critical issues
  - Acceptable readability
  - Adequate error handling
  - Standards compliance met

- **FAIL conditions**:
  - Critical security/performance issues
  - Severe readability problems
  - Missing critical error handling
  - Major standards violations

**Output**: Verdict with prioritized findings

## Checklist

### Scope
- [ ] Changed files identified
- [ ] Change type understood
- [ ] Review scope clear

### Readability
- [ ] Naming conventions checked
- [ ] Code structure assessed
- [ ] Complexity evaluated

### Error Handling
- [ ] Input validation reviewed
- [ ] Error cases checked
- [ ] Edge cases considered

### Standards
- [ ] Coding style verified
- [ ] Type safety checked
- [ ] Best practices followed

### Issues
- [ ] Performance considered
- [ ] Security reviewed
- [ ] No critical problems found

## Output Template

```markdown
### Quality Review Report

**Target Node**: [node-id] - [title]
**Review Node**: [review-node-id]
**Files Reviewed**: [count] files
**Verdict**: PASS / FAIL

### Summary

| Category | Status | Issues |
|----------|--------|--------|
| Readability | OK/WARN/FAIL | [count] |
| Error Handling | OK/WARN/FAIL | [count] |
| Standards | OK/WARN/FAIL | [count] |
| Potential Issues | OK/WARN/FAIL | [count] |

### Findings by Category

#### Readability
- [Finding 1 with location]
- [Finding 2 with location]

#### Error Handling
- [Finding 1 with location]
- [Finding 2 with location]

#### Standards Compliance
- [Finding 1 with location]
- [Finding 2 with location]

#### Potential Issues
- [Finding 1 with severity and location]
- [Finding 2 with severity and location]

### Prioritized Recommendations

1. **[CRITICAL/HIGH/MEDIUM/LOW]**: [Issue] - [Suggested fix]
2. **[CRITICAL/HIGH/MEDIUM/LOW]**: [Issue] - [Suggested fix]

### Conclusion

[Summary of quality assessment]
```

## Recording to Workspace

**Principle**: Quality feedback should be actionable and prioritized.

### What to Record

| Content | Where | Example |
|---------|-------|---------|
| Verdict summary | conclusion | "Quality Review PASS: No critical issues" |
| Critical issues | conclusion | "FAIL: 2 critical issues found" |
| Full report | conclusion or memo | Detailed findings |

### Conclusion Template (PASS)

```
**Verdict**: PASS
**Quality Score**: [X]/5
**Summary**: Code meets quality standards.
**Notes**: [minor suggestions, if any]
```

### Conclusion Template (FAIL)

```
**Verdict**: FAIL
**Critical Issues**: [count]
**Issues**:
1. [CRITICAL] [description] @ [location]
2. [HIGH] [description] @ [location]
**Required Actions**:
1. [specific fix for issue 1]
2. [specific fix for issue 2]
```

---

## Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| CRITICAL | Security vulnerability, data loss risk | Must fix, blocks review |
| HIGH | Performance issue, missing error handling | Should fix before merge |
| MEDIUM | Code smell, maintainability concern | Recommend fixing |
| LOW | Style preference, minor improvement | Optional |

## Red Flags

1. **Style nitpicking** - Focusing on style over substance
2. **Missing context** - Not understanding the change purpose
3. **Blocking on LOW issues** - Failing review for minor concerns
4. **No prioritization** - Listing issues without severity

## Mandatory Rules

1. **MUST focus on changed files** - NEVER review unrelated code
2. **MUST prioritize findings** - Every issue needs severity level
3. **MUST provide specific feedback** - Vague comments are not actionable
4. **MUST focus on substance over style** - Style nitpicking wastes everyone's time
5. **NEVER block on LOW severity** - Only CRITICAL/HIGH issues should fail review

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Perfectionism** | Fail for minor style issues | Focus on critical problems |
| **Vague feedback** | "Code could be better" | "Function X at line Y lacks error handling for null input" |
| **Opinion as fact** | "I prefer approach X" | "Approach X improves readability because..." |
| **Scope creep** | Review unrelated code | Focus on changed files only |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "All issues should be fixed" | Minor issues block important work | Prioritize by severity |
| "This style is more readable" | Style is subjective, follow project standards | Match existing patterns |
| "While we're here, let's fix this too" | Scope creep delays delivery | Focus on changed files only |
| "I would have done it differently" | Different != wrong | Only flag if objectively problematic |
| "It's faster to just note everything" | Noise obscures signal | Prioritize, focus on what matters |
