// src/tools/workspace.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * workspace_init 工具定义
 */
export const workspaceInitTool: Tool = {
  name: "workspace_init",
  description: "初始化新工作区。创建工作区目录结构和必要的配置文件。返回 webUrl 可在浏览器中查看。",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "工作区名称（不能包含特殊字符: / \\ : * ? \" < > |）",
      },
      goal: {
        type: "string",
        description: "工作区目标描述",
      },
      rules: {
        type: "array",
        items: { type: "string" },
        description: "规则列表（可选）",
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
        description: "文档引用列表（可选）",
      },
      scenario: {
        type: "string",
        enum: ["feature", "summary", "optimize", "debug", "misc"],
        description: `任务场景类型（必填）：
- feature: 新功能开发、新想法探索、可行性调研（涉及设计或实现新东西）
- summary: 整理已有内容（文档梳理、代码总结、知识归纳，不涉及新设计）
- optimize: 优化重构（性能优化、代码重构、架构改进）
- debug: 查错修复（Bug定位、问题诊断、错误修复）
- misc: 其他（不确定类型、灵活探索、讨论性任务）`,
      },
    },
    required: ["name", "goal", "scenario"],
  },
};

/**
 * workspace_list 工具定义
 */
export const workspaceListTool: Tool = {
  name: "workspace_list",
  description: `列出所有工作区,支持按状态过滤。

**排序规则**：
- 如果提供了 cwd 参数，匹配当前路径的工作区优先显示
- 同级别按更新时间降序排列`,
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["active", "archived", "all"],
        description: "筛选状态(默认 active)",
      },
      cwd: {
        type: "string",
        description: "当前工作目录，匹配的工作区优先显示",
      },
    },
  },
};

/**
 * workspace_get 工具定义
 */
export const workspaceGetTool: Tool = {
  name: "workspace_get",
  description: "获取工作区详情，包含配置、节点图和 Workspace.md 内容。返回 webUrl 可在浏览器中查看。",
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
 * workspace_delete 工具定义
 */
export const workspaceDeleteTool: Tool = {
  name: "workspace_delete",
  description: "删除工作区。活动状态的工作区需要 force=true 才能删除。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      force: {
        type: "boolean",
        description: "是否强制删除活动状态的工作区（默认 false）",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * workspace_update_rules 工具定义
 */
export const workspaceUpdateRulesTool: Tool = {
  name: "workspace_update_rules",
  description: `动态更新工作区规则。

**规则分类**：
- 全局规则：工作区级别，所有节点都要遵守 → 通过此 API 更新
- 节点规则：针对特定任务的约束 → 通过 node_update 更新 requirement

**使用场景**：
- 用户要求记录重要信息（如环境变量、路径配置）到规则中
- 发现需要全局遵守的新约束
- 清理过时的规则`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      action: {
        type: "string",
        enum: ["add", "remove", "replace"],
        description: "操作类型：add（追加单条）、remove（删除单条）、replace（替换全部）",
      },
      rule: {
        type: "string",
        description: "规则内容（add/remove 时使用）",
      },
      rules: {
        type: "array",
        items: { type: "string" },
        description: "规则数组（replace 时使用）",
      },
    },
    required: ["workspaceId", "action"],
  },
};

/**
 * workspace_archive 工具定义
 */
export const workspaceArchiveTool: Tool = {
  name: "workspace_archive",
  description: `归档工作区。将工作区移动到归档目录，标记为已完成。

**归档后**：
- 工作区状态变为 archived
- 目录移动到 .tanmi-workspace/archive/ 下
- 仍可通过 workspace_get 查看
- 可通过 workspace_restore 恢复`,
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
 * workspace_restore 工具定义
 */
export const workspaceRestoreTool: Tool = {
  name: "workspace_restore",
  description: `恢复归档的工作区。将工作区从归档目录移回，重新激活。

**恢复后**：
- 工作区状态变为 active
- 目录移回原位置
- 可继续正常使用`,
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
 * workspace_health 工具定义
 */
export const workspaceHealthTool: Tool = {
  name: "workspace_health",
  description: `检测工作区健康状态。

**首次调用**：需要先阅读诊断指南获取令牌。

**检测内容**：
- 目录完整性
- 配置文件有效性
- 节点文件完整性
- 版本兼容性

**使用方式**：
1. 首次调用返回诊断指南路径
2. 阅读诊断指南获取 diagnosticToken
3. 携带 token 再次调用执行检测`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID（可选，不填则检测所有活跃工作区）",
      },
      diagnosticToken: {
        type: "string",
        description: "诊断令牌（从诊断指南获取）",
      },
    },
    required: [],
  },
};

/**
 * signal 工具定义
 */
export const signalTool: Tool = {
  name: "signal",
  description: "内部状态同步工具（由 flow-info/flow-design/flow-impl Skill 指导调用，请勿直接使用）",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      code: {
        type: "string",
        description: "操作码（由 Skill 提供，请勿手动填写）",
      },
    },
    required: ["workspaceId", "code"],
  },
};

/**
 * 所有工作区工具
 */
export const workspaceTools: Tool[] = [
  workspaceInitTool,
  workspaceListTool,
  workspaceGetTool,
  workspaceDeleteTool,
  workspaceUpdateRulesTool,
  workspaceArchiveTool,
  workspaceRestoreTool,
  workspaceHealthTool,
  signalTool,
];
