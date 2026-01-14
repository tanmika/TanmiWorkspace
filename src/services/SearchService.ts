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
    const { query, limit = 10 } = params;
    const lowerQuery = query.toLowerCase();

    const index = await this.json.readIndex();
    const matches: WorkspaceSearchMatch[] = [];

    for (const ws of index.workspaces) {
      if (ws.status !== "active") continue;

      const matchedIn: string[] = [];

      // 搜索名称
      if (ws.name.toLowerCase().includes(lowerQuery)) {
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

        if (goal.toLowerCase().includes(lowerQuery)) {
          matchedIn.push("goal");
        }

        if (workspaceMd.rules.some(rule => rule.toLowerCase().includes(lowerQuery))) {
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
      } catch {
        // 读取失败，跳过
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
    const { workspaceId, query, id, target = "all", limit = 20, context = 1 } = params;
    const lowerQuery = query.toLowerCase();

    // 获取工作区信息
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    const { projectRoot } = wsEntry;
    const wsDirName = wsEntry.dirName || wsEntry.id;
    const isArchived = wsEntry.status === "archived";

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
        if (matches.length >= limit + 1) break;

        const nodeMeta = graph.nodes[nodeId];
        if (!nodeMeta) continue;

        const nodeDirName = nodeMeta.dirName || nodeId;

        try {
          const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName, isArchived);

          // 搜索标题
          if (nodeInfo.title.toLowerCase().includes(lowerQuery)) {
            matches.push({
              type: "node",
              nodeId,
              nodeTitle: nodeInfo.title,
              source: "title",
              snippet: nodeInfo.title,
            });
          }

          // 搜索需求
          if (nodeInfo.requirement && matches.length < limit + 1) {
            const reqMatch = this.findInText(nodeInfo.requirement, lowerQuery, context);
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
          if (nodeInfo.conclusion && matches.length < limit + 1) {
            const conMatch = this.findInText(nodeInfo.conclusion, lowerQuery, context);
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
        } catch {
          // 读取失败，跳过
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
        if (matches.length >= limit + 1) break;

        const memoMeta = memos[memoId];
        if (!memoMeta) continue;

        const memoDirName = memoMeta.dirName;

        // 搜索标题
        if (memoMeta.title.toLowerCase().includes(lowerQuery)) {
          matches.push({
            type: "memo",
            memoId,
            memoTitle: memoMeta.title,
            source: "title",
            snippet: memoMeta.title,
          });
        }

        // 搜索摘要
        if (memoMeta.summary && matches.length < limit + 1) {
          if (memoMeta.summary.toLowerCase().includes(lowerQuery)) {
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
        if (memoMeta.tags && matches.length < limit + 1) {
          const matchedTag = memoMeta.tags.find(tag => tag.toLowerCase().includes(lowerQuery));
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
        if (matches.length < limit + 1) {
          try {
            const contentPath = this.fs.getMemoContentPath(projectRoot, wsDirName, memoDirName);
            const content = await this.fs.readFile(contentPath);
            const contentMatches = this.findAllInText(content, lowerQuery, context);

            for (const match of contentMatches) {
              if (matches.length >= limit + 1) break;
              matches.push({
                type: "memo",
                memoId,
                memoTitle: memoMeta.title,
                source: "content",
                line: match.line,
                snippet: match.snippet,
              });
            }
          } catch {
            // 读取失败，跳过
          }
        }
      }
    }

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
   * 在文本中查找关键词，返回第一个匹配的片段
   */
  private findInText(text: string, query: string, contextLines: number): { snippet: string } | null {
    const lines = text.split("\n");
    const lowerLines = lines.map(l => l.toLowerCase());

    for (let i = 0; i < lowerLines.length; i++) {
      if (lowerLines[i].includes(query)) {
        const start = Math.max(0, i - contextLines);
        const end = Math.min(lines.length, i + contextLines + 1);
        const snippet = lines.slice(start, end).join("\n");
        return { snippet };
      }
    }

    return null;
  }

  /**
   * 在文本中查找所有匹配，返回带行号的片段列表
   */
  private findAllInText(text: string, query: string, contextLines: number): Array<{ line: number; snippet: string }> {
    const lines = text.split("\n");
    const lowerLines = lines.map(l => l.toLowerCase());
    const results: Array<{ line: number; snippet: string }> = [];

    for (let i = 0; i < lowerLines.length; i++) {
      if (lowerLines[i].includes(query)) {
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
