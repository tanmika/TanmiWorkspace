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
import { ContextService } from "../../src/services/ContextService.js";
import { ReferenceService } from "../../src/services/ReferenceService.js";

describe("ContextService - Memo References", () => {
  const originalHome = process.env.HOME;
  let testBasePath: string;
  let basePath: string;
  let homeDir: string;
  let projectRoot: string;
  let fsAdapter: FileSystemAdapter;
  let json: JsonStorage;
  let md: MarkdownStorage;
  let workspaceService: WorkspaceService;
  let nodeService: NodeService;
  let memoService: MemoService;
  let contextService: ContextService;
  let referenceService: ReferenceService;
  let workspaceId: string;

  beforeEach(async () => {
    testBasePath = `.test-tanmi-workspace-context-${crypto.randomUUID()}`;

    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {}

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
    contextService = new ContextService(json, md, fsAdapter);
    referenceService = new ReferenceService(json, md, fsAdapter);

    contextService.setMemoService(memoService);

    const result = await workspaceService.init({
      name: "context-test-workspace",
      goal: "Test ContextService with Memo References",
      projectRoot,
    });
    workspaceId = result.workspaceId;
    projectRoot = result.projectRoot;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (basePath) {
      await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe("context_get with memo references", () => {
    it("should return memo content when node references a memo", async () => {
      const createResult = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Test Node with Memo",
        requirement: "Test node that references a memo",
      });
      const nodeId = createResult.nodeId;

      const memoResult = await memoService.create({
        workspaceId,
        title: "Test Memo",
        summary: "A test memo for context_get",
        content: "This is the full content of the test memo.",
        tags: ["test", "context"],
      });
      const memoId = memoResult.memoId;

      await referenceService.reference({
        workspaceId,
        nodeId,
        targetIdOrPath: `memo://${memoId}`,
        action: "add",
      });

      const context = await contextService.get({
        workspaceId,
        nodeId,
      });

      expect(context.memoReferences).toBeDefined();
      expect(context.memoReferences).toHaveLength(1);
      
      const memoRef = context.memoReferences[0];
      expect(memoRef.memoId).toBe(memoId);
      expect(memoRef.title).toBe("Test Memo");
      expect(memoRef.summary).toBe("A test memo for context_get");
      expect(memoRef.content).toBe("This is the full content of the test memo.");
      expect(memoRef.tags).toEqual(["test", "context"]);
    });

    it("should return empty array when node has no memo references", async () => {
      const createResult = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Test Node without Memo",
        requirement: "Test node without memo references",
      });
      const nodeId = createResult.nodeId;

      const context = await contextService.get({
        workspaceId,
        nodeId,
      });

      expect(context.memoReferences).toBeDefined();
      expect(context.memoReferences).toHaveLength(0);
    });

    it("should handle multiple memo references", async () => {
      const createResult = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Test Node with Multiple Memos",
        requirement: "Test node with multiple memo references",
      });
      const nodeId = createResult.nodeId;

      const memo1Result = await memoService.create({
        workspaceId,
        title: "Memo 1",
        summary: "First memo",
        content: "Content of first memo",
        tags: ["tag1"],
      });

      const memo2Result = await memoService.create({
        workspaceId,
        title: "Memo 2",
        summary: "Second memo",
        content: "Content of second memo",
        tags: ["tag2"],
      });

      await referenceService.reference({
        workspaceId,
        nodeId,
        targetIdOrPath: `memo://${memo1Result.memoId}`,
        action: "add",
      });

      await referenceService.reference({
        workspaceId,
        nodeId,
        targetIdOrPath: `memo://${memo2Result.memoId}`,
        action: "add",
      });

      const context = await contextService.get({
        workspaceId,
        nodeId,
      });

      expect(context.memoReferences).toHaveLength(2);
      
      const memoIds = context.memoReferences.map(m => m.memoId);
      expect(memoIds).toContain(memo1Result.memoId);
      expect(memoIds).toContain(memo2Result.memoId);
    });

    it("should skip non-existent memo references gracefully", async () => {
      const createResult = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Test Node with Invalid Memo",
        requirement: "Test node with invalid memo reference",
      });
      const nodeId = createResult.nodeId;

      // Add invalid memo reference using reference service
      // Since ReferenceService validates memo existence, we need to bypass it
      // by directly modifying the graph after getting the workspace dir from index
      const index = await json.readIndex();
      const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
      const wsDirName = wsEntry.dirName || workspaceId;
      
      const graph = await json.readGraph(projectRoot, wsDirName);
      graph.nodes[nodeId].references.push("memo://nonexistent-memo-id");
      await json.writeGraph(projectRoot, wsDirName, graph);

      const context = await contextService.get({
        workspaceId,
        nodeId,
      });

      expect(context.memoReferences).toHaveLength(0);
    });

    it("should include both node references and memo references", async () => {
      const node1Result = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Referenced Node",
        requirement: "A node to be referenced",
      });

      const node2Result = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Main Node",
        requirement: "Main node with mixed references",
      });

      const memoResult = await memoService.create({
        workspaceId,
        title: "Referenced Memo",
        summary: "A memo to be referenced",
        content: "Memo content",
        tags: ["ref"],
      });

      await referenceService.reference({
        workspaceId,
        nodeId: node2Result.nodeId,
        targetIdOrPath: node1Result.nodeId,
        action: "add",
      });

      await referenceService.reference({
        workspaceId,
        nodeId: node2Result.nodeId,
        targetIdOrPath: `memo://${memoResult.memoId}`,
        action: "add",
      });

      const context = await contextService.get({
        workspaceId,
        nodeId: node2Result.nodeId,
      });

      expect(context.references).toHaveLength(1);
      expect(context.references[0].nodeId).toBe(node1Result.nodeId);
      
      expect(context.memoReferences).toHaveLength(1);
      expect(context.memoReferences[0].memoId).toBe(memoResult.memoId);
    });
  });
});
