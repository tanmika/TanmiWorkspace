---
name: diagnosing-issues
description: Traces root cause of problems, applies to logic errors and performance bottlenecks. Use when debugging errors or investigating performance issues.
---

# Diagnosing Issues

## Core Thinking

**Trace** - Follow the causal chain to find root cause.

## Applicable Scenarios

- **Debug**: Diagnose logic errors (why error occurs)
- **Optimize**: Diagnose performance bottlenecks (why slow)

## SOP

### 1. Reproduce/Locate

#### Debug Scenario
- Collect error info (message, stack trace, error code)
- Confirm reproduction steps (always/sometimes, trigger conditions)
- **Locate code line**: Find code position from error stack

#### Optimize Scenario
- Collect performance data (response time, throughput, resource usage)
- Identify slow operations (API, DB query, compute-intensive tasks)
- **Locate bottleneck**: Find slowest function call or SQL

### 2. Causal Chain Analysis

Build call chain using AST analysis or code tracing:

```
Entry function
  ↓ calls
Intermediate function A
  ↓ calls
Intermediate function B
  ↓ calls
Problem function ← Located point
  ↓ trace back
Data source/Logic flaw ← Root cause
```

### 3. Hypothesis Testing

**Construct hypotheses**:
- Based on error type, list possible causes
- Based on performance data, identify potential bottlenecks
- Priority: Most likely causes first

**Verify hypotheses**:
- Add logging to verify assumptions
- Modify code to test hypotheses
- Use debugger to trace execution

### 4. Root Cause Confirmation

**Confirmation criteria**:
- Can explain all observed symptoms
- Can reproduce consistently
- Modification can fix the issue

**Output diagnosis report**:
- Reproduction path
- Causal chain analysis
- Root cause location
- Fix recommendation

## Checklist

### Debug
- [ ] Error message collected
- [ ] Stack trace analyzed
- [ ] Reproduction steps confirmed
- [ ] Root cause code located
- [ ] Fix verified

### Optimize
- [ ] Performance baseline established
- [ ] Bottleneck identified
- [ ] Causal chain traced
- [ ] Optimization point confirmed

## Output Template

```markdown
## Diagnosis Summary
**Issue type**: [Error/Performance]
**Root cause**: [One sentence description]
**Location**: [file:line]

## Reproduction Path
1. [Step 1]
2. [Step 2]
3. [Symptom appears]

## Causal Chain
[Entry] → [Function A] → [Function B] → [Problem point]

## Root Cause Analysis
[Detailed explanation of why this causes the issue]

## Fix Recommendation
[Specific fix approach]
```

## Recording to Workspace

**Principle**: User only sees workspace, not conversation output.

### What to Record

| Content | Where | Example |
|---------|-------|---------|
| Error/symptom | conclusion | "Error: TypeError at file:line" |
| Investigation path | conclusion or memo | Hypotheses tested, results |
| Root cause | conclusion | "Cause: null check missing" |
| Fix recommendation | conclusion | "Fix: add validation at line X" |

### Conclusion Template

```
**Issue**: [error message or symptom]
**Investigation**:
- Hypothesis 1: [tested] → [result]
- Hypothesis 2: [tested] → [result]
**Root Cause**: [file:line] - [explanation]
**Fix**: [recommendation]
**Details**: 见 MEMO#xxx (if long trace)
```

---

## Red Flags

1. **Fix symptoms not cause** - Patch visible error without finding root cause
2. **Skip reproduction** - Assume issue without consistent reproduction
3. **Single hypothesis** - Lock on first guess without exploring alternatives
4. **No verification** - Claim fix without testing

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Guess and fix** | Try random fixes hoping one works | Systematic hypothesis testing |
| **Blame user** | "Works on my machine" | Reproduce in user environment |
| **Ignore edge cases** | Only test happy path | Test error scenarios too |
| **Incomplete trace** | Stop at first error | Trace to true root cause |
