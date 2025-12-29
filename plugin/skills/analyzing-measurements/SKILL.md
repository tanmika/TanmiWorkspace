---
name: analyzing-measurements
description: Use when optimizing performance or establishing metrics. Establishes performance baselines, measures and compares data, verifies optimization effects.
---

# Analyzing Measurements

## Core Thinking

**Measure** - You can't improve what you don't measure.

**Recording**: Conversation output is invisible to users. You MUST record to workspace node. Standard: "If context is wiped now, can you recall discussion details from conclusion alone?"

## Typical Actions

- Establish baseline
- Compare data
- Verify improvements

## SOP

### 1. Define Metrics

Determine what to measure.

**Common metrics**:
- **Frontend**: FPS, First Paint, TTI, LCP, Bundle size
- **API**: Response time (P50/P95/P99), QPS, Error rate
- **System**: CPU usage, Memory, Disk I/O, Network
- **Business**: Conversion rate, Retention, Success rate

**Output**: Metric list with target values

### 2. Establish Test Environment

Ensure reproducible results.

**Key factors**:
- **Hardware**: CPU, Memory, Disk specs
- **Software**: OS, Runtime version, Dependencies
- **Network**: Bandwidth, Latency
- **Data scale**: Test data volume, Concurrent users

**Output**: Test environment documentation

### 3. Get Baseline

Execute tests, record current values.

**Execution points**:
- Choose appropriate tools (wrk, k6, Lighthouse, Chrome DevTools)
- Run multiple times, take average
- Record environment conditions
- Document measurement methodology

**Output**: Baseline data table

### 4. Post-Optimization Comparison

After optimization, measure again and compare.

**Comparison points**:
- Use same test environment
- Use same methodology
- Calculate improvement rate
- Verify no regression in other metrics

**Output**: Before/After comparison table

### 5. Record to Workspace (MANDATORY)

After measurement, MUST record to workspace node:

**Recording locations**:
| Content | Location | Tool |
|---------|----------|------|
| Key conclusions (brief) | conclusion | node_update |
| Metrics, baseline, results | notes | node_update |
| Full measurement data (>200 lines) | MEMO | memo_create + node_reference |

**NEVER hardcode MEMO IDs** in text like "见 MEMO#xxx". Use `node_reference` to link.

**Conclusion template** (brief):
```
[度量目标] + [基线值] + [结果] + [结论]
```

**Notes template** (detailed):
```
**Objective**: [what measured]
**Environment**: [hardware, software, data scale]
**Metrics**: [name] (target: [value])
**Baseline**: [value] ([method])
**After**: [value] ([change %])
**Analysis**: [explanation]
**Conclusion**: [target met? next steps?]
```

**Output**: node_update called with conclusion + notes

### 6. Present to User (MANDATORY)

After recording, MUST present measurement results to user:

1. **Output summary**: Show results using Output Template
2. **Wait for confirmation**: Ask user if analysis is correct and next steps are acceptable
3. **NEVER proceed directly**: Do NOT start optimization without user acknowledgment

**Output**: Results presented, user confirmation received

## Checklist

### Pre-Measurement
- [ ] Metrics defined with targets
- [ ] Test environment documented
- [ ] Measurement tools selected
- [ ] Baseline established

### Post-Optimization
- [ ] Same environment used
- [ ] Same methodology applied
- [ ] Improvement calculated
- [ ] No regression verified

### Recording (MANDATORY)
- [ ] **Conclusion written**: Brief summary in node conclusion
- [ ] **Notes written**: Metrics, baseline, results in node notes
- [ ] **MEMO linked**: Long content in MEMO, linked via node_reference (not hardcoded ID)
- [ ] **Wipe test**: If context wiped now, can recall details from recorded content?

## Output Template

```markdown
## Measurement Summary
**Objective**: [What to optimize]
**Key Metric**: [Primary metric]
**Result**: [X% improvement / No improvement]

## Environment
- **Hardware**: [Specs]
- **Software**: [Versions]
- **Data scale**: [Volume]

## Baseline (Before)
| Metric | Value | Target |
|--------|-------|--------|
| [Metric 1] | [Value] | [Target] |
| [Metric 2] | [Value] | [Target] |

## After Optimization
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| [Metric 1] | [Value] | [Value] | [+/-X%] |
| [Metric 2] | [Value] | [Value] | [+/-X%] |

## Analysis
[Explanation of results]

## Conclusion
- Target achieved: [Yes/No]
- Further optimization needed: [Yes/No]
```

## Red Flags

1. **No baseline** - Optimize without measuring current state
2. **Different environments** - Compare results from different conditions
3. **Single run** - Draw conclusions from one measurement
4. **Ignore other metrics** - Optimize one metric, break others
5. **Silent execution** - Complete measurement, then immediately start optimization without showing user

## Mandatory Rules

1. **MUST establish baseline first** - NEVER optimize without measuring current state
2. **MUST use same environment** - All measurements in identical conditions, no exceptions
3. **MUST run multiple times** - Single run data is NEVER conclusive
4. **MUST check for regressions** - Improving one metric while breaking others is unacceptable
5. **NEVER report without evidence** - Every claim needs numbers with methodology
6. **MUST present before proceed** - After measurement, NEVER start optimization directly. Present results, wait for user confirmation

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Guess performance** | "Feels faster" | Measure with numbers |
| **Premature optimization** | Optimize without profiling | Measure first, optimize bottleneck |
| **Cherry-pick results** | Report best run only | Average multiple runs |
| **Tunnel vision** | Only check target metric | Verify no regression |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "It obviously improved" | Perception is not measurement | Show before/after numbers |
| "One test run is enough" | Variance makes single runs unreliable | Run 3+ times, take average |
| "Environment doesn't matter" | Different conditions = incomparable results | Document and match environment |
| "We're in a hurry, skip baseline" | No baseline = no proof of improvement | 10 min baseline saves hours of debate |
| "Target metric improved, we're done" | May have broken other metrics | ALWAYS check for regressions |
