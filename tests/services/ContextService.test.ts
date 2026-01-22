import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-context-${crypto.randomUUID()}`;
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
const { ContextService } = await import("../../src/services/ContextService.js");
const { ReferenceService } = await import("../../src/services/ReferenceService.js");
const { StateService } = await import("../../src/services/StateService.js");

describe("ContextService - Memo References", () => {
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
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {}

    basePath = path.join(process.cwd(), testBasePath);
    projectRoot = path.join(basePath, "project");
    homeDir = mockHomeDir;

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
    vi.restoreAllMocks();
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
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
        tags: ["tag1", "multiple"],
      });

      const memo2Result = await memoService.create({
        workspaceId,
        title: "Memo 2",
        summary: "Second memo",
        content: "Content of second memo",
        tags: ["tag2", "multiple"],
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
        tags: ["ref", "mixed"],
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

describe("ContextService - Active Nodes Interception", () => {
  let basePath: string;
  let projectRoot: string;
  let fsAdapter: InstanceType<typeof FileSystemAdapter>;
  let json: InstanceType<typeof JsonStorage>;
  let md: InstanceType<typeof MarkdownStorage>;
  let workspaceService: InstanceType<typeof WorkspaceService>;
  let nodeService: InstanceType<typeof NodeService>;
  let contextService: InstanceType<typeof ContextService>;
  let stateService: InstanceType<typeof StateService>;
  let workspaceId: string;

  beforeEach(async () => {
    const testBasePath2 = `.test-tanmi-workspace-context-active-${crypto.randomUUID()}`;
    basePath = path.join(process.cwd(), testBasePath2);
    projectRoot = path.join(basePath, "project");

    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(projectRoot, { recursive: true });

    fsAdapter = new FileSystemAdapter();
    json = new JsonStorage(fsAdapter);
    md = new MarkdownStorage(fsAdapter);
    workspaceService = new WorkspaceService(json, md, fsAdapter);
    nodeService = new NodeService(json, md, fsAdapter);
    contextService = new ContextService(json, md, fsAdapter);
    stateService = new StateService(json, md, fsAdapter);

    const result = await workspaceService.init({
      name: "active-nodes-test",
      goal: "Test active nodes interception",
      projectRoot,
    });
    workspaceId = result.workspaceId;
    projectRoot = result.projectRoot;
  });

  afterEach(async () => {
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  describe("context_focus active nodes interception", () => {
    it("should block switching to another branch when current branch has implementing node", async () => {
      // Create two branches under root
      const branch1 = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Branch 1 Task",
        requirement: "Task in branch 1",
      });

      const branch2 = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Branch 2 Task",
        requirement: "Task in branch 2",
      });

      // Start branch1 (implementing state)
      await stateService.transition({
        workspaceId,
        nodeId: branch1.nodeId,
        action: "start",
      });

      // Focus on branch1
      await contextService.focus({
        workspaceId,
        nodeId: branch1.nodeId,
      });

      // Try to switch to branch2 - should be blocked
      const result = await contextService.focus({
        workspaceId,
        nodeId: branch2.nodeId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("ACTIVE_NODES_IN_SUBTREE");
      expect(result.activeNodes).toBeDefined();
      expect(result.activeNodes!.length).toBeGreaterThan(0);
      expect(result.activeNodes![0].nodeId).toBe(branch1.nodeId);
      expect(result.activeNodes![0].status).toBe("implementing");
    });

    it("should block switching when current branch has monitoring planning node", async () => {
      // Create planning node with execution child
      const planningNode = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "planning",
        title: "Planning Node",
        requirement: "Planning task",
      });

      const execNode = await nodeService.create({
        workspaceId,
        parentId: planningNode.nodeId,
        type: "execution",
        title: "Execution Task",
        requirement: "Execution under planning",
      });

      // Create another branch
      const otherBranch = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Other Branch",
        requirement: "Another task",
      });

      // Start execution node - this will cascade planning to monitoring automatically
      await stateService.transition({
        workspaceId,
        nodeId: execNode.nodeId,
        action: "start",
      });

      // Focus on execution node
      await contextService.focus({
        workspaceId,
        nodeId: execNode.nodeId,
      });

      // Try to switch to other branch - should be blocked
      const result = await contextService.focus({
        workspaceId,
        nodeId: otherBranch.nodeId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("ACTIVE_NODES_IN_SUBTREE");
      expect(result.activeNodes).toBeDefined();
      // Should include both monitoring planning node and implementing execution node
      const statuses = result.activeNodes!.map(n => n.status);
      expect(statuses).toContain("implementing");
      expect(statuses).toContain("monitoring");
    });

    it("should allow switching up to ancestor node even with active nodes", async () => {
      // Create planning node with execution child
      const planningNode = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "planning",
        title: "Planning Node",
        requirement: "Planning task",
      });

      const execNode = await nodeService.create({
        workspaceId,
        parentId: planningNode.nodeId,
        type: "execution",
        title: "Execution Task",
        requirement: "Execution under planning",
      });

      // Start execution node
      await stateService.transition({
        workspaceId,
        nodeId: execNode.nodeId,
        action: "start",
      });

      // Focus on execution node
      await contextService.focus({
        workspaceId,
        nodeId: execNode.nodeId,
      });

      // Switch up to planning node - should be allowed
      const result = await contextService.focus({
        workspaceId,
        nodeId: planningNode.nodeId,
      });

      expect(result.success).toBe(true);
      expect(result.currentFocus).toBe(planningNode.nodeId);
    });

    it("should allow switching down to child node", async () => {
      // Create planning node
      const planningNode = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "planning",
        title: "Planning Node",
        requirement: "Planning task",
      });

      // Start planning node (enters planning state)
      await stateService.transition({
        workspaceId,
        nodeId: planningNode.nodeId,
        action: "start",
      });

      // Create execution child after planning node is started
      const execNode = await nodeService.create({
        workspaceId,
        parentId: planningNode.nodeId,
        type: "execution",
        title: "Execution Task",
        requirement: "Execution under planning",
      });

      // Focus on planning node
      await contextService.focus({
        workspaceId,
        nodeId: planningNode.nodeId,
      });

      // Switch down to execution node - should be allowed
      const result = await contextService.focus({
        workspaceId,
        nodeId: execNode.nodeId,
      });

      expect(result.success).toBe(true);
      expect(result.currentFocus).toBe(execNode.nodeId);
    });

    it("should allow switching when all nodes in current branch are in terminal state", async () => {
      // Create two branches
      const branch1 = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Branch 1 Task",
        requirement: "Task in branch 1",
      });

      const branch2 = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Branch 2 Task",
        requirement: "Task in branch 2",
      });

      // Complete branch1
      await stateService.transition({
        workspaceId,
        nodeId: branch1.nodeId,
        action: "start",
      });
      await stateService.transition({
        workspaceId,
        nodeId: branch1.nodeId,
        action: "complete",
        conclusion: "Task completed",
      });

      // Focus on branch1
      await contextService.focus({
        workspaceId,
        nodeId: branch1.nodeId,
      });

      // Switch to branch2 - should be allowed since branch1 is completed
      const result = await contextService.focus({
        workspaceId,
        nodeId: branch2.nodeId,
      });

      expect(result.success).toBe(true);
      expect(result.currentFocus).toBe(branch2.nodeId);
    });

    it("should return activeNodes list with correct information", async () => {
      // Create branch with multiple active nodes
      const planningNode = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "planning",
        title: "Planning Task",
        requirement: "Planning work",
      });

      const execNode = await nodeService.create({
        workspaceId,
        parentId: planningNode.nodeId,
        type: "execution",
        title: "Exec Task",
        requirement: "Execution work",
      });

      const otherBranch = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Other",
        requirement: "Other task",
      });

      // Start execution node - this will cascade planning to monitoring
      await stateService.transition({
        workspaceId,
        nodeId: execNode.nodeId,
        action: "start",
      });

      // Focus on exec node
      await contextService.focus({
        workspaceId,
        nodeId: execNode.nodeId,
      });

      // Try to switch to other branch
      const result = await contextService.focus({
        workspaceId,
        nodeId: otherBranch.nodeId,
      });

      expect(result.success).toBe(false);
      expect(result.activeNodes).toBeDefined();

      // Check activeNodes contains correct info
      for (const node of result.activeNodes!) {
        expect(node.nodeId).toBeDefined();
        expect(node.title).toBeDefined();
        expect(node.status).toBeDefined();
        expect(node.type).toMatch(/^(planning|execution)$/);
      }
    });

    it("should block switching from completed child to another branch when parent is monitoring", async () => {
      // Scenario: root -> a(monitoring) -> c,d,e(all completed)
      //           root -> b(pending)
      // Switch from e to b: should be blocked because a is monitoring

      // Create a (planning) and b (execution) under root
      const a = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "planning",
        title: "Node A",
        requirement: "Planning A",
      });

      const b = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Node B",
        requirement: "Task B",
      });

      // Create c, d, e under a
      const c = await nodeService.create({
        workspaceId,
        parentId: a.nodeId,
        type: "execution",
        title: "Node C",
        requirement: "Task C",
      });

      const d = await nodeService.create({
        workspaceId,
        parentId: a.nodeId,
        type: "execution",
        title: "Node D",
        requirement: "Task D",
      });

      const e = await nodeService.create({
        workspaceId,
        parentId: a.nodeId,
        type: "execution",
        title: "Node E",
        requirement: "Task E",
      });

      // Complete c, d, e (start -> complete)
      // When first child starts, parent 'a' will cascade to 'monitoring'
      for (const node of [c, d, e]) {
        await stateService.transition({
          workspaceId,
          nodeId: node.nodeId,
          action: "start",
        });
        await stateService.transition({
          workspaceId,
          nodeId: node.nodeId,
          action: "complete",
          conclusion: "Task completed",
        });
      }

      // Focus on e (which is completed)
      await contextService.focus({
        workspaceId,
        nodeId: e.nodeId,
      });

      // Try to switch to b - should be BLOCKED because a is still monitoring
      const result = await contextService.focus({
        workspaceId,
        nodeId: b.nodeId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("ACTIVE_NODES_IN_SUBTREE");
      expect(result.activeNodes).toBeDefined();
      expect(result.activeNodes!.length).toBe(1);
      expect(result.activeNodes![0].nodeId).toBe(a.nodeId);
      expect(result.activeNodes![0].status).toBe("monitoring");
    });
  });
});
