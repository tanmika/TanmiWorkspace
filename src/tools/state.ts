// src/tools/state.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * node_transition 工具定义
 */
export const nodeTransitionTool: Tool = {
  name: "node_transition",
  description: `变更节点状态。支持的状态转换：
- start: pending → implementing（开始执行）
- submit: implementing → validating（提交验证）
- complete: implementing/validating → completed（完成，需提供 conclusion）
- fail: validating → failed（失败，需提供 conclusion）
- retry: failed → implementing（重试）
- reopen: completed → implementing（重新激活已完成节点，用于追加新功能）

注意：start 和 reopen 会自动级联更新父节点状态（pending/completed → implementing）`,
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
        enum: ["start", "submit", "complete", "fail", "retry", "reopen"],
        description: "状态转换动作",
      },
      reason: {
        type: "string",
        description: "转换原因（记录到日志，可选）",
      },
      conclusion: {
        type: "string",
        description: "结论/产出摘要（complete/fail 时必填）",
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
