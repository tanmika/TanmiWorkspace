/**
 * ChangeService - listChanges summary 测试
 *
 * 测试用例：
 * - TC-SUM-001: summary=true 时 add 操作不含 content，有 lineCount
 * - TC-SUM-002: summary=true 时 overwrite 操作不含 originalContent/newContent，有 hasOriginal
 * - TC-SUM-003: summary=true 时 overwrite 操作无 originalContent 时 hasOriginal=false
 * - TC-SUM-004: summary=true 时 update 操作保留完整字段
 * - TC-SUM-005: summary=true 时 delete 操作保持不变
 * - TC-SUM-006: summary=false 时返回完整数据（默认行为不变）
 * - TC-SUM-007: summary 不传时返回完整数据（向后兼容）
 * - TC-SUM-008: summarizeRecord 对混合操作类型列表正确转换
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-change-summary-${crypto.randomUUID()}`;
const mockHomeDir = path.join(process.cwd(), testBasePath, "home");

// Mock os 模块
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => mockHomeDir,
  };
});

// 动态导入
const { FileSystemAdapter } = await import("../../src/storage/FileSystemAdapter.js");
const { JsonStorage } = await import("../../src/storage/JsonStorage.js");
const { MarkdownStorage } = await import("../../src/storage/MarkdownStorage.js");
const { WorkspaceService } = await import("../../src/services/WorkspaceService.js");
const { ChangeService } = await import("../../src/services/ChangeService.js");
const { NodeService } = await import("../../src/services/NodeService.js");

import type {
  ChangeRecord,
  ChangeRecordSummary,
  ChangeOperationAddSummary,
  ChangeOperationOverwriteSummary,
  ChangeOperationUpdate,
} from "../../src/types/change.js";

describe("ChangeService - listChanges summary", () => {
  let basePath: string;
  let projectRoot: string;
  let fsAdapter: InstanceType<typeof FileSystemAdapter>;
  let json: InstanceType<typeof JsonStorage>;
  let md: InstanceType<typeof MarkdownStorage>;
  let workspaceService: InstanceType<typeof WorkspaceService>;
  let changeService: InstanceType<typeof ChangeService>;
  let nodeService: InstanceType<typeof NodeService>;
  let workspaceId: string;

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
    changeService = new ChangeService(json, fsAdapter);
    nodeService = new NodeService(json, md, fsAdapter);

    const result = await workspaceService.init({
      name: "change-summary-test",
      goal: "Test listChanges summary",
      projectRoot,
    });
    workspaceId = result.workspaceId;
    projectRoot = result.projectRoot;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  // ===== 辅助函数：录入各种类型的变更 =====

  async function recordAddChange(content: string = "line1\nline2\nline3\n") {
    return changeService.recordChange({
      workspaceId,
      sessionId: "test-session",
      client: "claude-code",
      operation: {
        type: "add",
        filePath: "/tmp/test-file.ts",
        content,
      },
    });
  }

  async function recordOverwriteChange(opts?: { originalContent?: string; newContent?: string }) {
    return changeService.recordChange({
      workspaceId,
      sessionId: "test-session",
      client: "claude-code",
      operation: {
        type: "overwrite",
        filePath: "/tmp/test-file.ts",
        originalContent: opts?.originalContent,
        newContent: opts?.newContent,
      },
    });
  }

  async function recordUpdateChange() {
    return changeService.recordChange({
      workspaceId,
      sessionId: "test-session",
      client: "claude-code",
      operation: {
        type: "update",
        filePath: "/tmp/test-file.ts",
        oldLines: ["old line 1", "old line 2"],
        newLines: ["new line 1", "new line 2"],
        lineNumber: 10,
        contextBefore: ["before 1"],
        contextAfter: ["after 1"],
      },
    });
  }

  async function recordDeleteChange() {
    return changeService.recordChange({
      workspaceId,
      sessionId: "test-session",
      client: "claude-code",
      operation: {
        type: "delete",
        filePath: "/tmp/test-file.ts",
      },
    });
  }

  // ===== 测试用例 =====

  describe("TC-SUM-001: summary=true 时 add 操作不含 content，有 lineCount", () => {
    it("Given: 一条 add 变更, When: listChanges(summary=true), Then: operation 有 lineCount 无 content", async () => {
      const content = "line1\nline2\nline3";
      await recordAddChange(content);

      const result = await changeService.listChanges({
        workspaceId,
        summary: true,
      });

      expect(result.totalCount).toBe(1);
      const op = result.changes[0].operation as ChangeOperationAddSummary;
      expect(op.type).toBe("add");
      expect(op.lineCount).toBe(3);
      expect((op as any).content).toBeUndefined();
    });
  });

  describe("TC-SUM-002: summary=true 时 overwrite 操作不含 originalContent/newContent，有 hasOriginal=true", () => {
    it("Given: 一条含 originalContent 的 overwrite 变更, When: listChanges(summary=true), Then: hasOriginal=true 且无 originalContent/newContent", async () => {
      await recordOverwriteChange({
        originalContent: "old content here",
        newContent: "new content here",
      });

      const result = await changeService.listChanges({
        workspaceId,
        summary: true,
      });

      expect(result.totalCount).toBe(1);
      const op = result.changes[0].operation as ChangeOperationOverwriteSummary;
      expect(op.type).toBe("overwrite");
      expect(op.hasOriginal).toBe(true);
      expect((op as any).originalContent).toBeUndefined();
      expect((op as any).newContent).toBeUndefined();
    });
  });

  describe("TC-SUM-003: summary=true 时 overwrite 操作无 originalContent 时 hasOriginal=false", () => {
    it("Given: 一条无 originalContent 的 overwrite 变更, When: listChanges(summary=true), Then: hasOriginal=false", async () => {
      await recordOverwriteChange({
        newContent: "new content only",
      });

      const result = await changeService.listChanges({
        workspaceId,
        summary: true,
      });

      expect(result.totalCount).toBe(1);
      const op = result.changes[0].operation as ChangeOperationOverwriteSummary;
      expect(op.type).toBe("overwrite");
      expect(op.hasOriginal).toBe(false);
    });
  });

  describe("TC-SUM-004: summary=true 时 update 操作保留完整字段", () => {
    it("Given: 一条 update 变更, When: listChanges(summary=true), Then: 保留 oldLines/newLines/lineNumber/context", async () => {
      await recordUpdateChange();

      const result = await changeService.listChanges({
        workspaceId,
        summary: true,
      });

      expect(result.totalCount).toBe(1);
      const op = result.changes[0].operation as ChangeOperationUpdate;
      expect(op.type).toBe("update");
      expect(op.oldLines).toEqual(["old line 1", "old line 2"]);
      expect(op.newLines).toEqual(["new line 1", "new line 2"]);
      expect(op.lineNumber).toBe(10);
      expect(op.contextBefore).toEqual(["before 1"]);
      expect(op.contextAfter).toEqual(["after 1"]);
    });
  });

  describe("TC-SUM-005: summary=true 时 delete 操作保持不变", () => {
    it("Given: 一条 delete 变更, When: listChanges(summary=true), Then: 操作字段不变", async () => {
      await recordDeleteChange();

      const result = await changeService.listChanges({
        workspaceId,
        summary: true,
      });

      expect(result.totalCount).toBe(1);
      const op = result.changes[0].operation;
      expect(op.type).toBe("delete");
      expect(op.filePath).toBe("/tmp/test-file.ts");
    });
  });

  describe("TC-SUM-006: summary=false 时返回完整数据", () => {
    it("Given: 一条 add 变更, When: listChanges(summary=false), Then: operation 保留完整 content", async () => {
      const content = "line1\nline2\nline3";
      await recordAddChange(content);

      const result = await changeService.listChanges({
        workspaceId,
        summary: false,
      });

      expect(result.totalCount).toBe(1);
      const op = result.changes[0].operation;
      expect(op.type).toBe("add");
      expect((op as any).content).toBe(content);
      expect((op as any).lineCount).toBeUndefined();
    });
  });

  describe("TC-SUM-007: summary 不传时返回完整数据（向后兼容）", () => {
    it("Given: 一条 add 变更, When: listChanges(无 summary), Then: 返回完整数据", async () => {
      const content = "full content";
      await recordAddChange(content);

      const result = await changeService.listChanges({
        workspaceId,
      });

      expect(result.totalCount).toBe(1);
      const op = result.changes[0].operation;
      expect(op.type).toBe("add");
      expect((op as any).content).toBe(content);
    });
  });

  describe("TC-SUM-008: summarizeRecord 对混合操作类型列表正确转换", () => {
    it("Given: add+overwrite+update+delete 各一条, When: listChanges(summary=true), Then: 每条按规则精简", async () => {
      await recordAddChange("a\nb\nc\nd\ne");
      await recordOverwriteChange({ originalContent: "orig", newContent: "new" });
      await recordUpdateChange();
      await recordDeleteChange();

      const result = await changeService.listChanges({
        workspaceId,
        summary: true,
      });

      expect(result.totalCount).toBe(4);

      // add: lineCount=5, 无 content
      const addOp = result.changes.find(c => c.operation.type === "add")!.operation as ChangeOperationAddSummary;
      expect(addOp.lineCount).toBe(5);
      expect((addOp as any).content).toBeUndefined();

      // overwrite: hasOriginal=true, 无 originalContent/newContent
      const owOp = result.changes.find(c => c.operation.type === "overwrite")!.operation as ChangeOperationOverwriteSummary;
      expect(owOp.hasOriginal).toBe(true);
      expect((owOp as any).originalContent).toBeUndefined();
      expect((owOp as any).newContent).toBeUndefined();

      // update: 保留完整字段
      const upOp = result.changes.find(c => c.operation.type === "update")!.operation as ChangeOperationUpdate;
      expect(upOp.oldLines).toBeDefined();
      expect(upOp.newLines).toBeDefined();

      // delete: 保持不变
      const delOp = result.changes.find(c => c.operation.type === "delete")!.operation;
      expect(delOp.type).toBe("delete");
      expect(delOp.filePath).toBe("/tmp/test-file.ts");
    });
  });
});

describe("ChangeService.summarizeRecord - 静态方法单元测试", () => {
  it("should convert add operation: content -> lineCount", () => {
    const record: ChangeRecord = {
      id: "chg-test-001",
      nodeId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      sessionId: "sess-1",
      client: "claude-code",
      operation: {
        type: "add",
        filePath: "/tmp/file.ts",
        content: "line1\nline2\nline3",
      },
    };

    const summary = ChangeService.summarizeRecord(record);
    expect(summary.id).toBe(record.id);
    expect(summary.operation.type).toBe("add");
    const op = summary.operation as ChangeOperationAddSummary;
    expect(op.lineCount).toBe(3);
    expect((op as any).content).toBeUndefined();
  });

  it("should convert overwrite operation: originalContent/newContent -> hasOriginal", () => {
    const record: ChangeRecord = {
      id: "chg-test-002",
      nodeId: "node-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      sessionId: "sess-1",
      client: "cursor",
      operation: {
        type: "overwrite",
        filePath: "/tmp/file.ts",
        originalContent: "old stuff",
        newContent: "new stuff",
      },
    };

    const summary = ChangeService.summarizeRecord(record);
    const op = summary.operation as ChangeOperationOverwriteSummary;
    expect(op.hasOriginal).toBe(true);
    expect((op as any).originalContent).toBeUndefined();
    expect((op as any).newContent).toBeUndefined();
  });

  it("should convert overwrite without originalContent: hasOriginal=false", () => {
    const record: ChangeRecord = {
      id: "chg-test-003",
      nodeId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      sessionId: "sess-1",
      client: "claude-code",
      operation: {
        type: "overwrite",
        filePath: "/tmp/file.ts",
        newContent: "only new",
      },
    };

    const summary = ChangeService.summarizeRecord(record);
    const op = summary.operation as ChangeOperationOverwriteSummary;
    expect(op.hasOriginal).toBe(false);
  });

  it("should keep update operation unchanged", () => {
    const record: ChangeRecord = {
      id: "chg-test-004",
      nodeId: "node-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      sessionId: "sess-1",
      client: "opencode",
      operation: {
        type: "update",
        filePath: "/tmp/file.ts",
        oldLines: ["a"],
        newLines: ["b"],
        lineNumber: 5,
        contextBefore: ["ctx-b"],
        contextAfter: ["ctx-a"],
      },
    };

    const summary = ChangeService.summarizeRecord(record);
    const op = summary.operation as ChangeOperationUpdate;
    expect(op.oldLines).toEqual(["a"]);
    expect(op.newLines).toEqual(["b"]);
    expect(op.lineNumber).toBe(5);
    expect(op.contextBefore).toEqual(["ctx-b"]);
    expect(op.contextAfter).toEqual(["ctx-a"]);
  });

  it("should keep delete operation unchanged", () => {
    const record: ChangeRecord = {
      id: "chg-test-005",
      nodeId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      sessionId: "sess-1",
      client: "claude-code",
      operation: {
        type: "delete",
        filePath: "/tmp/deleted-file.ts",
      },
    };

    const summary = ChangeService.summarizeRecord(record);
    expect(summary.operation.type).toBe("delete");
    expect(summary.operation.filePath).toBe("/tmp/deleted-file.ts");
  });

  it("should handle add with empty content: lineCount=1 (single empty line)", () => {
    const record: ChangeRecord = {
      id: "chg-test-006",
      nodeId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      sessionId: "sess-1",
      client: "claude-code",
      operation: {
        type: "add",
        filePath: "/tmp/empty.ts",
        content: "",
      },
    };

    const summary = ChangeService.summarizeRecord(record);
    const op = summary.operation as ChangeOperationAddSummary;
    // "".split("\n") => [""] => length 1
    expect(op.lineCount).toBe(1);
  });

  it("should handle add with trailing newline correctly", () => {
    const record: ChangeRecord = {
      id: "chg-test-007",
      nodeId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      sessionId: "sess-1",
      client: "claude-code",
      operation: {
        type: "add",
        filePath: "/tmp/file.ts",
        content: "line1\nline2\n",
      },
    };

    const summary = ChangeService.summarizeRecord(record);
    const op = summary.operation as ChangeOperationAddSummary;
    // "line1\nline2\n".split("\n") => ["line1", "line2", ""] => length 3
    // 但实际文件是 2 行内容，所以 lineCount 应该反映 split 结果
    expect(op.lineCount).toBe(3);
  });
});
