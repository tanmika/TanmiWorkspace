---
name: memo-create
description: Use when creating MEMOs in workspace. Guides proper title (5-20 chars), summary (≤50 chars), content structure, and tags formatting.
---

# MEMO Creation Guide

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

"I will use the **MEMO Creation** skill to create a high-quality MEMO with proper formatting."

## Core Thinking

**Quality**: Create MEMOs with clear titles, concise summaries, structured content, and appropriate tags.

**Recording**: MEMOs are workspace drafts - preserve discussion process, don't over-refine.

## What is MEMO

MEMO is the workspace's draft area, stored independently from the node tree, used for:
- Temporary recording of scattered ideas and discussions
- Unstructured content during brainstorming
- Draft technical proposals not yet finalized
- Reference materials shared across nodes
- Information summaries before creating info_summary nodes

**MEMO vs Node Note**:
- MEMO: Independent storage, can be referenced by multiple nodes, suitable for drafts
- Note: Bound to a node, suitable for implementation details

## When to Use MEMO

| Scenario | Use MEMO? | Explanation |
|----------|-----------|-------------|
| Brainstorming phase | ✅ Yes | Ideas scattered, structure undefined |
| Technical proposal draft | ✅ Yes | Not finalized, needs discussion |
| Pre info_summary summary | ✅ Yes | Summarize existing info first |
| Cross-node reference | ✅ Yes | Multiple nodes need to reference |
| Temporary research notes | ✅ Yes | Research results pending organization |
| Node implementation details | ❌ Use note | Bound to specific node |

## SOP

### Step 1: Generate Title

**Principles**: Brief, clear, quickly identifiable

**Format**:
- Use Chinese
- Length: 5-20 characters
- Avoid lengthy descriptions

**Examples**:

| ❌ Bad Title | ✅ Good Title |
|-------------|--------------|
| Some thoughts about MEMO mechanism implementation | MEMO Mechanism Initial Thoughts |
| We need to discuss capability pack model design | Capability Pack Model Draft |

### Step 2: Generate Summary

**Principles**: One sentence stating core content, ≤50 characters

**Format**:
- Complete sentence with subject-verb-object
- Directly state core content
- Don't use self-referential expressions like "This document..."

**Examples**:

| ❌ Bad Summary | ✅ Good Summary |
|---------------|----------------|
| This document discusses capability pack model | Defines Capability, BasePack, OptionalPack three-tier model |
| Some thoughts about MEMO | MEMO stored independently, supports multi-node reference and tag filtering |

### Step 3: Structure Content

**Principles**: Preserve discussion process, use Markdown structure

**Recommended Structure**:

```markdown
## Background/Problem
[Why this MEMO is needed]

## Core Ideas
[Main points or proposals]

## Discussion Points
- Point 1
- Point 2

## Pending Decisions
- [ ] Decision item 1
- [ ] Decision item 2

## References
- Related links or documents
```

**Notes**:
- Preserve thinking process, don't over-refine
- Use headings, lists, tables for structure
- Use code blocks for code snippets
- Can include unresolved questions

### Step 4: Recommend Tags

**Principles**: Few but precise, easy to filter

**Tag Types**:

| Type | Examples | Description |
|------|----------|-------------|
| Stage tag | draft, wip, done | Draft/In progress/Completed |
| Topic tag | design, research, bug | Design/Research/Defect |
| Tech tag | typescript, react, node | Related tech stack |
| Project tag | scenario-planning, memo | Feature module |

**Quantity Guidelines**:
- Minimum 1, maximum 5
- Must include 1 stage tag (draft/wip/done)
- Prefer existing tags (check via workspace_get)

**Examples**:

| Content | Recommended Tags |
|---------|------------------|
| MEMO mechanism design draft | ["draft", "design", "memo"] |
| React performance optimization research | ["wip", "research", "react"] |
| TypeScript type inference issue record | ["done", "bug", "typescript"] |

## Checklist

Before creating MEMO, verify:

- [ ] Title: 5-20 characters, concise
- [ ] Summary: ≤50 characters, one sentence stating core
- [ ] Content: Preserves discussion, uses Markdown structure
- [ ] Tags: 1-5 tags, includes stage tag (draft/wip/done)

## Common Errors

### ❌ Error 1: Title too long

```
title: "Some thoughts about TanmiWorkspace scenario planning system MEMO mechanism design and implementation"
```

**Fix**:
```
title: "MEMO Mechanism Design Thoughts"
```

### ❌ Error 2: Summary exceeds 50 characters

```
summary: "This document discusses MEMO mechanism design in detail, including storage location, reference protocol, tag system and other aspects, and proposes specific implementation plans"
```

**Fix**:
```
summary: "MEMO stored independently, supports multi-node reference and tag filtering"
```

### ❌ Error 3: Too many tags or missing stage tag

```
tags: ["memo", "design", "typescript", "workspace", "planning", "node", "reference"]
```

**Fix**:
```
tags: ["draft", "design", "memo"]
```

### ❌ Error 4: Content over-refined, loses discussion value

```markdown
## Proposal
Use memos/ directory for storage.
```

**Fix**:
```markdown
## Background
Need a draft area independent of node tree.

## Proposal Comparison
1. Store in node.note: Too coupled
2. Store in assets/: Confused with other resources
3. Store in memos/: Independent and clear ✅

## Decision
Use memos/ directory, reason: Good independence, easy to manage.
```

## Tool Call Reference

```typescript
// Create MEMO
memo_create({
  workspaceId: "ws-xxx",
  title: "Brief title",
  summary: "≤50 char summary",
  content: "Full Markdown content",
  tags: ["draft", "design"]
})

// Check existing tags (avoid duplicates)
workspace_get({ workspaceId: "ws-xxx" })
```

## Mandatory Rules

1. **Title length**: Must be 5-20 characters
2. **Summary length**: Must be ≤50 characters
3. **Stage tag required**: Tags must include one of draft/wip/done
4. **Preserve discussion**: Content should preserve thinking process, not just conclusions
5. **Check existing tags**: Before creating, check workspace_get for existing tags to maintain consistency
