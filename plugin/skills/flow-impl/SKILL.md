---
name: flow-impl
description: 执行阶段流程引导。按规划执行任务，支持派发和直接执行模式。
---

# 执行阶段引导

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **执行阶段引导** 技能来执行规划好的任务，支持派发和直接执行模式。」

---

## 第零步：创建阶段进入 Todo（MANDATORY）

进入 impl 阶段后，**必须首先**创建阶段进入追踪：

```
TodoWrite([
  { content: "调用 signal 确认进入 impl 阶段", activeForm: "调用 signal 中", status: "pending" },
  { content: "展示待执行任务列表", activeForm: "展示任务列表中", status: "pending" },
  { content: "询问用户选择执行模式", activeForm: "询问执行模式中", status: "pending" },
  { content: "确认 impl_continue_mode 配置", activeForm: "确认配置中", status: "pending" }
])
```

完成每个步骤后**立即**更新 todo 状态。

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

**智能派发模式**：按任务灵活切换派发状态。
- 派发任务：`dispatch_enable` → 派发执行 → `dispatch_disable`
- 直接执行任务：确保派发已关闭后执行

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

### 4.3 创建任务执行 Todo（MANDATORY）

用户确认执行模式后，**一次性**创建所有待执行任务的 todo：

**格式**：`[任务标题] (执行模式)`

**执行模式标注**：
- `直接` - 主 AI 直接执行
- `派发` - 派发给 subagent

**示例**：
```
TodoWrite([
  { content: "实现用户注册 API (直接)", activeForm: "执行 实现用户注册 API 中", status: "pending" },
  { content: "添加单元测试 (派发)", activeForm: "执行 添加单元测试 中", status: "pending" },
  { content: "更新 API 文档 (直接)", activeForm: "执行 更新 API 文档 中", status: "pending" }
])
```

**更新时机**：
- 开始执行某任务 → 标记为 `in_progress`
- 任务完成（节点 completed）→ 标记为 `completed`
- 任务失败（节点 failed）→ 保持并在末尾追加 `[任务] 失败处理`

**重要**：
- Todo 仅用于进度展示
- 节点的 transition、log、conclusion 操作**仍必须执行**
- 禁止用 todo 替代工作台节点操作

---

## 第五步：执行任务

### 5.1 执行节点完成条件

exec 节点完成前必须满足：

| 条件 | 说明 |
|------|------|
| 需求完成 | requirement 中描述的工作全部完成 |
| 验收通过 | 所有 acceptanceCriteria 逐条验证通过 |
| 无遗留 | 无 TODO/FIXME 标记 |
| 测试通过 | 相关测试全部通过 |
| conclusion 已填写 | 记录实际完成的工作和关键决策 |

**无法完成时**：
- 标记为 `failed`
- 详尽记录 problem（失败原因、尝试过的方案、卡点）
- 评估是否可解决，无法解决时必须与用户商讨核对需求

### 5.2 操作记录要求

执行过程中，对每个操作记录：
- **修改位置**：文件路径、函数/类名
- **修改目的**：为什么做这个修改
- 记录到节点的 log 中

### 5.3 直接执行流程

```
node_transition(action="start")  → implementing
    ↓
执行任务（Write/Edit/Bash）
  - 每个操作记录修改位置和目的
    ↓
逐条核对 acceptanceCriteria
  - 全部通过 → 继续
  - 有未通过 → 修复或标记 failed
    ↓
node_transition(action="complete", conclusion="...")  → completed
```

### 5.4 派发执行流程

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

### 5.5 节点状态机（执行节点）

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

## 场景执行指导

根据任务场景类型，遵循对应的执行要点。

**通用原则**：严格遵循需求计划。如果需求计划间出现矛盾或冲突，**立即停止并核查**，与用户确认后再继续。

### Feature 场景

**执行顺序**：测试定义 → 功能实现 → 集成验证

1. **测试定义节点**
   - 编写测试用例，定义接口输入输出
   - 记录：测试文件位置、覆盖的接口列表
   - 验收：测试可运行但失败（红灯状态）
   - **完成时必须**：
     1. 在 conclusion 中用固定格式列出 API 签名：
        ```
        ## API 契约
        - functionName(param: Type): ReturnType
        - anotherFunc(arg1, arg2): Result | null
        ```
     2. 用 `node_edit` 将 API 契约追加到**后续功能实现节点**的 requirement 中：
        ```typescript
        node_edit({
          workspaceId: "...",
          nodeId: "[功能实现节点ID]",
          field: "requirement",
          operation: "append",
          content: "\n\n## API 契约（来自测试定义，必须遵循）\n- ..."
        })
        ```

2. **功能实现节点**
   - 严格按测试用例实现功能
   - 每个修改记录位置和目的
   - 添加足量日志便于后续追踪
   - 验收：所有测试通过（绿灯状态）

3. **集成验证节点**
   - 运行所有现有测试
   - 检查日志输出是否符合预期
   - 核对实现是否符合规划目标
   - 验收：无回归 + 计划核对通过

### Debug 场景

**执行顺序**：问题复现 → 根因定位 → 修复实现 → 回归验证

1. **问题复现节点**
   - 按记录的复现条件执行
   - 确认问题确实存在且可稳定复现
   - 记录：复现步骤、环境信息、错误现象
   - 验收：问题可稳定复现

2. **根因定位节点**
   - 调试追踪，记录调试过程到 notes
   - 记录：排查路径、排除的可能性、最终定位
   - 验收：明确根因位置和原因

3. **修复实现节点**
   - 针对根因修复代码
   - 记录修改位置和目的
   - 验收：复现条件下问题不再出现

4. **回归验证节点**
   - 运行所有现有测试
   - 确认修复没有引入新问题
   - 验收：所有测试通过

**特殊情况处理**：
- 修复后问题仍存在 → 回到根因定位重新分析
- 回归发现新问题 → 返回 design 阶段重新分析

### Optimize 场景

**执行顺序**：基准测量 → 优化实现 → 效果验证 → 回归验证

1. **基准测量节点**
   - 建立性能基准，记录当前指标
   - 记录：测量方法、环境条件、具体数值/截图
   - 验收：有明确可对比的基准数据

2. **优化实现节点**
   - 按优化方案实施修改
   - 记录修改位置和目的
   - 验收：代码修改完成

3. **效果验证节点**
   - 用相同方法和环境重新测量
   - 对比优化前后数据
   - 记录：优化效果、提升幅度
   - 验收：达到预期优化目标

4. **回归验证节点**
   - 运行所有现有测试
   - 确认优化没有影响功能
   - 验收：所有测试通过

**特殊情况处理**：
- 效果未达标 → 返回 design 阶段重新分析瓶颈
- 回归发现问题 → 返回 design 阶段

### Summary 场景

**执行顺序**：分主题执行 → 完整性验证

1. **分主题执行节点**（每个主题）
   - 收集该主题相关信息
   - 整理归纳，形成结构化内容
   - 记录：信息来源、整理方法
   - **结论要求**：详尽记录，假设用户只看节点来获取信息
   - 验收：主题内容完整且结构清晰

2. **完整性验证节点**
   - 核对所有主题是否覆盖要求
   - 如需 MEMO，汇总生成最终报告
   - 验收：覆盖所有要求 + 产出符合约定形式

**特殊情况处理**：
- 发现某主题规模过大 → 立即停止，向用户提出，同意后转换到 design 阶段分解
- 禁止在执行阶段自行分解任务

**结论详尽性要求**：
- 每个节点的 conclusion 必须包含完整信息
- 用户应能仅通过阅读节点 conclusion 理解全部内容
- 不能依赖"见 MEMO"等引用，关键信息必须在 conclusion 中体现

### Misc 场景

**通用执行要点**：

1. **按规划的任务结构执行**
   - 严格按规划顺序执行各节点
   - 每个节点记录修改位置和目的
   - 结论详尽记录

2. **异常处理**
   - 遵循需求计划，发现矛盾立即停止核查
   - 发现规模过大 → 转 design 阶段分解
   - 发现问题 → 标记 failed 并记录 problem

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

### 7.0 同步 Todo 状态

确保 todo list 状态与节点状态一致。如有失败任务，追加：
```
{ content: "汇总失败任务并提供建议", activeForm: "汇总失败任务中", status: "pending" }
```

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
4. MUST verify all acceptanceCriteria - 完成前逐条核对验收标准
5. MUST record operations - 每个操作记录修改位置和目的到 log
6. MUST record user answers in notes - 用户的所有回答用 notes 记录（不是 log）
7. MUST mark failed with detailed problem - 无法完成时标记 failed 并详尽记录 problem
8. MUST discuss unsolvable issues with user - 无法解决的问题必须与用户商讨核对需求
9. MUST stop on major issues - 发现重大问题立刻停止
10. MUST ensure static state before phase change - 转换阶段前所有节点必须静止态
11. MUST complete planning nodes manually - planning 节点需手动完成并填写结论
12. NEVER create planning nodes - 执行阶段禁止创建规划节点
13. NEVER force phase change with non-static nodes - 有非静止态节点时禁止转换阶段
14. NEVER mark complete without all criteria passed - 验收标准未全部通过禁止标记完成
15. MUST use node_reference for citations - 引用 MEMO 或文档必须使用 node_reference，禁止直接引用
16. MUST create phase-entry todo - 进入阶段必须创建阶段进入 todo
17. MUST create all-tasks todo after mode confirmed - 确认执行模式后一次性创建所有任务 todo
18. MUST sync todo status with node status - todo 状态必须与节点状态同步
19. NEVER replace workspace operations with todo - 禁止用 todo 替代工作台节点操作（transition/log/conclusion 仍必须执行）

---

## Red Flags

1. 跳过 signal 直接开始 → 阶段状态未同步
2. 不展示任务直接执行 → 用户失去选择权
3. 不询问执行模式 → 默认行为可能不符合用户期望
4. 不记录操作位置和目的 → 无法追溯修改原因
5. 验收标准未全部通过就标记完成 → 节点质量不达标
6. failed 节点不记录详细 problem → 无法后续分析
7. 无法解决的问题不与用户商讨 → 可能方向错误
8. 发现问题继续执行 → 可能造成更大问题
9. 有非静止态节点时转换阶段 → 违反状态约束
10. planning 节点无结论直接标记完成 → 丢失汇总信息
11. 忽略失败任务直接结束 → 未处理的失败会累积
12. 用 log 记录用户回答 → 应使用 notes
13. 直接引用 MEMO 或文档 → 必须使用 node_reference 建立引用关系
14. 不创建阶段进入 todo → 用户无法了解阶段进度
15. 确认模式后不创建任务 todo → 用户无法了解任务进度
16. todo 状态与节点状态不一致 → 进度展示失真
17. 用 todo 替代节点操作 → 工作台记录缺失，无法追溯

---

## Checklist

### 阶段进入
- [ ] 已创建阶段进入 todo
- [ ] 已调用 signal 进入执行阶段
- [ ] 已获取并展示待执行任务列表
- [ ] 已分析最佳执行路径
- [ ] 已询问用户执行模式
- [ ] 已创建所有任务的执行 todo（标注执行模式）

### 执行过程
- [ ] 按节点状态机流转状态
- [ ] 同步更新 todo 状态（开始 → in_progress，完成 → completed）
- [ ] 每个任务完成后按配置处理（自动继续/询问）
- [ ] 发现问题立刻停止并汇报

### 问题处理
- [ ] 问题节点已推进到静止态
- [ ] 已向用户说明问题和理由
- [ ] 用户确认后才转换阶段

### 执行完成
- [ ] 所有 exec 节点处于 completed/failed
- [ ] todo 状态与节点状态一致
- [ ] 所有 plan 节点已手动完成并有结论
- [ ] 已汇报执行结果
- [ ] 失败任务有处理建议

### 阶段转换
- [ ] 所有节点处于静止态
- [ ] 通过代码验证（signal 检查）
- [ ] 通过 Hook 验证
