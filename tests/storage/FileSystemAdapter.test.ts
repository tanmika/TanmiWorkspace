import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { FileSystemAdapter } from "../../src/storage/FileSystemAdapter.js";

describe("FileSystemAdapter", () => {
  const testBasePath = `.test-tanmi-workspace-fs-${crypto.randomUUID()}`;
  let adapter: FileSystemAdapter;
  let projectRoot: string;
  let homeDir: string;
  const originalHome = process.env.HOME;

  beforeEach(async () => {
    projectRoot = path.join(process.cwd(), testBasePath, "project");
    homeDir = path.join(process.cwd(), testBasePath, "home");
    process.env.HOME = homeDir;

    await fs.rm(path.join(process.cwd(), testBasePath), { recursive: true, force: true }).catch(() => {});

    adapter = new FileSystemAdapter();
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.rm(path.join(process.cwd(), testBasePath), { recursive: true, force: true }).catch(() => {});
  });

  describe("路径方法", () => {
    it("应该返回正确的索引路径", () => {
      expect(adapter.getIndexPath()).toBe(path.join(homeDir, adapter.getDirName(), "index.json"));
    });

    it("应该返回正确的工作区路径", () => {
      expect(adapter.getWorkspacePath(projectRoot, "ws-123")).toBe(
        path.join(projectRoot, adapter.getDirName(), "ws-123")
      );
    });

    it("应该返回正确的节点路径", () => {
      expect(adapter.getNodePath(projectRoot, "ws-123", "node-456")).toBe(
        path.join(projectRoot, adapter.getDirName(), "ws-123", "nodes", "node-456")
      );
    });
  });

  describe("文件操作", () => {
    it("应该能创建目录", async () => {
      const dirPath = path.join(projectRoot, "test-dir");
      await adapter.mkdir(dirPath);
      const exists = await adapter.exists(dirPath);
      expect(exists).toBe(true);
    });

    it("应该能写入和读取文件", async () => {
      const filePath = path.join(projectRoot, "test.txt");
      await adapter.writeFile(filePath, "hello world");
      const content = await adapter.readFile(filePath);
      expect(content).toBe("hello world");
    });

    it("应该能删除目录", async () => {
      const dirPath = path.join(projectRoot, "to-delete");
      await adapter.mkdir(dirPath);
      await adapter.writeFile(path.join(dirPath, "file.txt"), "content");
      await adapter.rmdir(dirPath);
      const exists = await adapter.exists(dirPath);
      expect(exists).toBe(false);
    });

    it("exists 应该正确检测文件存在", async () => {
      await adapter.ensureProjectDir(projectRoot);
      expect(await adapter.exists(projectRoot)).toBe(true);
      expect(await adapter.exists(path.join(projectRoot, "nonexistent"))).toBe(false);
    });
  });

  describe("初始化", () => {
    it("应该能初始化基础目录", async () => {
      await adapter.ensureGlobalDir();
      const exists = await adapter.exists(path.join(homeDir, adapter.getDirName()));
      expect(exists).toBe(true);
    });

    it("应该能初始化空的索引文件", async () => {
      await adapter.ensureIndex();
      const content = await adapter.readFile(adapter.getIndexPath());
      const index = JSON.parse(content);
      expect(index.version).toBe("2.0");
      expect(index.workspaces).toEqual([]);
    });
  });
});
