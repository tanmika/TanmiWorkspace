// src/tools/node.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * node_create 工具定义
 */
export const nodeCreateTool: Tool = {
  name: "node_create",
  description: `在指定父节点下创建新的子节点。

**节点类型选择指南**（重要！）：
| 场景 | 选择类型 | 原因 |
|------|----------|------|
| 具体的代码修改、bug修复 | execution | 有明确的产出，不需要再分解 |
| 简单的文件操作、配置更改 | execution | 单步完成，不需要分解 |
| 需要分析后再决定具体步骤 | planning | 先分析，再创建子节点执行 |
| 涉及多个模块或多步操作 | planning | 需要分解为多个执行节点 |
| 不确定具体做法 | planning | 先规划，再决定如何执行 |

**节点类型说明**：
- planning（规划节点）：负责分析、分解任务、派发子节点、汇总结论。可以有子节点。
- execution（执行节点）：负责具体执行任务、产出结论。不能有子节点，执行中遇到问题需 fail 回退到父节点。

**节点角色（role）说明**：
- info_collection：信息收集节点。用于调研、分析项目信息。完成时在 conclusion 中使用特定格式，系统会自动归档到工作区：
  \`\`\`
  ## 规则
  - 规则1
  - 规则2

  ## 文档
  - /path/to/doc1: 文档1描述
  - /path/to/doc2: 文档2描述
  \`\`\`
- 其他角色（validation, summary）：预留，暂不使用

**重要约束**：
- 只有规划节点可以创建子节点
- 父节点必须处于 pending、planning 或 monitoring 状态
- 创建第一个子节点时，父节点自动转为 monitoring 状态
- 执行节点发现任务过于复杂时，应 fail 回退让父规划节点重新分解
- **如果工作区有规则，必须传入正确的 rulesHash**（通过 workspace_get 或 context_get 获取）
- **根节点 start 前必须先完成一个 role='info_collection' 的信息收集节点**`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      parentId: {
        type: "string",
        description: "父节点 ID（必须是规划节点）",
      },
      type: {
        type: "string",
        enum: ["planning", "execution"],
        description: "节点类型：planning（规划）或 execution（执行）",
      },
      title: {
        type: "string",
        description: "节点标题（不能包含特殊字符: / \\ : * ? \" < > |）",
      },
      requirement: {
        type: "string",
        description: "节点需求描述，详细说明该节点要完成的任务（必填）",
      },
      docs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            description: { type: "string" },
          },
          required: ["path", "description"],
        },
        description: "派发给子节点的文档引用（可选）",
      },
      rulesHash: {
        type: "string",
        description: "规则哈希（如果工作区有规则则必填，通过 workspace_get 或 context_get 获取）",
      },
      role: {
        type: "string",
        enum: ["info_collection", "validation", "summary"],
        description: "节点角色（可选）：info_collection=信息收集节点，完成时自动归档规则和文档到工作区",
      },
      createTestNode: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "测试节点标题",
          },
          requirement: {
            type: "string",
            description: "验收标准",
          },
        },
        required: ["title", "requirement"],
        description: "同时创建配对的测试节点（派发模式用）",
      },
      pairWithExecNode: {
        type: "string",
        description: "与指定执行节点配对（用于单独创建测试节点时，指定关联的执行节点 ID）",
      },
    },
    required: ["workspaceId", "parentId", "type", "title", "requirement"],
  },
};

/**
 * node_get 工具定义
 */
export const nodeGetTool: Tool = {
  name: "node_get",
  description: "获取节点详情，包含元数据和所有 Markdown 内容。",
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
    },
    required: ["workspaceId", "nodeId"],
  },
};

/**
 * node_list 工具定义
 */
export const nodeListTool: Tool = {
  name: "node_list",
  description: "获取节点树结构，支持指定起始节点和深度。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      rootId: {
        type: "string",
        description: "起始节点 ID（默认为工作区根节点）",
      },
      depth: {
        type: "number",
        description: "最大深度（默认无限）",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * node_delete 工具定义
 */
export const nodeDeleteTool: Tool = {
  name: "node_delete",
  description: "删除节点及其所有子节点。根节点无法删除。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "要删除的节点 ID",
      },
    },
    required: ["workspaceId", "nodeId"],
  },
};

// ========== Phase 3: 节点更新 ==========

/**
 * node_update 工具定义
 */
export const nodeUpdateTool: Tool = {
  name: "node_update",
  description: "更新节点信息（标题、需求、备注、结论）。只更新提供的字段，保留其他字段不变。",
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
      title: {
        type: "string",
        description: "新标题（可选）",
      },
      requirement: {
        type: "string",
        description: "新需求描述（可选）",
      },
      note: {
        type: "string",
        description: "新备注（可选）",
      },
      conclusion: {
        type: "string",
        description: "新结论（可选，用于修正已完成节点的结论）",
      },
    },
    required: ["workspaceId", "nodeId"],
  },
};

/**
 * node_move 工具定义
 */
export const nodeMoveTool: Tool = {
  name: "node_move",
  description: `移动节点到新的父节点下，用于重组节点层级结构。
- 根节点无法移动
- 不能将节点移动到其自身的子节点下（防止循环依赖）
- 目标父节点必须是规划节点（执行节点不能有子节点）
- 节点本身的数据（标题、需求、状态等）保持不变`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "要移动的节点 ID",
      },
      newParentId: {
        type: "string",
        description: "目标父节点 ID（必须是规划节点）",
      },
    },
    required: ["workspaceId", "nodeId", "newParentId"],
  },
};

/**
 * 所有节点工具
 */
export const nodeTools: Tool[] = [
  nodeCreateTool,
  nodeGetTool,
  nodeListTool,
  nodeDeleteTool,
  nodeUpdateTool,
  nodeMoveTool,
];
