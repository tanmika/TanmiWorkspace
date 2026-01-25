import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { JsonStorage } from "../../src/storage/JsonStorage.js";
import { FileSystemAdapter } from "../../src/storage/FileSystemAdapter.js";

describe("JsonStorage", () => {
  let testBasePath: string;
  let testGlobalPath: string;
  let testId: string;
  let jsonStorage: JsonStorage;
  let fsAdapter: FileSystemAdapter;
  let projectRoot: string;

  beforeEach(async () => {
    testId = crypto.randomUUID().slice(0, 8);
    testBasePath = `.test-tanmi-workspace-json-${testId}`;
    testGlobalPath = path.join(process.cwd(), testBasePath, "global");
    projectRoot = path.join(process.cwd(), testBasePath, "project");
    await fs.rm(path.join(process.cwd(), testBasePath), { recursive: true, force: true }).catch(() => {});
    // 使用隔离的测试全局路径
    fsAdapter = new FileSystemAdapter(testGlobalPath);
    jsonStorage = new JsonStorage(fsAdapter);
  });

  afterEach(async () => {
    // 直接删除隔离的测试目录即可，不需要清理全局索引
    await fs.rm(path.join(process.cwd(), testBasePath), { recursive: true, force: true }).catch(() => {});
  });

  describe("getWorkspaceLocation", () => {
    it("应该返回 isArchived=false 对于活跃工作区", async () => {
      // 准备：创建一个活跃状态的工作区索引
      const wsId = `ws-active-${testId}`;
      await fsAdapter.ensureIndex();
      const index = await jsonStorage.readIndex();
      index.workspaces.push({
        id: wsId,
        name: "Active Workspace",
        dirName: "active_ws",
        projectRoot: projectRoot,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await jsonStorage.writeIndex(index);

      // 执行
      const location = await jsonStorage.getWorkspaceLocation(wsId);

      // 验证
      expect(location).not.toBeNull();
      expect(location!.projectRoot).toBe(projectRoot);
      expect(location!.dirName).toBe("active_ws");
      expect(location!.isArchived).toBe(false);
    });

    it("应该返回 isArchived=true 对于归档工作区", async () => {
      // 准备：创建一个归档状态的工作区索引
      const wsId = `ws-archived-${testId}`;
      await fsAdapter.ensureIndex();
      const index = await jsonStorage.readIndex();
      index.workspaces.push({
        id: wsId,
        name: "Archived Workspace",
        dirName: "archived_ws",
        projectRoot: projectRoot,
        status: "archived",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await jsonStorage.writeIndex(index);

      // 执行
      const location = await jsonStorage.getWorkspaceLocation(wsId);

      // 验证
      expect(location).not.toBeNull();
      expect(location!.projectRoot).toBe(projectRoot);
      expect(location!.dirName).toBe("archived_ws");
      expect(location!.isArchived).toBe(true);
    });

    it("应该返回 isArchived=false 对于错误状态工作区", async () => {
      // 准备：创建一个错误状态的工作区索引
      const wsId = `ws-error-${testId}`;
      await fsAdapter.ensureIndex();
      const index = await jsonStorage.readIndex();
      index.workspaces.push({
        id: wsId,
        name: "Error Workspace",
        dirName: "error_ws",
        projectRoot: projectRoot,
        status: "error",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await jsonStorage.writeIndex(index);

      // 执行
      const location = await jsonStorage.getWorkspaceLocation(wsId);

      // 验证
      expect(location).not.toBeNull();
      expect(location!.isArchived).toBe(false);
    });

    it("应该返回 null 对于不存在的工作区", async () => {
      await fsAdapter.ensureIndex();

      const location = await jsonStorage.getWorkspaceLocation("ws-nonexistent");

      expect(location).toBeNull();
    });

    it("应该返回 null 对于缺少 projectRoot 的工作区", async () => {
      const wsId = `ws-no-root-${testId}`;
      await fsAdapter.ensureIndex();
      const index = await jsonStorage.readIndex();
      index.workspaces.push({
        id: wsId,
        name: "No Root Workspace",
        dirName: "no_root_ws",
        projectRoot: "", // 空 projectRoot
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await jsonStorage.writeIndex(index);

      const location = await jsonStorage.getWorkspaceLocation(wsId);

      expect(location).toBeNull();
    });
  });
});
