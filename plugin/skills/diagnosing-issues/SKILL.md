---
name: diagnosing-issues
description: Use when debugging errors or investigating performance issues. Traces root cause of problems, applies to logic errors and performance bottlenecks.
---

# Diagnosing Issues

## Core Thinking

**Trace** - Follow the causal chain to find root cause.

**Recording**: Conversation output is invisible to users. You MUST record to workspace node. Standard: "If context is wiped now, can you recall discussion details from conclusion alone?"

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

### 5. Record to Workspace (MANDATORY)

After diagnosis, MUST record to workspace node:

**Recording locations**:
| Content | Location | Tool |
|---------|----------|------|
| Key conclusions (brief) | conclusion | node_update |
| Hypotheses, investigation, root cause | notes | node_update |
| Full trace log (>200 lines) | MEMO | memo_create + node_reference |

**NEVER hardcode MEMO IDs** in text like "见 MEMO#xxx". Use `node_reference` to link.

**Conclusion template** (brief):
```
[问题描述] + [根因位置] + [修复建议]
```

**Notes template** (detailed):
```
**Issue**: [error/symptom]
**Reproduction**: [steps]
**Investigation**:
- Hypothesis 1: [tested] → [result]
- Hypothesis 2: [tested] → [result]
**Causal Chain**: Entry → A → B → Problem
**Root Cause**: [file:line] - [explanation]
**Fix**: [recommendation]
```

**Output**: node_update called with conclusion + notes

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

### Recording (MANDATORY)
- [ ] **Conclusion written**: Brief summary in node conclusion
- [ ] **Notes written**: Investigation, root cause in node notes
- [ ] **MEMO linked**: Long content in MEMO, linked via node_reference (not hardcoded ID)
- [ ] **Wipe test**: If context wiped now, can recall details from recorded content?

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

## Red Flags

1. **Fix symptoms not cause** - Patch visible error without finding root cause
2. **Skip reproduction** - Assume issue without consistent reproduction
3. **Single hypothesis** - Lock on first guess without exploring alternatives
4. **No verification** - Claim fix without testing

## Mandatory Rules

1. **MUST reproduce first** - NEVER attempt fix without consistent reproduction
2. **MUST find root cause** - Fixing symptoms without root cause leads to recurrence
3. **MUST test one hypothesis at a time** - Multiple simultaneous changes = no learning
4. **MUST verify the fix** - "Should work" is not verification
5. **NEVER blame user/environment** - Reproduce in user's conditions first

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Guess and fix** | Try random fixes hoping one works | Systematic hypothesis testing |
| **Blame user** | "Works on my machine" | Reproduce in user environment |
| **Ignore edge cases** | Only test happy path | Test error scenarios too |
| **Incomplete trace** | Stop at first error | Trace to true root cause |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "The fix is obvious" | Obvious fixes often miss root cause | Trace causal chain first |
| "It only happens sometimes" | Intermittent bugs need systematic reproduction | Find trigger conditions |
| "Adding a retry will fix it" | Retry masks the real problem | Find why it fails, then fix |
| "Let me try this quick fix first" | Quick fixes compound into technical debt | Diagnose properly, fix once |
| "I've seen this before" | Similar symptoms may have different causes | Verify with evidence, don't assume |
