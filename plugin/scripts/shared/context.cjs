/**
 * 上下文生成逻辑
 */

/**
 * 生成工作区上下文注入内容
 * @param {object} binding - 会话绑定信息
 * @param {object} config - 工作区配置
 * @param {object} workspaceMdData - 工作区 Markdown 数据
 * @param {object} graph - 节点图
 * @param {object} focusedNodeInfo - 聚焦节点信息
 * @returns {string} 上下文内容
 */
function generateWorkspaceContext(binding, config, workspaceMdData, graph, focusedNodeInfo) {
  let context = `
<tanmi-workspace-context>
## 当前工作区: ${config.name}

**目标**: ${workspaceMdData.goal}
`;

  // 添加规则
  if (workspaceMdData.rules && workspaceMdData.rules.length > 0) {
    context += `
**规则** (必须遵守):
${workspaceMdData.rules.map(r => `- ${r}`).join('\n')}
`;
  }

  // 添加聚焦节点信息（优先使用 graph.currentFocus 作为权威来源）
  const focusNodeId = graph?.currentFocus || binding.focusedNodeId;
  if (focusNodeId && focusedNodeInfo) {
    const nodeStatus = graph?.nodes[focusNodeId]?.status || focusedNodeInfo.status;
    context += `
**当前聚焦节点**: ${focusedNodeInfo.title}
- 节点 ID: ${focusNodeId}
- 状态: ${nodeStatus}
${focusedNodeInfo.requirement ? `- 需求: ${focusedNodeInfo.requirement}` : ''}
`;
  }

  context += `
</tanmi-workspace-context>

<tanmi-workflow-guide>
## 工作流程

### 三阶段概览

\`\`\`
info（收集信息）→ design（规划任务）→ impl（执行实现）
\`\`\`

#### info 阶段
**职责**：理解需求、调研项目、收集信息
**能做**：读文件、搜索代码、创建 info_collection 节点、与用户澄清需求
**禁止**：Write、Edit（不能修改代码）
**结束标志**：info_collection 节点 complete，记录发现的规则和文档

#### design 阶段
**职责**：分解任务、制定计划、创建执行节点
**能做**：创建 planning/execution 节点、创建 memo、展示计划
**禁止**：Write、Edit、派发任务
**关键**：创建计划后**必须**向用户展示并等待确认，不能直接执行

#### impl 阶段
**职责**：逐个执行节点，完成实际工作
**能做**：Write、Edit、执行节点、记录日志、派发任务
**流程**：start 节点 → 执行工作 → log_append 记录过程 → complete 填写结论

---

### 节点操作

#### 执行节点状态流转
\`\`\`
pending ──start──► implementing ──submit──► validating ──complete──► completed
                        │                       │
                       fail                    fail
                        ▼                       ▼
                     failed ◄───────────────────┘
                        │
                      retry
                        ▼
                   implementing

completed ──reopen──► implementing
\`\`\`

#### 规划节点状态流转
\`\`\`
pending ──start──► planning ──complete──► monitoring ──complete──► completed
                       │                      │
                     cancel                 cancel
                       ▼                      ▼
                            cancelled

completed/cancelled ──reopen──► planning
\`\`\`

#### 执行节点动作
| 动作 | 调用 | 说明 |
|------|------|------|
| start | \`node_transition({ action: "start" })\` | pending → implementing |
| submit | \`node_transition({ action: "submit" })\` | implementing → validating，提交验证 |
| complete | \`node_transition({ action: "complete", conclusion: "..." })\` | implementing/validating → completed |
| fail | \`node_transition({ action: "fail", conclusion: "..." })\` | implementing/validating → failed |
| retry | \`node_transition({ action: "retry" })\` | failed → implementing |
| reopen | \`node_transition({ action: "reopen" })\` | completed → implementing |

#### 规划节点动作
| 动作 | 调用 | 说明 |
|------|------|------|
| start | \`node_transition({ action: "start" })\` | pending → planning |
| complete | \`node_transition({ action: "complete", conclusion: "..." })\` | planning/monitoring → completed |
| cancel | \`node_transition({ action: "cancel", conclusion: "..." })\` | planning/monitoring → cancelled |
| reopen | \`node_transition({ action: "reopen" })\` | completed/cancelled → planning |

---

### 信息查看与更新

| 信息 | 查看 | 更新 |
|------|------|------|
| 节点详情 | \`node_get(nodeId)\` | — |
| 工作区全貌 | \`workspace_get(workspaceId)\` | — |
| 当前焦点 | \`context_get()\` | \`context_focus(nodeId)\` |
| 执行日志 | node_get 返回的 logs | \`log_append({ operator, event })\` |
| 当前问题 | node_get 返回的 problem | \`problem_update({ problem, nextStep })\` |
| 完成结论 | node_get 返回的 conclusion | \`node_transition({ conclusion })\` |

**了解节点完整情况**：组合调用 node_get + context_get + workspace_get，综合分析后向用户呈现。

---

### 行为规范

#### 1. 用户输入歧义处理
当用户输入可能有多种理解时（序号、代词、简短回答、模糊指代如"我们的 XXX"），先判断是否有歧义：
- 无歧义：直接执行
- 有歧义：结合对话上下文推断，用具体内容确认意图

#### 2. Git 操作谨慎原则
执行 git 操作（commit、push、reset 等）前，**必须**阐述实际行为：
- commit 前：列出将提交的文件和改动摘要
- push 前：说明目标分支、将推送的提交数量
- 破坏性操作：明确警告影响范围

执行后反馈结果。

#### 3. 代码操作工具优先级
代码分析（查定义、找引用、追调用链）**必须**优先使用 LSP，不用 grep 反复搜索。
通用原则：用户配置了比默认更优的工具时，**必须**优先使用。

#### 4. 关键决策提供对比
需要用户做选择时（多方案、模式切换等），**必须**提供：
- 各选项的差异和影响
- 推荐选项及理由

不要只列选项让用户盲选。

#### 5. 调研后先总结再行动
执行调研类任务（搜索代码、分析文档、扫描问题）后，**必须**先总结发现：
- "我发现 X 处需要处理：[清单]"
- 等用户确认后再执行修改

---

### actionRequired 指令

某些工具返回 actionRequired，表示**必须**立即执行特定行为：

| type | 必须做什么 |
|------|-----------|
| show_plan | 向用户展示计划并等待确认 |
| ask_user | 询问用户特定问题 |
| invoke_skill | 调用指定的 Skill |
| check_docs | 检查相关文档 |
| review_structure | 查看现有结构再决定调整 |
| ask_dispatch | 询问是否启用派发模式 |
| dispatch_task | 执行派发任务 |
| dispatch_complete_choice | 派发完成后选择下一步 |

忽略 actionRequired 会导致流程错误。

---

### 帮助系统

\`\`\`
tanmi_help()                      // 列出所有主题
tanmi_help({ topic: "模糊需求" }) // 按需求搜索
\`\`\`

不确定怎么操作时，先查帮助。
</tanmi-workflow-guide>
`;

  return context;
}

/**
 * 生成 sessionId 注入内容（让 AI 知道自己的会话 ID）
 * @param {string} sessionId - 会话 ID
 * @param {string} platform - 平台标识 ('claude-code' | 'cursor')
 * @returns {string} 注入内容
 */
function generateSessionIdContext(sessionId, platform = 'claude-code') {
  const paramName = 'sessionId';

  return `<tanmi-session-info>
当前会话 ID: ${sessionId}
如需使用 TanmiWorkspace 管理任务，请调用: session_bind(${paramName}="${sessionId}", workspaceId="...")
可用 session_status(${paramName}="${sessionId}") 查看可用工作区列表。
</tanmi-session-info>

<tanmi-guide>
## TanmiWorkspace 操作指南

### 何时使用工作区

**触发场景**：
- 用户要求实现功能、修复 Bug、重构代码
- 用户要求调研/分析某个主题并输出结论
- 用户提到"继续之前的任务"、"上次做到哪了"
- 任务预计需要多步骤、跨会话

**不需要工作区**：简单问答、单次查询、一步完成的小修改

### 新建 vs 继续

| 用户意图 | 判断依据 | 操作 |
|----------|----------|------|
| 新任务 | 明确说"帮我做 XXX" | workspace_init |
| 继续已有 | 提到之前的任务、工作区名称 | workspace_search → session_bind |
| 不确定 | 模糊表述 | 先 workspace_search 查找匹配 |

### 工具调用

| 操作 | 工具 | 说明 |
|------|------|------|
| 模糊搜索 | \`workspace_search(query="关键词")\` | 按名称/目标模糊匹配 |
| 列出全部 | \`workspace_list()\` | 返回所有活跃工作区 |
| 获取详情 | \`workspace_get(workspaceId)\` | 完整状态和节点树 |
| 绑定 | \`session_bind(workspaceId)\` | 绑定后获得完整指南 |
| 新建 | \`workspace_init(name, goal)\` | 创建新工作区 |
| 帮助 | \`tanmi_help()\` | 无参数列主题，有参数模糊搜索 |
</tanmi-guide>`;
}

/**
 * 生成绑定提醒内容（未绑定但检测到工作区关键词时）
 * @param {string} sessionId - 会话 ID
 * @param {string} platform - 平台标识 ('claude-code' | 'cursor')
 * @returns {string} 提醒内容
 */
function generateBindingReminder(sessionId, platform = 'claude-code') {
  const paramName = platform === 'cursor' ? 'sessionId' : 'sessionId';

  return `<tanmi-workspace-reminder>
检测到可能涉及工作区任务，但当前会话未绑定工作区。
如需使用 TanmiWorkspace 功能，请先绑定：
- 查看可用工作区: session_status(${paramName}="${sessionId}")
- 绑定工作区: session_bind(${paramName}="${sessionId}", workspaceId="...")
</tanmi-workspace-reminder>`;
}

/**
 * 获取完整的工作区上下文（组合调用）
 * @param {object} binding - 会话绑定信息
 * @returns {string|null} 上下文内容或 null
 */
function getFullWorkspaceContext(binding) {
  const { getWorkspaceConfig, getWorkspaceMdData, getNodeGraph, getNodeInfo } = require('./workspace.cjs');

  const config = getWorkspaceConfig(binding.workspaceId);
  if (!config) {
    return null;
  }

  const workspaceMdData = getWorkspaceMdData(binding.workspaceId);
  const graph = getNodeGraph(binding.workspaceId);
  // 优先使用 graph.currentFocus 作为权威来源
  const focusNodeId = graph?.currentFocus || binding.focusedNodeId;
  const focusedNodeInfo = focusNodeId ? getNodeInfo(binding.workspaceId, focusNodeId) : null;

  if (workspaceMdData) {
    return generateWorkspaceContext(binding, config, workspaceMdData, graph, focusedNodeInfo);
  }

  return null;
}

module.exports = {
  generateWorkspaceContext,
  generateSessionIdContext,
  generateBindingReminder,
  getFullWorkspaceContext
};
