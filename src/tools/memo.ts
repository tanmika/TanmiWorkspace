// src/tools/memo.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * memo_create 工具定义
 */
export const memoCreateTool: Tool = {
  name: "memo_create",
  description: "创建工作区备忘。备忘是独立于节点树的草稿区，用于记录灵感、讨论、调研结果。创建后可使用 node_reference 关联到节点。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      title: {
        type: "string",
        description: "备忘标题",
      },
      summary: {
        type: "string",
        description: "备忘摘要（用于列表显示）",
      },
      content: {
        type: "string",
        description: "完整内容（Markdown 格式）",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        description: "标签列表（必填，至少2个有效标签，用于分类和过滤）",
      },
    },
    required: ["workspaceId", "title", "summary", "content", "tags"],
  },
};

/**
 * memo_list 工具定义
 */
export const memoListTool: Tool = {
  name: "memo_list",
  description: "列出工作区的所有备忘（精简信息：title+summary+tags），支持按标签过滤。返回所有已使用的标签列表。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "标签列表（可选）。如果指定，仅返回包含任一指定标签的备忘",
      },
    },
    required: ["workspaceId"],
  },
};

/**
 * memo_get 工具定义
 */
export const memoGetTool: Tool = {
  name: "memo_get",
  description: `获取备忘内容（支持按行分页）。返回 contentHash 用于 memo_replace/memo_edit/memo_insert 校验。

**分页参数**:
- lineOffset: 起始行号（从 1 开始，默认 1）
- lineLimit: 返回行数（默认 500）

**返回**:
- memo: 备忘数据（content 可能被截取）
- totalLines: 总行数
- contentHash: 用于 memo_replace/memo_edit/memo_insert 校验
- contentTruncated: 是否被截取
- pagination: 分页导航信息（截断时提供）

**截断处理建议**:
当 contentTruncated=true 时，优先使用 content_search 定位目标内容，避免逐页滚动浏览。
仅在需要全文时才使用 pagination.nextCommand 继续读取。

**使用示例**:
- 读取: memo_get({ workspaceId, memoId })
- 搜索定位: content_search({ workspaceId, id: memoId, query: "关键词" })
- 分页读取: memo_get({ workspaceId, memoId, lineOffset: 501 })`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      memoId: {
        type: "string",
        description: "备忘 ID",
      },
      lineOffset: {
        type: "number",
        description: "起始行号（从 1 开始，默认 1）",
      },
      lineLimit: {
        type: "number",
        description: "返回行数（默认 500）",
      },
    },
    required: ["workspaceId", "memoId"],
  },
};

/**
 * memo_delete 工具定义
 */
export const memoDeleteTool: Tool = {
  name: "memo_delete",
  description: "删除备忘。会同时删除备忘文件和索引。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      memoId: {
        type: "string",
        description: "备忘 ID",
      },
    },
    required: ["workspaceId", "memoId"],
  },
};

/**
 * memo_replace 工具定义
 */
export const memoReplaceTool: Tool = {
  name: "memo_replace",
  description:
    "全量替换备忘内容。⚠️ 慎用：会覆盖整个内容。适用于完全重写场景。推荐优先使用 memo_edit 或 memo_insert。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      memoId: {
        type: "string",
        description: "备忘 ID",
      },
      contentHash: {
        type: "string",
        description: "当前内容 hash（从 memo_get 获取）",
      },
      content: {
        type: "string",
        description: "新的完整内容",
      },
      title: {
        type: "string",
        description: "可选，更新标题",
      },
      summary: {
        type: "string",
        description: "可选，更新摘要",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "可选，更新标签",
      },
    },
    required: ["workspaceId", "memoId", "contentHash", "content"],
  },
};

/**
 * memo_edit 工具定义
 */
export const memoEditTool: Tool = {
  name: "memo_edit",
  description: `精确替换备忘中的特定文本。推荐用于局部修改。使用前必须先 memo_get 获取当前内容和 contentHash。

**两种模式**:
- string（默认）：按字符串匹配替换，需提供 old_str 和 new_str
- line_range：按行范围替换，需提供 lineStart、lineEnd 和 new_str

**互斥规则**:
- mode=string 时：old_str 必填，禁止使用 lineStart/lineEnd
- mode=line_range 时：lineStart/lineEnd 必填，禁止使用 old_str`,
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      memoId: {
        type: "string",
        description: "备忘 ID",
      },
      contentHash: {
        type: "string",
        description: "当前内容 hash（从 memo_get 获取）",
      },
      field: {
        type: "string",
        enum: ["content", "title", "summary"],
        description: "要编辑的字段",
      },
      mode: {
        type: "string",
        enum: ["string", "line_range"],
        description: "替换模式。string=按字符串匹配替换，line_range=按行范围替换。默认 string",
      },
      old_str: {
        type: "string",
        description: "要替换的原文（必须存在且唯一）。mode=string 时必填",
      },
      new_str: {
        type: "string",
        description: "替换后的新文",
      },
      lineStart: {
        type: "number",
        description: "起始行号（从1开始）。mode=line_range 时必填",
      },
      lineEnd: {
        type: "number",
        description: "结束行号（包含该行）。mode=line_range 时必填",
      },
    },
    required: ["workspaceId", "memoId", "contentHash", "field", "new_str"],
  },
};

/**
 * memo_insert 工具定义
 */
export const memoInsertTool: Tool = {
  name: "memo_insert",
  description:
    "在备忘指定行后插入文本。推荐用于追加内容。line=0 表示在开头插入，line=n 表示在第 n 行后插入。",
  inputSchema: {
    type: "object",
    properties: {
      workspaceId: {
        type: "string",
        description: "工作区 ID",
      },
      memoId: {
        type: "string",
        description: "备忘 ID",
      },
      contentHash: {
        type: "string",
        description: "当前内容 hash（从 memo_get 获取）",
      },
      line: {
        type: "number",
        description: "在此行后插入（0=开头，n=第n行后）",
      },
      text: {
        type: "string",
        description: "要插入的文本",
      },
    },
    required: ["workspaceId", "memoId", "contentHash", "line", "text"],
  },
};

/**
 * 导出所有 memo 工具
 */
export const memoTools: Tool[] = [
  memoCreateTool,
  memoListTool,
  memoGetTool,
  memoDeleteTool,
  memoReplaceTool,
  memoEditTool,
  memoInsertTool,
];
