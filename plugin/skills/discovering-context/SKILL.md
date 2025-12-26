---
name: discovering-context
description: Investigates project context, understands existing state and dependencies. Use when starting work on unfamiliar codebase or module.
---

# Discovering Context

## Core Thinking

**Investigate** - Build cognitive model through systematic information collection.

## Typical Actions

- **Explore codebase**: Use Task tool with `subagent_type=Explore` for complex exploration
- Search code: Use Grep/Glob for targeted keyword search
- Read docs: Scan README, design docs, API docs
- Trace dependencies: Analyze module relationships, data flow

## When to Use Explore Agent

**PREFER Explore agent** for open-ended exploration:
- "Where is X implemented?"
- "How does the codebase handle Y?"
- "Find all files related to Z"

**Use Grep/Glob directly** for targeted search:
- Specific class/function name
- Known file pattern
- Simple keyword lookup

## Strategy Selection

### Macro (Document-first)
- **Use when**: New project, architecture design, requirements analysis
- **Sources**: README, docs/, architecture diagrams, CHANGELOG
- **Goal**: Understand overall design, business logic, module structure

### Micro (Code-first)
- **Use when**: Bug fixing, feature extension, code refactoring
- **Sources**: Source code, type definitions, test cases
- **Goal**: Understand implementation, data flow, call chains

**Decision rules**:
- Architecture design → Macro
- Specific implementation → Micro
- New domain → Macro first, then Micro deep dive
- Clear local scope → Micro first

## SOP

### 1. Entry Point Location

**Macro entries**:
1. Project root README.md
2. docs/ directory
3. package.json / pyproject.toml
4. CHANGELOG.md

**Micro entries**:
1. Grep for keywords
2. src/index.* or main.*
3. Type definitions (src/types/)
4. Test files

### 2. Dependency Analysis

**Module dependencies**:
- Analyze import/export relationships
- Identify core vs auxiliary modules
- Build mental dependency graph

**External dependencies**:
- Extract production vs dev dependencies
- Identify core libraries and their purpose
- Note version constraints

**Data dependencies**:
- Identify shared data structures
- Trace data flow paths
- Understand state management

### 3. Data Flow Tracing

**For functional tasks**:
- Start from user input
- Track through modules
- Identify transformations
- Locate final output

**For system tasks**:
- Identify core data structures
- Understand persistence
- Analyze sync mechanisms
- Trace config propagation

### 4. Output Knowledge Snapshot

Structure findings using output template.

## Information Source Priority

1. **Codebase**: Most reliable, implementation is truth
2. **Docs**: Official documentation, design docs
3. **User**: Confirm requirements and expectations
4. **Public Knowledge**: Tech docs, best practices

**Rules**:
- Code conflicts with docs → Trust code
- Docs missing → Check code first, then ask user
- Uncertain → Mark as "to be confirmed"

## Checklist

### Macro
- [ ] Project overview understood
- [ ] Tech stack identified
- [ ] Module structure mapped
- [ ] Data flow documented
- [ ] Config/deployment understood

### Micro
- [ ] Entry point located
- [ ] Key functions identified
- [ ] Type definitions understood
- [ ] Dependencies traced
- [ ] Data flow traced
- [ ] Error handling identified

## Recording to Workspace

**Principle**: User only sees workspace, not conversation output.

### What to Record

| Content | Where | Example |
|---------|-------|---------|
| Scanned scope | conclusion | "Scanned: src/services/, docs/" |
| Key files found | conclusion | "Entry: src/index.ts:45" |
| Discoveries | conclusion or memo | Dependencies, data flow |
| Uncertainties | conclusion | "TBD: Config loading mechanism" |

### Conclusion Template

```
**Scope**: [what was scanned]
**Strategy**: [Macro/Micro]
**Key Findings**:
- Entry: [file:line]
- Dependencies: [list]
- Data flow: [brief]
**Uncertainties**: [items to confirm]
**Details**: 见 MEMO#xxx (if long)
```

### Long Content Handling

If findings exceed 10 lines:
1. Use `memo_create` to store full knowledge snapshot
2. Write concise conclusion with key paths and discoveries

---

## Red Flags

1. **Skip exploration** - Start implementing without reading existing code
2. **Assume existence** - Assume feature exists without verification
3. **Ignore dependencies** - Don't check module relationships
4. **Wrong strategy** - Use docs when should use code, or vice versa

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Blind start** | Code without reading existing code | Grep/Glob to locate relevant code first |
| **Over-explore** | Read entire project | Scope to task needs |
| **Trust docs over code** | Docs say X exists, believe it | Code is truth, docs may be stale |
| **No record** | Explore and forget | Output structured knowledge snapshot |
