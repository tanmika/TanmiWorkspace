---
name: designing-solutions
description: Use when planning implementation approach for features or changes. Builds technical solutions, defines interfaces, data structures, and implementation paths.
---

# Designing Solutions

## Core Thinking

**Architect** - Design before build. Good architecture enables good implementation.

**Recording**: Conversation output is invisible to users. You MUST record to workspace node. Standard: "If context is wiped now, can you recall discussion details from conclusion alone?"

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

### 4. Implementation Plan

**Goal**: Define execution steps.

- **Task breakdown**:
  - Break into testable units
  - Each step independently verifiable
- **Execution order**:
  - Dependencies between steps
  - Recommended execution sequence
- **Risk points**:
  - Which steps are risky?
  - What could go wrong?

**Output**: Numbered implementation steps

### 5. Record to Workspace (MANDATORY)

After design, MUST record to workspace node:

**Recording locations**:
| Content | Location | Tool |
|---------|----------|------|
| Key conclusions (brief) | conclusion | node_update |
| Scope, interfaces, steps | notes | node_update |
| Full design doc (>200 lines) | MEMO | memo_create + node_reference |

**NEVER hardcode MEMO IDs** in text like "见 MEMO#xxx". Use `node_reference` to link.

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
- [ ] Tasks broken down
- [ ] Order determined
- [ ] Risks identified

### Recording (MANDATORY)
- [ ] **Conclusion written**: Brief summary in node conclusion
- [ ] **Notes written**: Scope, interfaces, steps in node notes
- [ ] **MEMO linked**: Long content in MEMO, linked via node_reference (not hardcoded ID)
- [ ] **Wipe test**: If context wiped now, can recall details from recorded content?

## Output Template

```markdown
## Solution Overview
**Problem**: [What to solve]
**Approach**: [High-level approach]

## Boundaries
**Change scope**:
- [File 1]: [Change description]
- [File 2]: [Change description]

**Impact**: [Affected modules/callers]
**Not changing**: [Explicit exclusions]

## Interfaces

### Public Interface
```typescript
function example(param: Type): ReturnType
```

### Module Interface
[Internal contracts]

## Data Structures

```typescript
interface CoreType {
  field1: string;  // [description]
  field2: number;  // [description]
}
```

## Implementation Plan

1. **Step 1**: [Description]
   - Files: [list]
   - Verification: [how to verify]

2. **Step 2**: [Description]
   - Files: [list]
   - Verification: [how to verify]

## Risks
- **Risk 1**: [Description] - Mitigation: [approach]
```

## Red Flags

1. **No boundaries** - Start coding without scoping
2. **Interface changes mid-way** - Design interfaces after implementation
3. **Missing states** - Forget state management design
4. **No breakdown** - Giant task without steps

## Mandatory Rules

1. **MUST define boundaries first** - NEVER start coding without knowing change scope
2. **MUST design interfaces before implementation** - Changing interfaces mid-way causes rework
3. **MUST check existing patterns** - Design must fit existing codebase, not fight it
4. **MUST break down into steps** - No giant tasks without clear milestones
5. **NEVER create hidden dependencies** - All coupling must be explicit and documented

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Code first** | Jump into coding | Design interfaces first |
| **Over-design** | Perfect design for simple task | Match design effort to complexity |
| **Ignore existing** | Design without checking existing code | Understand existing patterns first |
| **Hidden coupling** | Create implicit dependencies | Make dependencies explicit |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "This is simple, no design needed" | Simple tasks still need scope definition | Define boundaries, even briefly |
| "I'll refine the interface as I go" | Interface changes cascade to all callers | Design interface upfront |
| "I know the codebase well enough" | Memory is unreliable, patterns may have changed | Check existing code before designing |
| "One big task is faster than splitting" | Big tasks fail more, are harder to verify | Break into testable units |
| "Design takes too long" | No design = more rework later | 30 min design saves 3 hour fixes |
