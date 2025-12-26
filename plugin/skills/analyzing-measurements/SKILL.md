---
name: analyzing-measurements
description: Establishes performance baselines, measures and compares data, verifies optimization effects. Use when optimizing performance or establishing metrics.
---

# Analyzing Measurements

## Core Thinking

**Measure** - You can't improve what you don't measure.

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

## Recording to Workspace

**Principle**: User only sees workspace, not conversation output.

### What to Record

| Content | Where | Example |
|---------|-------|---------|
| Metrics + targets | conclusion | "Response time: target <500ms" |
| Baseline data | conclusion | "Current: 850ms (P95)" |
| Measurement method | conclusion or memo | Tool, runs, environment |
| Results comparison | conclusion | "After: 320ms (-62%)" |

### Conclusion Template

```
**Objective**: [what measured]
**Metric**: [name] (target: [value])
**Baseline**: [value] ([source/method])
**After**: [value] ([change %])
**Environment**: [brief or 见 MEMO]
**Conclusion**: [target met? next steps?]
```

---

## Red Flags

1. **No baseline** - Optimize without measuring current state
2. **Different environments** - Compare results from different conditions
3. **Single run** - Draw conclusions from one measurement
4. **Ignore other metrics** - Optimize one metric, break others

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Guess performance** | "Feels faster" | Measure with numbers |
| **Premature optimization** | Optimize without profiling | Measure first, optimize bottleneck |
| **Cherry-pick results** | Report best run only | Average multiple runs |
| **Tunnel vision** | Only check target metric | Verify no regression |
