// src/types/search.ts

/**
 * 搜索相关类型定义
 */

// ========== workspace_search ==========

/**
 * workspace_search 输入
 */
export interface WorkspaceSearchParams {
  query: string;                    // 搜索关键词
  limit?: number;                   // 最大结果数（默认 10）
}

/**
 * workspace_search 匹配项
 */
export interface WorkspaceSearchMatch {
  id: string;
  name: string;
  goal: string;
  matchedIn: string[];              // ["name", "goal", "rules"]
}

/**
 * workspace_search 输出
 */
export interface WorkspaceSearchResult {
  workspaces: WorkspaceSearchMatch[];
  hasMore: boolean;
}

// ========== content_search ==========

/**
 * content_search 输入
 */
export interface ContentSearchParams {
  workspaceId: string;              // 工作区 ID
  query: string;                    // 搜索关键词
  id?: string;                      // 限定范围：节点 ID（搜索子树）或 memo ID（搜索该 memo）
  target?: "all" | "node" | "memo"; // 搜索目标（默认 all）
  limit?: number;                   // 最大结果数（默认 20）
  context?: number;                 // 上下文行数（默认 1）
}

/**
 * content_search 匹配项
 */
export interface ContentSearchMatch {
  type: "node" | "memo";

  // 节点定位
  nodeId?: string;
  nodeTitle?: string;

  // Memo 定位
  memoId?: string;
  memoTitle?: string;

  // 匹配详情
  source: string;                   // title/requirement/conclusion/summary/content/tags
  line?: number;                    // 仅 memo content 返回行号
  snippet: string;                  // 匹配片段 + 上下文
}

/**
 * content_search 输出
 */
export interface ContentSearchResult {
  matches: ContentSearchMatch[];
  hasMore: boolean;
}
