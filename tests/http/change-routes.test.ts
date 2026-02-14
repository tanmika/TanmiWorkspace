/**
 * HTTP change 路由测试
 *
 * 测试用例：
 * - TC-HTTP-CHG-001: GET /workspaces/:wid/nodes/:nid/changes — 返回节点变更列表
 * - TC-HTTP-CHG-002: GET /workspaces/:wid/nodes/:nid/changes?summary=true — 返回精简变更列表
 * - TC-HTTP-CHG-003: GET /workspaces/:wid/nodes/:nid/changes — 节点不存在返回 404
 * - TC-HTTP-CHG-004: GET /workspaces/:wid/changes/ambiguous — 返回 ambiguous 数量
 * - TC-HTTP-CHG-005: GET /workspaces/:wid/changes/ambiguous — 无 ambiguous 时返回 0
 * - TC-HTTP-CHG-006: POST /workspaces/:wid/changes/revert — 成功回滚
 * - TC-HTTP-CHG-007: POST /workspaces/:wid/changes/revert — changeIds 为空数组返回 400
 * - TC-HTTP-CHG-008: POST /workspaces/:wid/changes/revert — 不存在的 changeId 返回部分失败
 * - TC-HTTP-CHG-009: POST /workspaces/:wid/changes/revert-check — dry-run 成功但不修改文件
 * - TC-HTTP-CHG-010: POST /workspaces/:wid/changes/revert-check — dry-run 检查失败
 * - TC-HTTP-CHG-011: 工作区不存在时所有端点返回 404
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-change-routes-${crypto.randomUUID()}`;
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
const { NodeService } = await import("../../src/services/NodeService.js");
const { StateService } = await import("../../src/services/StateService.js");
const { ChangeService } = await import("../../src/services/ChangeService.js");

// Fastify 相关
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { changeRoutes } from "../../src/http/routes/change.js";

// Mock getServices，使路由可以访问我们创建的服务实例
vi.mock("../../src/http/services.js", () => {
  return {
    getServices: () => mockServices,
    resolveWsDirName: vi.fn(),
    resolveDirNames: vi.fn(),
  };
});

// 模块级变量，由 beforeEach 填充
let mockServices: any;

describe("HTTP change routes", () => {
  let basePath: string;
  let projectRoot: string;
  let fsAdapter: InstanceType<typeof FileSystemAdapter>;
  let json: InstanceType<typeof JsonStorage>;
  let md: InstanceType<typeof MarkdownStorage>;
  let workspaceService: InstanceType<typeof WorkspaceService>;
  let nodeService: InstanceType<typeof NodeService>;
  let stateService: InstanceType<typeof StateService>;
  let changeService: InstanceType<typeof ChangeService>;
  let workspaceId: string;
  let server: FastifyInstance;

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
    stateService = new StateService(json, md, fsAdapter);
    changeService = new ChangeService(json, fsAdapter);

    // 设置服务依赖
    workspaceService.setStateService(stateService);
    nodeService.setStateService(stateService);

    const result = await workspaceService.init({
      name: "change-routes-test",
      goal: "Test HTTP change routes",
      projectRoot,
    });
    workspaceId = result.workspaceId;
    projectRoot = result.projectRoot;

    // 设置 mock services
    mockServices = {
      change: changeService,
      workspace: workspaceService,
      node: nodeService,
      state: stateService,
      json,
      md,
      fs: fsAdapter,
    };

    // 创建 Fastify 实例并注册路由
    server = Fastify();
    await server.register(changeRoutes, { prefix: "/api" });
    await server.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await server.close();
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  // ===== 辅助函数 =====

  /**
   * 创建一个执行节点并推进到 implementing 状态
   */
  async function createExecutionNode(): Promise<string> {
    // 先 start 根节点
    const listResult = await nodeService.list({ workspaceId });
    const rootId = listResult.rootId;
    await stateService.transition({
      workspaceId,
      nodeId: rootId,
      action: "start",
    });

    // 创建执行节点
    const nodeResult = await nodeService.create({
      workspaceId,
      parentId: rootId,
      type: "execution",
      title: "test-exec-node",
      requirement: "test requirement",
    });

    // 推进到 implementing
    await stateService.transition({
      workspaceId,
      nodeId: nodeResult.nodeId,
      action: "start",
    });

    return nodeResult.nodeId;
  }

  /**
   * 记录一个 update 类型的变更到指定节点
   */
  async function recordUpdateChange(nodeId?: string): Promise<string> {
    const filePath = path.join(projectRoot, `test-file-${Date.now()}.txt`);
    await fs.writeFile(filePath, "line1\nmodified\nline3\n");

    const result = await changeService.recordChange({
      workspaceId,
      sessionId: "test-session",
      client: "claude-code",
      operation: {
        type: "update",
        filePath,
        oldLines: ["original"],
        newLines: ["modified"],
      },
      nodeId,
    });

    return result.changeId;
  }

  /**
   * 记录一个 add 类型的 ambiguous 变更（无活跃节点时自动 ambiguous）
   */
  async function recordAmbiguousChange(): Promise<string> {
    const result = await changeService.recordChange({
      workspaceId,
      sessionId: "test-session",
      client: "claude-code",
      operation: {
        type: "add",
        filePath: `/tmp/ambiguous-${Date.now()}.txt`,
        content: "ambiguous content",
      },
    });

    return result.changeId;
  }

  // ===== 测试用例 =====

  describe("GET /api/workspaces/:wid/nodes/:nid/changes", () => {
    it("TC-HTTP-CHG-001: 返回节点变更列表", async () => {
      const nodeId = await createExecutionNode();
      const changeId = await recordUpdateChange(nodeId);

      const response = await server.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/nodes/${nodeId}/changes`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.totalCount).toBeGreaterThanOrEqual(1);
      expect(body.changes).toBeInstanceOf(Array);
      expect(body.changes.some((c: any) => c.id === changeId)).toBe(true);
    });

    it("TC-HTTP-CHG-002: summary=true 返回精简变更列表", async () => {
      const nodeId = await createExecutionNode();

      // 记录一个 add 变更
      await changeService.recordChange({
        workspaceId,
        sessionId: "test-session",
        client: "claude-code",
        operation: {
          type: "add",
          filePath: "/tmp/summary-test.txt",
          content: "line1\nline2\nline3",
        },
        nodeId,
      });

      const response = await server.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/nodes/${nodeId}/changes?summary=true`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.totalCount).toBeGreaterThanOrEqual(1);

      // summary 模式下 add 操作应有 lineCount 而不是 content
      const addChange = body.changes.find((c: any) => c.operation.type === "add");
      if (addChange) {
        expect(addChange.operation.lineCount).toBeDefined();
        expect(addChange.operation.content).toBeUndefined();
      }
    });

    it("TC-HTTP-CHG-003: 节点不存在返回 404", async () => {
      const response = await server.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/nodes/non-existent-node/changes`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /api/workspaces/:wid/changes/ambiguous", () => {
    it("TC-HTTP-CHG-004: 返回 ambiguous 变更数量", async () => {
      // 记录 ambiguous 变更（无活跃节点时自动 ambiguous）
      await recordAmbiguousChange();
      await recordAmbiguousChange();

      const response = await server.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/changes/ambiguous`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.count).toBe(2);
    });

    it("TC-HTTP-CHG-005: 无 ambiguous 时返回 0", async () => {
      const response = await server.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/changes/ambiguous`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.count).toBe(0);
    });
  });

  describe("POST /api/workspaces/:wid/changes/revert", () => {
    it("TC-HTTP-CHG-006: 成功回滚变更", async () => {
      const nodeId = await createExecutionNode();
      const filePath = path.join(projectRoot, "revert-test.txt");
      await fs.writeFile(filePath, "line1\nmodified\nline3\n");

      const recordResult = await changeService.recordChange({
        workspaceId,
        sessionId: "test-session",
        client: "claude-code",
        operation: {
          type: "add",
          filePath,
          content: "line1\nmodified\nline3\n",
        },
        nodeId,
      });

      const response = await server.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/changes/revert`,
        payload: { changeIds: [recordResult.changeId] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.results).toBeInstanceOf(Array);
      expect(body.results[0].success).toBe(true);
    });

    it("TC-HTTP-CHG-007: changeIds 为空数组返回 400 (schema validation)", async () => {
      const response = await server.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/changes/revert`,
        payload: { changeIds: [] },
      });

      expect(response.statusCode).toBe(400);
    });

    it("TC-HTTP-CHG-008: 不存在的 changeId 返回部分失败结果", async () => {
      const response = await server.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/changes/revert`,
        payload: { changeIds: ["non-existent-change-id"] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.results[0].success).toBe(false);
      expect(body.results[0].reason).toBeDefined();
    });
  });

  describe("POST /api/workspaces/:wid/changes/revert-check", () => {
    it("TC-HTTP-CHG-009: dry-run 成功但不修改文件", async () => {
      const nodeId = await createExecutionNode();
      const filePath = path.join(projectRoot, "dryrun-test.txt");
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
        nodeId,
      });

      const response = await server.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/changes/revert-check`,
        payload: { changeIds: [recordResult.changeId] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.results[0].success).toBe(true);

      // 文件应该仍然存在（dry-run 不修改）
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it("TC-HTTP-CHG-010: dry-run 检查失败", async () => {
      const response = await server.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/changes/revert-check`,
        payload: { changeIds: ["non-existent-id"] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.results[0].success).toBe(false);
    });
  });

  describe("工作区不存在时", () => {
    it("TC-HTTP-CHG-011: 所有端点返回 404", async () => {
      const fakeWid = "non-existent-workspace";

      // GET changes
      const r1 = await server.inject({
        method: "GET",
        url: `/api/workspaces/${fakeWid}/nodes/some-node/changes`,
      });
      expect(r1.statusCode).toBe(404);

      // GET ambiguous
      const r2 = await server.inject({
        method: "GET",
        url: `/api/workspaces/${fakeWid}/changes/ambiguous`,
      });
      expect(r2.statusCode).toBe(404);

      // POST revert
      const r3 = await server.inject({
        method: "POST",
        url: `/api/workspaces/${fakeWid}/changes/revert`,
        payload: { changeIds: ["some-id"] },
      });
      expect(r3.statusCode).toBe(404);

      // POST revert-check
      const r4 = await server.inject({
        method: "POST",
        url: `/api/workspaces/${fakeWid}/changes/revert-check`,
        payload: { changeIds: ["some-id"] },
      });
      expect(r4.statusCode).toBe(404);
    });
  });
});

// ========== 补充边界测试用例 ==========

describe("HTTP change routes - 边界场景", () => {
  let basePath: string;
  let projectRoot: string;
  let fsAdapter: InstanceType<typeof FileSystemAdapter>;
  let json: InstanceType<typeof JsonStorage>;
  let md: InstanceType<typeof MarkdownStorage>;
  let workspaceService: InstanceType<typeof WorkspaceService>;
  let nodeService: InstanceType<typeof NodeService>;
  let stateService: InstanceType<typeof StateService>;
  let changeService: InstanceType<typeof ChangeService>;
  let workspaceId: string;
  let server: FastifyInstance;

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
    stateService = new StateService(json, md, fsAdapter);
    changeService = new ChangeService(json, fsAdapter);

    workspaceService.setStateService(stateService);
    nodeService.setStateService(stateService);

    const result = await workspaceService.init({
      name: "change-routes-edge-test",
      goal: "Test HTTP change routes edge cases",
      projectRoot,
    });
    workspaceId = result.workspaceId;
    projectRoot = result.projectRoot;

    mockServices = {
      change: changeService,
      workspace: workspaceService,
      node: nodeService,
      state: stateService,
      json,
      md,
      fs: fsAdapter,
    };

    server = Fastify();
    await server.register(changeRoutes, { prefix: "/api" });
    await server.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await server.close();
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  async function createExecutionNode(): Promise<string> {
    const listResult = await nodeService.list({ workspaceId });
    const rootId = listResult.rootId;
    await stateService.transition({
      workspaceId,
      nodeId: rootId,
      action: "start",
    });
    const nodeResult = await nodeService.create({
      workspaceId,
      parentId: rootId,
      type: "execution",
      title: "edge-test-node",
      requirement: "edge test requirement",
    });
    await stateService.transition({
      workspaceId,
      nodeId: nodeResult.nodeId,
      action: "start",
    });
    return nodeResult.nodeId;
  }

  describe("Schema validation 边界", () => {
    it("TC-HTTP-CHG-012: POST /revert 缺少 body → 400", async () => {
      const response = await server.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/changes/revert`,
      });

      expect(response.statusCode).toBe(400);
    });

    it("TC-HTTP-CHG-013: POST /revert-check 空 changeIds → 400", async () => {
      const response = await server.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/changes/revert-check`,
        payload: { changeIds: [] },
      });

      expect(response.statusCode).toBe(400);
    });

    it("TC-HTTP-CHG-014: POST /revert body 含额外字段 → Fastify 静默移除额外字段后正常处理", async () => {
      const response = await server.inject({
        method: "POST",
        url: `/api/workspaces/${workspaceId}/changes/revert`,
        payload: { changeIds: ["some-id"], extraField: "not-allowed" },
      });
      // Fastify 默认 removeAdditional: true，额外字段被静默移除，请求正常处理
      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /nodes/:nid/changes 边界", () => {
    it("TC-HTTP-CHG-015: 节点无变更时返回空列表", async () => {
      const nodeId = await createExecutionNode();
      const response = await server.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/nodes/${nodeId}/changes`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.totalCount).toBe(0);
      expect(body.changes).toEqual([]);
    });

    it("TC-HTTP-CHG-016: summary=false 返回完整数据（与不传 summary 一致）", async () => {
      const nodeId = await createExecutionNode();

      await changeService.recordChange({
        workspaceId,
        sessionId: "test-session",
        client: "claude-code",
        operation: {
          type: "add",
          filePath: "/tmp/summary-false-test.txt",
          content: "line1\nline2\n",
        },
        nodeId,
      });

      const response = await server.inject({
        method: "GET",
        url: `/api/workspaces/${workspaceId}/nodes/${nodeId}/changes?summary=false`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.totalCount).toBeGreaterThanOrEqual(1);

      // summary=false 时 add 操作应有 content 字段（完整数据）
      const addChange = body.changes.find((c: any) => c.operation.type === "add");
      if (addChange) {
        expect(addChange.operation.content).toBeDefined();
      }
    });
  });
});
