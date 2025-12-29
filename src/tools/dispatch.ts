// src/tools/dispatch.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * dispatch_node 工具定义
 * 升级执行节点为派发母节点
 */
export const dispatchNodeTool: Tool = {
  name: "dispatch_node",
  description: `升级执行节点为派发母节点。

**使用场景**：将执行节点升级为派发母节点，准备创建子节点进行派发执行。

**前置条件**：
- 工作区已启用派发模式
- 节点类型为 execution

**执行逻辑**：
1. 验证派发模式已启用
2. 验证节点是 execution 类型
3. 检查上级节点角色：
   - 如果是 info_collection/info_summary → 返回提示「可直接执行，无需派发」
   - 否则 → 继续升级流程
4. 将节点类型改为 planning
5. 状态改为 monitoring（dispatchParent 字段由 dispatch_create 设置）
6. 返回 actionRequired 指向 dispatching-parent Skill

**返回内容**：
- success: 操作是否成功
- upgraded: 是否升级成功
- skipReason: 如果未升级，原因说明
- actionRequired: 包含下一步操作指引
  - type: "invoke_skill"
  - skill: "dispatching-parent"
  - message: 引导阅读派发流程

**注意**：
- 不创建任何子节点（子节点由 dispatch_create 创建）
- 不记录 startMarker（由 dispatch_create 时记录）
- 不构建 executor prompt（由 dispatch_create 返回）`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "要升级的执行节点 ID",
      },
    },
    required: ["workspaceId", "nodeId"],
  },
};

/**
 * dispatch_complete 工具定义
 * 处理派发任务的执行结果
 */
export const dispatchCompleteTool: Tool = {
  name: "dispatch_complete",
  description: `处理派发任务的执行结果。

**使用场景**：subagent 执行完成后，调用此工具处理结果。

**执行逻辑**：
- 成功时：
  - **Git 模式**：自动 commit 代码变更
  - **无 Git 模式**：记录完成时间戳
  - 返回下一步指引（派发测试节点或返回父节点）
- 失败时：
  - **Git 模式**：自动 git reset --hard 回滚到 startMarker
  - **无 Git 模式**：无法自动回滚，需手动恢复代码
  - 更新节点状态为 failed，返回父节点决策指引

**返回内容**：
- endMarker: 执行后的标记，用于记录执行终点
  - **Git 模式（成功）**：commit hash（新创建的 commit ID）
  - **Git 模式（失败）**：null（已回滚到 startMarker）
  - **无 Git 模式**：时间戳（ISO 8601 格式）
  - 用途：记录执行完成时间点，配合 startMarker 形成执行区间
- nextAction: 下一步操作
  - "dispatch_test": 派发配对的测试节点
  - "return_parent": 返回父节点
- testNodeId: 配对的测试节点 ID（如果有）`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "节点 ID",
      },
      success: {
        type: "boolean",
        description: "执行是否成功",
      },
      conclusion: {
        type: "string",
        description: "执行结论/失败原因",
      },
    },
    required: ["workspaceId", "nodeId", "success"],
  },
};

/**
 * dispatch_cleanup 工具定义
 * 清理派发相关的 git 分支
 */
export const dispatchCleanupTool: Tool = {
  name: "dispatch_cleanup",
  description: `清理派发相关的 git 分支。

**使用场景**：
- 派发完成后清理临时分支（仅 Git 模式）
- 取消派发时清理分支（仅 Git 模式）
- 工作区归档/删除时自动调用

**Git 模式清理内容**：
- 派发分支: tanmi_workspace/process/{workspaceId}
- 备份分支: tanmi_workspace/backup/{workspaceId}/*

**无 Git 模式行为**：
- 此工具为 no-op（无操作，直接返回成功）
- 无 Git 模式下没有分支需要清理
- 调用不会报错，但不执行任何操作

**注意**：
- 工作区配置已在 dispatch_disable_execute 中清理，此工具仅处理 git 分支
- 无 Git 模式下调用此工具是安全的，但不是必需的`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      cleanupType: {
        type: "string",
        enum: ["backup", "process", "all"],
        description: "清理类型：backup=仅备份分支，process=仅派发分支，all=全部（默认）",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * dispatch_enable 工具定义
 * 启用派发模式
 */
export const dispatchEnableTool: Tool = {
  name: "dispatch_enable",
  description: `启用工作区的派发模式。

**派发模式说明**：
派发模式允许将执行节点任务交给独立的 subagent 执行。提供两种模式：

| 模式 | 定位 | 推荐度 | 特性 |
|------|------|--------|------|
| **无 Git 模式** | 标准模式 | ✅ 推荐（默认） | 仅更新元数据，不影响代码，安全 |
| **Git 模式** | 实验功能 | ⚠️ 谨慎使用 | 自动分支、提交、回滚，有一定风险 |

**useGit 参数说明**：
- \`false\` 或不传（默认）：无 Git 模式
  - 仅更新元数据，不创建分支
  - 测试失败无法自动回滚（需手动恢复代码）
  - 适合大部分场景
- \`true\`：Git 模式（实验功能）
  - 需要项目是 git 仓库
  - 自动创建派发分支 \`tanmi_workspace/process/{workspaceId}\`
  - 备份未提交内容到 \`tanmi_workspace/backup/{workspaceId}/{timestamp}\`
  - 测试失败自动回滚（git reset）
  - 有一定风险，谨慎使用

**前置条件**：
- Git 模式需要项目是 git 仓库
- 同一项目同时只允许一个工作区启用派发

**执行内容**：
- 检查并发限制
- Git 模式：备份未提交内容（如有）、创建派发分支
- 无 Git 模式：仅更新配置

**推荐做法**：
优先使用无 Git 模式（安全、简单）。只在明确需要自动回滚时使用 Git 模式。`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      useGit: {
        type: "boolean",
        description: "是否使用 Git 模式（实验功能：分支隔离、自动提交、回滚）。默认 false（无 Git 模式，推荐）。设为 true 需要项目是 git 仓库。",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * dispatch_disable 工具定义
 * 禁用派发模式（第一步：查询状态，返回选项）
 */
export const dispatchDisableTool: Tool = {
  name: "dispatch_disable",
  description: `禁用派发模式第一步：查询当前状态并返回合并选项。

**⚠️ 重要：此工具返回的选项必须由用户决策，AI 禁止擅自选择！**

**返回内容**：
- Git 模式：原分支名称、备份分支信息、派发分支上的提交列表
- 无 Git 模式：简化的状态信息（无分支信息）
- actionRequired: 包含合并策略选项和分支保留选项（仅 Git 模式）

**合并策略**（仅 Git 模式）：
- sequential: 按顺序合并，保留每个任务的独立提交（线性历史）
- squash: 压缩为一个提交，最干净的历史
- cherry-pick: 遴选到工作区但不提交，方便用户手动调整
- skip: 暂不合并，保留分支稍后处理

**无 Git 模式行为**：
- 无需选择合并策略（无分支需要合并）
- 直接调用 dispatch_disable_execute 清理配置即可
- actionRequired 将指导下一步操作

**🚫 禁止行为**：
- AI 不得自行选择合并策略
- AI 不得自行决定是否保留分支
- 必须使用 AskUserQuestion 工具询问用户

**✅ 正确流程**：
1. 调用 dispatch_disable 获取状态和选项
2. **必须**使用 AskUserQuestion 向用户展示选项并等待用户选择
3. 根据用户的明确选择调用 dispatch_disable_execute`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * dispatch_disable_execute 工具定义
 * 执行禁用派发（第二步：根据用户选择执行）
 */
export const dispatchDisableExecuteTool: Tool = {
  name: "dispatch_disable_execute",
  description: `禁用派发模式第二步：执行用户选择的合并策略。

**⚠️ 前置条件：必须先通过 AskUserQuestion 获取用户的明确选择！**

**🚫 严禁行为**：
- 禁止 AI 自行决定 mergeStrategy 参数值
- 禁止 AI 自行决定 keepBackupBranch/keepProcessBranch 参数值
- 所有参数必须来自用户通过 AskUserQuestion 的明确回答

**参数说明**（所有参数必须来自用户选择）：
- mergeStrategy: 合并策略（用户必选）
  - "sequential": 按顺序合并（rebase/fast-forward）
  - "squash": 压缩合并为单一提交
  - "cherry-pick": 遴选修改到工作区（不提交）
  - "skip": 不合并，仅切回原分支
- keepBackupBranch: 是否保留备份分支（用户选择）
- keepProcessBranch: 是否保留派发分支（用户选择）
- commitMessage: squash 合并时的提交信息（可选，用户提供）

**注意**：
- cherry-pick 策略会将所有修改应用到工作区但不提交，用户可手动调整后提交
- skip 策略会自动保留派发分支，忽略 keepProcessBranch 设置`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      mergeStrategy: {
        type: "string",
        enum: ["sequential", "squash", "cherry-pick", "skip"],
        description: "合并策略",
      },
      keepBackupBranch: {
        type: "boolean",
        description: "是否保留备份分支（默认 false）",
      },
      keepProcessBranch: {
        type: "boolean",
        description: "是否保留派发分支（默认 false）",
      },
      commitMessage: {
        type: "string",
        description: "squash 合并时的提交信息（可选）",
      },
    },
    required: ["workspaceId", "mergeStrategy"],
  },
};

/**
 * dispatch_create 工具定义
 * 在派发母节点下创建派发子节点
 */
export const dispatchCreateTool: Tool = {
  name: "dispatch_create",
  description: `在派发母节点下创建派发子节点。

**使用场景**：dispatch_node 升级节点后，使用此工具创建子节点。

**前置条件**：
- parentId 必须是已调用 dispatch_node 的派发母节点
- 派发模式已启用

**创建的节点**：
- exec: 执行节点 (role=dispatch_exec)
- spec: 规格审查节点 (role=dispatch_spec)，自动生成
- quality: 质量审查节点 (role=dispatch_quality)，可选

**返回**：
- execId, specId, qualityId
- actionRequired: 派发 exec 节点的指令`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      parentId: {
        type: "string",
        description: "派发母节点 ID",
      },
      exec: {
        type: "object",
        properties: {
          requirement: {
            type: "string",
            description: "执行节点的需求描述",
          },
          acceptanceCriteria: {
            type: "array",
            items: {
              type: "object",
              properties: {
                when: { type: "string" },
                then: { type: "string" },
              },
              required: ["when", "then"],
            },
            description: "验收标准列表",
          },
        },
        required: ["requirement", "acceptanceCriteria"],
        description: "执行节点的配置",
      },
      includeQuality: {
        type: "boolean",
        description: "是否创建质量审查节点，默认 true",
      },
    },
    required: ["workspaceId", "parentId", "exec"],
  },
};

/**
 * 所有派发工具
 */
export const dispatchTools: Tool[] = [
  dispatchNodeTool,
  dispatchCompleteTool,
  dispatchCleanupTool,
  dispatchEnableTool,
  dispatchDisableTool,
  dispatchDisableExecuteTool,
  dispatchCreateTool,
];
