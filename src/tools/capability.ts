// src/tools/capability.ts

import type { TanmiTool } from "../types/tool.js";

/**
 * capability_list 工具定义
 */
export const capabilityListTool: TanmiTool = {
  name: "capability_list",
  description: "获取指定场景的能力包列表。返回基础包（默认选中）和选装包（用户可选）供选择。如果已绑定工作区且未传入 scenario，会自动从工作区配置获取。",
  readonly: true,
  inputSchema: {
    type: "object",
    properties: {
      scenario: {
        type: "string",
        enum: ["feature", "debug", "optimize", "summary", "misc"],
        description: "任务场景类型：feature(新功能开发)、debug(查错修复)、optimize(优化重构)、summary(总结分析)、misc(其他)。可选 - 如果已绑定工作区会自动获取。",
      },
      sessionId: {
        type: "string",
        description: "会话 ID（用于自动从绑定的工作区获取 scenario）",
      },
    },
  },
};

/**
 * capability_select 工具定义
 */
export const capabilitySelectTool: TanmiTool = {
  name: "capability_select",
  description: "确认选择的能力包，创建对应节点并返回执行指南。首次调用创建 info 节点+子节点；追加调用在指定节点下追加子节点。",
  readonly: false,
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
 * plugin_path 工具定义
 */
export const pluginPathTool: TanmiTool = {
  name: "plugin_path",
  description:
    "获取 TanmiWorkspace 插件资源的绝对路径。支持参数化查询特定资源，错误时返回可用选项列表。",
  readonly: true,
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["skill", "agent"],
        description: "资源类型。不传则返回插件根目录。",
      },
      name: {
        type: "string",
        description: "资源名称（如 flow-info、tanmi-executor）。需配合 type 使用。",
      },
    },
  },
};

/**
 * 所有能力包工具
 */
export const capabilityTools: TanmiTool[] = [
  capabilityListTool,
  capabilitySelectTool,
  pluginPathTool,
];
