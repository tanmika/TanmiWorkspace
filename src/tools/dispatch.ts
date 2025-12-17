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
 * 禁用派发模式
 */
export const dispatchDisableTool: Tool = {
  name: "dispatch_disable",
  description: `禁用工作区的派发模式。

**选项**：
- merge=true: 将派发分支的更改合并到原分支
- merge=false: 直接切回原分支，丢弃派发分支的更改

**执行内容**：
- 切换回原分支
- 可选：合并派发分支
- 清理派发相关分支
- 更新工作区配置`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      merge: {
        type: "boolean",
        description: "是否将派发分支合并到原分支（默认 false）",
      },
    },
    required: ["workspaceId"],
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
];
