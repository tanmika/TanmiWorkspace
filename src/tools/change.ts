// src/tools/change.ts

import type { TanmiTool } from "../types/tool.js";

/**
 * change_claim 工具定义
 * 认领 ambiguous 变更到指定节点
 */
export const changeClaimTool: TanmiTool = {
  name: "change_claim",
  readonly: false,
  description: `认领待归属的变更记录到指定节点。

当多个执行节点同时活跃时，文件变更会被标记为 ambiguous（待认领）。
执行节点完成前需要认领这些变更，以便追踪和回滚。

**使用场景**：
- node_transition 提示存在未认领变更时
- 派发任务完成后整理变更归属

**示例**：
\`\`\`
change_claim(nodeId: "node-xxx", changeIds: ["chg-001", "chg-002"])
\`\`\``,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "目标节点 ID（变更将归属到此节点）",
      },
      changeIds: {
        type: "array",
        items: { type: "string" },
        description: "要认领的变更 ID 列表",
      },
    },
    required: ["workspaceId", "nodeId", "changeIds"],
  },
};

/**
 * change_transfer 工具定义
 * 转移变更归属（用于修正错误的认领）
 */
export const changeTransferTool: TanmiTool = {
  name: "change_transfer",
  readonly: false,
  description: `转移变更记录的归属节点。

用于修正错误的变更认领，将变更从一个节点转移到另一个节点。

**使用场景**：
- 发现变更被错误认领到其他节点
- 需要重新组织变更归属`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      changeId: {
        type: "string",
        description: "要转移的变更 ID",
      },
      toNodeId: {
        type: "string",
        description: "目标节点 ID",
      },
    },
    required: ["workspaceId", "changeId", "toNodeId"],
  },
};

/**
 * change_list 工具定义
 * 列出变更记录
 */
export const changeListTool: TanmiTool = {
  name: "change_list",
  readonly: true,
  description: `列出变更记录。

- 不传 nodeId：列出所有待认领（ambiguous）的变更
- 传 nodeId：列出指定节点的所有变更

**返回信息**：
- 变更 ID、时间戳、操作类型
- 文件路径、修改内容摘要
- 来源会话和客户端类型`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      nodeId: {
        type: "string",
        description: "节点 ID（可选，不传则列出 ambiguous 变更）",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * change_revert 工具定义
 * 回滚指定变更
 */
export const changeRevertTool: TanmiTool = {
  name: "change_revert",
  readonly: false,
  description: `回滚指定的变更记录。

支持的操作类型和回滚方式：
- **add（新建文件）**：删除文件
- **update（编辑文件）**：模糊匹配找到修改位置，替换回原内容
- **overwrite（覆盖文件）**：恢复原始文件内容（如有保存）
- **delete（删除文件）**：无法自动回滚

**回滚策略**：
- 非原子性：每个变更独立回滚，部分失败不影响其他
- 返回详细的成功/失败信息
- 失败时返回 patch 文件路径，供手动处理

**模糊匹配级别**：
1. exact - 完全匹配
2. punctuation - 标点符号标准化
3. whitespace - 忽略尾部空白
4. aggressive - 折叠所有空白`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      changeIds: {
        type: "array",
        items: { type: "string" },
        description: "要回滚的变更 ID 列表",
      },
    },
    required: ["workspaceId", "changeIds"],
  },
};

/**
 * 所有变更追踪工具
 */
export const changeTools: TanmiTool[] = [
  changeClaimTool,
  changeTransferTool,
  changeListTool,
  changeRevertTool,
];
