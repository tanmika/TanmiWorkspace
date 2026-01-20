import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { TanmiError } from "../../src/types/errors.js";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-node-${crypto.randomUUID()}`;
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

describe("NodeService", () => {
  let basePath: string;
  let homeDir: string;
  let projectRoot: string;
  let fsAdapter: FileSystemAdapter;
  let json: JsonStorage;
  let md: MarkdownStorage;
  let workspaceService: WorkspaceService;
  let nodeService: NodeService;
  let workspaceId: string;
  let wsDirName: string;

  beforeEach(async () => {
    // 清理测试目录
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {
      // 忽略
    }

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
    nodeService = new NodeService(json, md, fsAdapter);

    // 创建测试工作区
    const result = await workspaceService.init({
      name: "测试工作区",
      goal: "测试节点功能",
      projectRoot,
    });
    workspaceId = result.workspaceId;
    projectRoot = result.projectRoot;
    // 从 path 中提取 wsDirName（用于 readGraph）
    wsDirName = path.basename(result.path);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  describe("create", () => {
    it("应该在根节点下创建子节点", async () => {
      const result = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "子节点1",
        requirement: "需求描述",
      });

      expect(result.nodeId).toMatch(/^node-/);

      // 验证节点已添加到图中
      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[result.nodeId]).toBeDefined();
      expect(graph.nodes["root"].children).toContain(result.nodeId);
    });

    it("应该支持嵌套节点", async () => {
      const child1 = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "planning",
        title: "一级节点",
      });

      const child2 = await nodeService.create({
        workspaceId,
        parentId: child1.nodeId,
        type: "execution",
        title: "二级节点",
      });

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[child1.nodeId].children).toContain(child2.nodeId);
      expect(graph.nodes[child2.nodeId].parentId).toBe(child1.nodeId);
    });

    it("应该拒绝无效的标题", async () => {
      await expect(
        nodeService.create({
          workspaceId,
          parentId: "root",
          type: "execution",
          title: "invalid:title",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("应该拒绝不存在的父节点", async () => {
      await expect(
        nodeService.create({
          workspaceId,
          parentId: "nonexistent",
          type: "execution",
          title: "test",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("应该拒绝不存在的工作区", async () => {
      await expect(
        nodeService.create({
          workspaceId: "nonexistent",
          parentId: "root",
          type: "execution",
          title: "test",
        })
      ).rejects.toThrow(TanmiError);
    });
  });

  describe("get", () => {
    it("应该获取节点详情", async () => {
      const createResult = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "测试节点",
        requirement: "需求",
      });

      const result = await nodeService.get({
        workspaceId,
        nodeId: createResult.nodeId,
      });

      expect(result.meta.id).toBe(createResult.nodeId);
      expect(result.infoMd).toContain("测试节点");
    });

    it("应该能获取根节点", async () => {
      const result = await nodeService.get({
        workspaceId,
        nodeId: "root",
      });

      expect(result.meta.id).toBe("root");
      expect(result.meta.parentId).toBeNull();
    });

    it("应该对不存在的节点抛出错误", async () => {
      await expect(
        nodeService.get({
          workspaceId,
          nodeId: "nonexistent",
        })
      ).rejects.toThrow(TanmiError);
    });
  });

  describe("list", () => {
    it("应该返回节点树", async () => {
      await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "节点A",
      });

      await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "节点B",
      });

      const result = await nodeService.list({ workspaceId });

      expect(result.tree.id).toBe("root");
      expect(result.tree.children).toHaveLength(2);
    });

    it("应该支持深度限制", async () => {
      const child1 = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "planning",
        title: "一级",
      });

      await nodeService.create({
        workspaceId,
        parentId: child1.nodeId,
        type: "execution",
        title: "二级",
      });

      const result = await nodeService.list({
        workspaceId,
        depth: 1,
      });

      expect(result.tree.children).toHaveLength(1);
      expect(result.tree.children[0].children).toHaveLength(0);
    });

    it("应该支持指定起始节点", async () => {
      const child1 = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "planning",
        title: "一级",
      });

      await nodeService.create({
        workspaceId,
        parentId: child1.nodeId,
        type: "execution",
        title: "二级",
      });

      const result = await nodeService.list({
        workspaceId,
        rootId: child1.nodeId,
      });

      expect(result.tree.id).toBe(child1.nodeId);
      expect(result.tree.children).toHaveLength(1);
    });
  });

  describe("delete", () => {
    it("应该删除节点", async () => {
      const createResult = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "待删除",
      });

      const result = await nodeService.delete({
        workspaceId,
        nodeId: createResult.nodeId,
      });

      expect(result.success).toBe(true);
      expect(result.deletedNodes).toContain(createResult.nodeId);

      // 验证节点已从图中移除
      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes[createResult.nodeId]).toBeUndefined();
    });

    it("应该递归删除子节点", async () => {
      const parent = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "planning",
        title: "父节点",
      });

      const child = await nodeService.create({
        workspaceId,
        parentId: parent.nodeId,
        type: "execution",
        title: "子节点",
      });

      const result = await nodeService.delete({
        workspaceId,
        nodeId: parent.nodeId,
      });

      expect(result.deletedNodes).toContain(parent.nodeId);
      expect(result.deletedNodes).toContain(child.nodeId);
    });

    it("应该拒绝删除根节点", async () => {
      await expect(
        nodeService.delete({
          workspaceId,
          nodeId: "root",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("应该更新父节点的 children", async () => {
      const child = await nodeService.create({
        workspaceId,
        parentId: "root",
        type: "execution",
        title: "子节点",
      });

      await nodeService.delete({
        workspaceId,
        nodeId: child.nodeId,
      });

      const graph = await json.readGraph(projectRoot, wsDirName);
      expect(graph.nodes["root"].children).not.toContain(child.nodeId);
    });
  });
});
