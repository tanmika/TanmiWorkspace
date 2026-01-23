---
name: flow-info
description: 信息阶段流程引导。工作区初始化后、开始新研究任务、补充信息时使用。
---

# 信息阶段引导

## Announcement (MANDATORY)

Before executing this skill, you MUST announce to the user:

「我将使用 **信息阶段引导** 技能来选择能力、创建信息节点、执行{收集/总结}流程。」

---

## 第一步：确认进入阶段

调用以下命令确认进入信息阶段：

```typescript
signal(workspaceId: "...", code: "aW5mbw")
```

---

## 第二步：阶段约束

当前阶段禁止以下操作：
- ❌ Write/Edit/MultiEdit 文件
- ❌ 直接 node_create 创建信息节点（必须使用 capability_select）

允许的操作：
- ✅ Read/Search/Grep/Glob 探索代码
- ✅ capability_list/capability_select 选择能力
- ✅ 记录发现到 conclusion
- ✅ 创建 MEMO 保存详细信息

---

## 第三步：能力选择

### 3.1 获取推荐能力

```typescript
capability_list({ workspaceId: "ws-xxx" })
```

返回：
- basePack：必选能力（全部必须选择）
- optionalPack：可选能力（用户选择）

### 3.2 展示并询问用户

模板：

```
要进行「{用户目标}」，这是一个**{收集/总结}**任务。

我将执行以下能力：
- **{能力名}**: {任务语境下的具体作用}
- **{能力名}**: {任务语境下的具体作用}

还可以选择：
  a. **{能力名}** - {语境下描述}
  b. **{能力名}** - {语境下描述}

需要添加哪些？（输入序号如 a、ab，或回车跳过）
```

规则：
- basePack：直接说「我将执行」，不问用户
- optionalPack：用 abc 序号，方便用户输入
- MUST 等待用户响应后再调用 capability_select
- MUST 用 **notes** 记录用户回答（不是 log）

### 3.3 创建信息节点

```typescript
capability_select({
  workspaceId: "ws-xxx",
  infoType: "info_collection",  // 或 "info_summary"
  selected: ["intent_alignment", "context_discovery", ...]
})
```

infoType 选择：

| 类型 | 使用场景 |
|------|----------|
| info_collection | 需主动探索：扫描项目、阅读文档、调研技术 |
| info_summary | 整理已有信息：从对话中提炼、归纳总结 |

---

## 第四步：执行能力任务

capability_select 返回 actionRequired，MUST 遵循其指示调用 Skill。

### 执行流程

```
capability_select 返回
    ↓
actionRequired: { type: "invoke_skill", skills: [...] }
    ↓
Skill(aligning-intent)  ← 第一个能力
    ↓
node_transition(action="start")
    ↓
按 Skill SOP 执行
    ↓
node_transition(action="complete", conclusion="...")
    ↓
Skill(discovering-context)  ← 下一个能力
    ↓
...重复...
```

### 执行规则

| 步骤 | 动作 | 说明 |
|------|------|------|
| 1 | Skill(xxx) | 调用对应能力 Skill 获取 SOP |
| 2 | node_transition(action="start") | 启动节点 |
| 3 | 按 SOP 执行 | 遵循 Skill 的 SOP 步骤 |
| 4 | node_transition(action="complete") | 完成节点，记录结论 |

### 禁止事项

- NEVER 跳过 Skill 调用直接 node_transition start
- NEVER 在信息阶段修改任何代码
- NEVER 在能力节点中执行 Write/Edit 操作

### 职责边界

| 允许 | 禁止 |
|------|------|
| Read、Search、Grep、Glob | Write、Edit、MultiEdit |
| 分析代码、理解结构 | 修改代码、创建文件 |
| 记录发现到 conclusion | 直接实现功能 |
| 提出方案建议 | 执行方案 |

---

## 第五步：完成信息节点并展示方案

### 5.1 完成信息节点

所有能力节点完成后，完成信息节点：

```typescript
node_transition({
  workspaceId: "ws-xxx",
  nodeId: "info-node-id",
  action: "complete",
  conclusion: "方案设计总结..."
})
```

### 5.2 展示方案设计并询问用户

模板：

```
## 方案设计总结

{设计概要/构想}

详细信息已记录在：
- 信息节点 conclusion
- MEMO: {memo-id}（如有）

---

是否进入方案规划阶段？
- 输入「继续」进入 flow-design
- 输入需要补充的内容，我将创建新的能力节点
```

### 5.3 根据用户响应

**用户同意进入下一阶段：**

```typescript
Skill(flow-design)
```

**用户需要补充：**

1. 根据补充内容选择合适的能力类型
2. 创建新的能力节点（通过 capability_select 或直接添加）
3. 执行新能力节点
4. 更新信息节点结论
5. 重新展示方案，询问用户
6. 循环直到用户满意

---

## 流程回溯机制

**流程并非严格线性**。在探索过程中可能发现之前遗漏的信息，此时应**重开已完成的节点**补充，而非强行继续。

### 常见回溯场景

| 触发点 | 回溯目标 | 场景说明 |
|--------|----------|----------|
| discovering-context 用户核对阶段 | aligning-intent 节点 | 探索中发现意图核对遗漏的技术约束/需求点 |
| 任意能力节点执行中 | 前置能力节点 | 发现前置信息不足，需要补充 |
| 方案设计中 | discovering-context 节点 | 设计时发现对现状理解不够 |

### Reopen 操作

```typescript
node_transition({
  workspaceId: "ws-xxx",
  nodeId: "需要补充的节点ID",
  action: "reopen",
  reason: "补充原因说明"
})
```

### 状态转换

| 节点类型 | reopen 转换 |
|----------|-------------|
| 执行节点 | `completed → implementing` |
| 规划节点 | `completed/cancelled → planning` |

**规则**：
- 重开后节点回到活跃状态，可继续补充信息
- 补充完成后正常 `complete`
- 父节点会自动级联更新到 `monitoring` 状态

### 回溯 vs 创建新节点

| 场景 | 选择 |
|------|------|
| 补充同一主题的遗漏信息 | **reopen** 原节点 |
| 发现全新的探索方向 | 创建新能力节点 |
| 意图有变化需要重新核对 | **reopen** aligning-intent |

---

## Mandatory Rules

1. MUST call signal first - 确认进入信息阶段
2. MUST call capability_list - 获取推荐能力
3. MUST show user and ask - 展示能力并询问选择
4. MUST use capability_select - 不能直接 node_create
5. MUST include all basePack - 必选能力全部包含
6. MUST call Skill before node start - 启动前必须调用能力 Skill
7. MUST complete info node - 能力完成后必须完成信息节点
8. MUST show design and ask user - 展示方案并获得用户允许才能转换阶段
9. MUST record user answers in notes - 用户的所有回答必须用 notes 记录（不是 log）
10. MUST use node_reference for citations - 引用 MEMO 或文档必须使用 node_reference，禁止直接引用
11. NEVER modify code - 信息阶段禁止 Write/Edit

---

## Red Flags

1. 跳过 signal 直接开始 → 阶段状态未同步
2. 跳过 capability_list → 缺少能力推荐
3. 自己决定能力不问用户 → 用户失去选择权
4. 直接 node_create 信息节点 → 绕过能力流程
5. 跳过 Skill 直接 node_transition → 不知道正确 SOP
6. 信息阶段时修改代码 → 违反职责边界
7. 不展示方案直接进入下一阶段 → 用户失去确认权
8. 用户要求补充时直接进入下一阶段 → 忽略用户需求
9. 用 log 记录用户回答 → 应使用 notes（log 用于工作记录，notes 用于用户输入）
10. 直接引用 MEMO 或文档 → 必须使用 node_reference 建立引用关系
11. **发现遗漏却不回溯** → 应 reopen 对应节点补充，而非强行继续
12. **补充信息时创建重复节点** → 补充同一主题应 reopen 原节点，而非新建
