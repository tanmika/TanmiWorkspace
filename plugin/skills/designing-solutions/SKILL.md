---
name: designing-solutions
description: Use when planning implementation approach for features or changes. Builds technical solutions, defines interfaces, data structures, and implementation paths.
---

# Designing Solutions

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **方案设计** 技能来构建技术方案、定义接口和数据结构、规划实现路径。」

This creates a commitment checkpoint. Proceed only after announcing.

## Core Thinking

**Architect** - Design before build. Good architecture enables good implementation.

**YAGNI Ruthlessly** - You Aren't Gonna Need It. Remove unnecessary features from all designs. Simpler is better.

**Incremental Validation** - Present design in sections, validate each before proceeding. Early correction beats late rework.

**Recording**: Conversation output is invisible to users. You MUST record to workspace node. Standard: "If context is wiped now, can you recall discussion details from conclusion alone?"

**Progressive Recording**: For complex designs, checkpoint after each major decision. `log_append` interface decisions before moving to data structures.

## Typical Actions

- Define interfaces
- Design data structures
- Plan implementation steps

## SOP

### 1. Define Boundaries

**Goal**: Determine change scope and impact.

- **Change scope**: Which modules/files to modify?
- **Impact assessment**: Which callers affected?
- **Unchanged parts**: What explicitly won't change?
- **System boundary**: What system does/doesn't handle?

**Output**: Change scope list (files, modules)

**⏸️ User Validation**: Present boundaries to user. Ask: "这个变更范围对吗？有遗漏或需要排除的吗？" Wait for confirmation before proceeding.

### 2. Interface Design

**Goal**: Define input/output contracts.

- **Public interfaces**:
  - Function signatures (params, returns, exceptions)
  - API endpoints (if any)
  - Clear semantics, complete params
- **Module interfaces**:
  - Internal module collaboration
  - Call relationships, data passing
- **Backward compatibility**:
  - Need to maintain compatibility?
  - How to handle deprecated interfaces?

**Output**: Interface definitions (TypeScript/code examples)

**⚠️ Checkpoint**: After interface design, `log_append` the interface definitions before proceeding to data structures.

**⏸️ User Validation**: Present interfaces to user. Ask: "接口设计合理吗？参数和返回值符合预期吗？" Wait for confirmation before proceeding.

### 3. Data Structure Design

**Goal**: Design core data models.

- **Core types**:
  - Main interfaces/types/classes
  - Field meanings and constraints
- **State management**:
  - Where to store state?
  - How to update state?
- **Data validation**:
  - Required vs optional fields
  - Value range validation

**Output**: Type definitions with comments

**⏸️ User Validation**: Present data structures to user. Ask: "数据结构设计可以吗？字段是否完整？" Wait for confirmation before proceeding.

### 4. Implementation Plan

**Goal**: Define execution steps.

- **YAGNI check** (FIRST):
  - What can be removed without breaking core functionality?
  - Is this feature truly needed NOW, or "might be useful later"?
  - Can we simplify without losing value?
- **Task breakdown**:
  - Break into testable units
  - Each step independently verifiable
- **Execution order**:
  - Dependencies between steps
  - Recommended execution sequence
- **Risk points**:
  - Which steps are risky?
  - What could go wrong?

**Output**: Numbered implementation steps (after YAGNI pruning)

**⏸️ User Validation**: Present implementation plan to user. Ask: "实现步骤清晰吗？顺序和风险点有问题吗？" Wait for confirmation before proceeding.

### 4.5. Test & Observability Design (MANDATORY)

**Goal**: Define verification strategy and logging requirements BEFORE implementation.

#### Verification Strategy

For each implementation step, define HOW to verify it:

| Step | Verification | Format |
|------|--------------|--------|
| 核心功能 | 可运行的命令 | `[cmd] pytest tests/xxx.py` |
| UI 变更 | 手动验证步骤 | `[manual] 打开页面 → 检查显示` |
| 代码规范 | 代码检查 | `[check] 无 TODO/FIXME` |

**Critical questions**:
- **哪些功能必须有测试覆盖？** 核心业务逻辑、边界条件
- **测试放在哪里？** 现有测试目录结构
- **无测试框架时怎么办？** `[manual]` 或 `[check]` 替代

#### Logging Requirements

定义实现中需要的日志点：

| 场景 | 日志需求 |
|------|----------|
| **关键流程** | 入口、出口、状态变更 |
| **错误场景** | 错误类型、上下文、恢复动作 |
| **调试信息** | 中间状态、参数值 |

**Critical questions**:
- **哪些操作需要日志？** 用户操作、系统事件、异常
- **日志级别？** debug/info/warn/error 分别用在哪里
- **日志内容？** 需要记录哪些上下文信息

**Output**: Verification table + Logging requirements

**⚠️ Iron Law**: NO IMPLEMENTATION STEP WITHOUT VERIFICATION METHOD

**⏸️ User Validation**: Present test & observability design. Ask: "验证方式和日志需求合理吗？" Wait for confirmation before proceeding.

### 5. Record to Workspace (MANDATORY)

After design, MUST record to workspace node:

**Recording locations**:
| Content | Location | Tool |
|---------|----------|------|
| Key conclusions (brief) | conclusion | node_update |
| Scope, interfaces, steps | notes | node_update |
| Full design doc (>200 lines) | MEMO | memo_create + node_reference |

**NEVER hardcode MEMO IDs** in text like "见 MEMO#xxx". Use `node_reference` to link.

**Reference rules** (design tasks SHOULD include):
- Affected files/modules in scope
- Dependencies being relied upon
- Existing patterns being followed
- Core principle: references help reviewers understand context

**Conclusion template** (brief):
```
[问题] + [方案概述] + [影响范围] + [步骤数]
```

**Notes template** (detailed):
```
**Problem**: [what to solve]
**Approach**: [high-level]
**Scope**: [files/modules]
**Key Interfaces**:
- function(param): Return
**Key Types**:
- TypeName { field: type }
**Implementation Steps**:
1. Step 1 - [verification]
2. Step 2 - [verification]
**Risks**: [identified risks]
```

**Output**: node_update called with conclusion + notes

### 6. Present to User (MANDATORY)

After recording, MUST present design to user:

1. **Output summary**: Show design using Output Template
2. **Wait for confirmation**: Ask user if design approach is acceptable
3. **NEVER proceed directly**: Do NOT start implementation without user approval

**Output**: Design presented, user confirmation received

## Checklist

### Boundaries
- [ ] Change scope identified
- [ ] Impact assessed
- [ ] Unchanged parts documented
- [ ] System boundaries clear

### Interfaces
- [ ] Public interfaces defined
- [ ] Module interfaces defined
- [ ] Compatibility considered

### Data Structures
- [ ] Core types designed
- [ ] State management planned
- [ ] Validation rules defined

### Implementation
- [ ] **YAGNI applied**: Unnecessary features removed
- [ ] Tasks broken down
- [ ] Order determined
- [ ] Risks identified

### Test & Observability (MANDATORY)
- [ ] **Verification defined**: Each step has `[cmd]`, `[manual]`, or `[check]`
- [ ] **Critical tests identified**: Core logic has test coverage plan
- [ ] **Logging planned**: Key flows have logging requirements
- [ ] **Error logging**: Error scenarios have context capture

### Incremental Validation (MANDATORY)
- [ ] **Boundaries confirmed**: User validated change scope
- [ ] **Interfaces confirmed**: User validated interface design
- [ ] **Data structures confirmed**: User validated type definitions
- [ ] **Plan confirmed**: User validated implementation steps
- [ ] **Test & observability confirmed**: User validated verification strategy and logging

### Recording (MANDATORY)
- [ ] **Conclusion written**: Brief summary in node conclusion
- [ ] **Notes written**: Scope, interfaces, steps in node notes
- [ ] **MEMO linked**: Long content in MEMO, linked via node_reference (not hardcoded ID)
- [ ] **Wipe test**: If context wiped now, can recall details from recorded content?

### Long Content Protection
- [ ] **Checkpoint hit**: Logged interface design before data structures
- [ ] **Scope referenced**: Affected files/modules listed
- [ ] **Dependencies noted**: Key dependencies documented

## Output Template

```markdown
### Solution Overview
**Problem**: [What to solve]
**Approach**: [High-level approach]

### Boundaries
**Change scope**:
- [File 1]: [Change description]
- [File 2]: [Change description]

**Impact**: [Affected modules/callers]
**Not changing**: [Explicit exclusions]

### Interfaces

#### Public Interface
```typescript
function example(param: Type): ReturnType
```

#### Module Interface
[Internal contracts]

### Data Structures

```typescript
interface CoreType {
  field1: string;  // [description]
  field2: number;  // [description]
}
```

### Implementation Plan

1. **Step 1**: [Description]
   - Files: [list]
   - Verification: [how to verify]

2. **Step 2**: [Description]
   - Files: [list]
   - Verification: [how to verify]

### Test & Observability

#### Verification Strategy
| Step | Verification | Method |
|------|--------------|--------|
| Step 1 | [what to verify] | `[cmd] xxx` |
| Step 2 | [what to verify] | `[manual] xxx` |

#### Logging Requirements
| Flow | Log Points | Level |
|------|------------|-------|
| [operation] | entry, exit, error | info/error |

### Risks
- **Risk 1**: [Description] - Mitigation: [approach]
```

## Red Flags

1. **No boundaries** - Start coding without scoping
2. **Interface changes mid-way** - Design interfaces after implementation
3. **Missing states** - Forget state management design
4. **No breakdown** - Giant task without steps
5. **Silent execution** - Complete design, then immediately start implementing without showing user
6. **Skip checkpoint** - Complete complex design without intermediate logging
7. **Skip incremental validation** - Output entire design without pausing for user feedback at each step
8. **Batch presentation** - Present all sections at once instead of section by section
9. **YAGNI violation** - Adding "might be useful" features, over-engineering for hypothetical future needs
10. **No verification plan** - Implementation steps without `[cmd]`/`[manual]`/`[check]` methods
11. **No logging design** - Code changes without considering observability needs

## Mandatory Rules

1. **MUST define boundaries first** - NEVER start coding without knowing change scope
2. **MUST design interfaces before implementation** - Changing interfaces mid-way causes rework
3. **MUST check existing patterns** - Design must fit existing codebase, not fight it
4. **MUST break down into steps** - No giant tasks without clear milestones
5. **NEVER create hidden dependencies** - All coupling must be explicit and documented
6. **MUST present before proceed** - After design, NEVER start implementation directly. Present design, wait for user approval
7. **MUST validate incrementally** - Present each section, get user confirmation before next section. Early correction beats late rework
8. **MUST apply YAGNI** - Before finalizing design, ask "What can we remove?" Simpler designs are better designs
9. **MUST define verification for each step** - Every implementation step needs `[cmd]`, `[manual]`, or `[check]`
10. **MUST plan logging** - Key operations, errors, and state changes need log points

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Code first** | Jump into coding | Design interfaces first |
| **Over-design** | Perfect design for simple task | Match design effort to complexity |
| **Ignore existing** | Design without checking existing code | Understand existing patterns first |
| **Hidden coupling** | Create implicit dependencies | Make dependencies explicit |
| **Batch dump** | Output entire design then ask "OK?" | Present section by section, validate each |
| **Test afterthought** | "We'll figure out testing later" | Define verification in design phase |
| **Silent code** | No logs, debug by guessing | Plan log points for key operations |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "This is simple, no design needed" | Simple tasks still need scope definition | Define boundaries, even briefly |
| "I'll refine the interface as I go" | Interface changes cascade to all callers | Design interface upfront |
| "I know the codebase well enough" | Memory is unreliable, patterns may have changed | Check existing code before designing |
| "One big task is faster than splitting" | Big tasks fail more, are harder to verify | Break into testable units |
| "Design takes too long" | No design = more rework later | 30 min design saves 3 hour fixes |
| "Asking after each section is slow" | Late correction costs 10x early correction | Validate incrementally, save rework |
| "User will see the full picture better" | User drowns in details, misses problems | Small sections are easier to review |
| "We might need this later" | 90% of "later" never comes | Build what's needed NOW, extend later |
| "It's easy to add while we're here" | Easy to add = easy to add later | YAGNI - don't add until needed |
| "Testing is the executor's job" | Executor can't test what wasn't designed | Define verification in design phase |
| "Logs clutter the code" | Silent code = blind debugging | Strategic logs save hours of debugging |
