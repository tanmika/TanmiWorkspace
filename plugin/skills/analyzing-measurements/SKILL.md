---
name: analyzing-measurements
description: Use when optimizing performance or establishing metrics. Establishes performance baselines, measures and compares data, verifies optimization effects.
---

# Analyzing Measurements

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **度量分析** 技能来建立性能基准、对比数据、验证优化效果。」

This creates a commitment checkpoint. Proceed only after announcing.

## Core Thinking

**Measure** - You can't improve what you don't measure.

**Recording**: Conversation output is invisible to users. You MUST record to workspace node. Standard: "If context is wiped now, can you recall discussion details from conclusion alone?"

**Progressive Recording**: Measurement data is precious. After each measurement run, immediately `log_append` the results. Data loss means re-running tests.

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

#### Optimize Scenario: Additional Requirements

When in **optimize scenario** (performance optimization), additional steps are required:

- **Record environment differences**: Document differences between test and production environments (hardware, load, data volume). This affects result interpretation.
- **Determine warmup strategy**: Decide between cold start vs hot run measurement. Specify number of warmup iterations before actual measurement.
- **Implement noise isolation**: Close unrelated processes, fix CPU frequency (disable turbo boost), disable background services. Ensure consistent measurement conditions.

**Output**: Environment difference documentation + warmup strategy + noise isolation checklist

### 3. Get Baseline

Execute tests, record current values.

**Execution points**:
- Choose appropriate tools (wrk, k6, Lighthouse, Chrome DevTools)
- Run multiple times, take average
- Record environment conditions
- Document measurement methodology

**Output**: Baseline data table

**⚠️ Checkpoint**: After getting baseline, immediately `log_append` the baseline data. This is your reference point.

#### Optimize Scenario: Multi-Run Requirements

When in **optimize scenario**, strengthen measurement rigor:

- **Minimum 5 runs**: Each metric MUST be measured at least 5 times. Single or few runs are statistically unreliable.
- **Use percentiles**: Report P50 (median), P95, P99 instead of just average. Outliers can skew averages.
- **Record variance**: Document the range/standard deviation of measurements. High variance indicates unreliable results.
- **Immediate logging**: After baseline measurement, IMMEDIATELY call `log_append` to save results. Data loss means re-running all tests.

**Output**: Baseline data with P50/P95/P99, variance recorded, logged to workspace

### 4. Post-Optimization Comparison

After optimization, measure again and compare.

**Comparison points**:
- Use same test environment
- Use same methodology
- Calculate improvement rate
- Verify no regression in other metrics

**Output**: Before/After comparison table

#### Optimize Scenario: Regression and Statistical Validation

When in **optimize scenario**, additional validation is required:

- **Regression check**: Don't just verify the target metric improved. Check ALL related metrics for regression:
  - Memory usage (did optimization increase memory?)
  - CPU usage (did optimization shift load?)
  - Latency distribution (did P99 get worse while P50 improved?)
  - Error rate (did optimization introduce instability?)

- **Statistical significance**: Improvement MUST be outside the margin of error:
  - If baseline variance is +/-10%, a 5% improvement is NOT significant
  - Use statistical tests (t-test) for rigorous validation when needed
  - Rule of thumb: improvement should be > 2x the standard deviation

- **Multi-scenario validation**: Test under different conditions:
  - Normal load: typical usage patterns
  - High load: stress test conditions
  - Edge cases: boundary conditions, empty data, maximum data

**Output**: Regression report + statistical significance analysis + multi-scenario results

### 5. Record to Workspace (MANDATORY)

After measurement, MUST record to workspace node:

**Recording locations**:
| Content | Location | Tool |
|---------|----------|------|
| Key conclusions (brief) | conclusion | node_update |
| Metrics, baseline, results | notes | node_update |
| Full measurement data (>200 lines) | MEMO | memo_create + node_reference |

**NEVER hardcode MEMO IDs** in text like "见 MEMO#xxx". Use `node_reference` to link.

**Reference rules** (measurement tasks SHOULD include):
- Measurement tool and version
- Environment specs (for reproducibility)
- Data source/test case reference
- Core principle: reproducible measurements need documented conditions

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

### Long Content Protection
- [ ] **Baseline logged**: Used `log_append` immediately after baseline measurement
- [ ] **Environment documented**: Tool versions and specs recorded
- [ ] **Data preserved**: Raw measurement data saved before analysis

### Optimize Scenario Checklist
- [ ] **Environment differences recorded**: Test vs production differences documented (hardware, load, data volume)
- [ ] **Warmup strategy determined**: Cold start vs hot run decision made and documented
- [ ] **Noise isolation implemented**: Unrelated processes closed, CPU frequency fixed, background services disabled
- [ ] **Minimum 5 measurements per metric**: Each metric measured at least 5 times with P50/P95/P99 reported
- [ ] **Regression metrics checked**: All related metrics verified for regression (memory, CPU, latency distribution, error rate)
- [ ] **Statistical significance verified**: Improvement is outside margin of error (> 2x standard deviation)

## Output Template

```markdown
### Measurement Summary
**Objective**: [What to optimize]
**Key Metric**: [Primary metric]
**Result**: [X% improvement / No improvement]

### Environment
- **Hardware**: [Specs]
- **Software**: [Versions]
- **Data scale**: [Volume]

### Baseline (Before)
| Metric | Value | Target |
|--------|-------|--------|
| [Metric 1] | [Value] | [Target] |
| [Metric 2] | [Value] | [Target] |

### After Optimization
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| [Metric 1] | [Value] | [Value] | [+/-X%] |
| [Metric 2] | [Value] | [Value] | [+/-X%] |

### Analysis
[Explanation of results]

### Conclusion
- Target achieved: [Yes/No]
- Further optimization needed: [Yes/No]
```

## Red Flags

1. **No baseline** - Optimize without measuring current state
2. **Different environments** - Compare results from different conditions
3. **Single run** - Draw conclusions from one measurement
4. **Ignore other metrics** - Optimize one metric, break others
5. **Silent execution** - Complete measurement, then immediately start optimization without showing user
6. **Lost baseline** - Forget to log baseline before optimization
7. **Undocumented environment** - Can't reproduce measurement conditions

### Optimize Scenario Red Flags

8. **Single measurement conclusion** - Drawing conclusions from single run in performance optimization. Results are unreliable without multiple measurements.
9. **Undisclosed environment differences** - Test environment differs significantly from production but not documented. Misleads judgment about real-world impact.
10. **Target-only tunnel vision** - Only checking target metric without verifying regression in other metrics. May improve one thing while breaking another.
11. **Margin-of-error success claim** - Declaring optimization successful when improvement is within measurement variance. Self-deception that wastes effort.

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
