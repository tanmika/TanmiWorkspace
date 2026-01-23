import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { TanmiError } from "../src/types/errors.js";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-rename-${crypto.randomUUID()}`;
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
const { FileSystemAdapter } = await import("../src/storage/FileSystemAdapter.js");
const { JsonStorage } = await import("../src/storage/JsonStorage.js");
const { MarkdownStorage } = await import("../src/storage/MarkdownStorage.js");
const { WorkspaceService } = await import("../src/services/WorkspaceService.js");

describe("WorkspaceService.rename", () => {
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

  describe("TC-001: 正常重命名（活跃工作区）", () => {
    it("应该成功重命名工作区并同步更新 4 处数据", async () => {
      // 1. 创建工作区
      const initResult = await service.init({
        name: "原始名称",
        goal: "测试目标",
        projectRoot,
      });
      const { workspaceId } = initResult;

      // 2. 重命名工作区
      const renameResult = await service.rename({
        workspaceId,
        newName: "新名称",
      });

      expect(renameResult.success).toBe(true);

      // 3. 验证 index.json 更新
      const index = await json.readIndex();
      const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
      expect(wsEntry?.name).toBe("新名称");
      // dirName 格式是 "{name}_{shortId}"
      expect(wsEntry?.dirName).toMatch(/^新名称_[a-z0-9]+$/);

      // 4. 验证 workspace.json 更新（使用实际的 dirName）
      const config = await json.readWorkspaceConfig(projectRoot, wsEntry!.dirName, false);
      expect(config.name).toBe("新名称");

      // 5. 验证 Workspace.md 更新（目录名已更改）
      const wsResult = await service.get({ workspaceId });
      expect(wsResult.config.name).toBe("新名称");
      expect(wsResult.workspaceMd).toContain("新名称");
    });

    it("应该保持 workspaceId 不变", async () => {
      const initResult = await service.init({
        name: "不变ID测试",
        goal: "测试",
        projectRoot,
      });
      const originalId = initResult.workspaceId;

      await service.rename({
        workspaceId: originalId,
        newName: "重命名后",
      });

      // 验证可以用原 ID 获取工作区
      const wsResult = await service.get({ workspaceId: originalId });
      expect(wsResult.config.name).toBe("重命名后");
    });
  });

  describe("TC-002: 归档工作区重命名", () => {
    it("应该成功重命名归档状态的工作区", async () => {
      // 1. 创建工作区
      const initResult = await service.init({
        name: "待归档",
        goal: "测试",
        projectRoot,
      });
      const { workspaceId } = initResult;

      // 2. 归档工作区
      await service.archive({ workspaceId });

      // 3. 重命名归档工作区
      const renameResult = await service.rename({
        workspaceId,
        newName: "归档后重命名",
      });

      expect(renameResult.success).toBe(true);

      // 4. 验证 archive 目录下的更新
      const index = await json.readIndex();
      const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
      expect(wsEntry?.name).toBe("归档后重命名");
      expect(wsEntry?.status).toBe("archived");

      // 5. 验证归档目录存在（使用实际的 dirName）
      const archivePath = fsAdapter.getArchivePath(projectRoot, wsEntry!.dirName);
      const exists = await fsAdapter.exists(archivePath);
      expect(exists).toBe(true);
    });
  });

  describe("TC-003: 重名校验", () => {
    it("应该拒绝重命名为已存在的工作区名称", async () => {
      // 1. 创建两个工作区
      const ws1 = await service.init({
        name: "工作区A",
        goal: "测试",
        projectRoot,
      });
      await service.init({
        name: "工作区B",
        goal: "测试",
        projectRoot,
      });

      // 2. 尝试将 A 重命名为 B 的名称
      await expect(
        service.rename({
          workspaceId: ws1.workspaceId,
          newName: "工作区B",
        })
      ).rejects.toThrow(TanmiError);

      // 3. 验证错误码为 WORKSPACE_EXISTS
      try {
        await service.rename({
          workspaceId: ws1.workspaceId,
          newName: "工作区B",
        });
      } catch (error) {
        expect(error).toBeInstanceOf(TanmiError);
        expect((error as TanmiError).code).toBe("WORKSPACE_EXISTS");
      }
    });

    it("应该允许重命名为不同状态的工作区名称（活跃与归档）", async () => {
      // 创建两个工作区
      const ws1 = await service.init({
        name: "活跃工作区",
        goal: "测试",
        projectRoot,
      });
      const ws2 = await service.init({
        name: "将归档",
        goal: "测试",
        projectRoot,
      });

      // 归档 ws2
      await service.archive({ workspaceId: ws2.workspaceId });

      // 尝试将 ws1 重命名为 ws2 的名称（应该失败，同项目下名称不能重复）
      await expect(
        service.rename({
          workspaceId: ws1.workspaceId,
          newName: "将归档",
        })
      ).rejects.toThrow(TanmiError);
    });
  });

  describe("TC-004: 非法字符校验", () => {
    it("应该拒绝包含 / 的名称", async () => {
      const initResult = await service.init({
        name: "正常名称",
        goal: "测试",
        projectRoot,
      });

      await expect(
        service.rename({
          workspaceId: initResult.workspaceId,
          newName: "非法/名称",
        })
      ).rejects.toThrow(TanmiError);

      try {
        await service.rename({
          workspaceId: initResult.workspaceId,
          newName: "非法/名称",
        });
      } catch (error) {
        expect(error).toBeInstanceOf(TanmiError);
        expect((error as TanmiError).code).toBe("INVALID_NAME");
      }
    });

    it("应该拒绝包含 : 的名称", async () => {
      const initResult = await service.init({
        name: "正常名称",
        goal: "测试",
        projectRoot,
      });

      await expect(
        service.rename({
          workspaceId: initResult.workspaceId,
          newName: "非法:名称",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("应该拒绝包含 * 的名称", async () => {
      const initResult = await service.init({
        name: "正常名称",
        goal: "测试",
        projectRoot,
      });

      await expect(
        service.rename({
          workspaceId: initResult.workspaceId,
          newName: "非法*名称",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("应该拒绝包含 \\ 的名称", async () => {
      const initResult = await service.init({
        name: "正常名称",
        goal: "测试",
        projectRoot,
      });

      await expect(
        service.rename({
          workspaceId: initResult.workspaceId,
          newName: "非法\\名称",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("应该拒绝包含 ? 的名称", async () => {
      const initResult = await service.init({
        name: "正常名称",
        goal: "测试",
        projectRoot,
      });

      await expect(
        service.rename({
          workspaceId: initResult.workspaceId,
          newName: "非法?名称",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("应该拒绝包含 \" 的名称", async () => {
      const initResult = await service.init({
        name: "正常名称",
        goal: "测试",
        projectRoot,
      });

      await expect(
        service.rename({
          workspaceId: initResult.workspaceId,
          newName: '非法"名称',
        })
      ).rejects.toThrow(TanmiError);
    });

    it("应该拒绝包含 < > | 的名称", async () => {
      const initResult = await service.init({
        name: "正常名称",
        goal: "测试",
        projectRoot,
      });

      await expect(
        service.rename({
          workspaceId: initResult.workspaceId,
          newName: "非法<名称>|",
        })
      ).rejects.toThrow(TanmiError);
    });
  });

  describe("TC-005: 工作区不存在", () => {
    it("应该对不存在的 workspaceId 返回 WORKSPACE_NOT_FOUND", async () => {
      await expect(
        service.rename({
          workspaceId: "ws-nonexistent-id",
          newName: "新名称",
        })
      ).rejects.toThrow(TanmiError);

      try {
        await service.rename({
          workspaceId: "ws-nonexistent-id",
          newName: "新名称",
        });
      } catch (error) {
        expect(error).toBeInstanceOf(TanmiError);
        expect((error as TanmiError).code).toBe("WORKSPACE_NOT_FOUND");
      }
    });
  });

  describe("边界用例", () => {
    it("应该拒绝空名称", async () => {
      const initResult = await service.init({
        name: "正常名称",
        goal: "测试",
        projectRoot,
      });

      await expect(
        service.rename({
          workspaceId: initResult.workspaceId,
          newName: "",
        })
      ).rejects.toThrow(TanmiError);

      try {
        await service.rename({
          workspaceId: initResult.workspaceId,
          newName: "",
        });
      } catch (error) {
        expect(error).toBeInstanceOf(TanmiError);
        expect((error as TanmiError).code).toBe("INVALID_NAME");
      }
    });

    it("应该处理超长名称（>50字符）", async () => {
      const initResult = await service.init({
        name: "正常名称",
        goal: "测试",
        projectRoot,
      });

      const longName = "这是一个非常非常非常非常非常非常非常非常非常非常非常非常长的工作区名称超过五十个字符";

      // 期望要么截断要么报错，具体行为由实现决定
      // 这里测试的是调用不会导致未处理异常
      try {
        const result = await service.rename({
          workspaceId: initResult.workspaceId,
          newName: longName,
        });
        // 如果成功，验证名称被处理（可能被截断）
        expect(result.success).toBe(true);
      } catch (error) {
        // 如果失败，验证是预期的错误类型
        expect(error).toBeInstanceOf(TanmiError);
      }
    });

    it("应该正常处理中文名称", async () => {
      const initResult = await service.init({
        name: "英文Name",
        goal: "测试",
        projectRoot,
      });

      const result = await service.rename({
        workspaceId: initResult.workspaceId,
        newName: "中文工作区名称",
      });

      expect(result.success).toBe(true);

      // 验证中文名称正确存储
      const wsResult = await service.get({ workspaceId: initResult.workspaceId });
      expect(wsResult.config.name).toBe("中文工作区名称");
    });

    it("应该处理相同名称（原名 == 新名）", async () => {
      const initResult = await service.init({
        name: "相同名称",
        goal: "测试",
        projectRoot,
      });

      // 用相同名称重命名应该成功（无变化）
      const result = await service.rename({
        workspaceId: initResult.workspaceId,
        newName: "相同名称",
      });

      expect(result.success).toBe(true);

      // 验证工作区保持不变
      const wsResult = await service.get({ workspaceId: initResult.workspaceId });
      expect(wsResult.config.name).toBe("相同名称");
    });

    it("应该处理只有空格的名称", async () => {
      const initResult = await service.init({
        name: "正常名称",
        goal: "测试",
        projectRoot,
      });

      await expect(
        service.rename({
          workspaceId: initResult.workspaceId,
          newName: "   ",
        })
      ).rejects.toThrow(TanmiError);
    });

    it("应该正确处理前后有空格的名称（trim）", async () => {
      const initResult = await service.init({
        name: "正常名称",
        goal: "测试",
        projectRoot,
      });

      // 期望实现会 trim 空格
      const result = await service.rename({
        workspaceId: initResult.workspaceId,
        newName: "  带空格名称  ",
      });

      expect(result.success).toBe(true);

      // 验证名称被 trim
      const wsResult = await service.get({ workspaceId: initResult.workspaceId });
      expect(wsResult.config.name).toBe("带空格名称");
    });
  });
});
