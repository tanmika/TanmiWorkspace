---
name: designing-solutions
description: Builds technical solutions, defines interfaces, data structures, and implementation paths. Use when planning implementation approach for features or changes.
---

# Designing Solutions

## Core Thinking

**Architect** - Design before build. Good architecture enables good implementation.

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

## Recording to Workspace

**Principle**: User only sees workspace, not conversation output.

### What to Record

| Content | Where | Example |
|---------|-------|---------|
| Scope decision | conclusion | "Scope: src/services/auth.ts" |
| Key interfaces | conclusion | "Interface: login(creds): Token" |
| User confirmations | conclusion | > User: "no breaking changes" |
| Full design | memo | Complete interfaces, types |

### Conclusion Template

```
**Problem**: [what to solve]
**Scope**: [files/modules affected]
**Approach**: [high-level]
**Key Decisions**:
- [decision 1] (user confirmed / AI proposed)
- [decision 2]
**Implementation Steps**: [count] steps
**Details**: 见 MEMO#xxx (full design)
```

---

## Red Flags

1. **No boundaries** - Start coding without scoping
2. **Interface changes mid-way** - Design interfaces after implementation
3. **Missing states** - Forget state management design
4. **No breakdown** - Giant task without steps

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Code first** | Jump into coding | Design interfaces first |
| **Over-design** | Perfect design for simple task | Match design effort to complexity |
| **Ignore existing** | Design without checking existing code | Understand existing patterns first |
| **Hidden coupling** | Create implicit dependencies | Make dependencies explicit |
