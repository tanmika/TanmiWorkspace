import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { FileSystemAdapter } from "../../src/storage/FileSystemAdapter.js";
import { JsonStorage } from "../../src/storage/JsonStorage.js";
import { MarkdownStorage } from "../../src/storage/MarkdownStorage.js";
import { WorkspaceService } from "../../src/services/WorkspaceService.js";
import { MemoService } from "../../src/services/MemoService.js";

describe("WorkspaceService - status with memos", () => {
  const testBasePath = ".test-tanmi-workspace-status-memo-" + Date.now();
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
  let testCounter = 0;

  beforeEach(async () => {
    testCounter++;
    
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
      name: "memo-status-test-" + testCounter,
      goal: "Test workspace_status memo extension",
      projectRoot,
    });
    workspaceId = result.workspaceId;
    projectRoot = result.projectRoot;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  it("should return empty memos when workspace has no memos", async () => {
    const result = await workspaceService.status({
      workspaceId,
      format: "box",
    });

    expect(result.memos).toBeUndefined();
  });

  it("should return memo summary when workspace has memos", async () => {
    // Create some memos
    await memoService.create({
      workspaceId,
      title: "Test Memo 1",
      summary: "Summary 1",
      content: "Content 1",
      tags: ["tag1", "common"],
    });

    await memoService.create({
      workspaceId,
      title: "Test Memo 2",
      summary: "Summary 2",
      content: "Content 2",
      tags: ["tag2", "common"],
    });

    const result = await workspaceService.status({
      workspaceId,
      format: "box",
    });

    // Verify memos field exists
    expect(result.memos).toBeDefined();
    expect(result.memos!.totalCount).toBe(2);
    
    // Verify items contain summary info (not full content)
    expect(result.memos!.items).toHaveLength(2);
    expect(result.memos!.items[0].title).toBeDefined();
    expect(result.memos!.items[0].summary).toBeDefined();
    expect(result.memos!.items[0].tags).toBeDefined();
    expect(result.memos!.items[0].updatedAt).toBeDefined();
    
    // Verify full content is NOT included
    expect((result.memos!.items[0] as any).content).toBeUndefined();
    
    // Verify allTags
    expect(result.memos!.allTags).toContain("tag1");
    expect(result.memos!.allTags).toContain("tag2");
    expect(result.memos!.allTags).toContain("common");
  });

  it("should return sorted memos by updatedAt descending", async () => {
    const memo1 = await memoService.create({
      workspaceId,
      title: "First",
      summary: "First summary",
      content: "Content",
      tags: [],
    });

    // Wait a bit to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    const memo2 = await memoService.create({
      workspaceId,
      title: "Second",
      summary: "Second summary",
      content: "Content",
      tags: [],
    });

    const result = await workspaceService.status({
      workspaceId,
      format: "box",
    });

    expect(result.memos!.items).toHaveLength(2);
    // Most recent first
    expect(result.memos!.items[0].id).toBe(memo2.memoId);
    expect(result.memos!.items[1].id).toBe(memo1.memoId);
  });

  it("should work with both box and markdown formats", async () => {
    await memoService.create({
      workspaceId,
      title: "Format Test",
      summary: "Testing format",
      content: "Content",
      tags: ["format"],
    });

    const boxResult = await workspaceService.status({
      workspaceId,
      format: "box",
    });

    const mdResult = await workspaceService.status({
      workspaceId,
      format: "markdown",
    });

    expect(boxResult.memos).toBeDefined();
    expect(mdResult.memos).toBeDefined();
    expect(boxResult.memos!.totalCount).toBe(1);
    expect(mdResult.memos!.totalCount).toBe(1);
  });

  it("should handle memos with empty tags", async () => {
    await memoService.create({
      workspaceId,
      title: "No Tags",
      summary: "No tags here",
      content: "Content",
    });

    const result = await workspaceService.status({
      workspaceId,
      format: "box",
    });

    expect(result.memos).toBeDefined();
    expect(result.memos!.items[0].tags).toEqual([]);
    expect(result.memos!.allTags).toEqual([]);
  });

  it("should deduplicate and sort tags", async () => {
    await memoService.create({
      workspaceId,
      title: "Memo 1",
      summary: "Summary",
      content: "Content",
      tags: ["zebra", "alpha"],
    });

    await memoService.create({
      workspaceId,
      title: "Memo 2",
      summary: "Summary",
      content: "Content",
      tags: ["alpha", "beta"],
    });

    const result = await workspaceService.status({
      workspaceId,
      format: "box",
    });

    expect(result.memos!.allTags).toEqual(["alpha", "beta", "zebra"]);
  });
});
