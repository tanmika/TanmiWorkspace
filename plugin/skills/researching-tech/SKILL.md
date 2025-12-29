---
name: researching-tech
description: Use when choosing between technologies or approaches. Evaluates technical options through multi-dimensional comparison, provides selection recommendations.
---

# Researching Tech

## Core Thinking

**Trade-off** - Every choice has pros and cons, find the best fit.

**Recording**: Conversation output is invisible to users. You MUST record to workspace node. Standard: "If context is wiped now, can you recall discussion details from conclusion alone?"

## Typical Actions

- Compare options
- Review best practices
- Validate constraints

## SOP

### 1. Identify Options

- List candidate solutions (at least 2)
- Collect core features for each
- Record official links/repos

### 2. Constraint Matching

- Check existing tech stack compatibility
- Exclude incompatible options
- Verify environment requirements (Node version, dependencies)

### 3. Multi-dimensional Comparison

| Dimension | Considerations |
|-----------|----------------|
| **Implementation complexity** | Code amount, config complexity |
| **Performance** | Throughput, latency, resource usage |
| **Maintenance cost** | Learning curve, doc quality, community support |

### 4. Recommendation

- Give clear recommendation
- Explain reasoning (at least 3 points)
- Note prerequisites and risks

### 5. Record to Workspace (MANDATORY)

After research, MUST record to workspace node:

**Recording locations**:
| Content | Location | Tool |
|---------|----------|------|
| Key conclusions (brief) | conclusion | node_update |
| Options, comparison, reasoning | notes | node_update |
| Full comparison table (>200 lines) | MEMO | memo_create + node_reference |

**NEVER hardcode MEMO IDs** in text like "见 MEMO#xxx". Use `node_reference` to link.

**Conclusion template** (brief):
```
[调研主题] + [推荐选项] + [核心理由]
```

**Notes template** (detailed):
```
**Topic**: [what researched]
**Options**: [A, B, C with links]
**Comparison**:
| Dimension | A | B | C |
|-----------|---|---|---|
| ... | ... | ... | ... |
**Recommendation**: [choice]
**Reasons**: 1. ... 2. ... 3. ...
**Risks**: [noted risks]
```

**Output**: node_update called with conclusion + notes

### 6. Present to User (MANDATORY)

After recording, MUST present research findings to user:

1. **Output summary**: Show recommendation using Output Template
2. **Wait for confirmation**: Ask user if they accept the recommendation
3. **NEVER proceed directly**: Do NOT start implementation without user decision

**Output**: Recommendation presented, user decision received

## Checklist

### Option Completeness
- [ ] At least 2 candidates identified
- [ ] Official links/repos recorded
- [ ] Core features documented

### Constraint Validation
- [ ] Tech stack compatibility checked
- [ ] Environment requirements verified
- [ ] Incompatible options excluded

### Comparison Quality
- [ ] Multiple dimensions compared
- [ ] Pros/Cons listed for each
- [ ] Concrete examples provided

### Conclusion
- [ ] Clear recommendation given
- [ ] Reasoning explained (3+ points)
- [ ] Risks documented

### Recording (MANDATORY)
- [ ] **Conclusion written**: Brief summary in node conclusion
- [ ] **Notes written**: Options, comparison, reasoning in node notes
- [ ] **MEMO linked**: Long content in MEMO, linked via node_reference (not hardcoded ID)
- [ ] **Wipe test**: If context wiped now, can recall details from recorded content?

## Output Template

```markdown
## Research Summary
**Topic**: [What technology/approach]
**Recommendation**: [Recommended option]

## Candidates

### Option A: [Name]
- **Link**: [URL]
- **Features**: [Key features]
- **Pros**: [List]
- **Cons**: [List]

### Option B: [Name]
- **Link**: [URL]
- **Features**: [Key features]
- **Pros**: [List]
- **Cons**: [List]

## Comparison

| Dimension | Option A | Option B |
|-----------|----------|----------|
| Complexity | [Rating] | [Rating] |
| Performance | [Rating] | [Rating] |
| Maintenance | [Rating] | [Rating] |

## Recommendation

**Choose: [Option]**

**Reasons**:
1. [Reason 1]
2. [Reason 2]
3. [Reason 3]

**Prerequisites**:
- [Prerequisite 1]

**Risks**:
- [Risk 1]
```

## Red Flags

1. **Single option** - Only consider one solution
2. **Skip constraints** - Ignore compatibility with existing stack
3. **Hype-driven** - Choose trendy over appropriate
4. **No comparison** - Recommendation without pros/cons analysis
5. **Silent execution** - Complete research, then immediately start implementing without showing user

## Mandatory Rules

1. **MUST compare at least 2 options** - Single option is not a choice
2. **MUST check compatibility** - Tech must work with existing stack
3. **MUST provide reasoning** - Recommendations need justification (3+ points)
4. **MUST document risks** - Every choice has trade-offs
5. **NEVER choose based on hype** - Fit to project, not trends
6. **MUST present before proceed** - After research, NEVER start implementation directly. Present recommendation, wait for user decision

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **First result** | Pick first Google result | Compare multiple options |
| **Resume-driven** | Choose to learn new tech | Choose what fits project |
| **Ignore team** | Pick unfamiliar tech for team | Consider team expertise |
| **Overkill** | Complex solution for simple problem | Match solution to problem scale |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "This is the industry standard" | Standards may not fit your context | Evaluate fit for YOUR project |
| "The benchmark shows it's fastest" | Benchmarks don't reflect your use case | Test in your context |
| "It's what I know best" | Familiarity != best fit | Compare objectively |
| "Newer is better" | Newer = less stable, fewer resources | Evaluate maturity and support |
| "Everyone recommends it" | Popularity != appropriateness | Match to requirements, not trends |
