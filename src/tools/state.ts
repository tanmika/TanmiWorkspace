// src/tools/state.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * node_transition 工具定义
 */
export const nodeTransitionTool: Tool = {
  name: "node_transition",
  description: `变更节点状态。根据节点类型支持不同的状态转换：

**执行节点 (execution)**：
- start: pending → implementing（开始执行）
- submit: implementing → validating（提交验证）
- complete: implementing/validating → completed（完成，需提供 conclusion）
- fail: implementing/validating → failed（失败，需提供 conclusion）
- retry: failed → implementing（重试）
- reopen: completed → implementing（重新激活）

**规划节点 (planning)**：
- start: pending → planning（开始规划）
- complete: planning/monitoring → completed（完成汇总，需提供 conclusion，要求所有子节点已完成）
- cancel: planning/monitoring → cancelled（取消规划，需提供 conclusion）
- reopen: completed/cancelled → planning（重新规划）

注意：执行节点 start/reopen 会自动级联更新父规划节点到 monitoring 状态`,
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
      action: {
        type: "string",
        enum: ["start", "submit", "complete", "fail", "retry", "reopen", "cancel"],
        description: "状态转换动作",
      },
      reason: {
        type: "string",
        description: "转换原因（记录到日志，可选）",
      },
      conclusion: {
        type: "string",
        description: "结论/产出摘要（complete/fail/cancel 时必填）",
      },
    },
    required: ["workspaceId", "nodeId", "action"],
  },
};

/**
 * 所有状态工具
 */
export const stateTools: Tool[] = [
  nodeTransitionTool,
];
