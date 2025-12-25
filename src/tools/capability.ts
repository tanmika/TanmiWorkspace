// src/tools/capability.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * capability_list 工具定义
 */
export const capabilityListTool: Tool = {
  name: "capability_list",
  description: "获取指定场景的能力包列表。返回基础包（默认选中）和选装包（用户可选）供选择。",
  inputSchema: {
    type: "object",
    properties: {
      scenario: {
        type: "string",
        enum: ["feature", "debug", "optimize", "summary", "misc"],
        description: "任务场景类型：feature(新功能开发)、debug(查错修复)、optimize(优化重构)、summary(总结分析)、misc(其他)",
      },
    },
    required: ["scenario"],
  },
};

/**
 * capability_select 工具定义
 */
export const capabilitySelectTool: Tool = {
  name: "capability_select",
  description: "确认选择的能力包，创建对应节点并返回执行指南。首次调用创建 info 节点+子节点；追加调用在指定节点下追加子节点。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      infoType: {
        type: "string",
        enum: ["info_collection", "info_summary"],
        description: "信息节点类型（首次调用时必填）",
      },
      nodeId: {
        type: "string",
        description: "现有 info 节点 ID（追加能力时使用，首次调用时不需要）",
      },
      selected: {
        type: "array",
        items: { type: "string" },
        description: "选择的能力 ID 列表",
      },
    },
    required: ["workspaceId", "selected"],
  },
};

/**
 * 所有能力包工具
 */
export const capabilityTools: Tool[] = [
  capabilityListTool,
  capabilitySelectTool,
];
