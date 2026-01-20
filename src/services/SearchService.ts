// src/services/SearchService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  WorkspaceSearchParams,
  WorkspaceSearchResult,
  WorkspaceSearchMatch,
  ContentSearchParams,
  ContentSearchResult,
  ContentSearchMatch,
} from "../types/search.js";
import { TanmiError } from "../types/errors.js";
import { devLog } from "../utils/devLog.js";
import safe from "safe-regex2";

/** 正则表达式最大长度限制 */
const MAX_REGEX_LENGTH = 200;

/**
 * 搜索匹配器类型
 */
type Matcher = {
  test: (text: string) => boolean;
};

/**
 * 创建匹配器
 * @param query 搜索关键词
 * @param regex 是否正则模式
 * @returns 匹配器对象，如果正则语法错误返回 null
 */
function createMatcher(query: string, regex: boolean): Matcher | { error: string } {
  if (regex) {
    // 第一道防线：长度限制
    if (query.length > MAX_REGEX_LENGTH) {
      return { error: `正则表达式过长，最大支持 ${MAX_REGEX_LENGTH} 字符` };
    }
    // 第二道防线：ReDoS 危险模式检测
    if (!safe(query)) {
      return { error: "正则表达式可能存在性能风险（ReDoS），请简化模式" };
    }
    try {
      const re = new RegExp(query, "i");
      return { test: (text: string) => text ? re.test(text) : false };
    } catch (e) {
      return { error: `正则语法错误: ${e instanceof Error ? e.message : String(e)}` };
    }
  } else {
    const lowerQuery = query.toLowerCase();
    return { test: (text: string) => text ? text.toLowerCase().includes(lowerQuery) : false };
  }
}

/**
 * 搜索服务
 */
export class SearchService {
  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 搜索工作区
   */
  async workspaceSearch(params: WorkspaceSearchParams): Promise<WorkspaceSearchResult> {
    const { query, regex = false, limit = 10 } = params;

    // 创建匹配器
    const matcherResult = createMatcher(query, regex);
    if ("error" in matcherResult) {
      throw new TanmiError("INVALID_PARAMS", matcherResult.error);
    }
    const matcher = matcherResult;

    const index = await this.json.readIndex();
    const matches: WorkspaceSearchMatch[] = [];

    for (const ws of index.workspaces) {
      if (ws.status !== "active") continue;

      const matchedIn: string[] = [];

      // 搜索名称
      if (matcher.test(ws.name)) {
        matchedIn.push("name");
      }

      // 读取工作区详情搜索 goal 和 rules
      try {
        const wsDirName = ws.dirName || ws.id;
        const workspaceMd = await this.md.readWorkspaceMd(ws.projectRoot, wsDirName);

        // 从根节点读取 goal（requirement 字段）- goal 已统一到根节点
        const config = await this.json.readWorkspaceConfig(ws.projectRoot, wsDirName);
        const graph = await this.json.readGraph(ws.projectRoot, wsDirName);
        const rootNodeId = config.rootNodeId || "root";
        const rootNodeMeta = graph.nodes[rootNodeId];
        const rootNodeDirName = rootNodeMeta?.dirName || rootNodeId;
        const rootNodeInfo = await this.md.readNodeInfo(ws.projectRoot, wsDirName, rootNodeDirName);
        const goal = rootNodeInfo.requirement || "";

        if (matcher.test(goal)) {
          matchedIn.push("goal");
        }

        if (workspaceMd.rules.some(rule => matcher.test(rule))) {
          matchedIn.push("rules");
        }

        if (matchedIn.length > 0) {
          matches.push({
            id: ws.id,
            name: ws.name,
            goal,
            matchedIn,
          });
        }
      } catch (err) {
        devLog.debug(`[search] 工作区搜索读取失败: ${ws.id}`, { error: err instanceof Error ? err.message : String(err) });
      }

      if (matches.length >= limit + 1) break;
    }

    const hasMore = matches.length > limit;
    return {
      workspaces: matches.slice(0, limit),
      hasMore,
    };
  }

  /**
   * 搜索工作区内容
   */
  async contentSearch(params: ContentSearchParams): Promise<ContentSearchResult> {
    const { workspaceId, query, regex = false, id, target = "all", limit = 20, context = 1 } = params;

    // 创建匹配器（如果有 query）；无 query 时使用全匹配器（用于 ID 搜索）
    let matcher: Matcher;
    if (query) {
      const matcherResult = createMatcher(query, regex);
      if ("error" in matcherResult) {
        throw new TanmiError("INVALID_PARAMS", matcherResult.error);
      }
      matcher = matcherResult;
    } else {
      // 无 query 时匹配所有内容（用于 ID 定位搜索）
      matcher = { test: () => true };
    }

    // 获取工作区信息
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    const { projectRoot } = wsEntry;
    const wsDirName = wsEntry.dirName || wsEntry.id;
    const isArchived = wsEntry.status === "archived";

    // 收集所有匹配（内部限制防止内存问题）
    const MAX_INTERNAL = 200;
    const matches: ContentSearchMatch[] = [];

    // 判断 id 类型
    const isMemoId = id?.startsWith("memo-");
    const isNodeId = id && !isMemoId;

    // 搜索节点
    if ((target === "all" || target === "node") && !isMemoId) {
      const graph = await this.json.readGraph(projectRoot, wsDirName, isArchived);

      // 确定要搜索的节点列表
      let nodeIds: string[];
      if (isNodeId) {
        // 搜索指定节点子树
        nodeIds = this.collectSubtreeNodes(id!, graph.nodes);
      } else {
        // 搜索所有节点
        nodeIds = Object.keys(graph.nodes);
      }

      for (const nodeId of nodeIds) {
        if (matches.length >= MAX_INTERNAL) break;

        const nodeMeta = graph.nodes[nodeId];
        if (!nodeMeta) continue;

        const nodeDirName = nodeMeta.dirName || nodeId;

        try {
          const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName, isArchived);

          // 搜索标题
          if (matcher.test(nodeInfo.title)) {
            matches.push({
              type: "node",
              nodeId,
              nodeTitle: nodeInfo.title,
              source: "title",
              snippet: nodeInfo.title,
            });
          }

          // 搜索需求
          if (nodeInfo.requirement && matches.length < MAX_INTERNAL) {
            const reqMatch = this.findInTextWithMatcher(nodeInfo.requirement, matcher, context);
            if (reqMatch) {
              matches.push({
                type: "node",
                nodeId,
                nodeTitle: nodeInfo.title,
                source: "requirement",
                snippet: reqMatch.snippet,
              });
            }
          }

          // 搜索结论
          if (nodeInfo.conclusion && matches.length < MAX_INTERNAL) {
            const conMatch = this.findInTextWithMatcher(nodeInfo.conclusion, matcher, context);
            if (conMatch) {
              matches.push({
                type: "node",
                nodeId,
                nodeTitle: nodeInfo.title,
                source: "conclusion",
                snippet: conMatch.snippet,
              });
            }
          }
        } catch (err) {
          devLog.debug(`[search] 节点内容读取失败: ${nodeId}`, { error: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    // 搜索 memo
    if ((target === "all" || target === "memo") && !isNodeId) {
      const graph = await this.json.readGraph(projectRoot, wsDirName, isArchived);
      const memos = graph.memos || {};

      // 确定要搜索的 memo 列表
      let memoIds: string[];
      if (isMemoId) {
        memoIds = [id!];
      } else {
        memoIds = Object.keys(memos);
      }

      for (const memoId of memoIds) {
        if (matches.length >= MAX_INTERNAL) break;

        const memoMeta = memos[memoId];
        if (!memoMeta) continue;

        const memoDirName = memoMeta.dirName;

        // 搜索标题
        if (matcher.test(memoMeta.title)) {
          matches.push({
            type: "memo",
            memoId,
            memoTitle: memoMeta.title,
            source: "title",
            snippet: memoMeta.title,
          });
        }

        // 搜索摘要
        if (memoMeta.summary && matches.length < MAX_INTERNAL) {
          if (matcher.test(memoMeta.summary)) {
            matches.push({
              type: "memo",
              memoId,
              memoTitle: memoMeta.title,
              source: "summary",
              snippet: memoMeta.summary,
            });
          }
        }

        // 搜索标签
        if (memoMeta.tags && matches.length < MAX_INTERNAL) {
          const matchedTag = memoMeta.tags.find(tag => matcher.test(tag));
          if (matchedTag) {
            matches.push({
              type: "memo",
              memoId,
              memoTitle: memoMeta.title,
              source: "tags",
              snippet: `[${memoMeta.tags.join(", ")}]`,
            });
          }
        }

        // 搜索内容（带行号）
        if (matches.length < MAX_INTERNAL) {
          try {
            const contentPath = this.fs.getMemoContentPath(projectRoot, wsDirName, memoDirName);
            const content = await this.fs.readFile(contentPath);
            const contentMatches = this.findAllInTextWithMatcher(content, matcher, context);

            for (const match of contentMatches) {
              if (matches.length >= MAX_INTERNAL) break;
              matches.push({
                type: "memo",
                memoId,
                memoTitle: memoMeta.title,
                source: "content",
                line: match.line,
                snippet: match.snippet,
              });
            }
          } catch (err) {
            devLog.debug(`[search] MEMO内容读取失败: ${memoId}`, { error: err instanceof Error ? err.message : String(err) });
          }
        }
      }
    }

    // 按相关度排序：标题匹配优先
    const SOURCE_PRIORITY: Record<string, number> = {
      title: 0,      // 最高优先级
      summary: 1,
      requirement: 2,
      tags: 3,
      conclusion: 4,
      content: 5,    // 最低优先级
    };

    matches.sort((a, b) => {
      const aPriority = SOURCE_PRIORITY[a.source] ?? 99;
      const bPriority = SOURCE_PRIORITY[b.source] ?? 99;
      return aPriority - bPriority;
    });

    const hasMore = matches.length > limit;
    return {
      matches: matches.slice(0, limit),
      hasMore,
    };
  }

  /**
   * 收集节点子树中所有节点 ID
   */
  private collectSubtreeNodes(rootId: string, nodes: Record<string, any>): string[] {
    const result: string[] = [];
    const stack = [rootId];

    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      const node = nodes[nodeId];
      if (!node) continue;

      result.push(nodeId);

      if (node.children) {
        stack.push(...node.children);
      }
    }

    return result;
  }

  /**
   * 在文本中使用匹配器查找，返回第一个匹配的片段
   */
  private findInTextWithMatcher(text: string, matcher: Matcher, contextLines: number): { snippet: string } | null {
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (matcher.test(lines[i])) {
        const start = Math.max(0, i - contextLines);
        const end = Math.min(lines.length, i + contextLines + 1);
        const snippet = lines.slice(start, end).join("\n");
        return { snippet };
      }
    }

    return null;
  }

  /**
   * 在文本中使用匹配器查找所有匹配，返回带行号的片段列表
   */
  private findAllInTextWithMatcher(text: string, matcher: Matcher, contextLines: number): Array<{ line: number; snippet: string }> {
    const lines = text.split("\n");
    const results: Array<{ line: number; snippet: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      if (matcher.test(lines[i])) {
        const start = Math.max(0, i - contextLines);
        const end = Math.min(lines.length, i + contextLines + 1);
        const snippet = lines.slice(start, end).join("\n");
        results.push({
          line: i + 1,  // 1-based
          snippet,
        });
      }
    }

    return results;
  }
}
