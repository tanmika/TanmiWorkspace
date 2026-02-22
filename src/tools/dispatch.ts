// src/tools/dispatch.ts

import type { TanmiTool } from "../types/tool.js";

/**
 * dispatch_node 工具定义
 * 升级执行节点为派发母节点
 */
export const dispatchNodeTool: TanmiTool = {
  name: "dispatch_node",
  readonly: false,
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
export const dispatchCompleteTool: TanmiTool = {
  name: "dispatch_complete",
  readonly: false,
  description: `处理派发任务的执行结果。

**使用场景**：subagent 执行完成后，调用此工具处理结果。

**执行逻辑**：
- 成功时：记录完成时间戳，更新节点状态为 completed
- 失败时：记录完成时间戳，更新节点状态为 failed

**返回内容**：
- endMarker: 时间戳，记录执行完成时间点
- hint: 执行结果提示`,
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
 * dispatch_enable 工具定义
 * 启用派发模式
 */
export const dispatchEnableTool: TanmiTool = {
  name: "dispatch_enable",
  readonly: false,
  description: `启用工作区的派发模式。

**派发模式说明**：
派发模式允许将执行节点任务交给独立的 subagent 执行，提高并行效率。

**执行内容**：
- 检查工作区是否已启用派发
- 如果是 git 仓库，确保工作区目录被 git 排除
- 更新配置启用派发模式`,
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
export const dispatchDisableTool: TanmiTool = {
  name: "dispatch_disable",
  readonly: false,
  description: `禁用工作区的派发模式。

**使用场景**：
- 不再需要派发模式时关闭
- 派发任务全部完成后关闭

**前置条件**：
- 没有正在执行中（executing）的派发任务

**执行内容**：
- 检查是否有正在执行的派发任务（有则拒绝）
- 清理派发配置
- 记录日志`,
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
 * dispatch_create 工具定义
 * 在派发母节点下创建派发子节点
 */
export const dispatchCreateTool: TanmiTool = {
  name: "dispatch_create",
  readonly: false,
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
export const dispatchTools: TanmiTool[] = [
  dispatchNodeTool,
  dispatchCompleteTool,
  dispatchEnableTool,
  dispatchDisableTool,
  dispatchCreateTool,
];
