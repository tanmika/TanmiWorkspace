import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { TanmiError } from "../../src/types/errors.js";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-memo-${crypto.randomUUID()}`;
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
const { MemoService } = await import("../../src/services/MemoService.js");

describe("MemoService", () => {
  let basePath: string;
  let homeDir: string;
  let projectRoot: string;
  let fsAdapter: FileSystemAdapter;
  let json: JsonStorage;
  let md: MarkdownStorage;
  let workspaceService: WorkspaceService;
  let memoService: MemoService;
  let workspaceId: string;
  let wsDirName: string;

  beforeEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {}

    basePath = path.join(process.cwd(), testBasePath);
    projectRoot = path.join(basePath, "project");
    homeDir = mockHomeDir;

    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});

    // Create the project directory before calling init
    await fs.mkdir(projectRoot, { recursive: true });

    fsAdapter = new FileSystemAdapter();
    json = new JsonStorage(fsAdapter);
    md = new MarkdownStorage(fsAdapter);
    workspaceService = new WorkspaceService(json, md, fsAdapter);
    memoService = new MemoService(json, md, fsAdapter);

    const result = await workspaceService.init({
      name: "memo-test-workspace",
      goal: "Test MemoService",
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

  describe("create", () => {
    it("should create memo", async () => {
      const result = await memoService.create({
        workspaceId,
        title: "Test Memo",
        summary: "This is a test memo summary",
        content: "Test content",
        tags: ["test", "memo"],
      });

      expect(result.memoId).toMatch(/^memo-/);
      expect(result.path).toContain("memos/");
      expect(result.hint).toContain("memo://");

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.memos).toBeDefined();
      expect(graph.memos![result.memoId]).toBeDefined();
      expect(graph.memos![result.memoId].title).toBe("Test Memo");
    });

    it("should require at least 2 tags", async () => {
      // 没有 tags 应该抛出错误
      await expect(
        memoService.create({
          workspaceId,
          title: "No Tags",
          summary: "No tags",
          content: "Content",
        })
      ).rejects.toThrow(TanmiError);

      // 只有 1 个 tag 也应该抛出错误
      await expect(
        memoService.create({
          workspaceId,
          title: "One Tag",
          summary: "One tag only",
          content: "Content",
          tags: ["single"],
        })
      ).rejects.toThrow(TanmiError);
    });

    it("should throw error for nonexistent workspace", async () => {
      await expect(
        memoService.create({
          workspaceId: "nonexistent",
          title: "Test",
          summary: "Summary",
          content: "Content",
          tags: ["test", "error"],
        })
      ).rejects.toThrow(TanmiError);
    });
  });

  describe("list", () => {
    it("should list all memos", async () => {
      await memoService.create({
        workspaceId,
        title: "Memo1",
        summary: "Summary1",
        content: "Content1",
        tags: ["tag1", "list"],
      });

      await memoService.create({
        workspaceId,
        title: "Memo2",
        summary: "Summary2",
        content: "Content2",
        tags: ["tag2", "list"],
      });

      const result = await memoService.list({ workspaceId });

      expect(result.memos).toHaveLength(2);
      expect(result.allTags).toContain("tag1");
      expect(result.allTags).toContain("tag2");
    });

    it("should filter by tags", async () => {
      await memoService.create({
        workspaceId,
        title: "MemoA",
        summary: "SummaryA",
        content: "ContentA",
        tags: ["alpha", "common"],
      });

      await memoService.create({
        workspaceId,
        title: "MemoB",
        summary: "SummaryB",
        content: "ContentB",
        tags: ["beta", "common"],
      });

      const result = await memoService.list({
        workspaceId,
        tags: ["alpha"],
      });

      expect(result.memos).toHaveLength(1);
      expect(result.memos[0].title).toBe("MemoA");
    });

    it("should return hint for empty workspace", async () => {
      const result = await memoService.list({ workspaceId });

      expect(result.memos).toHaveLength(0);
      expect(result.hint).toContain("memo_create");
    });
  });

  describe("get", () => {
    it("should get full memo content", async () => {
      const createResult = await memoService.create({
        workspaceId,
        title: "Full Memo",
        summary: "Summary",
        content: "Full content here",
        tags: ["full", "get"],
      });

      const result = await memoService.get({
        workspaceId,
        memoId: createResult.memoId,
      });

      expect(result.memo.id).toBe(createResult.memoId);
      expect(result.memo.title).toBe("Full Memo");
      expect(result.memo.content).toBe("Full content here");
      expect(result.memo.createdAt).toBeDefined();
    });

    it("should throw error for nonexistent memo", async () => {
      await expect(
        memoService.get({
          workspaceId,
          memoId: "memo-nonexistent",
        })
      ).rejects.toThrow(TanmiError);
    });
  });

  describe("replace", () => {
    it("should replace all fields with contentHash", async () => {
      const createResult = await memoService.create({
        workspaceId,
        title: "Old Title",
        summary: "Old Summary",
        content: "Old Content",
        tags: ["old", "update"],
      });

      // 先获取 contentHash
      const getBeforeResult = await memoService.get({
        workspaceId,
        memoId: createResult.memoId,
      });

      const replaceResult = await memoService.replace({
        workspaceId,
        memoId: createResult.memoId,
        contentHash: getBeforeResult.contentHash,
        title: "New Title",
        summary: "New Summary",
        content: "New Content",
        tags: ["new", "updated"],
      });

      expect(replaceResult.success).toBe(true);

      const getResult = await memoService.get({
        workspaceId,
        memoId: createResult.memoId,
      });

      expect(getResult.memo.title).toBe("New Title");
      expect(getResult.memo.summary).toBe("New Summary");
      expect(getResult.memo.content).toBe("New Content");
      expect(getResult.memo.tags).toEqual(["new", "updated"]);
    });

    it("should support partial replace (content required)", async () => {
      const createResult = await memoService.create({
        workspaceId,
        title: "Original",
        summary: "Original Summary",
        content: "Original Content",
        tags: ["original", "partial"],
      });

      const getBeforeResult = await memoService.get({
        workspaceId,
        memoId: createResult.memoId,
      });

      // replace 需要 content 参数，只更新 title
      await memoService.replace({
        workspaceId,
        memoId: createResult.memoId,
        contentHash: getBeforeResult.contentHash,
        content: "Original Content",  // 保持原内容
        title: "Changed Title",
      });

      const result = await memoService.get({
        workspaceId,
        memoId: createResult.memoId,
      });

      expect(result.memo.title).toBe("Changed Title");
      expect(result.memo.summary).toBe("Original Summary");
    });

    it("should return error for nonexistent memo", async () => {
      const result = await memoService.replace({
        workspaceId,
        memoId: "memo-nonexistent",
        contentHash: "dummy",
        title: "New",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("不存在");
    });
  });

  describe("delete", () => {
    it("should delete memo", async () => {
      const createResult = await memoService.create({
        workspaceId,
        title: "To Delete",
        summary: "Will be deleted",
        content: "Content",
        tags: ["delete", "test"],
      });

      const deleteResult = await memoService.delete({
        workspaceId,
        memoId: createResult.memoId,
      });

      expect(deleteResult.success).toBe(true);

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.memos![createResult.memoId]).toBeUndefined();

      await expect(
        memoService.get({
          workspaceId,
          memoId: createResult.memoId,
        })
      ).rejects.toThrow(TanmiError);
    });

    it("should throw error for nonexistent memo", async () => {
      await expect(
        memoService.delete({
          workspaceId,
          memoId: "memo-nonexistent",
        })
      ).rejects.toThrow(TanmiError);
    });
  });
});
