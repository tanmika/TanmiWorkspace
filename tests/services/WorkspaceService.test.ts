import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { TanmiError } from "../../src/types/errors.js";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-ws-${crypto.randomUUID()}`;
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

describe("WorkspaceService", () => {
  let basePath: string;
  let homeDir: string;
  let projectRoot: string;
  let fsAdapter: FileSystemAdapter;
  let json: JsonStorage;
  let md: MarkdownStorage;
  let service: WorkspaceService;

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
    service = new WorkspaceService(json, md, fsAdapter);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  describe("init", () => {
    it("应该能创建新工作区", async () => {
      const result = await service.init({
        name: "测试工作区",
        goal: "测试目标",
        projectRoot,
      });

      expect(result.workspaceId).toMatch(/^ws-/);
      expect(result.rootNodeId).toBe("root");

      // 验证索引已更新
      const index = await json.readIndex();
      expect(index.workspaces).toHaveLength(1);
      expect(index.workspaces[0].name).toBe("测试工作区");
    });

    it("应该拒绝无效的名称", async () => {
      await expect(
        service.init({
          name: "test/invalid",
          goal: "test",
          projectRoot,
        })
      ).rejects.toThrow(TanmiError);
    });

    it("应该拒绝重复的活动工作区名称", async () => {
      await service.init({ name: "duplicate", goal: "test", projectRoot });
      await expect(
        service.init({ name: "duplicate", goal: "test2", projectRoot })
      ).rejects.toThrow(TanmiError);
    });

    it("应该支持规则和文档", async () => {
      const result = await service.init({
        name: "带规则的工作区",
        goal: "测试",
        rules: ["规则1", "规则2"],
        docs: [{ path: "/doc/readme.md", description: "说明文档" }],
        projectRoot,
      });

      // 使用 service.get 验证（内部会正确解析 dirName）
      const wsResult = await service.get({ workspaceId: result.workspaceId });
      expect(wsResult.workspaceMd).toContain("规则1");
      expect(wsResult.workspaceMd).toContain("/doc/readme.md");
    });
  });

  describe("list", () => {
    it("应该列出所有工作区", async () => {
      await service.init({ name: "ws1", goal: "g1", projectRoot });
      await service.init({ name: "ws2", goal: "g2", projectRoot });

      const result = await service.list({});
      expect(result.workspaces).toHaveLength(2);
    });

    it("应该按状态过滤", async () => {
      await service.init({ name: "ws1", goal: "g1", projectRoot });

      const activeResult = await service.list({ status: "active" });
      expect(activeResult.workspaces).toHaveLength(1);

      const archivedResult = await service.list({ status: "archived" });
      expect(archivedResult.workspaces).toHaveLength(0);
    });
  });

  describe("get", () => {
    it("应该获取工作区详情", async () => {
      const initResult = await service.init({ name: "test", goal: "goal", projectRoot });
      const result = await service.get({ workspaceId: initResult.workspaceId });

      expect(result.config.name).toBe("test");
      // API 变更：现在返回 topology 而不是 graph.nodes
      expect(result.topology).toBeDefined();
      expect(result.topology.id).toBe("root");
      expect(result.workspaceMd).toContain("test");
    });

    it("应该对不存在的工作区抛出错误", async () => {
      await expect(
        service.get({ workspaceId: "nonexistent" })
      ).rejects.toThrow(TanmiError);
    });
  });

  describe("delete", () => {
    it("应该删除工作区（force=true）", async () => {
      const initResult = await service.init({ name: "to-delete", goal: "test", projectRoot });
      const result = await service.delete({
        workspaceId: initResult.workspaceId,
        force: true,
      });

      expect(result.success).toBe(true);

      const index = await json.readIndex();
      expect(index.workspaces).toHaveLength(0);
    });

    it("应该拒绝删除活动工作区（无 force）", async () => {
      const initResult = await service.init({ name: "active-ws", goal: "test", projectRoot });
      await expect(
        service.delete({ workspaceId: initResult.workspaceId })
      ).rejects.toThrow(TanmiError);
    });
  });

  describe("status", () => {
    it("应该返回 box 格式状态", async () => {
      const initResult = await service.init({ name: "status-test", goal: "目标", projectRoot });
      const result = await service.status({
        workspaceId: initResult.workspaceId,
        format: "box",
      });

      expect(result.output).toContain("status-test");
      expect(result.summary.totalNodes).toBe(1);
    });

    it("应该返回 markdown 格式状态", async () => {
      const initResult = await service.init({ name: "md-test", goal: "目标", projectRoot });
      const result = await service.status({
        workspaceId: initResult.workspaceId,
        format: "markdown",
      });

      expect(result.output).toContain("# md-test");
    });
  });
});
