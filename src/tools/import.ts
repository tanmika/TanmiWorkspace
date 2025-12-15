// src/tools/import.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * workspace_import_guide 工具定义
 *
 * 提供导入引导，而非直接返回完整数据
 * AI 根据引导自行读取理解后调用导入脚本
 */
export const workspaceImportGuideTool: Tool = {
  name: "workspace_import_guide",
  description: `获取外部规范的导入引导信息。

**设计理念**：
- 提供结构摘要和文件引导，而非完整数据
- AI 根据引导自行读取文件、理解内容
- 理解后调用返回的 importCommand 创建工作区

**支持的规范类型**：
- openspec: OpenSpec 变更规范

**返回内容**：
- summary: 结构摘要（标题、任务数、完成进度等）
- files: 需要阅读的文件列表和用途说明
- importCommand: 导入脚本的调用命令

**使用流程**：
1. 调用此工具获取引导
2. 根据 files 列表阅读相关文件
3. 向用户展示理解的内容
4. 用户确认后执行 importCommand
5. 调用 workspace_get 获取创建的工作区详情
6. 对照原始数据核对导入结果：
   - 检查节点结构是否完整
   - 补充缺失的细节（如 conclusion、references）
   - 调整节点状态和层级关系
7. 向用户汇报导入结果和调整情况`,
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "规范目录的绝对路径（如 OpenSpec 目录）",
      },
      type: {
        type: "string",
        enum: ["openspec"],
        description: "规范类型",
      },
      changeId: {
        type: "string",
        description: "要导入的变更 ID（OpenSpec 的 change 目录名）",
      },
      projectRoot: {
        type: "string",
        description: "目标项目根目录（工作区将创建在此目录下）",
      },
    },
    required: ["path", "type", "changeId", "projectRoot"],
  },
};

/**
 * workspace_import_list 工具定义
 */
export const workspaceImportListTool: Tool = {
  name: "workspace_import_list",
  description: `列出可导入的变更列表。

**用途**：
- 当用户提供规范目录但未指定具体 changeId 时使用
- 展示所有可用的变更及其进度

**返回内容**：
- changes: 变更列表，包含 id、title、progress`,
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "规范目录的绝对路径",
      },
      type: {
        type: "string",
        enum: ["openspec"],
        description: "规范类型",
      },
    },
    required: ["path", "type"],
  },
};

/**
 * 所有导入相关工具
 */
export const importTools: Tool[] = [
  workspaceImportGuideTool,
  workspaceImportListTool,
];
