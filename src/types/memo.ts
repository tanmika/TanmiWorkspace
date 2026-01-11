// src/types/memo.ts

/**
 * 备忘（Memo）- 工作区独立草稿区
 *
 * 用途：
 * - 快速记录灵感、讨论、调研结果
 * - 独立于节点树的草稿区
 * - 可通过引用（memo://memo-xxx）关联到节点
 */

/**
 * 备忘数据结构
 */
export interface Memo {
  id: string;                       // 备忘唯一标识，格式：memo-{shortId}
  title: string;                    // 备忘标题
  summary: string;                  // 摘要（用于列表显示）
  content: string;                  // 完整内容（Markdown 格式）
  tags: string[];                   // 标签列表（用于分类和过滤）
  createdAt: string;                // 创建时间（ISO 8601）
  updatedAt: string;                // 更新时间（ISO 8601）
}

// ========== API 输入输出类型 ==========

/**
 * memo_create 输入
 */
export interface MemoCreateParams {
  workspaceId: string;
  title: string;
  summary: string;
  content: string;
  tags?: string[];                  // 可选标签列表
}

/**
 * memo_create 输出
 */
export interface MemoCreateResult {
  memoId: string;
  path: string;                     // 备忘文件路径
  hint?: string;
}

/**
 * memo_list 输入
 */
export interface MemoListParams {
  workspaceId: string;
  tags?: string[];                  // 可选：按标签过滤
}

/**
 * memo_list 输出项（精简信息）
 */
export interface MemoListItem {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  contentLength: number;  // 内容长度（用于UI显示横线数量）
  dirName: string;        // 目录名，格式：{title}_{shortId}
  createdAt: string;
  updatedAt: string;
}

/**
 * memo_list 输出
 */
export interface MemoListResult {
  memos: MemoListItem[];
  allTags: string[];                // 所有已使用的标签列表
  hint?: string;
}

/**
 * memo_get 输入
 */
export interface MemoGetParams {
  workspaceId: string;
  memoId: string;
}

/**
 * memo_get 输出
 */
export interface MemoGetResult {
  memo: Memo;                       // 完整内容
  /** 内容的 MD5 hash，用于先读后写校验 */
  contentHash: string;
}

/**
 * memo_update 输入
 *
 * 更新模式：
 * 1. 全量替换：直接提供 content/summary/title 字段
 * 2. 精确替换：提供 field + old_str + new_str 进行字符串替换
 *
 * 安全机制：必须提供 contentHash（从 memo_get 获取）进行先读后写校验
 */
export interface MemoUpdateParams {
  workspaceId: string;
  memoId: string;
  /** 内容 hash，从 memo_get 返回值获取，用于校验内容未被其他操作修改 */
  contentHash: string;
  title?: string;
  summary?: string;
  content?: string;                 // 全量替换内容
  /** 指定要精确替换的字段 */
  field?: 'content' | 'summary';
  /** 要替换的原文本（与 field 配合使用） */
  old_str?: string;
  /** 替换后的文本（与 field 配合使用） */
  new_str?: string;
  tags?: string[];                  // 会完全替换现有标签
}

/**
 * memo_update 输出
 */
export interface MemoUpdateResult {
  success: boolean;
  updatedAt: string;
}

/**
 * memo_delete 输入
 */
export interface MemoDeleteParams {
  workspaceId: string;
  memoId: string;
}

/**
 * memo_delete 输出
 */
export interface MemoDeleteResult {
  success: boolean;
}
