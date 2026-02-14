/**
 * ChangeService.revertChanges dryRun 测试
 *
 * 测试用例：
 * - TC-REVERT-DRY-001: dryRun=true + update 操作匹配成功 → 返回 success 但文件内容不变
 * - TC-REVERT-DRY-002: dryRun=true + update 操作匹配失败 → 返回失败原因（与正常回滚结构一致）
 * - TC-REVERT-DRY-003: dryRun=true + add 操作 → 返回 success 但文件不被删除
 * - TC-REVERT-DRY-004: dryRun=true + overwrite 操作（有 originalContent）→ 返回 success 但文件内容不变
 * - TC-REVERT-DRY-005: dryRun=true → 变更记录文件不被删除，索引不变
 * - TC-REVERT-DRY-006: dryRun=false（默认）→ 行为不变，文件被修改，记录被删除
 * - TC-REVERT-DRY-007: dryRun=true + 多个变更 → 逐一检查，返回每个的结果
 * - TC-REVERT-DRY-008: dryRun=true + 变更记录不存在 → 返回失败（与正常回滚一致）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-change-revert-${crypto.randomUUID()}`;
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
const { ChangeService } = await import("../../src/services/ChangeService.js");

describe("ChangeService.revertChanges dryRun", () => {
  let basePath: string;
  let projectRoot: string;
  let fsAdapter: InstanceType<typeof FileSystemAdapter>;
  let json: InstanceType<typeof JsonStorage>;
  let md: InstanceType<typeof MarkdownStorage>;
  let workspaceService: InstanceType<typeof WorkspaceService>;
  let nodeService: InstanceType<typeof NodeService>;
  let changeService: InstanceType<typeof ChangeService>;
  let workspaceId: string;
  let wsDirName: string;

  beforeEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {}

    basePath = path.join(process.cwd(), testBasePath);
    projectRoot = path.join(basePath, "project");

    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(projectRoot, { recursive: true });

    fsAdapter = new FileSystemAdapter();
    json = new JsonStorage(fsAdapter);
    md = new MarkdownStorage(fsAdapter);
    workspaceService = new WorkspaceService(json, md, fsAdapter);
    nodeService = new NodeService(json, md, fsAdapter);
    changeService = new ChangeService(json, fsAdapter);

    const result = await workspaceService.init({
      name: "revert-dryrun-test",
      goal: "Test revertChanges dryRun",
      projectRoot,
    });
    workspaceId = result.workspaceId;
    projectRoot = result.projectRoot;
    wsDirName = path.basename(result.path);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  // ========== 辅助函数 ==========

  /**
   * 创建一个测试文件并记录一个 update 变更
   * 返回 changeId 和文件路径
   */
  async function setupUpdateChange(opts?: {
    oldContent?: string;
    newContent?: string;
  }): Promise<{ changeId: string; filePath: string }> {
    const oldContent = opts?.oldContent ?? "line1\nline2\nline3\n";
    const newContent = opts?.newContent ?? "line1\nmodified-line2\nline3\n";

    const filePath = path.join(projectRoot, "test-file.txt");
    // 先写入修改后的内容（模拟变更已经发生）
    await fs.writeFile(filePath, newContent);

    const oldLines = "line2".split("\n");
    const newLines = "modified-line2".split("\n");

    // 通过 ChangeService 记录变更
    const recordResult = await changeService.recordChange({
      workspaceId,
      sessionId: "test-session",
      client: "claude-code",
      operation: {
        type: "update",
        filePath,
        oldLines,
        newLines,
      },
    });

    return { changeId: recordResult.changeId, filePath };
  }

  /**
   * 创建一个 add 类型的变更记录
   */
  async function setupAddChange(): Promise<{ changeId: string; filePath: string }> {
    const filePath = path.join(projectRoot, "new-file.txt");
    await fs.writeFile(filePath, "new file content\n");

    const recordResult = await changeService.recordChange({
      workspaceId,
      sessionId: "test-session",
      client: "claude-code",
      operation: {
        type: "add",
        filePath,
        content: "new file content\n",
      },
    });

    return { changeId: recordResult.changeId, filePath };
  }

  /**
   * 创建一个 overwrite 类型的变更记录
   */
  async function setupOverwriteChange(): Promise<{ changeId: string; filePath: string }> {
    const filePath = path.join(projectRoot, "overwrite-file.txt");
    await fs.writeFile(filePath, "new overwritten content\n");

    const recordResult = await changeService.recordChange({
      workspaceId,
      sessionId: "test-session",
      client: "claude-code",
      operation: {
        type: "overwrite",
        filePath,
        originalContent: "original content\n",
        newContent: "new overwritten content\n",
      },
    });

    return { changeId: recordResult.changeId, filePath };
  }

  // ========== 测试用例 ==========

  describe("TC-REVERT-DRY-001: dryRun=true + update 匹配成功 → 文件内容不变", () => {
    it("Given: 一个 update 变更记录且文件中可匹配, When: dryRun=true revert, Then: success=true 且文件内容未被修改", async () => {
      const { changeId, filePath } = await setupUpdateChange();
      const contentBefore = await fs.readFile(filePath, "utf-8");

      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: [changeId],
        dryRun: true,
      });

      // 应该返回成功
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].changeId).toBe(changeId);

      // 文件内容应该没有改变
      const contentAfter = await fs.readFile(filePath, "utf-8");
      expect(contentAfter).toBe(contentBefore);
    });
  });

  describe("TC-REVERT-DRY-002: dryRun=true + update 匹配失败 → 返回失败", () => {
    it("Given: 一个 update 变更记录但文件内容已变, When: dryRun=true revert, Then: success=false 且含失败原因", async () => {
      const { changeId, filePath } = await setupUpdateChange();

      // 修改文件内容使匹配失败
      await fs.writeFile(filePath, "completely-different-content\n");

      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: [changeId],
        dryRun: true,
      });

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].reason).toBeDefined();
    });
  });

  describe("TC-REVERT-DRY-003: dryRun=true + add 操作 → 文件不被删除", () => {
    it("Given: 一个 add 变更记录且文件存在, When: dryRun=true revert, Then: success=true 且文件仍存在", async () => {
      const { changeId, filePath } = await setupAddChange();

      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: [changeId],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.results[0].success).toBe(true);

      // 文件应该仍然存在
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe("TC-REVERT-DRY-004: dryRun=true + overwrite（有 originalContent）→ 文件内容不变", () => {
    it("Given: 一个 overwrite 变更记录有 originalContent, When: dryRun=true revert, Then: success=true 且文件内容未被还原", async () => {
      const { changeId, filePath } = await setupOverwriteChange();
      const contentBefore = await fs.readFile(filePath, "utf-8");

      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: [changeId],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.results[0].success).toBe(true);

      // 文件内容不应该变回 originalContent
      const contentAfter = await fs.readFile(filePath, "utf-8");
      expect(contentAfter).toBe(contentBefore);
      expect(contentAfter).toBe("new overwritten content\n");
    });
  });

  describe("TC-REVERT-DRY-005: dryRun=true → 变更记录文件和索引不变", () => {
    it("Given: 变更记录存在, When: dryRun=true revert, Then: 变更记录未被删除，索引未改变", async () => {
      const { changeId } = await setupUpdateChange();

      // 回滚前查看变更列表
      const listBefore = await changeService.listChanges({ workspaceId });

      await changeService.revertChanges({
        workspaceId,
        changeIds: [changeId],
        dryRun: true,
      });

      // 回滚后查看变更列表 — 应该与之前一致
      const listAfter = await changeService.listChanges({ workspaceId });
      expect(listAfter.totalCount).toBe(listBefore.totalCount);
      expect(listAfter.changes.map(c => c.id)).toEqual(listBefore.changes.map(c => c.id));
    });
  });

  describe("TC-REVERT-DRY-006: dryRun=false（默认）→ 正常回滚行为不变", () => {
    it("Given: 一个 update 变更记录, When: 默认 revert（无 dryRun）, Then: 文件被修改，记录被删除", async () => {
      const { changeId, filePath } = await setupUpdateChange();

      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: [changeId],
      });

      expect(result.success).toBe(true);
      expect(result.results[0].success).toBe(true);

      // 文件内容应该被还原
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("line2");
      expect(content).not.toContain("modified-line2");

      // 变更记录应该被删除
      const listAfter = await changeService.listChanges({ workspaceId });
      expect(listAfter.changes.find(c => c.id === changeId)).toBeUndefined();
    });

    it("Given: 一个 add 变更记录, When: 默认 revert（无 dryRun）, Then: 文件被删除", async () => {
      const { changeId, filePath } = await setupAddChange();

      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: [changeId],
      });

      expect(result.success).toBe(true);

      // 文件应该被删除
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(false);
    });
  });

  describe("TC-REVERT-DRY-007: dryRun=true + 多个变更 → 逐一检查", () => {
    it("Given: 多个变更记录（一个可回滚一个不可回滚）, When: dryRun=true revert, Then: 各自返回对应结果", async () => {
      const update = await setupUpdateChange();
      const add = await setupAddChange();

      // 删除 add 的文件使其回滚失败（文件不存在无法确认删除）
      // 注意：add 回滚是删除文件，如果文件不存在则失败
      await fs.rm(add.filePath, { force: true });

      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: [update.changeId, add.changeId],
        dryRun: true,
      });

      expect(result.success).toBe(false); // 不是全部成功
      expect(result.results).toHaveLength(2);

      const updateResult = result.results.find(r => r.changeId === update.changeId);
      const addResult = result.results.find(r => r.changeId === add.changeId);

      expect(updateResult?.success).toBe(true);
      expect(addResult?.success).toBe(false);

      // 即使 update 检查通过，文件也不应被修改
      const content = await fs.readFile(update.filePath, "utf-8");
      expect(content).toContain("modified-line2");
    });
  });

  describe("TC-REVERT-DRY-008: dryRun=true + 变更记录不存在 → 返回失败", () => {
    it("Given: changeId 不存在, When: dryRun=true revert, Then: success=false 含失败原因", async () => {
      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: ["non-existent-change-id"],
        dryRun: true,
      });

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].reason).toBeDefined();
      expect(result.results[0].changeId).toBe("non-existent-change-id");
    });
  });
});

// ========== 补充边界测试用例 ==========

describe("ChangeService.revertChanges dryRun - 边界场景", () => {
  let basePath: string;
  let projectRoot: string;
  let fsAdapter: InstanceType<typeof FileSystemAdapter>;
  let json: InstanceType<typeof JsonStorage>;
  let md: InstanceType<typeof MarkdownStorage>;
  let workspaceService: InstanceType<typeof WorkspaceService>;
  let nodeService: InstanceType<typeof NodeService>;
  let changeService: InstanceType<typeof ChangeService>;
  let workspaceId: string;
  let wsDirName: string;

  beforeEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {}

    basePath = path.join(process.cwd(), testBasePath);
    projectRoot = path.join(basePath, "project");

    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(projectRoot, { recursive: true });

    fsAdapter = new FileSystemAdapter();
    json = new JsonStorage(fsAdapter);
    md = new MarkdownStorage(fsAdapter);
    workspaceService = new WorkspaceService(json, md, fsAdapter);
    nodeService = new NodeService(json, md, fsAdapter);
    changeService = new ChangeService(json, fsAdapter);

    const result = await workspaceService.init({
      name: "revert-dryrun-edge-test",
      goal: "Test revertChanges dryRun edge cases",
      projectRoot,
    });
    workspaceId = result.workspaceId;
    projectRoot = result.projectRoot;
    wsDirName = path.basename(result.path);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  describe("TC-REVERT-DRY-009: 空 changeIds 数组 → 返回成功空结果", () => {
    it("Given: 空 changeIds 数组, When: dryRun=true revert, Then: success=true 且 results 为空数组", async () => {
      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: [],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });

    it("Given: 空 changeIds 数组, When: 默认 revert（无 dryRun）, Then: success=true 且 results 为空数组", async () => {
      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: [],
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe("TC-REVERT-DRY-010: dryRun=true + delete 操作 → 返回无法回滚", () => {
    it("Given: 一个 delete 变更记录, When: dryRun=true revert, Then: success=false 含无法回滚原因", async () => {
      // 记录一个 delete 操作
      const filePath = path.join(projectRoot, "deleted-file.txt");
      const recordResult = await changeService.recordChange({
        workspaceId,
        sessionId: "test-session",
        client: "claude-code",
        operation: {
          type: "delete",
          filePath,
        },
      });

      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: [recordResult.changeId],
        dryRun: true,
      });

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].reason).toContain("删除操作无法自动回滚");
    });
  });

  describe("TC-REVERT-DRY-011: dryRun=true + overwrite 无 originalContent → 返回无法回滚", () => {
    it("Given: 一个 overwrite 变更记录无 originalContent, When: dryRun=true revert, Then: success=false 含失败原因", async () => {
      const filePath = path.join(projectRoot, "overwrite-no-original.txt");
      await fs.writeFile(filePath, "some content\n");

      // 记录一个没有 originalContent 的 overwrite 操作
      const recordResult = await changeService.recordChange({
        workspaceId,
        sessionId: "test-session",
        client: "claude-code",
        operation: {
          type: "overwrite",
          filePath,
          newContent: "some content\n",
          // 故意不提供 originalContent
        },
      });

      const result = await changeService.revertChanges({
        workspaceId,
        changeIds: [recordResult.changeId],
        dryRun: true,
      });

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].reason).toContain("没有保存原始内容");
    });
  });
});
