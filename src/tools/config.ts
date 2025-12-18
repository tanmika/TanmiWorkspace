// src/tools/config.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * config_get 工具定义
 */
export const configGetTool: Tool = {
  name: "config_get",
  description: `获取全局配置。

返回：
- version: 配置版本
- defaultDispatchMode: 默认派发模式 ("none" | "git" | "no-git")

**使用场景**：
- 查看当前全局配置
- 检查默认派发模式设置`,
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

/**
 * config_set 工具定义
 */
export const configSetTool: Tool = {
  name: "config_set",
  description: `设置全局配置。

可配置项：
- defaultDispatchMode: 默认派发模式
  - "none": 不启用派发（默认）
  - "git": Git 模式（实验功能，自动分支管理）
  - "no-git": 无 Git 模式（仅元数据管理）

**使用场景**：
- 修改默认派发模式
- 配置全局偏好设置

**注意**：
- 仅影响新启用派发的工作区
- 已启用的工作区不受影响`,
  inputSchema: {
    type: "object",
    properties: {
      defaultDispatchMode: {
        type: "string",
        enum: ["none", "git", "no-git"],
        description: '默认派发模式 ("none" | "git" | "no-git")',
      },
    },
    required: [],
  },
};

/**
 * 所有 config 工具
 */
export const configTools: Tool[] = [
  configGetTool,
  configSetTool,
];
