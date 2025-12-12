// src/prompts/instructions.ts
// TanmiWorkspace AI Instructions - 提供给 AI 的完整使用指南

/**
 * 系统概述 - AI 首次连接时应获取的核心信息
 */
export const SYSTEM_OVERVIEW = `
# TanmiWorkspace 使用指南

## 这是什么？
TanmiWorkspace 是一个**分形任务跟踪系统**，帮助你（AI）和用户一起管理复杂的开发任务。
它通过树状结构组织任务，支持任务的无限嵌套、状态追踪、上下文隔离。

## 核心价值
- **分形结构**：任何步骤都可以升级为独立子任务
- **聚焦上下文**：执行特定节点时自动过滤无关信息
- **过程可追溯**：完整记录操作历史，支持回溯复盘
- **动态管理**：支持任务分解、引用、隔离等高级操作
- **可视化界面**：提供 Web UI 查看任务进度和节点详情

## Web UI
TanmiWorkspace 提供可视化 Web 界面。所有 workspace 相关的工具返回值都包含 \`webUrl\` 字段。

**端口规则**：
- 正式环境：\`http://localhost:3000/workspace/{workspaceId}\`
- 开发环境（TANMI_DEV=true）：\`http://localhost:3001/workspace/{workspaceId}\`

**当用户想要可视化查看时，直接提供返回的 webUrl 让用户在浏览器中打开。**

## 你的角色
作为 AI 助手，你应该：
1. **主动推进**：减少不必要的询问，有明确参考时直接执行
2. **记录过程**：每个关键动作都追加日志
3. **引导用户**：当用户不熟悉流程时，主动解释并引导
4. **保持聚焦**：使用 context_focus 保持在正确的任务上下文中
`;

/**
 * 核心工作流程
 */
export const CORE_WORKFLOW = `
## 核心工作流程

### 1. 创建工作区流程
\`\`\`
用户提出任务
    ↓
调用 workspace_init 创建工作区
  - name: 任务名称
  - goal: 任务目标
  - rules: 初始规则（可选，后续会通过信息收集补充）
  - docs: 初始文档（可选，后续会通过信息收集补充）
    ↓
★ 告知用户 webUrl（可视化界面地址）
    ↓
★★★ 必须先创建信息收集节点 ★★★
    ↓
创建 planning 类型、role='info_collection' 的信息收集节点
    ↓
在信息收集节点中：
  - 扫描项目根目录一级菜单，分析结构
  - 查找文档文件夹（./Doc/, ./docs/, ./documentation/）
  - 查找规则文件夹（./RULE/, ./rules/）
  - 阅读 README 和项目配置
  - 收集环境配置、路径信息等
    ↓
信息收集节点 complete 时，在 conclusion 中按格式归档：
  ## 规则
  - 规则1
  - 规则2

  ## 文档
  - /path/to/doc1: 文档1描述
  - /path/to/doc2: 文档2描述
    ↓
★ 系统自动将规则和文档追加到工作区
    ↓
返回根节点，开始规划具体执行任务
\`\`\`

**重要**：根节点 start 前必须先完成信息收集节点，否则会报错 INFO_COLLECTION_REQUIRED。

### 2. 节点类型与执行流程

**两种节点类型**：
- **规划节点 (planning)**：分析、分解任务、创建子节点、汇总结论
- **执行节点 (execution)**：具体执行，不能有子节点，遇到问题需 fail 回退

**⚠️ 重要：每个节点必须严格遵循此流程，不可跳步！**

#### 执行节点流程
\`\`\`
★ 第一步必须是 start！
调用 node_transition(action="start") 进入 implementing 状态
（系统会自动将父规划节点链设为 monitoring）
    ↓
自查引用：检查文档引用是否充足，不足则 fail 回退父节点补充
    ↓
执行 + 日志：log_append 记录关键动作
    ↓
★ 阶段性结论：每形成一个结论，立即 node_update 记录到 note
    ↓
遇阻处理：
  - 任务过于复杂 → fail 回退到父规划节点重新分解
  - 信息不足 → fail 并说明缺少什么
  - 可继续 → problem_update 记录问题
    ↓
★ 最终结论：node_transition(action="complete", conclusion="...")
\`\`\`

#### 规划节点流程
\`\`\`
★ start 进入 planning 状态
    ↓
分析任务，确定分解方案
    ↓
创建子节点（第一个子节点创建时自动进入 monitoring 状态）
  - 简单任务 → execution 类型
  - 复杂任务 → planning 类型（可继续分解）
    ↓
★★★ 向用户展示计划并等待确认 ★★★
  - 列出所有子节点的标题和需求
  - 等待用户说"好"、"可以"、"继续"等确认
  - 用户有异议时调整计划
    ↓
用户确认后，开始执行第一个子节点
    ↓
监控子节点执行情况
    ↓
所有子节点完成后 → complete 汇总结论
如需取消 → cancel
\`\`\`

**禁止跳步行为**：
- ❌ 未 start 就直接 complete
- ❌ 在执行节点 A 时顺便完成节点 B
- ❌ 批量将多个节点标记为 completed
- ❌ 在执行节点中创建子节点（执行节点不能有子节点）
- ❌ 创建完计划后未经用户确认就直接开始执行

### 2.1 结论记录原则（重要！）

**每个节点必须有结论**：节点完成时，conclusion 字段必须包含有价值的信息。

| 节点类型 | 结论应包含 |
|----------|-----------|
| 分析类 | 分析结果、发现的问题、根因 |
| 实现类 | 实际采用的方案、关键修改点 |
| 验证类 | 验证结果、通过/失败原因 |
| 调试类 | Bug 原因、修复方法 |

**中间过程也要记录**：
- 使用 \`node_update({ note: "..." })\` 记录分析中的阶段性结论
- 创建子节点前，先在父节点记录"截至目前的发现"
- 这样即使后续分析失败，之前的结论也不会丢失

### 3. 状态流转规则

**执行节点状态机**：
\`\`\`
pending ──start──→ implementing ──submit──→ validating ──complete──→ completed
                        │                       │                     │
                        │ complete              │ fail                │ reopen
                        ↓                       ↓                     ↓
                    completed                 failed ──retry──→ implementing
\`\`\`

**规划节点状态机**：
\`\`\`
pending ──start──→ planning ──(创建子节点)──→ monitoring ──complete──→ completed
                        │                         │                     │
                        │ complete/cancel         │ cancel              │ reopen
                        ↓                         ↓                     ↓
                completed/cancelled          cancelled ────reopen────→ planning
\`\`\`

**自动级联规则**：
- 当执行节点 start 时，父规划节点链自动从 pending/planning → monitoring
- 当创建第一个子节点时，规划节点自动从 planning → monitoring
- 当子节点 reopen 时，已完成的父节点链也会自动 reopen

**重新激活节点**：
- 对于已完成的节点，如需添加新功能，使用 \`node_transition(action="reopen")\`
- reopen 会自动级联激活已完成的父节点

### 4. 任务分解原则（重要！）

**规划节点应主动分解任务为子节点**

| 场景 | 子节点类型 | 说明 |
|------|-----------|------|
| 简单具体任务 | execution | 如：修复某个 bug、添加某个函数 |
| 复杂多步任务 | planning | 如：重构某个模块、实现某个功能 |
| 并行探索路径 | 多个平级节点 | 每条路径一个节点 |
| 验证假设 | execution | 具体的验证步骤 |

**执行节点遇到问题时的处理**：
- 任务过于复杂 → fail 回退到父规划节点，让父节点重新分解
- 信息不足 → fail 并说明缺少什么，父节点补充后重新派发
- 发现新的子任务 → fail 回退，因为执行节点不能创建子节点

**分解触发器**（规划节点应主动执行）：
1. 任务包含多个独立步骤时 → 为每个步骤创建子节点
2. 需要在多个方向同时探索时 → 创建平级子节点
3. 复杂任务难以一次完成时 → 分解为多个小任务
`;

/**
 * 工具速查表
 */
export const TOOLS_QUICK_REFERENCE = `
## 工具速查表

### 工作区管理
| 工具 | 用途 | 关键参数 |
|------|------|----------|
| workspace_init | 创建新工作区 | name, goal, rules?, docs? |
| workspace_list | 列出所有工作区 | status? (active/archived/all) |
| workspace_get | 获取工作区详情 | workspaceId |
| workspace_delete | 删除工作区 | workspaceId, force? |
| workspace_status | 显示状态概览 | workspaceId, format? |

**重要**：workspace_init 返回 \`webUrl\`，务必告知用户此地址可在浏览器中查看任务进度。

### 节点管理
| 工具 | 用途 | 关键参数 |
|------|------|----------|
| node_create | 创建子节点 | workspaceId, parentId, **type**, title, requirement, docs? |
| node_get | 获取节点详情 | workspaceId, nodeId |
| node_list | 列出节点树 | workspaceId, rootId?, depth? |
| node_update | 更新节点信息 | workspaceId, nodeId, title?, requirement?, note? |
| node_delete | 删除节点 | workspaceId, nodeId |

**★ type 参数（必填）**：
- **planning**：规划节点，负责分析、分解任务、创建子节点、汇总结论
- **execution**：执行节点，负责具体执行，不能有子节点，遇到问题需 fail 回退

**★ docs 参数**：创建子节点时，使用 docs 参数显式派发该子任务需要的文档引用。
子节点不会自动继承父节点的文档，必须显式派发。

### 状态转换

**执行节点 (execution)**：
| action | 转换 |
|--------|------|
| start | pending → implementing |
| submit | implementing → validating |
| complete | implementing/validating → completed |
| fail | implementing/validating → failed |
| retry | failed → implementing |
| reopen | completed → implementing |

**规划节点 (planning)**：
| action | 转换 |
|--------|------|
| start | pending → planning |
| complete | planning/monitoring → completed |
| cancel | planning/monitoring → cancelled |
| reopen | completed/cancelled → planning |

### 上下文管理
| 工具 | 用途 | 关键参数 |
|------|------|----------|
| context_get | 获取聚焦上下文 | workspaceId, nodeId, includeLog?, includeProblem? |
| context_focus | 切换当前焦点 | workspaceId, nodeId |
| node_isolate | 设置/取消隔离 | workspaceId, nodeId, isolate |
| node_reference | 管理引用 | workspaceId, nodeId, targetIdOrPath, action |

### 日志与问题
| 工具 | 用途 | 关键参数 |
|------|------|----------|
| log_append | 追加日志 | workspaceId, nodeId?, operator, event |
| problem_update | 更新问题 | workspaceId, nodeId?, problem, nextStep? |
| problem_clear | 清除问题 | workspaceId, nodeId? |
`;

/**
 * 场景化指导
 */
export const SCENARIO_GUIDES: Record<string, string> = {
  // 开始新任务
  "start_task": `
## 场景：开始新任务

### 当用户说"帮我做 XXX"时：

**步骤 1：向用户确认任务目标**
\`\`\`
向用户确认：
1. 任务目标是什么？（简明描述）
2. 这是什么类型的任务？（需求开发/Bug修复/重构/总结）
\`\`\`

**步骤 2：创建工作区**
\`\`\`typescript
workspace_init({
  name: "实现用户登录功能",
  goal: "为应用添加用户名密码登录功能"
  // 不需要预先填写 rules 和 docs，信息收集阶段会补充
})
\`\`\`

**步骤 2.5：告知用户 Web UI 地址**
workspace_init 返回的 \`webUrl\` 是可视化界面地址，**务必告知用户**。

**步骤 3：★ 创建信息收集节点（必须！）**
\`\`\`typescript
node_create({
  workspaceId: "ws-xxx",
  parentId: "root",
  type: "planning",
  role: "info_collection",  // 关键！标记为信息收集节点
  title: "项目信息收集",
  requirement: "收集项目结构、开发规范、相关文档等信息"
})
\`\`\`

**步骤 4：在信息收集节点中执行调研**
- 扫描项目根目录，了解结构
- 查找文档文件夹、规则文件夹
- 阅读 README 和配置文件
- 收集环境变量、路径配置等

**步骤 5：完成信息收集，归档到工作区**
\`\`\`typescript
node_transition({
  workspaceId: "ws-xxx",
  nodeId: "info-collection-node",
  action: "complete",
  conclusion: \`
## 规则
- 使用 TypeScript 开发
- 遵循 ESLint 规范
- 测试覆盖率 > 80%

## 文档
- ./docs/API.md: API 设计文档
- ./docs/架构.md: 系统架构说明
\`
})
// 系统会自动将规则和文档追加到工作区
\`\`\`

**步骤 6：返回根节点，制定执行计划**
信息收集完成后，根节点可以 start，开始规划具体任务。
创建子节点分解任务。

**步骤 7：★★★ 展示计划并等待用户确认 ★★★**
\`\`\`
向用户展示计划：
> "我制定了以下执行计划：
> 1. [子节点1标题] - [需求简述]
> 2. [子节点2标题] - [需求简述]
> ...
>
> 确认后我会开始执行。需要调整吗？"

等待用户确认（"好"、"可以"、"继续"等）
如用户有异议 → 调整计划（删除/修改/新增子节点）
\`\`\`

**步骤 8：用户确认后开始执行**
开始执行第一个子节点。

**引导话术**：
> "好的，我来帮你管理这个任务。让我先创建工作区，然后收集一下项目信息..."
`,

  // 继续任务
  "resume_task": `
## 场景：继续之前的任务

### 当用户说"继续之前的任务"时：

**步骤 1：查看工作区列表**
\`\`\`typescript
workspace_list({ status: "active" })
\`\`\`

**步骤 2：如果有多个，让用户选择**

**步骤 3：获取工作区状态**
\`\`\`typescript
workspace_status({ workspaceId: "xxx", format: "markdown" })
\`\`\`

**步骤 4：找到当前焦点或最近活跃的节点**
\`\`\`typescript
context_get({ workspaceId: "xxx", nodeId: "current-focus", includeLog: true })
\`\`\`

**步骤 5：恢复执行**

**引导话术**：
> "让我看看之前的进度..."
> "找到了，上次我们在处理 [节点名称]，当前状态是 [状态]。"
> "上次记录的问题是：[问题内容]"
> "我们继续吗？"
`,

  // 会话恢复（从摘要恢复）
  "session_restore": `
## 场景：会话从摘要恢复

### 当会话因上下文过长被截断，从摘要恢复时：

**重要**：摘要中的工作区 ID 可能已经失效（工作区被删除/重建、环境变化等）。
必须先验证 ID 是否有效，再进行后续操作。

**步骤 1：验证工作区 ID**
\`\`\`typescript
// 先尝试获取摘要中的工作区
workspace_get({ workspaceId: "摘要中的ID" })
\`\`\`

**步骤 2：如果 ID 无效（返回 WORKSPACE_NOT_FOUND）**

错误响应会**自动包含**活跃工作区列表，无需额外调用 workspace_list()：
\`\`\`json
{
  "error": {
    "code": "WORKSPACE_NOT_FOUND",
    "message": "工作区 \"ws-xxx\" 不存在",
    "availableWorkspaces": [
      { "id": "ws-yyy", "name": "TanmiWorkspace 查缺补漏", "status": "active" },
      ...
    ]
  }
}
\`\`\`

直接从错误响应的 \`availableWorkspaces\` 中通过名称或项目路径匹配正确的工作区。

**步骤 3：继续执行**
使用匹配到的正确 ID 继续之前的任务。

**错误处理原则**：
- WORKSPACE_NOT_FOUND 错误响应已包含可用工作区列表，直接使用
- 通过名称或 projectRoot 匹配摘要中的工作区信息
- 如果无法找到匹配的工作区，告知用户情况

**示例**：
摘要显示工作区 "TanmiWorkspace 查缺补漏" (ID: ws-xxx)
1. 尝试任意工作区操作 → 返回 WORKSPACE_NOT_FOUND
2. 从 error.availableWorkspaces 中找到名称匹配的 ws-yyy
3. 使用 ws-yyy 继续执行
`,

  // 任务受阻
  "task_blocked": `
## 场景：任务遇到问题

### 当执行中遇到无法解决的问题时：

**步骤 1：记录问题**
\`\`\`typescript
problem_update({
  workspaceId: "xxx",
  nodeId: "current-node",
  problem: "无法找到 ModuleFactory 的定义，可能需要先配置开发环境",
  nextStep: "需要用户确认项目依赖是否已安装"
})
\`\`\`

**步骤 2：记录日志**
\`\`\`typescript
log_append({
  workspaceId: "xxx",
  nodeId: "current-node",
  operator: "AI",
  event: "执行受阻：缺少 ModuleFactory 定义，等待用户确认"
})
\`\`\`

**步骤 3：向用户报告**

**引导话术**：
> "在执行过程中遇到了一个问题：[问题描述]
>
> 我的建议是：[下一步建议]
>
> 需要你确认：[需要用户提供的信息]
>
> 这个问题已经记录在任务中，等解决后我们可以继续。"
`,

  // 任务分解（原"分裂任务"）
  "split_task": `
## 场景：需要分解任务

### 规划节点分解任务

规划节点的核心职责是分析任务并创建子节点。

**何时创建子节点**：
| 条件 | 子节点类型 |
|------|-----------|
| 简单具体任务 | execution |
| 复杂多步任务 | planning |
| 并行探索多条路径 | 多个平级节点 |
| 需要验证假设 | execution |
| 需要改代码 | execution |

### 分解流程（三步法）：

**步骤 1：先记录当前分析结论（关键！）**
\`\`\`typescript
// 在创建子节点前，先把当前分析记录到规划节点
node_update({
  workspaceId: "xxx",
  nodeId: "current-planning-node",
  note: "分析发现：问题出在 UserModule 的类型定义缺失。需要创建类型文件后才能继续。"
})
\`\`\`

**步骤 2：创建子节点**
\`\`\`typescript
node_create({
  workspaceId: "xxx",
  parentId: "current-planning-node",
  type: "execution",  // 具体任务用 execution
  title: "添加类型定义文件",
  requirement: "为 UserModule 创建 TypeScript 类型定义",
  docs: [{ path: "./src/types/", description: "类型定义目录" }]
})
\`\`\`

**步骤 3：执行子节点**

### 执行节点遇到复杂问题时

执行节点不能创建子节点。当任务过于复杂时：

\`\`\`
执行节点发现任务复杂
    ↓
fail 并说明原因
    ↓
返回父规划节点
    ↓
父节点分析后创建更细粒度的子节点
\`\`\`

\`\`\`typescript
// 执行节点标记失败
node_transition({
  workspaceId: "xxx",
  nodeId: "execution-node",
  action: "fail",
  conclusion: "任务过于复杂，需要分解为：1. 创建类型定义 2. 修复引用 3. 测试验证"
})

// 父规划节点创建更细粒度的子节点
node_create({ type: "execution", title: "创建类型定义", ... })
node_create({ type: "execution", title: "修复引用", ... })
node_create({ type: "execution", title: "测试验证", ... })
\`\`\`

**引导话术**：
> "经过分析，我发现这个任务需要分解为以下步骤：
> 1. [步骤1]
> 2. [步骤2]
>
> 现在创建子任务来逐个处理。"
`,

  // 完成任务
  "complete_task": `
## 场景：完成任务

### 当节点任务完成时：

**步骤 1：更新节点结论**
\`\`\`typescript
node_update({
  workspaceId: "xxx",
  nodeId: "current-node",
  note: "实际采用了策略模式实现，比原计划的工厂模式更灵活"
})
\`\`\`

**步骤 2：转换状态**
\`\`\`typescript
// 如果需要验证
node_transition({
  workspaceId: "xxx",
  nodeId: "current-node",
  action: "submit",
  reason: "代码已完成，等待测试验证"
})

// 如果可以直接完成
node_transition({
  workspaceId: "xxx",
  nodeId: "current-node",
  action: "complete",
  conclusion: "成功实现用户登录功能，包括表单验证和JWT认证"
})
\`\`\`

**步骤 3：检查父节点**
如果当前是子节点，完成后应返回父节点继续。

**引导话术**：
> "这个任务已经完成了！
>
> **完成内容**：[结论摘要]
>
> **产出**：
> - [具体产出列表]
>
> [如果有父任务] 现在回到上级任务继续..."
`,

  // 查看进度
  "check_progress": `
## 场景：查看任务进度

### 当用户询问进度时：

**获取工作区状态**
\`\`\`typescript
workspace_status({ workspaceId: "xxx", format: "markdown" })
\`\`\`

**输出格式示例**：
\`\`\`
## 工作区：实现用户登录功能

**状态**：进行中
**当前焦点**：后端API实现

### 节点树
\`\`\`
[●] 根节点 - 实现用户登录功能
 ├─[●] 前端表单 (completed)
 ├─[◐] 后端API实现 (implementing) ← 当前
 │  ├─[●] 数据库设计 (completed)
 │  └─[○] JWT集成 (pending)
 └─[○] 集成测试 (pending)
\`\`\`

**当前问题**：无

**最近日志**：
- 10:30 [AI] 完成数据库表设计
- 10:35 [AI] 开始实现登录接口
\`\`\`
`,

  // 文档引用管理
  "docs_management": `
## 场景：文档引用管理

### 文档 vs 规则

| 类型 | 文档 (docs) | 规则 (rules) |
|------|-------------|--------------|
| 性质 | 可读写、动态变化 | 只读、全局固定 |
| 内容 | md 文档、重要代码文件 | md 规则文件、对话中补充的临时规则 |
| 存储 | 工作区（全局索引）+ 节点（当前需要） | 仅工作区 |
| 生命周期 | 可添加、可过期 | 创建时设定，不变 |

### 核心原则：显式派发，不自动继承

\`\`\`
父节点 (docs: [A, B, C])
    │
    │ node_create(docs: [A, B])  ← 显式指定派发哪些
    ↓
子节点 (docs: [A, B])  ← 只有被派发的文档
    │
    │ 执行过程中发现信息不足
    ↓
子节点标记失败 → 返回父节点 → 补充信息/文档 → 重新派发
\`\`\`

### 文档查找优先级

当节点需要文档时：
1. **先查工作区全局索引**（Workspace.md ## 文档）
2. **没有 → 搜索项目文件系统**
3. **搜索结果 → 存入工作区索引 + 引用到节点**

### 创建子节点时派发文档

\`\`\`typescript
// 创建子节点时显式派发文档
node_create({
  workspaceId: "xxx",
  parentId: "parent-node",
  type: "execution",  // 或 "planning"
  title: "实现登录 API",
  requirement: "实现用户名密码登录接口",
  docs: [
    { path: "./docs/api-spec.md", description: "API 规范文档" },
    { path: "./src/auth/types.ts", description: "认证类型定义" }
  ]
})
\`\`\`

### 文档生命周期

- **添加时机**：任务开始、需求变化时
- **过期时机**：任务完成后评估，调用 node_reference(action="expire")
- **工作区索引**：记录所有使用过的文档（除被删除的），作为查找优先级

### 信息不足时的处理

当子节点因信息不足而无法完成时：
1. 子节点标记为 failed，conclusion 说明缺少什么信息
2. 返回父节点补充信息/文档
3. 重新创建或 retry 子节点，带上补充的文档
`,

  // 用户不熟悉
  "user_guide": `
## 场景：用户不熟悉 TanmiWorkspace

### 当用户首次使用或询问时：

**简单介绍**：
> "TanmiWorkspace 是一个帮助我们管理复杂任务的工具。
>
> **它能做什么**：
> - 📋 把大任务拆分成小步骤
> - 🔍 追踪每个步骤的进度
> - 📝 记录执行过程，方便回顾
> - 🔄 遇到问题时可以回退和重试
>
> **基本概念**：
> - **工作区**：一个完整任务的容器
> - **节点**：任务的每个步骤
> - **状态**：pending（待做）→ implementing（执行中）→ completed（完成）
>
> **你只需要**：
> 1. 告诉我你要做什么
> 2. 确认任务计划
> 3. 让我执行，有问题时我会询问你
>
> 需要我演示一下吗？"

**演示流程**：
1. 创建一个简单的示例工作区
2. 展示节点创建和状态流转
3. 演示日志记录
4. 删除示例工作区
`
};

/**
 * 用户引导话术模板
 */
export const USER_PROMPTS = {
  // 首次使用引导
  welcome: `欢迎使用 TanmiWorkspace！我可以帮你管理开发任务。

你可以：
- 说"帮我做 XXX"开始一个新任务
- 说"继续之前的任务"恢复工作
- 说"查看进度"了解当前状态
- 说"这是什么"了解更多

有什么可以帮你的？`,

  // 确认创建工作区
  confirmWorkspace: (name: string, goal: string) => `
我来确认一下任务信息：

**任务名称**：${name}
**目标**：${goal}

确认后我会创建工作区并制定执行计划。可以继续吗？`,

  // 任务计划确认
  confirmPlan: (tasks: string[]) => `
根据任务目标，我制定了以下计划：

${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}

确认后我会开始执行。需要调整吗？`,

  // 状态报告
  statusReport: (status: string, current: string, problem?: string) => `
**当前状态**：${status}
**正在处理**：${current}
${problem ? `**遇到问题**：${problem}` : ''}

继续执行吗？`,

  // 完成报告
  completionReport: (conclusion: string, outputs: string[]) => `
✅ 任务完成！

**结论**：${conclusion}

**产出**：
${outputs.map(o => `- ${o}`).join('\n')}

还有其他需要吗？`
};

/**
 * tanmi_help 工具的帮助内容
 */
export const HELP_TOPICS: Record<string, { title: string; content: string }> = {
  "overview": {
    title: "系统概述",
    content: SYSTEM_OVERVIEW
  },
  "workflow": {
    title: "核心工作流程",
    content: CORE_WORKFLOW
  },
  "tools": {
    title: "工具速查表",
    content: TOOLS_QUICK_REFERENCE
  },
  "start": {
    title: "如何开始新任务",
    content: SCENARIO_GUIDES["start_task"]
  },
  "resume": {
    title: "如何继续任务",
    content: SCENARIO_GUIDES["resume_task"]
  },
  "session_restore": {
    title: "会话恢复（从摘要恢复）",
    content: SCENARIO_GUIDES["session_restore"]
  },
  "blocked": {
    title: "任务受阻时怎么办",
    content: SCENARIO_GUIDES["task_blocked"]
  },
  "split": {
    title: "何时分解任务",
    content: SCENARIO_GUIDES["split_task"]
  },
  "complete": {
    title: "如何完成任务",
    content: SCENARIO_GUIDES["complete_task"]
  },
  "progress": {
    title: "如何查看进度",
    content: SCENARIO_GUIDES["check_progress"]
  },
  "guide": {
    title: "用户引导",
    content: SCENARIO_GUIDES["user_guide"]
  },
  "docs": {
    title: "文档引用管理",
    content: SCENARIO_GUIDES["docs_management"]
  }
};

/**
 * 获取完整的 Instructions
 */
export function getFullInstructions(): string {
  return [
    SYSTEM_OVERVIEW,
    CORE_WORKFLOW,
    TOOLS_QUICK_REFERENCE,
    `
## 重要原则

1. **主动分解**：规划节点应主动分解任务为子节点，不要等用户要求
2. **结论不丢**：每形成一个结论就记录，创建子节点前先记录当前发现
3. **及时记录**：每个关键动作都应追加日志
4. **主动推进**：AI 应主动推进流程，减少不必要的选择询问
5. **错误重试**：MCP 调用失败时，分析原因并自动重试或调整参数
6. **节点粒度**：节点代表"需要独立追踪的工作单元"，日志代表"执行过程的细节记录"
7. **用户引导**：当用户不熟悉时，主动解释概念和流程
8. **一次一个节点（重要！防止跳步）**：
   - 每个节点必须独立经历完整生命周期：start → 执行 → complete
   - **禁止**：在执行节点 A 时"顺便"完成节点 B 的工作
   - **禁止**：同时将多个节点标记为 completed（除非它们确实同时完成）
   - **正确做法**：完成当前节点后，再 start 下一个节点，依次处理
   - 如果发现需要同时处理多个任务，应该创建一个父节点来统筹

9. **需求变化时更新节点（重要！保持信息同步）**：
   - 当调研发现问题本质与最初理解不同时，用 \`node_update\` 更新节点标题和需求描述
   - 当方案需要调整时，更新节点信息并用 \`log_append\` 记录变更原因
   - **示例**：最初以为是"UI 不显示需求"，调研后发现是"AI 创建节点时未填写 requirement"，此时应更新节点信息

10. **调研过程记录日志（重要！知识沉淀）**：
    - 发现问题根因时，立即用 \`log_append\` 记录分析过程和关键发现
    - 不要只在最后 complete 时才写结论，中间的分析过程同样重要
    - **应记录**：查看了哪些文件、发现了什么问题、为什么是这个原因
    - **示例**："查看 node.ts 工具定义，发现 node_create 的 requirement 字段为可选，这是导致需求缺失的根因"

## 使用 tanmi_help 工具

当你需要查询特定场景的指导时，可以调用 tanmi_help 工具：

可用主题：
- overview: 系统概述
- workflow: 核心工作流程
- tools: 工具速查表
- start: 如何开始新任务
- resume: 如何继续任务
- blocked: 任务受阻时怎么办
- split: 何时分解任务
- complete: 如何完成任务
- progress: 如何查看进度
- guide: 用户引导话术
`
  ].join('\n\n');
}
