import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { TanmiError } from "../../src/types/errors.js";
import type { ReferenceType, NormalizedReference } from "../../src/types/context.js";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-ref-${crypto.randomUUID()}`;
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
const { ReferenceService } = await import("../../src/services/ReferenceService.js");

describe("ReferenceService - Memo Reference", () => {
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
    referenceService = new ReferenceService(json, md, fsAdapter);

    // 注入 ReferenceService（与生产环境保持一致）
    nodeService.setReferenceService(referenceService);
    memoService.setReferenceService(referenceService);

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
    vi.restoreAllMocks();
    await fs.rm(basePath, { recursive: true, force: true }).catch((error) => {
      console.warn(`[Test Cleanup] Failed to remove test directory: ${error}`);
    });
  });

  describe("memo:// prefix support", () => {
    it("should add memo reference with memo:// prefix", async () => {
      const memoResult = await memoService.create({
        workspaceId,
        title: "Test Memo",
        summary: "Test Summary",
        content: "Test Content",
        tags: ["test", "reference"],
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
      // status 字段是可选的，新增引用时不设置

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).toContain(memoRef);
    });

    it("should remove memo reference with memo:// prefix", async () => {
      const memoResult = await memoService.create({
        workspaceId,
        title: "Test Memo",
        summary: "Test Summary",
        content: "Test Content",
        tags: ["test", "remove"],
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

    // Note: expire/activate actions 已从 API 中移除，仅支持 add/remove

    it("should handle multiple memo references", async () => {
      const memo1 = await memoService.create({
        workspaceId,
        title: "Memo 1",
        summary: "Summary 1",
        content: "Content 1",
        tags: ["memo", "first"],
      });

      const memo2 = await memoService.create({
        workspaceId,
        title: "Memo 2",
        summary: "Summary 2",
        content: "Content 2",
        tags: ["memo", "second"],
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
        tags: ["test", "duplicate"],
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

  describe("normalizeReference", () => {
    // 测试场景 1: 自动补全 memo-xxx → memo://memo-xxx
    it("should auto-complete memo-xxx to memo://memo-xxx", async () => {
      // 创建一个真实的 memo 用于测试
      const memoResult = await memoService.create({
        workspaceId,
        title: "Auto Complete Test",
        summary: "Test auto completion",
        content: "Content for auto complete test",
        tags: ["test", "auto-complete"],
      });

      const input = memoResult.memoId; // memo-xxx 格式
      const result = await referenceService.normalizeReference(workspaceId, input);

      expect(result.type).toBe("memo");
      expect(result.uri).toBe(`memo://${memoResult.memoId}`);
      expect(result.targetId).toBe(memoResult.memoId);
    });

    // 测试场景 2: 自动补全 node-xxx → node://node-xxx
    it("should auto-complete node-xxx to node://node-xxx", async () => {
      const input = testNodeId; // node-xxx 格式
      const result = await referenceService.normalizeReference(workspaceId, input);

      expect(result.type).toBe("node");
      expect(result.uri).toBe(`node://${testNodeId}`);
      expect(result.targetId).toBe(testNodeId);
    });

    // 测试场景 3: 自动补全 ./docs/a.md → file://./docs/a.md
    it("should auto-complete relative path to file:// URI", async () => {
      // 创建测试文件（文件验证要求）
      const docsDir = path.join(projectRoot, "docs");
      await fs.mkdir(docsDir, { recursive: true });
      await fs.writeFile(path.join(docsDir, "a.md"), "Test content");

      const input = "./docs/a.md";
      const result = await referenceService.normalizeReference(workspaceId, input);

      expect(result.type).toBe("file");
      expect(result.uri).toBe("file://./docs/a.md");
      expect(result.path).toBe("./docs/a.md");
    });

    // 测试场景 4: 路径转引用 memos/标题_id → memo://memo-id
    it("should convert memos/ path to memo:// URI", async () => {
      const memoResult = await memoService.create({
        workspaceId,
        title: "Path Convert Test",
        summary: "Test path conversion",
        content: "Content for path convert test",
        tags: ["test", "path-convert"],
      });

      // 获取 memo 目录名（格式: 标题_id）
      const graph = await json.readGraph(projectRoot, wsDirName);
      const memoMeta = graph.memos[memoResult.memoId];
      const memoDirName = memoMeta.dirName;

      const input = `memos/${memoDirName}`;
      const result = await referenceService.normalizeReference(workspaceId, input);

      expect(result.type).toBe("memo");
      expect(result.uri).toBe(`memo://${memoResult.memoId}`);
      expect(result.targetId).toBe(memoResult.memoId);
    });

    // 测试场景 5: 路径转引用 nodes/标题_id → node://node-id
    it("should convert nodes/ path to node:// URI", async () => {
      // 获取 node 目录名（格式: 标题_id）
      const graph = await json.readGraph(projectRoot, wsDirName);
      const nodeMeta = graph.nodes[testNodeId];
      const nodeDirName = nodeMeta.dirName;

      const input = `nodes/${nodeDirName}`;
      const result = await referenceService.normalizeReference(workspaceId, input);

      expect(result.type).toBe("node");
      expect(result.uri).toBe(`node://${testNodeId}`);
      expect(result.targetId).toBe(testNodeId);
    });

    // 测试场景 6: 已规范格式保持不变 memo://memo-xxx
    it("should keep already normalized memo:// URI unchanged", async () => {
      const memoResult = await memoService.create({
        workspaceId,
        title: "Normalized Test",
        summary: "Test normalized URI",
        content: "Content for normalized test",
        tags: ["test", "normalized"],
      });

      const input = `memo://${memoResult.memoId}`;
      const result = await referenceService.normalizeReference(workspaceId, input);

      expect(result.type).toBe("memo");
      expect(result.uri).toBe(input);
      expect(result.targetId).toBe(memoResult.memoId);
    });

    // 测试场景 7: 歧义报错 memo:memo-xxx 抛出错误并提示正确格式
    it("should throw error for ambiguous format memo:memo-xxx with hint", async () => {
      const input = "memo:memo-xxx";

      await expect(
        referenceService.normalizeReference(workspaceId, input)
      ).rejects.toThrow(TanmiError);

      try {
        await referenceService.normalizeReference(workspaceId, input);
      } catch (error) {
        expect(error).toBeInstanceOf(TanmiError);
        const tanmiError = error as TanmiError;
        // 错误消息应包含正确格式的提示
        expect(tanmiError.message).toMatch(/memo:\/\//);
      }
    });

    // 测试场景 8: 目标不存在报错 memo://不存在 抛出错误
    it("should throw error when memo does not exist", async () => {
      const input = "memo://memo-nonexistent-id";

      await expect(
        referenceService.normalizeReference(workspaceId, input)
      ).rejects.toThrow(TanmiError);
    });
  });

  // ========== Phase 2: node:// 引用测试 ==========
  describe("node:// reference operations", () => {
    let secondNodeId: string;

    beforeEach(async () => {
      // 创建第二个节点用于引用测试
      const nodeResult = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Second Node",
        requirement: "Second node for reference testing",
      });
      secondNodeId = nodeResult.nodeId;
    });

    it("should add node reference with node:// prefix", async () => {
      const nodeRef = "node://" + secondNodeId;

      const refResult = await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: nodeRef,
        action: "add",
        description: "Test node reference",
      });

      expect(refResult.success).toBe(true);
      expect(refResult.references).toBeDefined();

      const addedRef = refResult.references.find(r => r.path === nodeRef);
      expect(addedRef).toBeDefined();
      expect(addedRef?.description).toBe("Test node reference");
      expect((addedRef as any)?.refType).toBe("node");

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).toContain(nodeRef);
    });

    it("should remove node reference with node:// prefix", async () => {
      const nodeRef = "node://" + secondNodeId;

      await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: nodeRef,
        action: "add",
      });

      const removeResult = await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: nodeRef,
        action: "remove",
      });

      expect(removeResult.success).toBe(true);
      expect(removeResult.references.some(r => r.path === nodeRef)).toBe(false);

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).not.toContain(nodeRef);
    });

    it("should throw error when adding reference to nonexistent node", async () => {
      const nodeRef = "node://node-nonexistent";

      await expect(
        referenceService.reference({
          workspaceId,
          nodeId: testNodeId,
          targetIdOrPath: nodeRef,
          action: "add",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("should throw error when adding duplicate node reference", async () => {
      const nodeRef = "node://" + secondNodeId;

      await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: nodeRef,
        action: "add",
      });

      await expect(
        referenceService.reference({
          workspaceId,
          nodeId: testNodeId,
          targetIdOrPath: nodeRef,
          action: "add",
        })
      ).rejects.toThrow(TanmiError);
    });
  });

  // ========== Phase 2: file:// 引用和路径验证测试 ==========
  describe("file:// reference and path validation", () => {
    beforeEach(async () => {
      // 创建测试文件
      await fs.mkdir(path.join(projectRoot, "docs"), { recursive: true });
      await fs.writeFile(path.join(projectRoot, "docs", "test.md"), "# Test Doc");
    });

    it("should add file reference with relative path", async () => {
      const filePath = "./docs/test.md";

      const refResult = await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: filePath,
        action: "add",
        description: "Test file reference",
      });

      expect(refResult.success).toBe(true);

      const addedRef = refResult.references.find(r => r.path === `file://${filePath}`);
      expect(addedRef).toBeDefined();
      expect((addedRef as any)?.refType).toBe("file");
    });

    it("should throw error when adding reference to nonexistent file", async () => {
      const filePath = "./docs/nonexistent.md";

      await expect(
        referenceService.reference({
          workspaceId,
          nodeId: testNodeId,
          targetIdOrPath: filePath,
          action: "add",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("should remove file reference", async () => {
      const filePath = "./docs/test.md";
      const fileUri = `file://${filePath}`;

      await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: filePath,
        action: "add",
      });

      const removeResult = await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: fileUri,
        action: "remove",
      });

      expect(removeResult.success).toBe(true);
      expect(removeResult.references.some(r => r.path === fileUri)).toBe(false);
    });
  });

  // ========== Phase 2: isolate 功能测试 ==========
  describe("node_isolate functionality", () => {
    it("should set node as isolated", async () => {
      const isolateResult = await referenceService.isolate({
        workspaceId,
        nodeId: testNodeId,
        isolate: true,
      });

      expect(isolateResult.success).toBe(true);

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].isolate).toBe(true);
    });

    it("should unset node isolation", async () => {
      // 先设置为 isolated
      await referenceService.isolate({
        workspaceId,
        nodeId: testNodeId,
        isolate: true,
      });

      // 再取消 isolated
      const isolateResult = await referenceService.isolate({
        workspaceId,
        nodeId: testNodeId,
        isolate: false,
      });

      expect(isolateResult.success).toBe(true);

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].isolate).toBe(false);
    });
  });

  // ========== Phase 1 回归测试：引用链清理 ==========
  describe("Phase 1 regression: reference cleanup on delete", () => {
    let nodeService: NodeService;
    let targetNodeId: string;

    beforeEach(async () => {
      nodeService = new NodeService(json, md, fsAdapter);
      nodeService.setReferenceService(referenceService);

      // 创建目标节点
      const nodeResult = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Target Node",
        requirement: "Target node to be deleted",
      });
      targetNodeId = nodeResult.nodeId;

      // testNodeId 引用 targetNodeId
      await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: `node://${targetNodeId}`,
        action: "add",
        description: "Reference to target node",
      });
    });

    it("should cleanup references in graph.json when deleting referenced node", async () => {
      // 验证引用存在
      let graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).toContain(`node://${targetNodeId}`);

      // 删除目标节点
      await nodeService.delete({
        workspaceId,
        nodeId: targetNodeId,
      });

      // 验证引用被清理
      graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).not.toContain(`node://${targetNodeId}`);
    });

    it("should cleanup references in Info.md when deleting referenced node", async () => {
      const nodeDirName = (await json.readGraph(projectRoot, wsDirName)).nodes[testNodeId].dirName || testNodeId;

      // 删除目标节点
      await nodeService.delete({
        workspaceId,
        nodeId: targetNodeId,
      });

      // 读取 Info.md 验证引用被清理
      const nodeInfo = await md.readNodeInfoFull(projectRoot, wsDirName, nodeDirName);
      expect(nodeInfo.docs.some(d => d.path === `node://${targetNodeId}`)).toBe(false);
    });

    it("should cleanup memo references when deleting memo", async () => {
      // 创建 memo 并添加引用
      const memoResult = await memoService.create({
        workspaceId,
        title: "Target Memo",
        summary: "Memo to be deleted",
        content: "Test content",
        tags: ["test", "regression"],
      });

      await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: `memo://${memoResult.memoId}`,
        action: "add",
      });

      // 验证引用存在
      let graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).toContain(`memo://${memoResult.memoId}`);

      // 删除 memo
      await memoService.delete({
        workspaceId,
        memoId: memoResult.memoId,
      });

      // 验证引用被清理
      graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).not.toContain(`memo://${memoResult.memoId}`);
    });

    it("should cleanup multiple references to same target", async () => {
      // 创建第二个节点也引用 targetNodeId
      const secondResult = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "Second Ref Node",
        requirement: "Another node referencing target",
      });

      await referenceService.reference({
        workspaceId,
        nodeId: secondResult.nodeId,
        targetIdOrPath: `node://${targetNodeId}`,
        action: "add",
      });

      // 验证两个节点都有引用
      let graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).toContain(`node://${targetNodeId}`);
      expect(graph.nodes[secondResult.nodeId].references).toContain(`node://${targetNodeId}`);

      // 删除目标节点
      await nodeService.delete({
        workspaceId,
        nodeId: targetNodeId,
      });

      // 验证两个节点的引用都被清理
      graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[testNodeId].references).not.toContain(`node://${targetNodeId}`);
      expect(graph.nodes[secondResult.nodeId].references).not.toContain(`node://${targetNodeId}`);
    });
  });

  // ========== Phase 1 回归测试：日志包含 description ==========
  describe("Phase 1 regression: log includes description", () => {
    it("should include description in log when adding reference", async () => {
      const memoResult = await memoService.create({
        workspaceId,
        title: "Log Test Memo",
        summary: "Test Summary",
        content: "Test Content",
        tags: ["test", "regression"],
      });

      const memoRef = "memo://" + memoResult.memoId;
      const description = "This is a custom description";

      await referenceService.reference({
        workspaceId,
        nodeId: testNodeId,
        targetIdOrPath: memoRef,
        action: "add",
        description,
      });

      // 读取日志验证 description 被记录
      const nodeDirName = (await json.readGraph(projectRoot, wsDirName)).nodes[testNodeId].dirName || testNodeId;
      const logPath = path.join(projectRoot, ".tanmi-workspace", wsDirName, "nodes", nodeDirName, "Log.md");
      const logContent = await fs.readFile(logPath, "utf-8");

      expect(logContent).toContain(description);
    });
  });

  // ========== Phase 2: 边界情况和错误处理测试 ==========
  describe("edge cases and error handling", () => {
    it("should throw error for ambiguous format (memo:xxx)", async () => {
      const input = "memo:memo-xxx";

      await expect(
        referenceService.normalizeReference(workspaceId, input)
      ).rejects.toThrow(TanmiError);
    });

    it("should throw error for ambiguous format (node:xxx)", async () => {
      const input = "node:node-xxx";

      await expect(
        referenceService.normalizeReference(workspaceId, input)
      ).rejects.toThrow(TanmiError);
    });

    it("should handle empty string gracefully", async () => {
      await expect(
        referenceService.reference({
          workspaceId,
          nodeId: testNodeId,
          targetIdOrPath: "",
          action: "add",
        })
      ).rejects.toThrow();
    });
  });
});
