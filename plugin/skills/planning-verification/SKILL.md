---
name: planning-verification
description: Designs test cases and acceptance steps to ensure requirements and designs are properly verified. Use when planning testing strategy or defining acceptance criteria.
---

# Planning Verification

## Core Thinking

**Verify** - Trust but verify. Every feature needs a way to prove it works.

## Typical Actions

- Design test cases
- Define acceptance steps
- Plan verification methods

## SOP

### 1. Identify Verification Points

- Extract key items from requirements and acceptance criteria
- Identify functional verification points (does feature work?)
- Identify non-functional points (performance, security, compatibility)
- Set verification priority (P0/P1/P2)

### 2. Design Test Cases

- **Normal flow**: Verify core functionality under normal conditions
- **Edge cases**: Verify handling of boundary values, limits
- **Error cases**: Verify error handling, fault tolerance
- Use Given/When/Then format

### 3. Determine Verification Methods

Choose appropriate method based on verification goal:

| Method | Use For |
|--------|---------|
| **Unit test** | Single function/class behavior |
| **Integration test** | Module collaboration |
| **E2E test** | Complete business flow |
| **Manual verification** | UI interaction, UX |

### 4. Write Acceptance Steps

- Provide reproducible verification sequence
- Specify expected result for each step
- Include precondition setup
- Include cleanup after verification

## Checklist

### Verification Points
- [ ] **Functional points**: All functional requirements have verification items
- [ ] **Non-functional points**: Performance, security requirements covered
- [ ] **Priority set**: P0/P1/P2 for each item

### Test Cases
- [ ] **Normal flow**: At least 3 happy path cases
- [ ] **Edge cases**: Boundary values covered
- [ ] **Error cases**: Exception handling verified

### Acceptance Steps
- [ ] **Reproducible**: Steps can be followed by anyone
- [ ] **Expected results**: Each step has clear expected outcome
- [ ] **Preconditions**: Setup requirements documented
- [ ] **Cleanup**: Post-verification cleanup documented

## Output Template

```markdown
## Verification Strategy
**Scope**: [What to verify]
**Priority**: [P0/P1/P2]

## Test Cases

### TC-001: [Case Name]
**Priority**: P0
**Type**: [Unit/Integration/E2E/Manual]

**Given**: [Precondition]
**When**: [Action]
**Then**: [Expected result]

### TC-002: [Case Name]
**Priority**: P1
**Type**: [Unit/Integration/E2E/Manual]

**Given**: [Precondition]
**When**: [Action]
**Then**: [Expected result]

## Edge Cases

| Case | Input | Expected |
|------|-------|----------|
| Empty input | "" | [Result] |
| Max value | [MAX] | [Result] |
| Invalid | [Invalid] | Error message |

## Acceptance Steps

### Preconditions
1. [Setup step 1]
2. [Setup step 2]

### Verification
1. [Action 1] → Expected: [Result 1]
2. [Action 2] → Expected: [Result 2]
3. [Action 3] → Expected: [Result 3]

### Cleanup
1. [Cleanup step 1]
```

## Coverage Guidelines

### Functional Coverage
- All features from requirements
- All acceptance criteria
- All user stories

### Scenario Coverage
| Type | Examples |
|------|----------|
| **Happy path** | Normal successful flow |
| **Edge cases** | Empty, null, max, min, special chars |
| **Error cases** | Invalid input, timeout, permission denied |
| **Concurrent** | Multiple users, race conditions |

### Priority Guidelines
| Priority | Criteria |
|----------|----------|
| **P0** | Core functionality, blocking issues |
| **P1** | Important features, significant bugs |
| **P2** | Nice to have, minor issues |

## Recording to Workspace

**Principle**: User only sees workspace, not conversation output.

### What to Record

| Content | Where | Example |
|---------|-------|---------|
| Verification scope | conclusion | "Verify: login flow, error handling" |
| Test case count | conclusion | "Cases: 5 P0, 3 P1, 2 P2" |
| Acceptance criteria source | conclusion | "From user: must support SSO" |
| Full test plan | memo | All cases with Given/When/Then |

### Conclusion Template

```
**Scope**: [what to verify]
**Cases**: [P0: X, P1: Y, P2: Z]
**Methods**: [unit/integration/e2e/manual]
**Key Criteria**:
- [criterion 1] (source: user/requirement)
- [criterion 2]
**Details**: 见 MEMO#xxx (full test plan)
```

---

## Red Flags

1. **No test plan** - Ship without any verification
2. **Only happy path** - Ignore edge and error cases
3. **Manual only** - No automated tests for core logic
4. **No acceptance criteria** - No way to know if done

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Test after** | Write tests after shipping | Plan tests before/during |
| **100% coverage** | Coverage goal over usefulness | Cover critical paths well |
| **Test implementation** | Test internal details | Test behavior and contracts |
| **Flaky tests** | Tests that sometimes fail | Reliable, deterministic tests |
