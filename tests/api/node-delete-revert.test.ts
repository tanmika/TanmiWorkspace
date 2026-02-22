/**
 * DELETE /api/workspaces/:wid/nodes/:nid?revert=true 路由增强测试
 *
 * 测试用例：
 * - TC-DEL-REVERT-001: revert=true + 全部可回滚 → 回滚成功 + 节点删除 + 变更记录清理
 * - TC-DEL-REVERT-002: revert=true + 部分不可回滚 → 返回失败详情，节点不删除
 * - TC-DEL-REVERT-003: revert=true + 节点无变更记录 → 正常删除节点
 * - TC-DEL-REVERT-004: 无 revert 参数 → 保持原有删除行为
 * - TC-DEL-REVERT-005: revert=false → 与无 revert 参数行为一致
 * - TC-DEL-REVERT-006: revert=true + 节点不存在 → 返回 404
 * - TC-DEL-REVERT-007: revert=true + 多个变更（mix add/update）→ 全部可回滚则成功
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

// 为每个测试文件生成唯一的测试目录（隔离本地数据）
const testId = crypto.randomUUID().slice(0, 8);
const testBasePath = `.test-del-revert-${testId}`;
const mockHomeDir = path.join(process.cwd(), testBasePath, "home");

// Mock os 模块，使 homedir() 返回测试专用目录
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => mockHomeDir,
  };
});

// 响应类型定义
interface DeleteSuccessResponse {
  success: boolean;
  deletedNodeId: string;
  manualOperationRecorded?: boolean;
}

interface DeleteRevertFailResponse {
  success: false;
  error: string;
  revertResults?: Array<{
    changeId: string;
    success: boolean;
    reason?: string;
  }>;
}

type DeleteResponse = DeleteSuccessResponse | DeleteRevertFailResponse;

describe("DELETE /api/workspaces/:wid/nodes/:nid with revert", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    // 确保测试目录存在
    await fs.mkdir(mockHomeDir, { recursive: true });

    // 动态导入（在 mock 生效后）
    const { createServer } = await import("../../src/http/server.js");
    server = await createServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    // 清理测试目录
    await fs.rm(path.join(process.cwd(), testBasePath), { recursive: true, force: true }).catch(() => {});
  });

  /**
   * 辅助：创建一个工作区 + execution 节点，返回 wid 和 nid
   */
  async function createWorkspaceAndNode(): Promise<{
    wid: string;
    nid: string;
    projectRoot: string;
  }> {
    // 先创建 projectRoot 目录（validateProjectRoot 要求目录在 home/cwd 下且已存在）
    const projectRootPath = path.join(process.cwd(), testBasePath, `project-${Date.now()}`);
    await fs.mkdir(projectRootPath, { recursive: true });

    // 通过 API 创建工作区
    const initRes = await server.inject({
      method: "POST",
      url: "/api/workspaces",
      payload: {
        name: `test-del-revert-${Date.now()}`,
        goal: "Test delete with revert",
        projectRoot: projectRootPath,
      },
    });

    expect(initRes.statusCode).toBe(201);
    const wsBody = JSON.parse(initRes.body);
    const wid = wsBody.workspaceId;
    const projectRoot = wsBody.projectRoot;

    // 获取 root 节点 ID
    const listRes = await server.inject({
      method: "GET",
      url: `/api/workspaces/${wid}/nodes`,
    });
    const tree = JSON.parse(listRes.body);
    const rootId = tree.rootId;

    // 创建一个 execution 节点
    const createRes = await server.inject({
      method: "POST",
      url: `/api/workspaces/${wid}/nodes`,
      payload: {
        parentId: rootId,
        type: "execution",
        title: "test-node-for-revert",
      },
    });
    const nodeBody = JSON.parse(createRes.body);

    return { wid, nid: nodeBody.nodeId, projectRoot };
  }

  /**
   * 辅助：通过 ChangeService 直接为节点创建一条 update 变更记录
   * 需要先在 projectRoot 下创建对应文件
   */
  async function createUpdateChange(
    wid: string,
    nid: string,
    projectRoot: string,
    fileName?: string,
  ): Promise<{ changeId: string; filePath: string }> {
    const { getServices } = await import("../../src/http/services.js");
    const services = getServices();

    const fName = fileName ?? `test-${Date.now()}.txt`;
    const filePath = path.join(projectRoot, fName);
    await fs.writeFile(filePath, "line1\nmodified-line2\nline3\n");

    // 记录变更
    const result = await services.change.recordChange({
      workspaceId: wid,
      sessionId: "test-session",
      client: "claude-code",
      operation: {
        type: "update",
        filePath,
        oldLines: ["line2"],
        newLines: ["modified-line2"],
      },
      nodeId: nid,
    });

    // claim 变更到节点（如果记录时未自动归属）
    if (result.isAmbiguous) {
      await services.change.claimChanges({
        workspaceId: wid,
        nodeId: nid,
        changeIds: [result.changeId],
      });
    }

    return { changeId: result.changeId, filePath };
  }

  /**
   * 辅助：创建一条 add 类型变更记录
   */
  async function createAddChange(
    wid: string,
    nid: string,
    projectRoot: string,
  ): Promise<{ changeId: string; filePath: string }> {
    const { getServices } = await import("../../src/http/services.js");
    const services = getServices();

    const filePath = path.join(projectRoot, `new-file-${Date.now()}.txt`);
    await fs.writeFile(filePath, "brand new content\n");

    const result = await services.change.recordChange({
      workspaceId: wid,
      sessionId: "test-session",
      client: "claude-code",
      operation: {
        type: "add",
        filePath,
        content: "brand new content\n",
      },
      nodeId: nid,
    });

    if (result.isAmbiguous) {
      await services.change.claimChanges({
        workspaceId: wid,
        nodeId: nid,
        changeIds: [result.changeId],
      });
    }

    return { changeId: result.changeId, filePath };
  }

  // ========== 测试用例 ==========

  describe("TC-DEL-REVERT-001: revert=true + 全部可回滚 → 回滚成功 + 节点删除", () => {
    it("Given: 节点有一条 update 变更且文件可匹配, When: DELETE ?revert=true, Then: 200 + 文件被回滚 + 节点被删除 + 变更记录被清理", async () => {
      const { wid, nid, projectRoot } = await createWorkspaceAndNode();
      const { filePath } = await createUpdateChange(wid, nid, projectRoot);

      const response = await server.inject({
        method: "DELETE",
        url: `/api/workspaces/${wid}/nodes/${nid}?revert=true`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as DeleteResponse;
      expect(body.success).toBe(true);

      // 文件内容应被回滚（modified-line2 → line2）
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("line2");
      expect(content).not.toContain("modified-line2");

      // 节点应该被删除（获取应该 404）
      const getRes = await server.inject({
        method: "GET",
        url: `/api/workspaces/${wid}/nodes/${nid}`,
      });
      expect(getRes.statusCode).toBe(404);

      // 变更记录应被清理（节点已删除，listChanges 会抛 NODE_NOT_FOUND）
      const { getServices } = await import("../../src/http/services.js");
      const services = getServices();
      await expect(
        services.change.listChanges({ workspaceId: wid, nodeId: nid })
      ).rejects.toThrow("不存在");
    });
  });

  describe("TC-DEL-REVERT-002: revert=true + 部分不可回滚 → 返回失败，节点不删除", () => {
    it("Given: 节点有变更但文件内容已变导致匹配失败, When: DELETE ?revert=true, Then: 返回失败详情 + 节点仍存在", async () => {
      const { wid, nid, projectRoot } = await createWorkspaceAndNode();
      const { filePath } = await createUpdateChange(wid, nid, projectRoot);

      // 篡改文件内容使回滚匹配失败
      await fs.writeFile(filePath, "completely-different-content\n");

      const response = await server.inject({
        method: "DELETE",
        url: `/api/workspaces/${wid}/nodes/${nid}?revert=true`,
      });

      // 应返回失败（具体状态码由实现决定，可能 409 或 200 + success:false）
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);

      // 应包含失败详情
      expect(body.revertResults).toBeDefined();
      expect(Array.isArray(body.revertResults)).toBe(true);
      const failedItem = body.revertResults.find((r: { success: boolean }) => !r.success);
      expect(failedItem).toBeDefined();
      expect(failedItem.reason).toBeDefined();

      // 节点应该仍存在
      const getRes = await server.inject({
        method: "GET",
        url: `/api/workspaces/${wid}/nodes/${nid}`,
      });
      expect(getRes.statusCode).toBe(200);
    });
  });

  describe("TC-DEL-REVERT-003: revert=true + 节点无变更记录 → 正常删除", () => {
    it("Given: 节点没有任何变更记录, When: DELETE ?revert=true, Then: 正常删除节点", async () => {
      const { wid, nid } = await createWorkspaceAndNode();

      const response = await server.inject({
        method: "DELETE",
        url: `/api/workspaces/${wid}/nodes/${nid}?revert=true`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // 节点应该被删除
      const getRes = await server.inject({
        method: "GET",
        url: `/api/workspaces/${wid}/nodes/${nid}`,
      });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe("TC-DEL-REVERT-004: 无 revert 参数 → 保持原有删除行为", () => {
    it("Given: 节点存在（有变更记录）, When: DELETE 无 revert 参数, Then: 直接删除节点不回滚", async () => {
      const { wid, nid, projectRoot } = await createWorkspaceAndNode();
      const { filePath } = await createUpdateChange(wid, nid, projectRoot);
      const contentBefore = await fs.readFile(filePath, "utf-8");

      const response = await server.inject({
        method: "DELETE",
        url: `/api/workspaces/${wid}/nodes/${nid}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // 文件内容不应被回滚（因为没有 revert 参数）
      const contentAfter = await fs.readFile(filePath, "utf-8");
      expect(contentAfter).toBe(contentBefore);
    });
  });

  describe("TC-DEL-REVERT-005: revert=false → 与无 revert 参数行为一致", () => {
    it("Given: 节点存在, When: DELETE ?revert=false, Then: 直接删除不回滚", async () => {
      const { wid, nid, projectRoot } = await createWorkspaceAndNode();
      const { filePath } = await createUpdateChange(wid, nid, projectRoot);
      const contentBefore = await fs.readFile(filePath, "utf-8");

      const response = await server.inject({
        method: "DELETE",
        url: `/api/workspaces/${wid}/nodes/${nid}?revert=false`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // 文件内容不应被回滚
      const contentAfter = await fs.readFile(filePath, "utf-8");
      expect(contentAfter).toBe(contentBefore);
    });
  });

  describe("TC-DEL-REVERT-006: revert=true + 节点不存在 → 返回 404", () => {
    it("Given: 节点 ID 不存在, When: DELETE ?revert=true, Then: 404", async () => {
      const { wid } = await createWorkspaceAndNode();

      const response = await server.inject({
        method: "DELETE",
        url: `/api/workspaces/${wid}/nodes/non-existent-node?revert=true`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("TC-DEL-REVERT-007: revert=true + 多类型变更 → 全部可回滚则成功", () => {
    it("Given: 节点有 add + update 变更均可回滚, When: DELETE ?revert=true, Then: 全部回滚成功 + 节点删除", async () => {
      const { wid, nid, projectRoot } = await createWorkspaceAndNode();
      const update = await createUpdateChange(wid, nid, projectRoot);
      const add = await createAddChange(wid, nid, projectRoot);

      const response = await server.inject({
        method: "DELETE",
        url: `/api/workspaces/${wid}/nodes/${nid}?revert=true`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // update 文件应被回滚
      const updateContent = await fs.readFile(update.filePath, "utf-8");
      expect(updateContent).toContain("line2");
      expect(updateContent).not.toContain("modified-line2");

      // add 文件应被删除
      const addFileExists = await fs.access(add.filePath).then(() => true).catch(() => false);
      expect(addFileExists).toBe(false);

      // 节点应该被删除
      const getRes = await server.inject({
        method: "GET",
        url: `/api/workspaces/${wid}/nodes/${nid}`,
      });
      expect(getRes.statusCode).toBe(404);
    });
  });
});
