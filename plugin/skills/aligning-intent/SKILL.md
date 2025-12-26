---
name: aligning-intent
description: Clarifies user intent through structured questioning, eliminates ambiguity, confirms verifiable acceptance criteria. Use when starting new tasks or when requirements are unclear.
---

# Aligning Intent

## Core Thinking

**Clarify**: Use structured questioning to eliminate ambiguity in requirements, transform user intent into verifiable acceptance criteria.

## Typical Actions

- Ask user: Pose clarifying questions for ambiguous points
- Confirm acceptance criteria: Transform expectations into WHEN/THEN format
- Confidence check: MUST ask if below 80%

## SOP

### 1. Identify Ambiguous Points

Check for unclear items in user input:

- **Subjective descriptions**: Adjectives, adverbs ("fast", "beautiful", "lots")
- **Incomplete lists**: Vague words like "etc.", "such as"
- **Hidden assumptions**: Unstated preconditions
- **Missing info**: Key elements not mentioned (error handling, edge cases)

**Output**: List of ambiguous points

### 2. Structured Questioning

Generate clarifying questions for identified ambiguities:

- **Quantify**: "fast response" → "What response time in ms?"
- **Complete**: "support images, videos, etc." → "What other formats?"
- **Confirm assumptions**: "after user login..." → "Are all features login-required?"
- **Edge cases**: "data import" → "How to handle failures? Size limit?"

**Principles**:
- Max 5 questions at once
- Priority: Core features > Edge cases > Non-functional requirements
- Questions should be specific and answerable

**Output**: List of clarifying questions

### 3. Confirm Acceptance Criteria

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

### 4. Confidence Check

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

## Checklist

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

## Recording to Workspace

**Principle**: User only sees workspace, not conversation output.

### What to Record

| Content | Where | Example |
|---------|-------|---------|
| User's original words | conclusion | > User: "I want it faster" |
| Questions asked | conclusion or memo | Q1: Response time? A: <500ms |
| Confirmed criteria | conclusion | WHEN/THEN table |
| Unconfirmed items | conclusion | - [ ] Error handling TBD |
| Detailed analysis | memo | Long content → memo_create |

### Conclusion Template

```
**User Input**: > "[original words]"
**Alignment Process**:
- Q: [question] → A: [user answer]
- Q: [question] → A: [user answer]
**Confirmed**: [key acceptance criteria]
**Pending**: [unconfirmed items]
**Confidence**: X% - [reason]
```

### Long Content Handling

If alignment details exceed 10 lines:
1. Use `memo_create` to store full content
2. Write concise conclusion: "见 MEMO#xxx"

---

## Output Template (for conversation)

```markdown
## Requirement Summary
[One sentence describing user intent, ≤50 words]

## User Story
As a [role], I want [feature], so that [value]

## Acceptance Criteria
| WHEN (Condition) | THEN (Result) |
|------------------|---------------|
| [Trigger 1] | [Expected result 1, observable, quantifiable] |
| [Trigger 2] | [Expected result 2] |
| [Error condition] | [Error handling] |

## Confidence
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

## Red Flags

When these appear, you may be skipping intent alignment:

1. **Start implementing immediately** - User describes need, you start coding
2. **Assume understanding correct** - No confirmation with user
3. **Ignore vague words** - See "fast", "simple", "etc." without asking
4. **Skip acceptance criteria** - No WHEN/THEN transformation
5. **Inflated confidence** - Self-assess ≥80% but obvious doubts exist

## Anti-Patterns

| Pattern | Wrong | Right |
|---------|-------|-------|
| **Assumption filling** | User says "fast", assume 100ms | Ask: "What response time?" |
| **Premature promise** | "OK, I'll implement it" | "Let me confirm a few things..." |
| **Pass on vague** | User says "images etc.", start coding | Ask: "What else does 'etc.' include?" |
| **Skip edge cases** | Only consider happy path | MUST clarify error handling |
| **Overconfident** | Start without asking | 5 min confirmation saves 5 hours rework |

## Common Rationalizations

| Excuse | Why Wrong | Correct Action |
|--------|-----------|----------------|
| "User should know what they want" | Users often unclear on details | Help with structured questions |
| "Too many questions annoy users" | Rework wastes more time | Ask once clearly, max 5 questions |
| "This is simple, no confirmation needed" | "Simple" requirements hide assumptions | Simple also needs acceptance criteria |
| "I'll make a draft for user to see" | Wrong first version anchors direction | Align intent first, then implement |
| "Time is tight, just do it" | Rework takes 10x alignment time | 15 min alignment > 3 hour rework |
