import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { TanmiError } from "../../src/types/errors.js";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-search-${crypto.randomUUID()}`;
const mockHomeDir = path.join(process.cwd(), testBasePath, "home");

// Mock os 模块，使 homedir() 返回测试专用目录
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => mockHomeDir,
  };
});

// 动态导入依赖 os.homedir 的模块（在 mock 生效后）
const { FileSystemAdapter } = await import("../../src/storage/FileSystemAdapter.js");
const { JsonStorage } = await import("../../src/storage/JsonStorage.js");
const { MarkdownStorage } = await import("../../src/storage/MarkdownStorage.js");
const { WorkspaceService } = await import("../../src/services/WorkspaceService.js");
const { NodeService } = await import("../../src/services/NodeService.js");
const { MemoService } = await import("../../src/services/MemoService.js");
const { StateService } = await import("../../src/services/StateService.js");
const { SearchService } = await import("../../src/services/SearchService.js");

describe("SearchService", () => {
  let basePath: string;
  let projectRoot: string;
  let fsAdapter: FileSystemAdapter;
  let json: JsonStorage;
  let md: MarkdownStorage;
  let workspaceService: WorkspaceService;
  let nodeService: NodeService;
  let memoService: MemoService;
  let stateService: StateService;
  let searchService: SearchService;
  let workspaceId: string;
  let wsDirName: string;

  beforeEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {}

    basePath = path.join(process.cwd(), testBasePath);
    projectRoot = path.join(basePath, "project");

    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(projectRoot, { recursive: true });

    fsAdapter = new FileSystemAdapter();
    json = new JsonStorage(fsAdapter);
    md = new MarkdownStorage(fsAdapter);
    workspaceService = new WorkspaceService(json, md, fsAdapter);
    nodeService = new NodeService(json, md, fsAdapter);
    memoService = new MemoService(json, md, fsAdapter);
    stateService = new StateService(json, md, fsAdapter);
    searchService = new SearchService(json, md, fsAdapter);

    const result = await workspaceService.init({
      name: "search-test-workspace",
      goal: "Test SearchService functionality",
      projectRoot,
    });
    workspaceId = result.workspaceId;
    projectRoot = result.projectRoot;
    wsDirName = path.basename(result.path);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  describe("workspaceSearch", () => {
    it("should search workspace by name", async () => {
      const result = await searchService.workspaceSearch({
        query: "search-test",
      });

      expect(result.workspaces.length).toBeGreaterThanOrEqual(1);
      const match = result.workspaces.find(w => w.id === workspaceId);
      expect(match).toBeDefined();
      expect(match!.matchedIn).toContain("name");
    });

    it("should search workspace by goal", async () => {
      const result = await searchService.workspaceSearch({
        query: "SearchService functionality",
      });

      expect(result.workspaces.length).toBeGreaterThanOrEqual(1);
      const match = result.workspaces.find(w => w.id === workspaceId);
      expect(match).toBeDefined();
      expect(match!.matchedIn).toContain("goal");
    });

    it("should support regex search", async () => {
      const result = await searchService.workspaceSearch({
        query: "search.*workspace",
        regex: true,
      });

      expect(result.workspaces.length).toBeGreaterThanOrEqual(1);
    });

    it("should respect limit parameter", async () => {
      const result = await searchService.workspaceSearch({
        query: "test",
        limit: 1,
      });

      expect(result.workspaces.length).toBeLessThanOrEqual(1);
    });

    it("should return empty for no match", async () => {
      const result = await searchService.workspaceSearch({
        query: "nonexistent-query-xyz-123",
      });

      expect(result.workspaces).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it("should reject invalid regex", async () => {
      await expect(
        searchService.workspaceSearch({
          query: "[invalid",
          regex: true,
        })
      ).rejects.toThrow(TanmiError);
    });

    it("should reject dangerous regex (ReDoS)", async () => {
      await expect(
        searchService.workspaceSearch({
          query: "(a+)+$",
          regex: true,
        })
      ).rejects.toThrow(TanmiError);
    });

    // === 边缘情况测试 ===

    it("should return empty for empty string query", async () => {
      const result = await searchService.workspaceSearch({
        query: "",
      });

      expect(result.workspaces).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it("should return empty for whitespace-only query", async () => {
      const result = await searchService.workspaceSearch({
        query: "   \t\n  ",
      });

      expect(result.workspaces).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it("should reject regex exceeding max length (200 chars)", async () => {
      const longRegex = "a".repeat(201);
      await expect(
        searchService.workspaceSearch({
          query: longRegex,
          regex: true,
        })
      ).rejects.toThrow(TanmiError);
    });

    it("should accept regex at max length boundary (200 chars)", async () => {
      const boundaryRegex = "a".repeat(200);
      // 不应抛出错误
      const result = await searchService.workspaceSearch({
        query: boundaryRegex,
        regex: true,
      });
      expect(result).toBeDefined();
    });
  });

  describe("contentSearch", () => {
    let childNodeId: string;
    let memoId: string;

    beforeEach(async () => {
      // 创建子节点
      const config = await json.readWorkspaceConfig(projectRoot, wsDirName);
      const rootNodeId = config.rootNodeId || "root";

      const nodeResult = await nodeService.create({
        workspaceId,
        parentId: rootNodeId,
        title: "Test Child Node",
        type: "execution",
        requirement: "This node contains unique keyword: ALPHA_SEARCH_TEST",
      });
      childNodeId = nodeResult.nodeId;

      // 设置节点结论
      await stateService.transition({
        workspaceId,
        nodeId: childNodeId,
        action: "start",
      });
      await stateService.transition({
        workspaceId,
        nodeId: childNodeId,
        action: "complete",
        conclusion: "Conclusion with BETA_SEARCH_TEST keyword",
      });

      // 创建 memo
      const memoResult = await memoService.create({
        workspaceId,
        title: "Test Memo GAMMA_SEARCH",
        summary: "Memo summary with DELTA_SEARCH keyword",
        content: "Line 1: Introduction\nLine 2: EPSILON_SEARCH keyword here\nLine 3: End",
        tags: ["search-test", "zeta-tag"],
      });
      memoId = memoResult.memoId;
    });

    it("should search node title", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "Test Child Node",
      });

      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      const match = result.matches.find(m => m.nodeId === childNodeId && m.source === "title");
      expect(match).toBeDefined();
      expect(match!.type).toBe("node");
    });

    it("should search node requirement", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "ALPHA_SEARCH_TEST",
      });

      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      const match = result.matches.find(m => m.nodeId === childNodeId && m.source === "requirement");
      expect(match).toBeDefined();
      expect(match!.snippet).toContain("ALPHA_SEARCH_TEST");
    });

    it("should search node conclusion", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "BETA_SEARCH_TEST",
      });

      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      const match = result.matches.find(m => m.nodeId === childNodeId && m.source === "conclusion");
      expect(match).toBeDefined();
      expect(match!.snippet).toContain("BETA_SEARCH_TEST");
    });

    it("should search memo title", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "GAMMA_SEARCH",
      });

      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      const match = result.matches.find(m => m.memoId === memoId && m.source === "title");
      expect(match).toBeDefined();
      expect(match!.type).toBe("memo");
    });

    it("should search memo summary", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "DELTA_SEARCH",
      });

      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      const match = result.matches.find(m => m.memoId === memoId && m.source === "summary");
      expect(match).toBeDefined();
    });

    it("should search memo content with line number", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "EPSILON_SEARCH",
      });

      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      const match = result.matches.find(m => m.memoId === memoId && m.source === "content");
      expect(match).toBeDefined();
      expect(match!.line).toBe(2); // Line 2 contains EPSILON_SEARCH
    });

    it("should search memo tags", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "zeta-tag",
      });

      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      const match = result.matches.find(m => m.memoId === memoId && m.source === "tags");
      expect(match).toBeDefined();
    });

    it("should filter by target=node", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "SEARCH",
        target: "node",
      });

      // 所有结果都应该是 node 类型
      expect(result.matches.every(m => m.type === "node")).toBe(true);
    });

    it("should filter by target=memo", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "SEARCH",
        target: "memo",
      });

      // 所有结果都应该是 memo 类型
      expect(result.matches.every(m => m.type === "memo")).toBe(true);
    });

    it("should search by node ID (subtree)", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "",
        id: childNodeId,
      });

      // 应该只返回该节点及其子节点的结果
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      expect(result.matches.every(m => m.nodeId === childNodeId)).toBe(true);
    });

    it("should search by memo ID", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "",
        id: memoId,
      });

      // 应该只返回该 memo 的结果
      expect(result.matches.length).toBeGreaterThanOrEqual(1);
      expect(result.matches.every(m => m.memoId === memoId)).toBe(true);
    });

    it("should sort by relevance (title first)", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "GAMMA_SEARCH",
      });

      // title 匹配应该排在前面
      const titleMatch = result.matches.find(m => m.source === "title");
      const contentMatch = result.matches.find(m => m.source === "content");

      if (titleMatch && contentMatch) {
        const titleIndex = result.matches.indexOf(titleMatch);
        const contentIndex = result.matches.indexOf(contentMatch);
        expect(titleIndex).toBeLessThan(contentIndex);
      }
    });

    it("should respect limit parameter", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "SEARCH",
        limit: 2,
      });

      expect(result.matches.length).toBeLessThanOrEqual(2);
    });

    it("should throw error for nonexistent workspace", async () => {
      await expect(
        searchService.contentSearch({
          workspaceId: "nonexistent-ws",
          query: "test",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("should support regex search", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "ALPHA.*TEST",
        regex: true,
      });

      expect(result.matches.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle empty query for ID search", async () => {
      // 空 query + ID 应该返回该 ID 下的所有内容
      const result = await searchService.contentSearch({
        workspaceId,
        query: "",
        id: memoId,
      });

      expect(result.matches.length).toBeGreaterThanOrEqual(1);
    });

    // === 边缘情况测试 ===

    it("should return empty for empty query without ID", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "",
      });

      expect(result.matches).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it("should return empty for whitespace-only query without ID", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: "   \t\n  ",
      });

      expect(result.matches).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it("should reject regex exceeding max length in contentSearch", async () => {
      const longRegex = "a".repeat(201);
      await expect(
        searchService.contentSearch({
          workspaceId,
          query: longRegex,
          regex: true,
        })
      ).rejects.toThrow(TanmiError);
    });

    it("should handle undefined query parameter", async () => {
      const result = await searchService.contentSearch({
        workspaceId,
        query: undefined as unknown as string,
      });

      expect(result.matches).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });
});
