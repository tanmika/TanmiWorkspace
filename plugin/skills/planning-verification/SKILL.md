---
name: planning-verification
description: Use when planning testing strategy or defining acceptance criteria. Designs test cases and acceptance steps to ensure requirements and designs are properly verified.
---

# Planning Verification

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **验证策略** 技能来设计测试用例、定义验收步骤、确保需求被正确验证。」

This creates a commitment checkpoint. Proceed only after announcing.

## Core Thinking

**Verify** - Trust but verify. Every feature needs a way to prove it works.

**Recording**: Conversation output is invisible to users. You MUST record to workspace node. Standard: "If context is wiped now, can you recall discussion details from conclusion alone?"

**Progressive Recording**: For large test plans, `log_append` after completing each test case category (normal, edge, error).

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

### 5. Record to Workspace (MANDATORY)

After planning, MUST record to workspace node:

**Recording locations**:
| Content | Location | Tool |
|---------|----------|------|
| Key conclusions (brief) | conclusion | node_update |
| Test cases, acceptance steps | notes | node_update |
| Full test plan (>200 lines) | MEMO | memo_create + node_reference |

**NEVER hardcode MEMO IDs** in text like "见 MEMO#xxx". Use `node_reference` to link.

**Reference rules** (verification tasks SHOULD include):
- Requirements/acceptance criteria being verified
- Related design documents
- Core principle: test cases should trace back to requirements

**Conclusion template** (brief):
```
[验证范围] + [用例数量] + [验证方法]
```

**Notes template** (detailed):
```
**Scope**: [what to verify]
**Cases**: P0: X, P1: Y, P2: Z
**Methods**: [unit/integration/e2e/manual]
**Test Cases**:
- TC-001: [name] - Given/When/Then
- TC-002: [name] - Given/When/Then
**Edge Cases**: [list]
**Acceptance Steps**:
1. [step] → Expected: [result]
```

**Output**: node_update called with conclusion + notes

### 6. Present to User (MANDATORY)

After recording, MUST present verification plan to user:

1. **Output summary**: Show test cases and acceptance steps using Output Template
2. **Wait for confirmation**: Ask user if verification plan is complete and acceptable
3. **NEVER proceed directly**: Do NOT start implementation/testing without user approval

**Output**: Verification plan presented, user confirmation received

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

### Recording (MANDATORY)
- [ ] **Conclusion written**: Brief summary in node conclusion
- [ ] **Notes written**: Test cases, acceptance steps in node notes
- [ ] **MEMO linked**: Long content in MEMO, linked via node_reference (not hardcoded ID)
- [ ] **Wipe test**: If context wiped now, can recall details from recorded content?

### Long Content Protection
- [ ] **Progressive recording**: Logged after each test case category
- [ ] **Requirements traced**: Test cases reference source requirements

## Output Template

```markdown
### Verification Strategy
**Scope**: [What to verify]
**Priority**: [P0/P1/P2]

### Test Cases

#### TC-001: [Case Name]
**Priority**: P0
**Type**: [Unit/Integration/E2E/Manual]

**Given**: [Precondition]
**When**: [Action]
**Then**: [Expected result]

#### TC-002: [Case Name]
**Priority**: P1
**Type**: [Unit/Integration/E2E/Manual]

**Given**: [Precondition]
**When**: [Action]
**Then**: [Expected result]

### Edge Cases

| Case | Input | Expected |
|------|-------|----------|
| Empty input | "" | [Result] |
| Max value | [MAX] | [Result] |
| Invalid | [Invalid] | Error message |

### Acceptance Steps

#### Preconditions
1. [Setup step 1]
2. [Setup step 2]

#### Verification
1. [Action 1] → Expected: [Result 1]
2. [Action 2] → Expected: [Result 2]
3. [Action 3] → Expected: [Result 3]

#### Cleanup
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

## Red Flags

1. **No test plan** - Ship without any verification
2. **Only happy path** - Ignore edge and error cases
3. **Manual only** - No automated tests for core logic
4. **No acceptance criteria** - No way to know if done
5. **Silent execution** - Complete verification planning, then immediately start implementation without showing user
6. **Untraceable tests** - Test cases without reference to source requirements

## Mandatory Rules

1. **MUST plan tests before/during implementation** - NEVER ship without verification plan
2. **MUST cover edge and error cases** - Happy path alone is insufficient
3. **MUST have acceptance criteria** - No way to know "done" without criteria
4. **MUST automate critical paths** - Manual-only testing for core logic is unacceptable
5. **NEVER accept flaky tests** - Unreliable tests erode trust in the test suite
6. **MUST present before proceed** - After planning verification, NEVER start implementation directly. Present plan, wait for user approval

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Test after** | Write tests after shipping | Plan tests before/during |
| **100% coverage** | Coverage goal over usefulness | Cover critical paths well |
| **Test implementation** | Test internal details | Test behavior and contracts |
| **Flaky tests** | Tests that sometimes fail | Reliable, deterministic tests |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "It works, I tested manually" | Manual testing doesn't scale, misses cases | Create automated tests |
| "Happy path covers 90% of usage" | Bugs hide in edge cases, cause most issues | MUST test edge and error cases |
| "No time for test planning" | Bugs in production cost 10x more to fix | Plan tests upfront |
| "High coverage = good quality" | Coverage without useful tests is vanity | Focus on critical path coverage |
| "We'll add tests later" | Later never comes, debt accumulates | Test with implementation |
