/**
 * rebuild.ts 测试
 * 验证工作区验证函数对归档路径的处理
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { verifyWorkspace, FOLDER_NAME } from "../../src/cli/rebuild.js";
import type { WorkspaceEntry } from "../../src/types/workspace.js";

describe("verifyWorkspace", () => {
  let testBasePath: string;
  let testId: string;
  let projectRoot: string;

  beforeEach(() => {
    testId = crypto.randomUUID().slice(0, 8);
    testBasePath = path.join(process.cwd(), `.test-rebuild-${testId}`);
    projectRoot = testBasePath;

    // 创建项目目录结构
    fs.mkdirSync(path.join(projectRoot, FOLDER_NAME), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, FOLDER_NAME, "archive"), { recursive: true });
  });

  afterEach(() => {
    // 清理测试目录
    fs.rmSync(testBasePath, { recursive: true, force: true });
  });

  // 辅助函数：创建工作区目录和配置
  function createWorkspaceDir(wsPath: string, wsId: string, wsName: string): void {
    fs.mkdirSync(wsPath, { recursive: true });
    fs.writeFileSync(
      path.join(wsPath, "config.json"),
      JSON.stringify({ id: wsId, name: wsName }, null, 2)
    );
  }

  // 辅助函数：创建工作区条目
  function createEntry(
    id: string,
    name: string,
    dirName: string,
    status: "active" | "archived" | "error"
  ): WorkspaceEntry {
    return {
      id,
      name,
      dirName,
      projectRoot,
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  describe("归档路径处理", () => {
    it("活跃工作区在普通路径 → valid=true", () => {
      // 准备：活跃工作区在 .tanmi-workspace/ws-active/
      const wsId = `ws-active-${testId}`;
      const dirName = "ws-active";
      const wsPath = path.join(projectRoot, FOLDER_NAME, dirName);
      createWorkspaceDir(wsPath, wsId, "Active Workspace");

      const entry = createEntry(wsId, "Active Workspace", dirName, "active");

      // 执行
      const result = verifyWorkspace(entry);

      // 验证
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("归档工作区在 archive/ 路径 → valid=true", () => {
      // 准备：归档工作区在 .tanmi-workspace/archive/ws-archived/
      const wsId = `ws-archived-${testId}`;
      const dirName = "ws-archived";
      const wsPath = path.join(projectRoot, FOLDER_NAME, "archive", dirName);
      createWorkspaceDir(wsPath, wsId, "Archived Workspace");

      const entry = createEntry(wsId, "Archived Workspace", dirName, "archived");

      // 执行
      const result = verifyWorkspace(entry);

      // 验证：归档工作区应该在 archive/ 路径下被找到
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("归档工作区在普通路径 → valid=false（当前bug）", () => {
      // 准备：归档工作区错误地放在 .tanmi-workspace/ws-wrong/ 而不是 archive/
      const wsId = `ws-wrong-${testId}`;
      const dirName = "ws-wrong";
      const wsPath = path.join(projectRoot, FOLDER_NAME, dirName);
      createWorkspaceDir(wsPath, wsId, "Wrong Location Workspace");

      const entry = createEntry(wsId, "Wrong Location Workspace", dirName, "archived");

      // 执行
      const result = verifyWorkspace(entry);

      // 验证：归档工作区不应该在普通路径下被认为有效
      // 这是当前的 bug - 应该返回 valid=false，但当前实现返回 valid=true
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("归档");
    });

    it("活跃工作区在 archive/ 路径 → valid=false", () => {
      // 准备：活跃工作区错误地放在 .tanmi-workspace/archive/ws-wrong/
      const wsId = `ws-wrong-active-${testId}`;
      const dirName = "ws-wrong-active";
      const wsPath = path.join(projectRoot, FOLDER_NAME, "archive", dirName);
      createWorkspaceDir(wsPath, wsId, "Wrong Active Workspace");

      const entry = createEntry(wsId, "Wrong Active Workspace", dirName, "active");

      // 执行
      const result = verifyWorkspace(entry);

      // 验证：活跃工作区不应该在 archive/ 路径下被认为有效
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe("基本验证", () => {
    it("缺少 id 字段 → valid=false", () => {
      const entry = createEntry("", "Test", "test-dir", "active");
      entry.id = "";

      const result = verifyWorkspace(entry);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("id");
    });

    it("缺少 projectRoot 字段 → valid=false", () => {
      const entry = createEntry("ws-123", "Test", "test-dir", "active");
      entry.projectRoot = "";

      const result = verifyWorkspace(entry);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("projectRoot");
    });

    it("目录不存在 → valid=false", () => {
      const entry = createEntry(`ws-nonexist-${testId}`, "NonExistent", "nonexistent-dir", "active");

      const result = verifyWorkspace(entry);

      expect(result.valid).toBe(false);
    });
  });
});
