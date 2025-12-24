import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { FileSystemAdapter } from "../../src/storage/FileSystemAdapter.js";
import { JsonStorage } from "../../src/storage/JsonStorage.js";
import { MarkdownStorage } from "../../src/storage/MarkdownStorage.js";
import { WorkspaceService } from "../../src/services/WorkspaceService.js";
import { NodeService } from "../../src/services/NodeService.js";
import { MemoService } from "../../src/services/MemoService.js";
import { ReferenceService } from "../../src/services/ReferenceService.js";
import { TanmiError } from "../../src/types/errors.js";

describe("ReferenceService - Memo Reference", () => {
  let testBasePath: string;
  const originalHome = process.env.HOME;
  let basePath: string;
  let homeDir: string;
  let projectRoot: string;
  let fsAdapter: FileSystemAdapter;
  let json: JsonStorage;
  let md: MarkdownStorage;
  let workspaceService: WorkspaceService;
  let nodeService: NodeService;
  let memoService: MemoService;
  let referenceService: ReferenceService;
  let workspaceId: string;
  let wsDirName: string;
  let testNodeId: string;

  beforeEach(async () => {
    testBasePath = ".test-tanmi-workspace-ref-" + crypto.randomUUID();
    
    basePath = path.join(process.cwd(), testBasePath);
    projectRoot = path.join(basePath, "project");
    homeDir = path.join(basePath, "home");
    process.env.HOME = homeDir;

    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(projectRoot, { recursive: true });

    fsAdapter = new FileSystemAdapter();
    json = new JsonStorage(fsAdapter);
    md = new MarkdownStorage(fsAdapter);
    workspaceService = new WorkspaceService(json, md, fsAdapter);
    nodeService = new NodeService(json, md, fsAdapter);
    memoService = new MemoService(json, md, fsAdapter);
    referenceService = new ReferenceService(json, md, fsAdapter);

    const result = await workspaceService.init({
      name: "reference-test-workspace",
      goal: "Test memo:// reference",
      projectRoot,
    });
    workspaceId = result.workspaceId;

    const wsLocation = await json.getWorkspaceLocation(workspaceId);
    if (!wsLocation) {
      throw new Error("Failed to get workspace location");
    }
    wsDirName = wsLocation.dirName;

    const nodeResult = await nodeService.create({
      workspaceId,
      parentId: "root",
      type: "execution",
      title: "Test Node",
      requirement: "Test node for reference testing",
    });
    testNodeId = nodeResult.nodeId;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  describe("memo:// prefix support", () => {
    it("should add memo reference with memo:// prefix", async () => {
      const memoResult = await memoService.create({
        workspaceId,
        title: "Test Memo",
        summary: "Test Summary",
        content: "Test Content",
        tags: ["test"],
      });

      const memoRef = "memo://" + memoResult.memoId;

      const refResult = await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: memoRef,
        action: "add",
        description: "Test memo reference",
      });

      expect(refResult.success).toBe(true);
      expect(refResult.references).toBeDefined();
      
      const addedRef = refResult.references.find(r => r.path === memoRef);
      expect(addedRef).toBeDefined();
      expect(addedRef?.description).toBe("Test memo reference");
      expect(addedRef?.status).toBe("active");

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).toContain(memoRef);
    });

    it("should remove memo reference with memo:// prefix", async () => {
      const memoResult = await memoService.create({
        workspaceId,
        title: "Test Memo",
        summary: "Test Summary",
        content: "Test Content",
      });

      const memoRef = "memo://" + memoResult.memoId;

      await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: memoRef,
        action: "add",
      });

      const removeResult = await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: memoRef,
        action: "remove",
      });

      expect(removeResult.success).toBe(true);
      
      const hasRef = removeResult.references.some(r => r.path === memoRef);
      expect(hasRef).toBe(false);

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).not.toContain(memoRef);
    });

    it("should throw error when adding reference to nonexistent memo", async () => {
      const memoRef = "memo://memo-nonexistent";

      await expect(
        referenceService.reference({
          workspaceId,
          nodeId: testNodeId,
          targetIdOrPath: memoRef,
          action: "add",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("should support expire and activate actions on memo references", async () => {
      const memoResult = await memoService.create({
        workspaceId,
        title: "Test Memo",
        summary: "Test Summary",
        content: "Test Content",
      });

      const memoRef = "memo://" + memoResult.memoId;

      await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: memoRef,
        action: "add",
      });

      const expireResult = await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: memoRef,
        action: "expire",
      });

      expect(expireResult.success).toBe(true);
      const expiredRef = expireResult.references.find(r => r.path === memoRef);
      expect(expiredRef?.status).toBe("expired");

      const activateResult = await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: memoRef,
        action: "activate",
      });

      expect(activateResult.success).toBe(true);
      const activeRef = activateResult.references.find(r => r.path === memoRef);
      expect(activeRef?.status).toBe("active");
    });

    it("should handle multiple memo references", async () => {
      const memo1 = await memoService.create({
        workspaceId,
        title: "Memo 1",
        summary: "Summary 1",
        content: "Content 1",
      });

      const memo2 = await memoService.create({
        workspaceId,
        title: "Memo 2",
        summary: "Summary 2",
        content: "Content 2",
      });

      const memoRef1 = "memo://" + memo1.memoId;
      const memoRef2 = "memo://" + memo2.memoId;

      await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: memoRef1,
        action: "add",
      });

      const result = await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: memoRef2,
        action: "add",
      });

      expect(result.success).toBe(true);
      expect(result.references.length).toBe(2);
      expect(result.references.some(r => r.path === memoRef1)).toBe(true);
      expect(result.references.some(r => r.path === memoRef2)).toBe(true);

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).toContain(memoRef1);
      expect(graph.nodes[testNodeId].references).toContain(memoRef2);
    });

    it("should throw error when adding duplicate memo reference", async () => {
      const memoResult = await memoService.create({
        workspaceId,
        title: "Test Memo",
        summary: "Test Summary",
        content: "Test Content",
      });

      const memoRef = "memo://" + memoResult.memoId;

      await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: memoRef,
        action: "add",
      });

      await expect(
        referenceService.reference({
          workspaceId,
          nodeId: testNodeId,
          targetIdOrPath: memoRef,
          action: "add",
        })
      ).rejects.toThrow(TanmiError);
    });
  });
});
