---
name: aligning-intent
description: Use when starting new tasks or when requirements are unclear. Clarifies user intent through structured questioning, eliminates ambiguity, confirms verifiable acceptance criteria.
---

# Aligning Intent

## Overview

通过自然协作对话，将模糊想法转化为清晰需求。先快速扫描项目现状，再逐个提问澄清意图，最终输出可验证的验收标准。

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **意图对齐** 技能来澄清需求、消除歧义、确认验收标准。」

This creates a commitment checkpoint. Proceed only after announcing.

## Core Thinking

**Scan then Ask**: 先快速扫描项目，再提出精准问题。避免问出"代码里已有答案"的问题。

**Clarify**: Use structured questioning to eliminate ambiguity in requirements, transform user intent into verifiable acceptance criteria.

**Be Flexible**: 如果用户回答揭示新问题，随时回退重新澄清。流程是指导，不是枷锁。

**Recording**: Conversation output is invisible to users. You MUST record to workspace node. Standard: "If context is wiped now, can you recall discussion details from conclusion alone?"

**⚠️ READ-ONLY**: This is an information gathering skill. **NEVER modify any code or files.** Only ask questions, analyze, and record findings.

## Typical Actions

- Ask user: Pose clarifying questions for ambiguous points
- Confirm acceptance criteria: Transform expectations into WHEN/THEN format
- Confidence check: MUST ask if below 80%

## SOP

### 1. Quick Scan (快速扫描)

在提问前，先了解项目现状（避免问出"代码里已有答案"的问题）：

- **项目结构**: README、目录结构、入口文件
- **相关模块**: 与用户需求相关的现有代码
- **近期变更**: 最近 commits，了解项目动态
- **已有实现**: 是否已有类似功能可复用

**Output**: 初步印象 + 相关发现（记录到 log）

**⏸️ 扫描后再问**: 基于扫描结果，提出更精准的问题。

### 2. Identify Ambiguous Points (识别歧义，基于扫描)

Check for unclear items in user input:

- **Subjective descriptions**: Adjectives, adverbs ("fast", "beautiful", "lots")
- **Incomplete lists**: Vague words like "etc.", "such as"
- **Hidden assumptions**: Unstated preconditions
- **Missing info**: Key elements not mentioned (error handling, edge cases)

**Output**: List of ambiguous points

### 3. Structured Questioning

Generate clarifying questions for identified ambiguities:

- **Quantify**: "fast response" → "What response time in ms?"
- **Complete**: "support images, videos, etc." → "What other formats?"
- **Confirm assumptions**: "after user login..." → "Are all features login-required?"
- **Edge cases**: "data import" → "How to handle failures? Size limit?"

**Principles**:
- **One question at a time** (preferred) - Deep exploration before moving to next topic
- Exception: Simple confirmations can be 2-3 together
- Priority: Core features > Edge cases > Non-functional requirements
- Questions should be specific and answerable

**Question types** (in order of preference):
1. **Multiple choice** - "A、B 还是 C？" (easiest to answer)
2. **Yes/No confirmation** - "是 X 吗？"
3. **Bounded open** - "限制是多少？(如 100, 1000, 不限)"
4. **Open-ended** - Only when above don't fit

**Output**: List of clarifying questions

### 4. Confirm Acceptance Criteria

Transform user expectations into verifiable WHEN/THEN format:

```markdown
| WHEN (Condition) | THEN (Result) |
|------------------|---------------|
| User clicks export | CSV generated within 3s with download prompt |
| Data exceeds 100k rows | Warning shown, batch export |
| Network request fails | Error message shown with retry button |
```

**Requirements**:
- Each criterion independently testable
- THEN part observable and quantifiable
- Cover normal, edge, and error scenarios

**Output**: Acceptance criteria table

### 5. Confidence Check

Evaluate understanding confidence:

- **≥85%**: Proceed to next phase
- **<85%**: MUST ask user

**Confidence scoring**:
- Core features clear: +30%
- Acceptance criteria complete: +30%
- Technical path clear: +20%
- Edge cases clear: +20%

**If confidence <85%**:
1. Identify uncertain points
2. Generate targeted questions
3. Wait for user response, re-evaluate

**Output**: Confidence % + uncertain points list (if any)

### 6. Record to Workspace (MANDATORY)

After user confirms, MUST record to workspace node:

**Recording locations**:
| Content | Location | Tool |
|---------|----------|------|
| Key conclusions (brief) | conclusion | node_update |
| QA process, acceptance criteria table | notes | node_update |
| Long analysis (>200 lines) | MEMO | memo_create + node_reference |

**NEVER hardcode MEMO IDs** in text like "见 MEMO#xxx". Use `node_reference` to link.

**Conclusion template** (brief, keywords):
```
[核心需求] + [关键约束] + [置信度X%]
```

**Notes template** (detailed):
```
**用户原话**: > "..."
**问答过程**:
- Q: ... → A: ...
**验收标准**:
| WHEN | THEN |
|------|------|
| ... | ... |
**待确认**: ...
```

**Output**: node_update called with conclusion + notes

### 7. Present to User (MANDATORY)

After recording, MUST present acceptance criteria to user for final confirmation:

1. **Output summary**: Show acceptance criteria using Output Template
2. **Wait for confirmation**: Ask user if criteria are complete and correct
3. **NEVER proceed directly**: Do NOT start implementation without user approval

**Output**: Acceptance criteria presented, user confirmation received

## Key Principles

- **Scan before ask** - 先看项目，再问问题，避免问出代码里已有答案的问题
- **One question at a time** - 一次一个问题，深入探索后再问下一个
- **Multiple choice preferred** - 选择题比开放题更容易回答
- **Quantify everything** - 所有模糊词必须量化（"快" → "多少ms"）
- **Be flexible** - 随时回退澄清，流程是指导不是枷锁

## Checklist

### Quick Scan
- [ ] **Project structure**: README、入口文件已扫描
- [ ] **Related modules**: 相关现有代码已了解
- [ ] **Existing solutions**: 已检查是否有可复用实现

### Core Elements
- [ ] **User intent**: What problem does user really want to solve?
- [ ] **Success criteria**: How to judge requirement is met?
- [ ] **Use cases**: When will this feature be used?
- [ ] **Expected result**: What does user expect to see?

### Boundaries & Constraints
- [ ] **Input limits**: Data types, formats, size limits
- [ ] **Error handling**: How to handle errors, timeouts, edge cases
- [ ] **Performance**: Response time, concurrency, data volume
- [ ] **Compatibility**: Environments, browsers, devices to support

### Acceptance Criteria
- [ ] **Normal scenarios**: At least 3 WHEN/THEN
- [ ] **Edge cases**: Empty data, oversized, special characters
- [ ] **Error scenarios**: Network failure, permission denied, timeout

### Recording (MANDATORY)
- [ ] **Conclusion written**: Brief summary in node conclusion
- [ ] **Notes written**: QA process + acceptance criteria in node notes
- [ ] **MEMO linked**: Long content in MEMO, linked via node_reference (not hardcoded ID)
- [ ] **Wipe test**: If context wiped now, can recall details from recorded content?

## Output Template (for conversation)

```markdown
### Requirement Summary
[One sentence describing user intent, ≤50 words]

### User Story
As a [role], I want [feature], so that [value]

### Acceptance Criteria
| WHEN (Condition) | THEN (Result) |
|------------------|---------------|
| [Trigger 1] | [Expected result 1, observable, quantifiable] |
| [Trigger 2] | [Expected result 2] |
| [Error condition] | [Error handling] |

### Confidence
- Current: [XX%]
- Uncertain points:
  - [ ] [Question 1]
  - [ ] [Question 2]
```

## Mandatory Rules

1. **NEVER assume**: MUST explicitly ask about anything uncertain
2. **MUST quantify**: Transform all subjective descriptions to quantifiable metrics
3. **MUST cover errors**: Not just normal flow, but error handling too
4. **NEVER skip confidence check**: <80% MUST ask, proceeding with doubts is serious error
5. **MUST get user confirmation**: Final acceptance criteria MUST be explicitly approved
6. **NEVER modify code**: 意图对齐阶段禁止 Write/Edit/Update，只能问问题和记录
7. **MUST ask questions**: 意图对齐的核心是向用户提问，不是自己分析代码得出结论

## Red Flags

When these appear, you may be skipping intent alignment:

1. **Skip quick scan** - 不看项目直接提问，问出"代码里已有答案"的问题
2. **Start implementing immediately** - User describes need, you start coding
3. **Assume understanding correct** - No confirmation with user
4. **Ignore vague words** - See "fast", "simple", "etc." without asking
5. **Skip acceptance criteria** - No WHEN/THEN transformation
6. **Inflated confidence** - Self-assess ≥80% but obvious doubts exist
7. **Code analysis instead of asking** - 用代码分析代替向用户提问 ⚠️ 严重错误
8. **Write/Edit in intent alignment** - 在意图对齐节点中修改代码 ⚠️ 严重错误
9. **No questions asked** - 整个过程没有问用户任何问题
10. **Question bombardment** - 一次问 5+ 个问题，用户难以逐一回答

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Assumption filling** | User says "fast", assume 100ms | Ask: "What response time?" |
| **Premature promise** | "OK, I'll implement it" | "Let me confirm a few things..." |
| **Pass on vague** | User says "images etc.", start coding | Ask: "What else does 'etc.' include?" |
| **Skip edge cases** | Only consider happy path | MUST clarify error handling |
| **Overconfident** | Start without asking | 5 min confirmation saves 5 hours rework |
| **Question dump** | Ask 5 questions at once | One question at a time, explore deeply |
| **Open-ended first** | "What do you want?" | "A, B, or C?" - choices are easier |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "User should know what they want" | Users often unclear on details | Help with structured questions |
| "Too many questions annoy users" | Rework wastes more time | One question at a time is less annoying |
| "This is simple, no confirmation needed" | "Simple" requirements hide assumptions | Simple also needs acceptance criteria |
| "I'll make a draft for user to see" | Wrong first version anchors direction | Align intent first, then implement |
| "Time is tight, just do it" | Rework takes 10x alignment time | 15 min alignment > 3 hour rework |
| "Asking one by one is too slow" | Batch questions get shallow answers | Deep exploration finds hidden requirements |
