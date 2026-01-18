---
name: flow-design
description: 方案规划阶段流程引导。将设计方案分解为可执行的任务计划。
---

# 方案规划阶段引导

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **方案规划阶段引导** 技能来将设计方案分解为规划节点和执行节点。」

---

## 第一步：确认进入阶段

调用以下命令确认进入规划阶段：

```typescript
signal(workspaceId: "...", code: "ZGVzaWdu")
```

---

## 第二步：阶段约束

当前阶段禁止以下操作：
- ❌ Write/Edit/MultiEdit 文件
- ❌ 派发执行（dispatch_node/dispatch_create）
- ❌ 执行任务（保持 exec 节点在 pending 状态）

允许的操作：
- ✅ 创建 planning 节点
- ✅ 创建 execution 节点（但不执行）
- ✅ 更新节点（node_update）
- ✅ 创建 MEMO 记录详细规划

---

## 第三步：分析设计方案

### 3.1 回顾设计产出

从信息阶段的结论中提取：
- 设计概要/构想
- 影响范围（文件、模块）
- 接口定义
- 实现步骤

### 3.2 根据场景选择规划策略

| 场景 | 规划策略 | 节点结构 |
|------|----------|----------|
| **feature** | TDD 驱动 | 测试定义 → 功能实现 → 集成验证 |
| **debug** | 诊断驱动 | 复现 → 定位 → 修复 → 验证回归 |
| **optimize** | 基准驱动 | 测量基准 → 优化实现 → 效果验证 → 回归验证 |
| **summary** | 产出驱动 | 收集 → 整理 → 输出 → 验证完整性 |
| **misc** | 通用流程 | 按模块/阶段分解 |

---

## 第四步：分解任务结构

### 4.1 分层原则

**8/80 规则**：每个执行节点的工作量应在 8-80 小时之间
**100% 规则**：子任务之和 = 父任务的全部工作

### 4.2 何时创建中间 planning 节点

| 判断条件 | 处理方式 |
|----------|----------|
| 任务跨多个模块/子系统 | 按模块创建 plan 节点 |
| 任务有明显的阶段/批次 | 按阶段创建 plan 节点 |
| 任务需要不同技能/角色 | 按角色分组创建 plan 节点 |
| exec 数量超过 5-7 个 | 分组为中间 plan 节点 |

### 4.3 何时直接创建 execution 节点

| 判断条件 | 说明 |
|----------|------|
| 任务单一、边界清晰 | 直接创建 exec |
| 工作量在 8-80 小时内 | 不需要再分解 |
| 再分解不会让项目更易管理 | 停止分解 |

### 4.4 分解完整性验证

问自己：
1. 所有子任务完成后，父任务是否 100% 完成？
2. 是否遗漏了某个步骤？
3. 任务之间的依赖关系是否清晰？

---

## 第五步：创建节点结构

### 5.1 创建 planning 节点

```typescript
// 1. 创建节点
node_create({
  workspaceId: "...",
  parentId: "...",
  type: "planning",
  title: "[模块/阶段名称]",
  requirement: `[详细需求描述 - 至少 3-5 行]

## 目标
[明确的目标描述]

## 范围
- [涉及的文件/模块]
- [涉及的功能点]

## 约束
- [不能做什么]
- [边界条件]`,
  acceptanceCriteria: [
    { when: "[条件1]", then: "[预期结果1]" },
    { when: "[条件2]", then: "[预期结果2]" }
  ]
})

// 2. 开始规划
node_transition({
  workspaceId: "...",
  nodeId: "[plan-node-id]",
  action: "start"
})
// 状态变为 planning
```

### 5.2 创建 execution 节点

```typescript
node_create({
  workspaceId: "...",
  parentId: "[plan-node-id]",
  type: "execution",
  title: "[动作] [具体目标]",
  requirement: `[详细需求描述 - 至少 3-5 行]

## 目标
[具体要完成什么]

## 影响文件
- [file1.ts]: [要做的修改]
- [file2.ts]: [要做的修改]

## 技术方案
[如有约束，说明具体实现方式]

## 约束
- [不能做什么]
- [需要保持什么不变]`,
  acceptanceCriteria: [
    { when: "[触发条件1]", then: "[预期行为1]", verify: "[cmd] npm test" },
    { when: "[触发条件2]", then: "[预期行为2]", verify: "[manual] 检查..." },
    { when: "[错误条件]", then: "[错误处理]", verify: "[check] 无 TODO" }
  ]
})
// exec 节点创建后保持 pending 状态
```

### 5.3 需求描述质量要求

**禁止**：
- ❌ 1-2 行的需求描述
- ❌ 模糊的描述如"实现功能"、"修复问题"
- ❌ 缺少影响范围的描述
- ❌ 缺少约束说明

**要求**：
- ✅ 至少 3-5 行详细描述
- ✅ 明确的目标和范围
- ✅ 涉及的文件/模块列表
- ✅ 技术约束和边界

### 5.4 验收标准质量要求

**禁止**：
- ❌ 无验收标准
- ❌ 宽泛无意义的描述如"功能正常工作"
- ❌ 无法验证的标准

**要求**：
- ✅ 至少 2 条具体的 WHEN/THEN
- ✅ 包含正常流程和异常流程
- ✅ 每条标准都有明确的验证方法（verify 列）

---

## 第六步：完成规划并转为监视

### 6.1 完成 planning 节点规划

当一个 planning 节点的所有子节点创建完成后：

```typescript
// planning 节点在创建子节点后应转为 monitoring
// 调用 node_transition 完成规划阶段
node_transition({
  workspaceId: "...",
  nodeId: "[plan-node-id]",
  action: "complete",
  conclusionsHash: "[从 context_get 获取]",
  conclusion: "[规划概述]"
})
```

**注意**：规划阶段完成后，所有 planning 节点应处于 `monitoring` 状态，所有 execution 节点应处于 `pending` 状态。

### 6.2 验证最终结构

检查清单：
- [ ] 所有 planning 节点状态为 `monitoring`
- [ ] 所有 execution 节点状态为 `pending`
- [ ] 每个节点都有详细的需求描述（≥3 行）
- [ ] 每个节点都有 ≥2 条验收标准
- [ ] 任务分解符合 100% 规则

---

## 第七步：展示规划并询问用户

### 7.1 展示任务树

模板：

```
## 任务规划完成

### 任务树结构

[plan] 模块A (monitoring)
├── [exec] 任务1.1 - [简述] (pending)
├── [exec] 任务1.2 - [简述] (pending)
└── [plan] 子模块A.1 (monitoring)
    ├── [exec] 任务1.1.1 (pending)
    └── [exec] 任务1.1.2 (pending)

[plan] 模块B (monitoring)
├── [exec] 任务2.1 (pending)
└── [exec] 任务2.2 (pending)

### 执行顺序建议

1. 模块A → 模块B（有依赖）
2. 任务1.1 可与任务2.1 并行

---

是否进入执行阶段？
- 输入「继续」进入 flow-impl
- 输入需要调整的内容，我将修改规划
```

### 7.2 根据用户响应

**用户同意进入下一阶段：**

```typescript
Skill(flow-impl)
```

**用户需要调整：**

1. 根据反馈修改节点
2. 重新展示规划
3. 循环直到用户满意

---

## Mandatory Rules

1. MUST call signal first - 确认进入规划阶段
2. MUST review design output - 从信息阶段结论中提取设计
3. MUST follow 8/80 and 100% rules - 分解粒度合理
4. MUST write detailed requirements - 每个节点 ≥3 行需求描述
5. MUST define acceptance criteria - 每个节点 ≥2 条验收标准
6. MUST include verify method - 每条标准说明如何验证
7. MUST keep exec nodes pending - 不在此阶段执行
8. MUST show plan and ask user - 展示规划并获得用户确认
9. NEVER modify code - 规划阶段禁止 Write/Edit
10. NEVER dispatch - 规划阶段禁止派发

---

## Red Flags

1. 跳过 signal 直接开始 → 阶段状态未同步
2. 不回顾设计直接分解 → 脱离设计方案
3. 需求描述只有 1-2 行 → 描述不充分
4. 无验收标准或标准模糊 → 无法验证完成
5. exec 节点超过 8 小时工作量 → 需要继续分解
6. 子任务之和不等于父任务 → 违反 100% 规则
7. 在规划阶段修改代码 → 违反阶段约束
8. 不展示规划直接进入执行 → 用户失去确认权

---

## Checklist

### 阶段确认
- [ ] 已调用 signal 进入规划阶段
- [ ] 已回顾信息阶段的设计产出

### 任务分解
- [ ] 遵循 8/80 规则（每个 exec 8-80 小时）
- [ ] 遵循 100% 规则（子任务之和 = 父任务）
- [ ] 按模块/阶段合理分层
- [ ] 依赖关系清晰

### 节点质量
- [ ] 每个节点需求描述 ≥3 行
- [ ] 每个节点验收标准 ≥2 条
- [ ] 每条验收标准有 verify 方法
- [ ] 无模糊或无意义的描述

### 状态检查
- [ ] 所有 planning 节点为 monitoring
- [ ] 所有 execution 节点为 pending
- [ ] 未执行任何代码修改

### 用户确认
- [ ] 已展示任务树结构
- [ ] 已说明执行顺序建议
- [ ] 已获得用户确认进入执行阶段
