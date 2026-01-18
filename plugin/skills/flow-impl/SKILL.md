---
name: flow-impl
description: 执行阶段流程引导。按规划执行任务，支持派发和直接执行模式。
---

# 执行阶段引导

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **执行阶段引导** 技能来执行规划好的任务，支持派发和直接执行模式。」

---

## 第一步：确认进入阶段

调用以下命令确认进入执行阶段：

```typescript
signal(workspaceId: "...", code: "aW1wbA")
```

---

## 第二步：阶段约束

当前阶段禁止以下操作：
- ❌ 创建 planning 节点（规划阶段已完成）

允许的操作：
- ✅ Write/Edit/MultiEdit 文件
- ✅ Bash 执行命令
- ✅ 派发执行（dispatch_node/dispatch_create）
- ✅ 执行节点状态转换
- ✅ 创建额外的 execution 节点（如发现遗漏）

---

## 第三步：展示待执行任务

### 3.1 获取任务列表

```typescript
node_list({ workspaceId: "...", depth: -1 })
```

### 3.2 分析最佳执行路径

考虑因素：
- 任务之间的依赖关系
- 可并行执行的任务
- 优先级（P0 > P1 > P2）

### 3.3 展示并询问用户

模板：

```
## 待执行任务

### 任务列表

| # | 任务 | 状态 | 依赖 | 建议 |
|---|------|------|------|------|
| 1 | [任务1标题] | pending | - | 可立即开始 |
| 2 | [任务2标题] | pending | #1 | 等待任务1 |
| 3 | [任务3标题] | pending | - | 可与#1并行 |

### 建议执行顺序

1. 先执行 #1 和 #3（可并行）
2. 再执行 #2（依赖 #1）

---

请选择执行模式：
a. **全部派发** - 所有任务派发给 subagent 执行
b. **智能派发** - 需人工核验的任务不派发（见下方推断）
c. **不派发** - 我直接执行所有任务

智能派发推断（需人工核验的任务）：
- #2: [原因，如：涉及敏感配置修改]

请选择模式（a/b/c）并指定从哪个任务开始：
```

---

## 第四步：配置执行选项

### 4.1 执行模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **全部派发** | 所有 exec 派发给 subagent | 任务独立、无需人工介入 |
| **智能派发** | AI 推断 + 用户确认哪些不派发 | 部分任务需人工核验 |
| **不派发** | 主 AI 直接执行 | 任务简单或需要连续上下文 |

### 4.2 任务完成后行为（工作区配置）

| 配置值 | 行为 |
|--------|------|
| `auto_continue` | 自动继续下一个任务 |
| `ask_each` | 每个任务完成后询问用户 |

配置读取：

```typescript
config_get({ workspaceId: "...", key: "impl_continue_mode" })
```

如未配置，询问用户并保存：

```typescript
config_set({
  workspaceId: "...",
  key: "impl_continue_mode",
  value: "auto_continue" // 或 "ask_each"
})
```

---

## 第五步：执行任务

### 5.1 直接执行流程

```
node_transition(action="start")  → implementing
    ↓
执行任务（Write/Edit/Bash）
    ↓
验证结果（运行测试、检查）
    ↓
node_transition(action="complete", conclusion="...")  → completed
```

### 5.2 派发执行流程

```
dispatch_node(nodeId)  → 升级为派发母节点
    ↓
dispatch_create(...)  → 创建 exec/spec 子节点
    ↓
Skill(dispatching-parent)  → 执行派发流程
    ↓
等待 subagent 完成
    ↓
审查结果
    ↓
node_transition(action="complete")  → completed
```

### 5.3 节点状态机（执行节点）

```
pending ─start→ implementing ─submit→ validating ─complete→ completed
                     │                    │
                     └───────fail─────────┴───→ failed
                                                  │
                                               retry
                                                  ↓
                                            implementing
```

**静止态**：`pending`, `completed`, `failed`
**非静止态**：`implementing`, `validating`

---

## 第六步：处理执行问题

### 6.1 发现需要调整规划

当发现以下情况时：
- 任务过大需要分解
- 需求不清晰
- 发现遗漏的任务
- 依赖关系有问题

**处理流程**：

1. **立刻停止当前执行**
2. **将当前节点推进到静止态**
   - 如果有部分成果 → `completed` + 结论说明
   - 如果无法继续 → `failed` + 失败原因
3. **确保所有节点处于静止态**
4. **向用户说明情况**

模板：

```
## 执行问题

**当前任务**：[任务标题]
**问题**：[具体问题描述]
**理由**：[为什么需要调整规划]

**当前节点状态**：
- [节点1]: completed（部分完成）
- [节点2]: failed（无法继续）
- [节点3]: pending（未开始）

---

建议：转化到方案规划阶段重新规划

是否同意？（是/否）
```

5. **用户同意后转化到 flow-design**

```typescript
Skill(flow-design)
```

### 6.2 阶段转换前置条件

**强制验证**（代码层面 + Hook 层面）：

转换出执行阶段前，必须满足：
- 所有 execution 节点处于静止态（pending/completed/failed）
- 所有 planning 节点处于静止态（pending/monitoring/completed/cancelled）

如有非静止态节点，**拒绝转换**，必须先处理。

---

## 第七步：完成执行阶段

### 7.1 检查所有任务状态

```typescript
node_list({ workspaceId: "...", depth: -1 })
```

确认：
- 所有 exec 节点为 `completed` 或 `failed`
- 所有 plan 节点为 `completed`（AI 需手动完成并填写结论）

### 7.2 完成 planning 节点

planning 节点不会自动完成，需要 AI 手动完成：

```typescript
// 获取 conclusionsHash
context_get({ workspaceId: "...", nodeId: "[plan-node-id]" })

// 完成 planning 节点
node_transition({
  workspaceId: "...",
  nodeId: "[plan-node-id]",
  action: "complete",
  conclusionsHash: "[从 context_get 获取]",
  conclusion: "[汇总子节点执行结果的结论]"
})
```

### 7.3 汇报执行结果

模板：

```
## 执行完成

### 任务完成情况

| 任务 | 状态 | 结论 |
|------|------|------|
| [任务1] | completed | [简述] |
| [任务2] | completed | [简述] |
| [任务3] | failed | [失败原因] |

### 总结

- 完成：X 个
- 失败：Y 个
- 未执行：Z 个

### 后续建议

[如有失败任务，建议如何处理]
```

---

## Mandatory Rules

1. MUST call signal first - 确认进入执行阶段
2. MUST show task list and ask user - 展示任务并询问执行模式
3. MUST follow node state machine - 按状态机流转节点状态
4. MUST stop on major issues - 发现重大问题立刻停止
5. MUST ensure static state before phase change - 转换阶段前所有节点必须静止态
6. MUST complete planning nodes manually - planning 节点需手动完成并填写结论
7. NEVER create planning nodes - 执行阶段禁止创建规划节点
8. NEVER force phase change with non-static nodes - 有非静止态节点时禁止转换阶段

---

## Red Flags

1. 跳过 signal 直接开始 → 阶段状态未同步
2. 不展示任务直接执行 → 用户失去选择权
3. 不询问执行模式 → 默认行为可能不符合用户期望
4. 发现问题继续执行 → 可能造成更大问题
5. 有非静止态节点时转换阶段 → 违反状态约束
6. planning 节点无结论直接标记完成 → 丢失汇总信息
7. 忽略失败任务直接结束 → 未处理的失败会累积

---

## Checklist

### 阶段进入
- [ ] 已调用 signal 进入执行阶段
- [ ] 已获取并展示待执行任务列表
- [ ] 已分析最佳执行路径
- [ ] 已询问用户执行模式

### 执行过程
- [ ] 按节点状态机流转状态
- [ ] 每个任务完成后按配置处理（自动继续/询问）
- [ ] 发现问题立刻停止并汇报

### 问题处理
- [ ] 问题节点已推进到静止态
- [ ] 已向用户说明问题和理由
- [ ] 用户确认后才转换阶段

### 执行完成
- [ ] 所有 exec 节点处于 completed/failed
- [ ] 所有 plan 节点已手动完成并有结论
- [ ] 已汇报执行结果
- [ ] 失败任务有处理建议

### 阶段转换
- [ ] 所有节点处于静止态
- [ ] 通过代码验证（signal 检查）
- [ ] 通过 Hook 验证
