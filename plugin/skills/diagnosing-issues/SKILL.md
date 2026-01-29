---
name: diagnosing-issues
description: Use when debugging errors or investigating performance issues. Traces root cause of problems, applies to logic errors and performance bottlenecks.
---

# Diagnosing Issues

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **问题诊断** 技能来追踪问题根因、分析逻辑错误和性能瓶颈。」

This creates a commitment checkpoint. Proceed only after announcing.

## Core Thinking

**Trace** - Follow the causal chain to find root cause.

**Recording**: Conversation output is invisible to users. You MUST record to workspace node. Standard: "If context is wiped now, can you recall discussion details from conclusion alone?"

**Progressive Recording**: Diagnosis can be long. After each hypothesis test, immediately `log_append` the result. Don't lose valuable debugging insights.

## Applicable Scenarios

- **Debug**: Diagnose logic errors (why error occurs)
- **Optimize**: Diagnose performance bottlenecks (why slow)

## SOP

### 1. Reproduce/Locate

#### Debug Scenario
- Collect error info (message, stack trace, error code)
- Confirm reproduction steps (always/sometimes, trigger conditions)
- **Locate code line**: Find code position from error stack

**Debug Scenario**:
- **Record reproduction environment**: Document environment requirements in notes (OS, versions, configs) so others can independently reproduce
- **Handle non-reproducible cases**: If cannot reproduce, immediately `problem_update` with "Cannot reproduce, need more info" and request additional context/logs
- **Set diagnosis time-box**: Single hypothesis verification exceeding 15 minutes without result should trigger a checkpoint

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

**⚠️ Checkpoint**: After each hypothesis test, `log_append` the result (confirmed/rejected + evidence).

**Debug Scene Enhancement - Fail Fast Mechanism**:
- **Record every hypothesis result**: After each hypothesis test, MUST `log_append` with confirmed/rejected + evidence
- **Trigger evaluation on 3 consecutive rejections**: If 3 hypotheses are rejected in a row:
  1. Call `problem_update` to record current diagnosis progress and blocking point
  2. Evaluate whether to return to design phase for re-analysis
  3. If info insufficient, mark as failed with suggestion "Need more context/logs/permissions"

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

**Debug Scenario**:
- **Root cause completeness verification**: Root cause MUST explain ALL observed symptoms, not just some
- **Impact scope assessment**: Clarify the impact scope of fix - does it affect other features?
- **Evaluate verification node creation**: Assess whether to dynamically create a verification node to confirm the fix

### 5. Record to Workspace (MANDATORY)

After diagnosis, MUST record to workspace node:

**Recording locations**:
| Content | Location | Tool |
|---------|----------|------|
| Key conclusions (brief) | conclusion | node_update |
| Hypotheses, investigation, root cause | notes | node_update |
| Full trace log (>200 lines) | MEMO | memo_create + node_reference |

**NEVER hardcode MEMO IDs** in text like "见 MEMO#xxx". Use `node_reference` to link.

**Reference rules** (diagnosis tasks MUST include):
- Root cause location: `file:line` format (CRITICAL)
- Error stack trace: key frames with file:line
- Causal chain: each node with file reference
- Core principle: precise location enables verification and fix

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

### 6. Present to User (MANDATORY)

After recording, MUST present diagnosis to user:

1. **Output summary**: Show root cause and fix recommendation using Output Template
2. **Wait for confirmation**: Ask user if diagnosis is correct and fix approach is acceptable
3. **NEVER proceed directly**: Do NOT start fixing without user confirmation

**Output**: Diagnosis presented, user confirmation received

## Fail Fast Mechanism (Debug Scenario Core Enhancement)

### Diagnosis Blocking Criteria

When any of the following conditions occur, trigger fail fast process:

1. **Cannot reproduce** → `problem_update` + request more info from user
2. **3 consecutive hypothesis rejections** → `problem_update` + evaluate returning to design phase
3. **Need additional permissions/tools** → `problem_update` + mark as blocked
4. **Diagnosis timeout (>30min without progress)** → `problem_update` + fail

### Phase Switch Timing

Recognize when to switch phases instead of continuing stuck diagnosis:

- **Root cause exceeds current understanding** → Return to design phase for architecture re-analysis
- **Need to fix other issues first** → Create prerequisite fix node
- **Multiple fix options available** → Return to design phase for solution comparison

### Handling Process

```
Blocking detected
  ↓
problem_update (record current findings + blocking point)
  ↓
Evaluate: recoverable?
  ├─ Yes → attempt recovery + log_append
  └─ No  → fail with conclusion explaining situation
```

## Checklist

### Debug
- [ ] Error message collected
- [ ] Stack trace analyzed
- [ ] Reproduction steps confirmed
- [ ] Root cause code located
- [ ] Fix verified

### Debug Scenario (WHEN applicable)
- [ ] **Reproduction steps executable**: Environment requirements documented, others can independently reproduce
- [ ] **Hypothesis results logged**: Every hypothesis test result has been `log_append`ed
- [ ] **Blocking handled**: Called `problem_update` when stuck
- [ ] **Root cause complete**: Root cause explains ALL observed symptoms
- [ ] **Impact scope assessed**: Fix impact on other features has been evaluated

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

### Long Content Protection
- [ ] **Progressive recording**: Used `log_append` after each hypothesis test
- [ ] **Root cause referenced**: Location has precise `file:line`
- [ ] **Causal chain referenced**: Each node has file reference

## Output Template

```markdown
### Diagnosis Summary
**Issue type**: [Error/Performance]
**Root cause**: [One sentence description]
**Location**: [file:line]

### Reproduction Path
1. [Step 1]
2. [Step 2]
3. [Symptom appears]

### Causal Chain
[Entry] → [Function A] → [Function B] → [Problem point]

### Root Cause Analysis
[Detailed explanation of why this causes the issue]

### Fix Recommendation
[Specific fix approach]
```

## Red Flags

1. **Fix symptoms not cause** - Patch visible error without finding root cause
2. **Skip reproduction** - Assume issue without consistent reproduction
3. **Single hypothesis** - Lock on first guess without exploring alternatives
4. **No verification** - Claim fix without testing
5. **Silent execution** - Complete diagnosis, then immediately start fixing without showing user
6. **Vague location** - "The problem is in module X" without `file:line`
7. **Lost hypotheses** - Test multiple hypotheses without logging results

### Debug Scenario Red Flags
8. **Guessing without reproduction** - Cannot reproduce but continue speculative diagnosis
9. **Unrecorded hypothesis rejection** - Hypothesis rejected but not logged, directly try next one
10. **Silent blocking** - Diagnosis stuck but not calling `problem_update`
11. **Prolonged stagnation** - No progress for >30 minutes without triggering fail evaluation
12. **Premature conclusion** - Found "one possible cause" and stopped, without verifying it explains ALL symptoms

## Mandatory Rules

1. **MUST reproduce first** - NEVER attempt fix without consistent reproduction
2. **MUST find root cause** - Fixing symptoms without root cause leads to recurrence
3. **MUST test one hypothesis at a time** - Multiple simultaneous changes = no learning
4. **MUST verify the fix** - "Should work" is not verification
5. **NEVER blame user/environment** - Reproduce in user's conditions first
6. **MUST present before proceed** - After diagnosis, NEVER start fixing directly. Present diagnosis, wait for user confirmation

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
