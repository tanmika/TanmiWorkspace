// src/tools/dispatch.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * node_dispatch 工具定义
 * 准备派发节点任务
 */
export const nodeDispatchTool: Tool = {
  name: "node_dispatch",
  description: `准备派发节点任务，返回 subagent 调用指令。

**使用场景**：在派发模式下，将执行节点任务交给 subagent 执行。

**前置条件**：
- 工作区已启用派发模式
- 节点类型为 execution
- 节点状态为 implementing

**返回内容**：
- startCommit: 执行前的 commit hash
- actionRequired: 包含 subagent 调用所需的所有信息
  - type: "dispatch_task"
  - subagentType: "tanmi-executor"
  - prompt: 预构建的 subagent prompt
  - timeout: 超时时间`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "要派发的节点 ID（必须是 implementing 状态的执行节点）",
      },
    },
    required: ["workspaceId", "nodeId"],
  },
};

/**
 * node_dispatch_complete 工具定义
 * 处理派发任务的执行结果
 */
export const nodeDispatchCompleteTool: Tool = {
  name: "node_dispatch_complete",
  description: `处理派发任务的执行结果。

**使用场景**：subagent 执行完成后，调用此工具处理结果。

**执行逻辑**：
- 成功时：git commit，记录 endCommit，返回下一步指引（派发测试节点）
- 失败时：更新节点状态为 failed，返回父节点决策指引

**返回内容**：
- endCommit: 执行后的 commit hash（成功时）
- nextAction: 下一步操作（"dispatch_test" 或 "return_parent"）
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
- 派发完成后清理临时分支
- 取消派发时清理分支
- 工作区归档/删除时自动调用

**清理内容**：
- 派发分支: tanmi_workspace/process/{workspaceId}
- 备份分支: tanmi_workspace/backup/{workspaceId}/*`,
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

**前置条件**：
- 项目必须是 git 仓库
- 同一项目同时只允许一个工作区启用派发

**执行内容**：
- 检查并发限制
- 备份未提交内容（如有）
- 创建派发分支
- 更新工作区配置`,
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
 * dispatch_disable 工具定义
 * 禁用派发模式（第一步：查询状态，返回选项）
 */
export const dispatchDisableTool: Tool = {
  name: "dispatch_disable",
  description: `禁用派发模式第一步：查询当前状态并返回合并选项。

**返回内容**：
- 原分支名称
- 备份分支信息（如有未提交修改）
- 派发分支上的提交列表
- actionRequired: 包含合并策略选项和分支保留选项

**合并策略**：
- sequential: 按顺序合并，保留每个任务的独立提交（线性历史）
- squash: 压缩为一个提交，最干净的历史
- cherry-pick: 遴选到工作区但不提交，方便用户手动调整
- skip: 暂不合并，保留分支稍后处理

**使用流程**：
1. 调用 dispatch_disable 获取状态和选项
2. 根据 actionRequired 向用户展示选项
3. 调用 dispatch_disable_execute 执行用户选择`,
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

**参数说明**：
- mergeStrategy: 合并策略
  - "sequential": 按顺序合并（rebase/fast-forward）
  - "squash": 压缩合并为单一提交
  - "cherry-pick": 遴选修改到工作区（不提交）
  - "skip": 不合并，仅切回原分支
- keepBackupBranch: 是否保留备份分支
- keepProcessBranch: 是否保留派发分支
- commitMessage: squash 合并时的提交信息（可选）

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
 * 所有派发工具
 */
export const dispatchTools: Tool[] = [
  nodeDispatchTool,
  nodeDispatchCompleteTool,
  dispatchCleanupTool,
  dispatchEnableTool,
  dispatchDisableTool,
  dispatchDisableExecuteTool,
];
