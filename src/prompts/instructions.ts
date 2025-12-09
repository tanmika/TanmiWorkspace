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
- **动态管理**：支持任务分裂、引用、隔离等高级操作
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
自动扫描项目（./Doc/, ./docs/, ./RULE/, ./README.md）
    ↓
智能匹配相关文档和规范
    ↓
向用户确认：目标、规则、文档引用
    ↓
调用 workspace_init 创建工作区
    ↓
★ 告知用户 webUrl（可视化界面地址）
    ↓
根据任务类型制定计划，创建子节点
\`\`\`

### 2. 节点执行流程

**⚠️ 重要：每个节点必须严格遵循此流程，不可跳步！**

\`\`\`
★ 第一步必须是 start！
调用 node_transition(action="start") 进入 implementing 状态
（系统会自动将父节点链也设为 implementing）
    ↓
自查引用：检查文档引用是否充足，不足则补充
    ↓
执行 + 日志：log_append 记录关键动作
    ↓
★ 阶段性结论：每形成一个结论，立即 node_update 记录到 note
    ↓
判断是否分裂：
  - 分析深度 > 3 步 → 分裂
  - 有新方向要探索 → 分裂
  - 结论明确但需继续 → 分裂
    ↓
遇阻处理：problem_update 记录问题
    ↓
★ 最终结论：node_transition(action="complete", conclusion="...")
\`\`\`

**禁止跳步行为**：
- ❌ 未 start 就直接 complete
- ❌ 在执行节点 A 时顺便完成节点 B
- ❌ 批量将多个节点标记为 completed

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
- 分裂子节点前，先在父节点记录"截至目前的发现"
- 这样即使后续分析失败，之前的结论也不会丢失

### 3. 状态流转规则
\`\`\`
pending ──start──→ implementing ──submit──→ validating ──complete──→ completed
                        │                       │                     │
                        │ complete              │ fail                │ reopen
                        ↓                       ↓                     ↓
                    completed                 failed ──retry──→ implementing
\`\`\`

**自动级联规则**：
- 当子节点 start 时，父节点链自动从 pending → implementing
- 当子节点 reopen 时，已完成的父节点链也会自动 reopen

**重新激活节点**：
- 对于已完成的节点，如需添加新功能，使用 \`node_transition(action="reopen")\`
- reopen 会自动级联激活已完成的父节点

### 4. 节点分裂时机（重要！）

**原则：分析深度超过 3 层时必须分裂节点**

| 场景 | 处理方式 | 示例 |
|------|----------|------|
| 线性追查代码（≤3步） | 仅记录日志 | 查看函数 → 找到调用处 → 定位问题 |
| 线性追查代码（>3步） | **必须分裂** | 追查路径过长，创建"追查 XXX"子节点 |
| 形成假设需验证 | **立即分裂** | 创建"验证假设：XXX"子节点 |
| 出现分支路径 | **立即分裂** | 创建平级子节点，每条路径一个 |
| 需要改代码验证 | **必须分裂** | 代码修改必须有独立节点追踪 |
| 确认根因，开始修复 | **立即分裂** | 创建"修复：XXX"子节点 |
| 分析形成阶段性结论 | **立即分裂** | 将结论记录到当前节点，再创建下一步子节点 |

**自动分裂触发器**（AI 应主动执行，无需用户要求）：
1. 当你发现需要超过 3 个日志条目来记录分析过程时 → 分裂
2. 当你说"接下来需要..."或"下一步是..."时 → 考虑分裂
3. 当分析形成明确结论，但任务尚未完成时 → 记录结论并分裂
4. 当你需要在多个方向同时探索时 → 立即分裂为平级节点
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
| node_create | 计划阶段创建子任务 | workspaceId, parentId, title, requirement? |
| node_split | 执行中分裂子任务 | workspaceId, parentId, title, requirement |
| node_get | 获取节点详情 | workspaceId, nodeId |
| node_list | 列出节点树 | workspaceId, rootId?, depth? |
| node_update | 更新节点信息 | workspaceId, nodeId, title?, requirement?, note? |
| node_delete | 删除节点 | workspaceId, nodeId |

### 状态转换
| 工具 | action 值 | 转换 |
|------|-----------|------|
| node_transition | start | pending → implementing |
| node_transition | submit | implementing → validating |
| node_transition | complete | implementing/validating → completed |
| node_transition | fail | validating → failed |
| node_transition | retry | failed → implementing |
| node_transition | reopen | completed → implementing |

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

**步骤 1：收集信息**
\`\`\`
向用户确认：
1. 任务目标是什么？（简明描述）
2. 有哪些相关的文档或规范需要遵循？
3. 这是什么类型的任务？（需求开发/Bug修复/重构/总结）
\`\`\`

**步骤 2：创建工作区**
\`\`\`typescript
// 调用示例
workspace_init({
  name: "实现用户登录功能",
  goal: "为应用添加用户名密码登录功能，包括前端表单和后端验证",
  rules: ["./RULE/coding_standard.md"],
  docs: [
    { path: "./Doc/API设计.md", description: "后端 API 规范" },
    { path: "./src/auth/", description: "现有认证模块" }
  ]
})
\`\`\`

**步骤 2.5：告知用户 Web UI 地址**
workspace_init 返回的 \`webUrl\` 是可视化界面地址，**务必告知用户**：
> "工作区已创建！你可以在浏览器中打开此地址查看进度：
> [webUrl 的值，例如 http://localhost:5173/workspace/ws-xxx]"

**步骤 3：制定计划**
根据任务类型，创建子节点分解任务。

**引导话术**：
> "好的，我来帮你管理这个任务。首先让我确认几个问题：
> 1. 这个任务的具体目标是什么？
> 2. 有没有需要遵循的项目规范或参考文档？
> 我会创建一个工作区来跟踪整个过程。"
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

  // 分裂任务
  "split_task": `
## 场景：需要分裂任务

### 自动分裂触发条件（无需用户要求）：

| 条件 | 必须分裂 |
|------|---------|
| 分析步骤 > 3 步 | ✅ |
| 形成阶段性结论 | ✅ |
| 需要验证假设 | ✅ |
| 出现多条路径 | ✅ |
| 需要改代码验证 | ✅ |
| 发现前置依赖 | ✅ |

### 分裂流程（三步法）：

**步骤 1：先记录当前结论（关键！）**
\`\`\`typescript
// 在分裂前，先把当前发现记录到父节点
node_update({
  workspaceId: "xxx",
  nodeId: "current-node",
  note: "分析发现：问题出在 UserModule 的类型定义缺失。需要创建类型文件后才能继续。"
})
\`\`\`

**步骤 2：分裂节点**
\`\`\`typescript
node_split({
  workspaceId: "xxx",
  parentId: "current-node",
  title: "添加类型定义文件",
  requirement: "为 UserModule 创建 TypeScript 类型定义",
  inheritContext: true
})
\`\`\`

**步骤 3：继续执行新节点**

### 示例：分析过程中的主动分裂

\`\`\`
[开始分析] → 查看代码(1) → 跟踪调用(2) → 定位问题(3)
                                            ↓
                        此时超过 3 步，触发自动分裂
                                            ↓
                        记录结论："发现 XXX 是问题根源"
                                            ↓
                        分裂："修复 XXX 问题"
\`\`\`

**引导话术**：
> "经过分析，我发现问题根源是：[结论摘要]
>
> 已记录到当前节点。接下来创建子任务处理：[子任务名称]"
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
    title: "何时分裂任务",
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

1. **主动分裂**：分析深度超过 3 步时必须分裂节点，不要等用户要求
2. **结论不丢**：每形成一个结论就记录，分裂前先记录当前发现
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
- split: 何时分裂任务
- complete: 如何完成任务
- progress: 如何查看进度
- guide: 用户引导话术
`
  ].join('\n\n');
}
