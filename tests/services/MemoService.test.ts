import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { FileSystemAdapter } from "../../src/storage/FileSystemAdapter.js";
import { JsonStorage } from "../../src/storage/JsonStorage.js";
import { MarkdownStorage } from "../../src/storage/MarkdownStorage.js";
import { WorkspaceService } from "../../src/services/WorkspaceService.js";
import { MemoService } from "../../src/services/MemoService.js";
import { TanmiError } from "../../src/types/errors.js";

describe("MemoService", () => {
  const testBasePath = `.test-tanmi-workspace-memo-${crypto.randomUUID()}`;
  const originalHome = process.env.HOME;
  let basePath: string;
  let homeDir: string;
  let projectRoot: string;
  let fsAdapter: FileSystemAdapter;
  let json: JsonStorage;
  let md: MarkdownStorage;
  let workspaceService: WorkspaceService;
  let memoService: MemoService;
  let workspaceId: string;

  beforeEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {}

    basePath = path.join(process.cwd(), testBasePath);
    projectRoot = path.join(basePath, "project");
    homeDir = path.join(basePath, "home");
    process.env.HOME = homeDir;

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
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
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

      const graph = await json.readGraph(projectRoot, workspaceId);
      expect(graph.memos).toBeDefined();
      expect(graph.memos![result.memoId]).toBeDefined();
      expect(graph.memos![result.memoId].title).toBe("Test Memo");
    });

    it("should create memo without tags", async () => {
      const result = await memoService.create({
        workspaceId,
        title: "No Tags",
        summary: "No tags",
        content: "Content",
      });

      const graph = await json.readGraph(projectRoot, workspaceId);
      expect(graph.memos![result.memoId].tags).toEqual([]);
    });

    it("should throw error for nonexistent workspace", async () => {
      await expect(
        memoService.create({
          workspaceId: "nonexistent",
          title: "Test",
          summary: "Summary",
          content: "Content",
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
        tags: ["tag1"],
      });

      await memoService.create({
        workspaceId,
        title: "Memo2",
        summary: "Summary2",
        content: "Content2",
        tags: ["tag2"],
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
        tags: ["beta"],
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
        tags: ["full"],
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

  describe("update", () => {
    it("should update all fields", async () => {
      const createResult = await memoService.create({
        workspaceId,
        title: "Old Title",
        summary: "Old Summary",
        content: "Old Content",
        tags: ["old"],
      });

      const updateResult = await memoService.update({
        workspaceId,
        memoId: createResult.memoId,
        title: "New Title",
        summary: "New Summary",
        content: "New Content",
        tags: ["new"],
      });

      expect(updateResult.success).toBe(true);

      const getResult = await memoService.get({
        workspaceId,
        memoId: createResult.memoId,
      });

      expect(getResult.memo.title).toBe("New Title");
      expect(getResult.memo.summary).toBe("New Summary");
      expect(getResult.memo.content).toBe("New Content");
      expect(getResult.memo.tags).toEqual(["new"]);
    });

    it("should support partial update", async () => {
      const createResult = await memoService.create({
        workspaceId,
        title: "Original",
        summary: "Original Summary",
        content: "Original Content",
      });

      await memoService.update({
        workspaceId,
        memoId: createResult.memoId,
        title: "Changed Title",
      });

      const result = await memoService.get({
        workspaceId,
        memoId: createResult.memoId,
      });

      expect(result.memo.title).toBe("Changed Title");
      expect(result.memo.summary).toBe("Original Summary");
    });

    it("should throw error for nonexistent memo", async () => {
      await expect(
        memoService.update({
          workspaceId,
          memoId: "memo-nonexistent",
          title: "New",
        })
      ).rejects.toThrow(TanmiError);
    });
  });

  describe("delete", () => {
    it("should delete memo", async () => {
      const createResult = await memoService.create({
        workspaceId,
        title: "To Delete",
        summary: "Will be deleted",
        content: "Content",
      });

      const deleteResult = await memoService.delete({
        workspaceId,
        memoId: createResult.memoId,
      });

      expect(deleteResult.success).toBe(true);

      const graph = await json.readGraph(projectRoot, workspaceId);
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
