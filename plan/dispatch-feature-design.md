# 派发功能设计方案

> 版本：v1.2
> 日期：2025-12-17
> 状态：待实现

## 概述

派发功能允许将节点任务交由独立的 subagent 执行，实现任务的自动化执行和验证。

## 核心原则

| 原则 | 说明 |
|------|------|
| 父节点主导 | 规划、定义验收标准、决策 |
| 子节点执行 | 执行任务，反馈结果/问题，不做决策 |
| 单节点派发 | 任务粒度足够小，一次派发一个节点 |
| 串行执行 | 同一父节点下的节点串行执行 |
| 自动验证 | 每个执行节点配对一个测试节点验证结果 |
| 单项目单派发 | 同一项目同时只允许一个工作区启用派发 |

## 功能特性

### 1. 开箱即用

通过安装脚本自动配置，用户克隆项目后无需手动设置。

**安装脚本扩展** (`scripts/install-global.sh`)：
- 自动创建项目级 `.claude/agents/tanmi-executor.md`
- 配置 subagent 的 tools、prompt

**安装位置**：
- 项目级：`{project}/.claude/agents/tanmi-executor.md`
- Claude Code 会自动加载此目录下的 agent 定义

**安装脚本示例**：
```bash
# scripts/install-global.sh 扩展
mkdir -p .claude/agents
cp templates/tanmi-executor.md .claude/agents/
```

**tanmi-executor.md 模板**：
```markdown
---
name: tanmi-executor
description: TanmiWorkspace node executor specializing in atomic task execution with strict scope control
tools: Read, Write, Edit, Bash, Glob, Grep, tanmi-workspace/*
model: sonnet
---

You are a senior task executor with expertise in TanmiWorkspace node execution. Your focus spans requirement analysis, scope assessment, and atomic task implementation with emphasis on strict boundary control and quality delivery.

When invoked:
1. Call context_get to retrieve full execution context
2. Assess task scope and information completeness
3. Execute task within defined boundaries
4. Report progress and deliver results via MCP tools

Execution quality checklist:
- Requirement clarity verified before execution
- Task scope fits single execution confirmed
- All code changes within requirement boundaries
- Log entries recorded at key milestones
- Conclusion includes actionable summary

Core capabilities:

Scope Assessment:
- Requirement completeness analysis
- Task granularity evaluation
- Dependency identification
- Risk assessment

Task Execution:
- Code implementation
- File modification
- Test execution
- Build verification

Progress Reporting:
- Milestone logging via log_append
- Problem reporting via problem_update
- Status transition via node_transition

Communication Protocol:

Progress update format:
{
  "agent": "tanmi-executor",
  "nodeId": "[current-node-id]",
  "status": "executing|completed|failed",
  "progress": {
    "completed": ["step1", "step2"],
    "pending": ["step3"],
    "filesChanged": ["path/to/file"]
  }
}

Failure report format:
{
  "agent": "tanmi-executor",
  "nodeId": "[current-node-id]",
  "status": "failed",
  "reason": "info_insufficient|scope_too_large|execution_error",
  "details": "[specific issue description]",
  "suggestion": "[recommended action for parent node]"
}

Execution Workflow:

Phase 1 - Assessment (CRITICAL):
- Parse requirement from context
- Evaluate information completeness
- Assess task scope and complexity
- If insufficient info → FAIL with reason "info_insufficient"
- If scope too large → FAIL with reason "scope_too_large"

Phase 2 - Implementation:
- Log execution start via log_append
- Implement changes incrementally
- Log key milestones
- Handle errors gracefully

Phase 3 - Delivery:
- Verify all changes complete
- Run relevant tests if applicable
- Call node_transition(action="complete") with conclusion
- Conclusion must summarize: what was done, files changed, verification result

Integration with TanmiWorkspace:
- Receive context from parent planning node via context_get
- Report progress to workspace via log_append
- Signal completion/failure via node_transition
- Support test node verification via clear conclusion

Constraints:
- NO planning decisions - execute only
- NO scope expansion - strict boundaries
- FAIL fast on uncertainty - let parent decide
- ALWAYS log before major operations
```

**tanmi-tester.md 模板**：
```markdown
---
name: tanmi-tester
description: TanmiWorkspace test executor specializing in verification against acceptance criteria
tools: Read, Bash, Glob, Grep, tanmi-workspace/*
model: sonnet
---

You are a senior test executor with expertise in TanmiWorkspace node verification. Your focus spans acceptance criteria validation, test execution, and quality verification with emphasis on objective assessment and clear reporting.

When invoked:
1. Call context_get to retrieve test context and acceptance criteria
2. Parse acceptance criteria from requirement
3. Execute verification for each criterion
4. Report verification results objectively

Verification quality checklist:
- All acceptance criteria identified and listed
- Each criterion has clear pass/fail result
- Evidence provided for each verification
- No subjective judgments - facts only
- Conclusion actionable for parent node

Core capabilities:

Criteria Analysis:
- Acceptance criteria parsing
- Test case identification
- Verification method selection
- Coverage assessment

Test Execution:
- Unit test running
- Integration test execution
- Manual verification steps
- Build and lint checks

Result Reporting:
- Per-criterion pass/fail status
- Evidence collection
- Failure root cause identification
- Recommendation for retry

Communication Protocol:

Verification result format:
{
  "agent": "tanmi-tester",
  "nodeId": "[test-node-id]",
  "execNodeId": "[paired-exec-node-id]",
  "status": "passed|failed",
  "criteria": [
    {
      "criterion": "Feature X works correctly",
      "status": "passed|failed",
      "evidence": "Test output / observation"
    }
  ],
  "summary": "X/Y criteria passed"
}

Verification Workflow:

Phase 1 - Criteria Analysis:
- Extract acceptance criteria from requirement
- List all verifiable items
- Determine verification method for each
- Log verification plan via log_append

Phase 2 - Execution:
- Execute tests/checks for each criterion
- Collect evidence (output, screenshots, logs)
- Record results objectively
- Do NOT fix issues - only verify

Phase 3 - Reporting:
- Compile all results
- Calculate pass rate
- If ALL passed → node_transition(action="complete")
- If ANY failed → node_transition(action="fail") with details
- Conclusion must list each criterion and its status

Integration with TanmiWorkspace:
- Receive acceptance criteria from parent node via requirement
- Verify work done by paired execution node
- Report to parent for decision making
- Enable git rollback decision via clear failure reporting

Constraints:
- NO code fixes - verify only
- NO new features - test existing work
- OBJECTIVE assessment - no bias toward pass/fail
- EVIDENCE required - no assumptions
- FAIL if ANY criterion not met
```

### 2. 派发为进阶功能

默认不启用，需要用户明确选择。

**启用时机**：用户确认计划后，开始执行第一个节点前询问。

**询问机制**：
```typescript
// actionRequired 类型
{
  type: "ask_dispatch",
  message: "是否启用派发模式？启用后执行节点将由独立 subagent 执行。",
  data: {
    workspaceId: string;
  }
}
```

**派发设定存储**：
```typescript
// workspace.json
{
  name: string;
  // ... 其他字段
  dispatch?: {
    enabled: boolean;
    enabledAt: number;
    originalBranch?: string;      // 派发前的原分支
    processBranch?: string;       // 当前派发分支
    backupBranches?: string[];    // 备份分支列表
    limits?: {
      timeoutMs?: number;         // 单节点执行超时，默认 300000 (5分钟)
      maxRetries?: number;        // 最大重试次数，默认 3
    }
  }
}
```

设定在单个工作区内统一，只设置一次，后续可手动更改。

### 3. 节点结构（派发模式）

父节点规划时必须成对创建执行节点和测试节点。

#### 节点关联机制

**显式关联**：通过字段关联执行节点和测试节点

```typescript
// NodeMeta 扩展
{
  // ... 现有字段

  // 执行节点专用
  testNodeId?: string;      // 关联的测试节点 ID

  // 测试节点专用
  execNodeId?: string;      // 关联的执行节点 ID
}
```

**创建方式**：

方式一：创建执行节点时同时创建测试节点
```typescript
node_create({
  workspaceId: "...",
  parentId: "...",
  title: "实现 xxx 功能",
  type: "execution",
  requirement: "...",
  createTestNode: {
    title: "验证 xxx 功能",
    requirement: "验收标准：\n1. xxx\n2. xxx"
  }
})
// 返回 { nodeId, testNodeId }
```

方式二：分两次创建，第二次指定配对
```typescript
// 先创建执行节点
const exec = node_create({ ... });

// 再创建测试节点，指定配对
node_create({
  workspaceId: "...",
  parentId: "...",
  title: "验证 xxx 功能",
  type: "execution",
  requirement: "验收标准：...",
  pairWithExecNode: exec.nodeId
})
```

**节点结构示例**：
```
父节点 (planning)
├── 执行节点 A (testNodeId: "test-a")
│   requirement: "实现 xxx 功能"
├── 测试节点 A (execNodeId: "exec-a")
│   requirement: "验证 xxx 功能\n验收标准：\n1. xxx\n2. xxx"
├── 执行节点 B (testNodeId: "test-b")
│   requirement: "实现 yyy 功能"
├── 测试节点 B (execNodeId: "exec-b")
│   requirement: "验证 yyy 功能\n验收标准：\n1. yyy"
└── ...
```

**验收标准**由父节点在创建测试节点时写入 requirement，测试节点只需按标准验证。

### 4. subagent 执行逻辑

```
派发开始
    │
    ▼
执行前评估
    │
    ├─ 信息不足 → failed + 原因 → 父节点重新评估
    ├─ 范围过大 → failed + 原因 → 父节点重新评估
    └─ 合适 → 继续执行
                │
                ▼
           执行任务
                │
           log_append 报告进度
                │
                ▼
           完成 → complete + conclusion
```

### 5. 失败处理

#### 失败类型与处理

| 失败类型 | 处理方式 | 状态流转 |
|---------|---------|---------|
| 信息不足/范围过大 | 父节点补充信息后重试 | failed → retry → implementing |
| 执行错误 | 父节点决定重试或放弃 | failed → retry → implementing |
| 测试失败 | git reset + 父节点重新规划 | failed → (新节点或调整后重试) |
| 多次失败（超过 maxRetries） | 父节点重新规划或询问用户 | 保持 failed，通知用户 |

#### 重试机制

- 使用节点状态机的 `retry` action，不需要额外的 `retrying` 状态
- 重试次数记录在节点日志中，由管理端 AI 判断是否超过限制
- 超过 `maxRetries` 后，返回 actionRequired 通知用户介入

### 6. dispatch 状态管理

**只有执行节点有 dispatch 字段**，测试节点使用普通节点状态管理。

```typescript
// 执行节点的 dispatch 字段
dispatch?: {
  startCommit: string;   // 执行前的 commit hash
  endCommit?: string;    // 执行后的 commit hash
  status: "pending" | "executing" | "testing" | "passed" | "failed";
}
```

**状态流转**：
```
pending → executing（subagent 开始执行）
        → testing（执行完成，开始测试）
        → passed（测试通过）
        → failed（执行失败或测试失败）
```

**测试节点状态**：使用普通节点状态（pending → implementing → completed/failed）

## Git 分支策略

采用**连续分支**方案，所有派发任务在同一分支上执行，通过 commit 记录实现精确回滚。

### 分支结构

```
tanmi_workspace/
├── backup/     # 未提交内容的备份
│   └── {workspaceId}/
│       └── {timestamp}
└── process/    # 派发执行分支
    └── {workspaceId}
```

### 派发前检查

**重要**：启用派发前进行以下检查：

```
[启用派发模式]
      │
      ▼
检查是否已有其他工作区在派发
├─ 有 → 报错：请先完成或取消已有派发
└─ 无 → 继续
      │
      ▼
检查是否有未提交内容
├─ 有 → 提示用户"建议先手动提交代码"
│       │
│       └─ 用户选择继续 → 自动备份
│                         │
│                         ▼
│               git checkout -b tanmi_workspace/backup/{wsId}/{timestamp}
│               git add -A
│               git commit -m "tanmi: 派发前自动备份 - {wsId}"
│               git checkout {原分支}
│               记录备份分支到 dispatch.backupBranches
│
└─ 无 → 继续
      │
      ▼
记录原分支到 dispatch.originalBranch
从当前 HEAD 创建派发分支
git checkout -b tanmi_workspace/process/{wsId}
记录派发分支到 dispatch.processBranch
```

### 执行流程

```
[派发模式已启用，分支已准备]
    │
    ▼
[执行节点 A]
├── git rev-parse HEAD → 记录 startCommit
├── 更新 dispatch.status = "executing"
├── subagent 执行任务
├── git add -A && git commit -m "tanmi: {nodeId} - {title}"
├── git rev-parse HEAD → 记录 endCommit
├── 更新 dispatch.status = "testing"
    │
    ▼
[测试节点 A]
├── subagent 执行测试
├── 通过 → 更新执行节点 dispatch.status = "passed" → 继续
├── 失败 → git reset --hard {startCommit}
│         → 更新执行节点 dispatch.status = "failed"
│         → 返回父节点决策
    │
    ▼
[执行节点 B]
├── git rev-parse HEAD → 记录 startCommit（= 节点A的endCommit）
├── ... 同上流程
    │
    ▼
[所有节点完成]
├── git checkout {原分支}
├── git merge --no-ff tanmi_workspace/process/{wsId} -m "tanmi: 完成工作区 {wsId} 任务"
├── git branch -d tanmi_workspace/process/{wsId}
├── 清理备份分支（可选）
```

### 合并策略

使用 `merge --no-ff`（强制创建合并 commit）：

| 策略 | 效果 | 选择原因 |
|------|------|----------|
| merge (fast-forward) | 线性历史，看不出分支 | ❌ |
| **merge --no-ff** | 保留分支结构，有合并节点 | ✅ 可追溯派发历史 |
| rebase | 线性历史，丢失分支信息 | ❌ |
| squash | 压缩为单个 commit | ❌ 丢失中间 commit |

### 回滚场景

**场景1：执行节点 failed（信息不足/范围过大）**
```bash
# 无代码修改，无需回滚
# 父节点介入决策
```

**场景2：执行节点执行后测试失败**
```bash
git reset --hard {执行节点的startCommit}
# 丢弃该执行节点的所有修改
# 父节点介入决策
```

**场景3：用户中断/取消工作区**
```bash
git checkout {原分支}
git branch -D tanmi_workspace/process/{wsId}
# 完全丢弃所有派发修改
# 备份分支保留，用户可手动恢复或删除
```

**场景4：合并时发生冲突**
```bash
# 原分支在派发期间有其他提交导致冲突
# 先尝试自动解决
# 失败则标记工作区状态为 "merge_conflict"
# 通知用户处理
```

### 备份分支清理策略

**自动清理时机**：
- `workspace_archive` 时：自动删除关联的 backup 和 process 分支
- `workspace_delete` 时：自动删除关联的所有分支

**手动清理工具**：
```typescript
// 新增 MCP 工具
{
  name: "dispatch_cleanup",
  description: "清理派发相关的 git 分支",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: { type: "string" },
      cleanupType: {
        type: "string",
        enum: ["backup", "process", "all"]
      }
    },
    required: ["workspaceId"]
  }
}
```

### 并发限制

**同一项目同时只允许一个工作区启用派发模式**。

检查机制：
```typescript
// 启用派发前检查
async function checkDispatchAvailable(): Promise<void> {
  const existingBranches = await git.listBranches("tanmi_workspace/process/*");
  if (existingBranches.length > 0) {
    const wsId = extractWorkspaceId(existingBranches[0]);
    throw new TanmiError(
      "DISPATCH_CONFLICT",
      `已有工作区 ${wsId} 正在派发中，请先完成或取消该派发`
    );
  }
}
```

### Git 命令封装

在 `src/utils/git.ts` 中封装：

```typescript
interface GitUtils {
  // 检查是否在 git 仓库中
  isGitRepo(): Promise<boolean>;

  // 获取当前分支名
  getCurrentBranch(): Promise<string>;

  // 检查是否有未提交的修改
  hasUncommittedChanges(): Promise<boolean>;

  // 列出匹配模式的分支
  listBranches(pattern: string): Promise<string[]>;

  // 创建备份分支（用于保存未提交内容）
  createBackupBranch(workspaceId: string): Promise<string>;

  // 创建并切换到派发分支
  createProcessBranch(workspaceId: string): Promise<void>;

  // 切换到派发分支
  checkoutProcessBranch(workspaceId: string): Promise<void>;

  // 获取当前 commit hash
  getCurrentCommit(): Promise<string>;

  // 提交派发修改
  commitDispatch(nodeId: string, title: string): Promise<string>;

  // 回滚到指定 commit
  resetToCommit(commitHash: string): Promise<void>;

  // 合并派发分支（使用 --no-ff）
  mergeProcessBranch(workspaceId: string, targetBranch: string): Promise<void>;

  // 删除派发分支
  deleteProcessBranch(workspaceId: string): Promise<void>;

  // 删除备份分支
  deleteBackupBranch(workspaceId: string, timestamp?: string): Promise<void>;

  // 删除所有工作区相关分支
  deleteAllWorkspaceBranches(workspaceId: string): Promise<void>;
}
```

## MCP 工具与 Task Tool 协调

### 协调机制

MCP 工具无法直接调用 Claude Code 的 Task tool。采用 **actionRequired 返回机制**：

```
node_dispatch 调用
      │
      ▼
MCP 工具执行准备工作
├── 验证派发模式
├── 验证节点状态
├── 准备 git 分支
├── 记录 startCommit
├── 构建 subagent prompt
      │
      ▼
返回 actionRequired
      │
      ▼
Claude 根据 actionRequired 调用 Task tool
      │
      ▼
subagent 执行完成
      │
      ▼
Claude 调用 node_dispatch_complete 处理结果
```

### node_dispatch

准备派发并返回 actionRequired。

```typescript
{
  name: "node_dispatch",
  description: "准备派发节点任务，返回 subagent 调用指令",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: { type: "string" },
      nodeId: { type: "string" },
    },
    required: ["workspaceId", "nodeId"]
  }
}
```

**返回结果**：
```typescript
{
  success: true,
  startCommit: string;
  actionRequired: {
    type: "dispatch_task",
    message: "请使用 Task tool 派发此节点任务",
    data: {
      nodeId: string;
      testNodeId: string;           // 关联的测试节点
      subagentType: "tanmi-executor";
      prompt: string;               // 预构建的 subagent prompt
      timeout: number;              // 超时时间（ms）
    }
  }
}
```

### node_dispatch_complete

处理 subagent 执行结果。

```typescript
{
  name: "node_dispatch_complete",
  description: "处理派发任务的执行结果",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: { type: "string" },
      nodeId: { type: "string" },
      success: { type: "boolean" },
      conclusion: { type: "string" },
    },
    required: ["workspaceId", "nodeId", "success"]
  }
}
```

**执行逻辑**：
1. 如果成功：`git commit`，记录 endCommit，更新 dispatch.status
2. 如果失败：更新节点状态为 failed，记录失败原因
3. 返回下一步操作指引（派发测试节点或返回父节点）

### workspace_get / workspace_init 扩展

返回结果中包含 `dispatch` 配置：
```typescript
{
  // ... 现有字段
  dispatch?: {
    enabled: boolean;
    enabledAt: number;
    processBranch?: string;
    originalBranch?: string;
    backupBranches?: string[];
    limits?: {
      timeoutMs?: number;
      maxRetries?: number;
    }
  }
}
```

### context_get 扩展

派发模式下，返回结果中包含 git 相关信息：
```typescript
{
  // ... 现有字段
  git?: {
    currentBranch: string;
    hasUncommittedChanges: boolean;
    isDispatchBranch: boolean;
  }
}
```

## 资源限制

### 超时控制

- **默认超时**：300000ms (5分钟)
- **配置位置**：workspace.json 的 dispatch.limits.timeoutMs
- **超时处理**：由管理端 AI 监控，超时则标记节点为 failed

### 重试次数限制

- **默认上限**：3 次
- **配置位置**：workspace.json 的 dispatch.limits.maxRetries
- **超限处理**：返回 actionRequired 通知用户介入

### Token 限制

- Claude Code Task tool 未暴露 token 限制参数
- 暂不支持，后续版本可考虑通过 prompt 中的约束来间接控制

## 流程图

### 完整派发流程

```
用户确认计划
      │
      ▼
actionRequired: ask_dispatch
"是否启用派发模式？（建议先提交当前代码修改）"
      │
      ├─ 否 → 正常自执行模式
      │
      └─ 是 → 启用派发
              │
              ▼
         检查并发限制
         检查未提交内容
              │
              ├─ 有未提交 → 创建备份分支
              │
              ▼
         记录原分支
         创建派发分支 tanmi_workspace/process/{wsId}
              │
              ▼
    ┌─────────────────────────┐
    │      执行节点循环        │
    │  ┌───────────────────┐  │
    │  │ 调用 node_dispatch │  │
    │  │      │            │  │
    │  │      ▼            │  │
    │  │ 返回 actionRequired│  │
    │  │ type: dispatch_task│  │
    │  │      │            │  │
    │  │      ▼            │  │
    │  │ Claude 调用 Task  │  │
    │  │ tool 派发任务      │  │
    │  │      │            │  │
    │  │      ▼            │  │
    │  │ subagent 评估     │  │
    │  │      │            │  │
    │  │  ┌───┴───┐        │  │
    │  │  │       │        │  │
    │  │ 合适   不合适     │  │
    │  │  │       │        │  │
    │  │  ▼       ▼        │  │
    │  │ 执行   failed     │  │
    │  │  │       │        │  │
    │  │  ▼       └──────────────→ 父节点决策
    │  │ 调用              │  │
    │  │ node_dispatch_    │  │
    │  │ complete          │  │
    │  │  │                │  │
    │  │  ▼                │  │
    │  │ commit + 更新状态  │  │
    │  │  │                │  │
    │  │  ▼                │  │
    │  │ 派发测试节点       │  │
    │  │ （同样流程）       │  │
    │  │  │                │  │
    │  │  ┌───┴───┐        │  │
    │  │  │       │        │  │
    │  │ 通过   失败       │  │
    │  │  │       │        │  │
    │  │  │       ▼        │  │
    │  │  │    git reset   │  │
    │  │  │       │        │  │
    │  │  │       └──────────────→ 父节点决策
    │  │  │                │  │
    │  │  ▼                │  │
    │  │ 下一对节点         │  │
    │  └───────────────────┘  │
    └─────────────────────────┘
              │
              ▼
         全部完成
              │
              ▼
      切换回原分支
      merge --no-ff 合并派发分支
              │
              ▼
         删除派发分支
         清理备份分支（可选）
```

## 实现步骤

### Phase 1: 基础设施
1. [ ] 创建 `src/utils/git.ts` Git 工具封装
2. [ ] 扩展 `workspace.json` 支持 dispatch 配置
3. [ ] 扩展 `NodeMeta` 支持 dispatch 状态和节点关联字段

### Phase 2: 安装脚本
4. [ ] 扩展 `scripts/install-global.sh` 创建 agent 配置
5. [ ] 创建 `templates/tanmi-executor.md` 模板文件

### Phase 3: MCP 工具
6. [ ] 实现 `node_dispatch` MCP 工具
7. [ ] 实现 `node_dispatch_complete` MCP 工具
8. [ ] 实现 `dispatch_cleanup` MCP 工具
9. [ ] 扩展 `node_create` 支持 createTestNode 和 pairWithExecNode
10. [ ] 扩展 `workspace_get` 返回 dispatch 配置
11. [ ] 扩展 `context_get` 返回 git 状态
12. [ ] 扩展 `workspace_archive` 自动清理分支
13. [ ] 扩展 `workspace_delete` 自动清理分支

### Phase 4: 流程集成
14. [ ] 实现 `ask_dispatch` actionRequired
15. [ ] 实现 `dispatch_task` actionRequired 处理
16. [ ] 集成派发流程到节点执行
17. [ ] 实现测试失败回滚逻辑
18. [ ] 实现并发检查机制
19. [ ] 实现超时和重试限制

### Phase 5: 测试和文档
20. [ ] 编写单元测试
21. [ ] 编写集成测试
22. [ ] 更新用户文档

## 设计决策记录

| 问题 | 决策 | 理由 |
|------|------|------|
| 派发分支基准 | 从当前 HEAD 创建 | 保留用户当前工作状态 |
| 未提交内容处理 | 提示用户 + 自动备份 | 防止丢失，给用户选择权 |
| 合并策略 | merge --no-ff | 保留派发历史，便于追溯 |
| 冲突处理 | 先自动，失败通知用户 | 平衡自动化和用户控制 |
| 多工作区并发 | 不允许 | 避免分支冲突和提交顺序问题 |
| MCP 与 Task tool 协调 | actionRequired 返回机制 | MCP 无法直接调用 Task tool |
| 节点关联 | 显式字段 testNodeId/execNodeId | 明确关联，避免歧义 |
| dispatch 状态管理 | 只有执行节点有 dispatch 字段 | 测试节点用普通状态管理 |
| 失败重试 | 使用节点状态机 retry action | 复用现有机制，不增加复杂度 |
| 备份分支清理 | archive/delete 时自动 + 手动工具 | 自动化 + 灵活性 |
| 资源限制 | 超时 5min，重试 3 次 | 防止资源滥用 |
| agent 安装位置 | 项目级 .claude/agents/ | Claude Code 自动加载 |

## 参考资料

- [Claude Code Task Tool 文档](https://docs.anthropic.com/claude-code)
- [Claude Code Subagent 机制](https://docs.anthropic.com/claude-code/subagents)
