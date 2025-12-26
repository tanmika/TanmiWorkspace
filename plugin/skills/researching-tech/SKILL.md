---
name: researching-tech
description: Evaluates technical options through multi-dimensional comparison, provides selection recommendations. Use when choosing between technologies or approaches.
---

# Researching Tech

## Core Thinking

**Trade-off** - Every choice has pros and cons, find the best fit.

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

## Recording to Workspace

**Principle**: User only sees workspace, not conversation output.

### What to Record

| Content | Where | Example |
|---------|-------|---------|
| Options compared | conclusion | "Compared: A vs B vs C" |
| Selection + reason | conclusion | "Choose A: reason1, reason2" |
| User preference | conclusion | > User: "prefer simpler" |
| Detailed comparison | memo | Full pros/cons table |

### Conclusion Template

```
**Topic**: [what researched]
**Options**: [A, B, C]
**Recommendation**: [choice]
**Reasons**:
1. [reason with user input if any]
2. [reason]
**Risks**: [noted risks]
**Details**: 见 MEMO#xxx (full comparison)
```

---

## Red Flags

1. **Single option** - Only consider one solution
2. **Skip constraints** - Ignore compatibility with existing stack
3. **Hype-driven** - Choose trendy over appropriate
4. **No comparison** - Recommendation without pros/cons analysis

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **First result** | Pick first Google result | Compare multiple options |
| **Resume-driven** | Choose to learn new tech | Choose what fits project |
| **Ignore team** | Pick unfamiliar tech for team | Consider team expertise |
| **Overkill** | Complex solution for simple problem | Match solution to problem scale |
