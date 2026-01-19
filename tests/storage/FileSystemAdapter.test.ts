import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { FileSystemAdapter } from "../../src/storage/FileSystemAdapter.js";

describe("FileSystemAdapter", () => {
  const testBasePath = `.test-tanmi-workspace-fs-${crypto.randomUUID()}`;
  let adapter: FileSystemAdapter;
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = path.join(process.cwd(), testBasePath, "project");
    await fs.rm(path.join(process.cwd(), testBasePath), { recursive: true, force: true }).catch(() => {});
    adapter = new FileSystemAdapter();
  });

  afterEach(async () => {
    await fs.rm(path.join(process.cwd(), testBasePath), { recursive: true, force: true }).catch(() => {});
  });

  describe("路径方法", () => {
    it("应该返回正确的索引路径结构", () => {
      const indexPath = adapter.getIndexPath();
      // 验证路径以正确的目录名和 index.json 结尾
      expect(indexPath).toContain(adapter.getDirName());
      expect(indexPath).toMatch(/index\.json$/);
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
      expect(await adapter.exists(path.join(projectRoot, adapter.getDirName()))).toBe(true);
      expect(await adapter.exists(path.join(projectRoot, "nonexistent"))).toBe(false);
    });
  });

  describe("初始化", () => {
    it("应该能初始化项目目录", async () => {
      await adapter.ensureProjectDir(projectRoot);
      const exists = await adapter.exists(path.join(projectRoot, adapter.getDirName()));
      expect(exists).toBe(true);
    });

    it("ensureIndex 应该创建有效的索引文件结构", async () => {
      await adapter.ensureIndex();
      const content = await adapter.readFile(adapter.getIndexPath());
      const index = JSON.parse(content);
      // 验证索引文件有必要的字段
      expect(index).toHaveProperty("version");
      expect(index).toHaveProperty("workspaces");
      expect(Array.isArray(index.workspaces)).toBe(true);
    });
  });
});
