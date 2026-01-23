/**
 * RepairService 测试
 * 验证工作区诊断与修复功能，特别是归档一致性检测
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-repair-${crypto.randomUUID()}`;
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
const { RepairService } = await import("../../src/services/RepairService.js");

describe("RepairService", () => {
  let basePath: string;
  let projectRoot: string;
  let fsAdapter: FileSystemAdapter;
  let json: JsonStorage;
  let service: RepairService;

  beforeEach(async () => {
    // 清理测试目录
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {
      // 忽略
    }

    basePath = path.join(process.cwd(), testBasePath);
    projectRoot = path.join(basePath, "project");

    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(projectRoot, { recursive: true });

    fsAdapter = new FileSystemAdapter();
    json = new JsonStorage(fsAdapter);
    service = new RepairService(json, fsAdapter);

    // 确保索引文件存在
    await fsAdapter.ensureIndex();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  // 辅助函数：创建工作区目录结构和配置
  async function createWorkspaceDir(wsPath: string, wsId: string, wsName: string): Promise<void> {
    await fs.mkdir(wsPath, { recursive: true });
    await fs.writeFile(
      path.join(wsPath, "workspace.json"),
      JSON.stringify({
        id: wsId,
        name: wsName,
        dirName: path.basename(wsPath),
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
      }, null, 2)
    );
    // 创建 graph.json
    await fs.writeFile(
      path.join(wsPath, "graph.json"),
      JSON.stringify({
        version: "5.0",
        nodes: { root: { id: "root", title: wsName, type: "root", children: [], status: "active" } },
        memos: {},
      }, null, 2)
    );
  }

  // 辅助函数：添加工作区到索引
  async function addToIndex(
    wsId: string,
    wsName: string,
    dirName: string,
    status: "active" | "archived"
  ): Promise<void> {
    const index = await json.readIndex();
    index.workspaces.push({
      id: wsId,
      name: wsName,
      dirName,
      projectRoot,
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await json.writeIndex(index);
  }

  // 获取工作区路径的辅助函数
  function getNormalPath(dirName: string): string {
    return fsAdapter.getWorkspacePath(projectRoot, dirName);
  }

  function getArchivePath(dirName: string): string {
    return fsAdapter.getArchivePath(projectRoot, dirName);
  }

  describe("归档一致性检测", () => {
    it("索引显示 archived 但文件在普通路径 → 检测到不一致", async () => {
      // 准备：创建工作区在普通路径，但索引标记为 archived
      const wsId = `ws-archived-wrong-${crypto.randomUUID().slice(0, 8)}`;
      const dirName = "archived-wrong";

      // 文件在普通路径
      const normalPath = getNormalPath(dirName);
      await createWorkspaceDir(normalPath, wsId, "Archived Wrong Location");

      // 索引标记为 archived
      await addToIndex(wsId, "Archived Wrong Location", dirName, "archived");

      // 执行诊断
      const result = await service.diagnose({ workspaceId: wsId });

      // 验证：应该检测到归档一致性问题
      expect(result.issues.length).toBeGreaterThan(0);
      const archiveIssue = result.issues.find(i =>
        i.id === "archive-location-mismatch" ||
        i.message.includes("归档") ||
        i.message.includes("archive")
      );
      expect(archiveIssue).toBeDefined();
      expect(archiveIssue?.severity).toBe("error");
    });

    it("索引显示 active 但文件在 archive/ 路径 → 检测到不一致", async () => {
      // 准备：创建工作区在 archive/ 路径，但索引标记为 active
      const wsId = `ws-active-wrong-${crypto.randomUUID().slice(0, 8)}`;
      const dirName = "active-wrong";

      // 文件在 archive/ 路径
      const archivePath = getArchivePath(dirName);
      await createWorkspaceDir(archivePath, wsId, "Active Wrong Location");

      // 索引标记为 active
      await addToIndex(wsId, "Active Wrong Location", dirName, "active");

      // 执行诊断
      const result = await service.diagnose({ workspaceId: wsId });

      // 验证：应该检测到归档一致性问题
      expect(result.issues.length).toBeGreaterThan(0);
      const archiveIssue = result.issues.find(i =>
        i.id === "archive-location-mismatch" ||
        i.message.includes("归档") ||
        i.message.includes("archive")
      );
      expect(archiveIssue).toBeDefined();
      expect(archiveIssue?.severity).toBe("error");
    });

    it("索引与文件位置一致（活跃在普通路径）→ 无归档问题", async () => {
      // 准备：创建活跃工作区在普通路径
      const wsId = `ws-active-correct-${crypto.randomUUID().slice(0, 8)}`;
      const dirName = "active-correct";

      const normalPath = getNormalPath(dirName);
      await createWorkspaceDir(normalPath, wsId, "Active Correct Location");
      await addToIndex(wsId, "Active Correct Location", dirName, "active");

      // 执行诊断
      const result = await service.diagnose({ workspaceId: wsId });

      // 验证：不应该有归档相关问题
      const archiveIssue = result.issues.find(i =>
        i.id === "archive-location-mismatch" ||
        i.message.includes("归档") ||
        i.message.includes("archive")
      );
      expect(archiveIssue).toBeUndefined();
    });

    it("索引与文件位置一致（归档在 archive/ 路径）→ 无归档问题", async () => {
      // 准备：创建归档工作区在 archive/ 路径
      const wsId = `ws-archived-correct-${crypto.randomUUID().slice(0, 8)}`;
      const dirName = "archived-correct";

      const archivePath = getArchivePath(dirName);
      await createWorkspaceDir(archivePath, wsId, "Archived Correct Location");
      await addToIndex(wsId, "Archived Correct Location", dirName, "archived");

      // 执行诊断
      const result = await service.diagnose({ workspaceId: wsId });

      // 验证：不应该有归档相关问题
      const archiveIssue = result.issues.find(i =>
        i.id === "archive-location-mismatch" ||
        i.message.includes("归档") ||
        i.message.includes("archive")
      );
      expect(archiveIssue).toBeUndefined();
    });
  });

  describe("归档一致性修复", () => {
    it("修复归档工作区位置：从普通路径迁移到 archive/", async () => {
      // 准备：创建工作区在普通路径，但索引标记为 archived
      const wsId = `ws-fix-archive-${crypto.randomUUID().slice(0, 8)}`;
      const dirName = "fix-archive";

      const normalPath = getNormalPath(dirName);
      const archivePath = getArchivePath(dirName);
      await createWorkspaceDir(normalPath, wsId, "Fix Archive Location");
      await addToIndex(wsId, "Fix Archive Location", dirName, "archived");

      // 执行修复
      const result = await service.repair({
        workspaceId: wsId,
        autoFix: true,
      });

      // 验证：工作区应该被迁移到 archive/ 路径
      expect(result.fixed).toBeGreaterThan(0);

      // 检查文件位置
      const normalExists = await fs.access(normalPath).then(() => true).catch(() => false);
      const archiveExists = await fs.access(archivePath).then(() => true).catch(() => false);

      expect(normalExists).toBe(false);
      expect(archiveExists).toBe(true);
    });

    it("修复活跃工作区位置：从 archive/ 路径迁移到普通路径", async () => {
      // 准备：创建工作区在 archive/ 路径，但索引标记为 active
      const wsId = `ws-fix-active-${crypto.randomUUID().slice(0, 8)}`;
      const dirName = "fix-active";

      const normalPath = getNormalPath(dirName);
      const archivePath = getArchivePath(dirName);
      await createWorkspaceDir(archivePath, wsId, "Fix Active Location");
      await addToIndex(wsId, "Fix Active Location", dirName, "active");

      // 执行修复
      const result = await service.repair({
        workspaceId: wsId,
        autoFix: true,
      });

      // 验证：工作区应该被迁移到普通路径
      expect(result.fixed).toBeGreaterThan(0);

      // 检查文件位置
      const normalExists = await fs.access(normalPath).then(() => true).catch(() => false);
      const archiveExists = await fs.access(archivePath).then(() => true).catch(() => false);

      expect(normalExists).toBe(true);
      expect(archiveExists).toBe(false);
    });
  });
});
