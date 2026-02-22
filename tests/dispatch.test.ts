// tests/dispatch.test.ts
// DispatchService 测试套件
// Git 派发模式已剥离，仅保留无 Git 派发相关测试

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DispatchService, DISPATCH_HINT } from "../src/services/DispatchService.js";
import type { FileSystemAdapter } from "../src/storage/FileSystemAdapter.js";
import type { JsonStorage } from "../src/storage/JsonStorage.js";
import type { MarkdownStorage } from "../src/storage/MarkdownStorage.js";
import type { WorkspaceConfig, WorkspaceIndex, WorkspaceEntry } from "../src/types/workspace.js";
import type { NodeGraph, NodeMeta } from "../src/types/node.js";

// ========== Mock 工厂函数 ==========

function createMockFs(): FileSystemAdapter {
  return {
    exists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue("{}"),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
    getIndexPath: vi.fn().mockReturnValue("/mock/index.json"),
    getWorkspacePath: vi.fn().mockReturnValue("/mock/workspace"),
    getWorkspaceConfigPath: vi.fn().mockReturnValue("/mock/workspace.json"),
    getGraphPath: vi.fn().mockReturnValue("/mock/graph.json"),
    getGlobalBasePath: vi.fn().mockReturnValue("/mock"),
    getWorkspaceRootPath: vi.fn().mockReturnValue("/mock/.tanmi-workspace"),
    isDev: vi.fn().mockReturnValue(true),
    getDirName: vi.fn().mockReturnValue(".tanmi-workspace-dev"),
  } as unknown as FileSystemAdapter;
}

function createMockJson(overrides: {
  index?: WorkspaceIndex;
  config?: WorkspaceConfig;
  graph?: NodeGraph;
} = {}): JsonStorage {
  const defaultIndex: WorkspaceIndex = {
    version: "5.0",
    workspaces: [],
  };

  const defaultConfig: WorkspaceConfig = {
    id: "ws-test-001",
    name: "Test Workspace",
    dirName: "Test Workspace_test001",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rootNodeId: "root",
  };

  const defaultGraph: NodeGraph = {
    version: "5.0",
    currentFocus: null,
    nodes: {
      root: {
        id: "root",
        dirName: "root",
        type: "planning",
        parentId: null,
        children: [],
        status: "planning",
        isolate: false,
        references: [],
        conclusion: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  };

  return {
    readIndex: vi.fn().mockResolvedValue(overrides.index || defaultIndex),
    writeIndex: vi.fn().mockResolvedValue(undefined),
    readWorkspaceConfig: vi.fn().mockResolvedValue(overrides.config || defaultConfig),
    writeWorkspaceConfig: vi.fn().mockResolvedValue(undefined),
    readGraph: vi.fn().mockResolvedValue(overrides.graph || defaultGraph),
    writeGraph: vi.fn().mockResolvedValue(undefined),
    findWorkspaceEntry: vi.fn().mockResolvedValue(null),
    getWorkspaceLocation: vi.fn().mockResolvedValue({
      projectRoot: "/project",
      dirName: overrides.config?.dirName || defaultConfig.dirName,
    }),
  } as unknown as JsonStorage;
}

function createMockMd(): MarkdownStorage {
  return {
    readNodeInfo: vi.fn().mockResolvedValue({
      id: "node-test-001",
      type: "execution",
      title: "Test Node",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      requirement: "Test requirement",
      docs: [],
      notes: "",
      conclusion: "",
    }),
    appendLog: vi.fn().mockResolvedValue(undefined),
    updateNodeStatus: vi.fn().mockResolvedValue(undefined),
    updateConclusion: vi.fn().mockResolvedValue(undefined),
  } as unknown as MarkdownStorage;
}

// ========== Git 工具 Mock（仅保留 isGitRepo + ensureGitExclude） ==========

vi.mock("../src/utils/git.js", () => ({
  isGitRepo: vi.fn().mockResolvedValue(true),
  ensureGitExclude: vi.fn().mockResolvedValue(undefined),
}));

// ========== 测试套件 ==========

describe("DispatchService", () => {
  let service: DispatchService;
  let mockFs: FileSystemAdapter;
  let mockJson: JsonStorage;
  let mockMd: MarkdownStorage;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========== enableDispatch 测试 ==========
  describe("enableDispatch", () => {

    it("启用派发模式成功，返回 config 不包含 git 相关字段", async () => {
      const config: WorkspaceConfig = {
        id: "ws-test-001",
        name: "Test Workspace",
        dirName: "Test Workspace_test001",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
      };

      mockFs = createMockFs();
      mockJson = createMockJson({ config });
      mockMd = createMockMd();

      service = new DispatchService(mockJson, mockMd, mockFs);

      const result = await service.enableDispatch("ws-test-001", "/project");

      expect(result.success).toBe(true);
      expect(result.config.enabled).toBe(true);
      expect(result.config.enabledAt).toBeDefined();

      // 验证不包含 git 相关字段
      expect((result.config as any).useGit).toBeUndefined();
      expect((result.config as any).originalBranch).toBeUndefined();
      expect((result.config as any).processBranch).toBeUndefined();
      expect((result.config as any).backupBranches).toBeUndefined();
    });

    it("已启用时再次启用应抛出错误", async () => {
      const config: WorkspaceConfig = {
        id: "ws-test-001",
        name: "Test Workspace",
        dirName: "Test Workspace_test001",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
        dispatch: {
          enabled: true,
          enabledAt: Date.now(),
        },
      };

      mockFs = createMockFs();
      mockJson = createMockJson({ config });
      mockMd = createMockMd();

      service = new DispatchService(mockJson, mockMd, mockFs);

      await expect(
        service.enableDispatch("ws-test-001", "/project")
      ).rejects.toThrow(/派发模式已启用/);
    });

    it("多个工作区可以同时启用派发模式（不再有 git 冲突检测）", async () => {
      const existingWorkspaces: WorkspaceEntry[] = [
        {
          id: "ws-001",
          name: "Workspace 1",
          dirName: "Workspace 1_001",
          projectRoot: "/project",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "ws-002",
          name: "Workspace 2",
          dirName: "Workspace 2_002",
          projectRoot: "/project",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const ws001Config: WorkspaceConfig = {
        id: "ws-001",
        name: "Workspace 1",
        dirName: "Workspace 1_001",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
        dispatch: {
          enabled: true,
          enabledAt: Date.now(),
        },
      };

      const ws002Config: WorkspaceConfig = {
        id: "ws-002",
        name: "Workspace 2",
        dirName: "Workspace 2_002",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
      };

      mockFs = createMockFs();
      mockJson = createMockJson({
        index: { version: "5.0", workspaces: existingWorkspaces },
      });
      mockMd = createMockMd();

      (mockJson.getWorkspaceLocation as any).mockImplementation(
        async (wsId: string) => {
          if (wsId === "ws-002") {
            return { projectRoot: "/project", dirName: "Workspace 2_002" };
          }
          return { projectRoot: "/project", dirName: "Workspace 1_001" };
        }
      );

      (mockJson.readWorkspaceConfig as any).mockImplementation(
        async (_projectRoot: string, wsDirName: string) => {
          if (wsDirName === "Workspace 2_002") {
            return ws002Config;
          }
          return ws001Config;
        }
      );

      service = new DispatchService(mockJson, mockMd, mockFs);

      // ws-002 启用应该成功（不再有 git 模式冲突检测）
      const result = await service.enableDispatch("ws-002", "/project");

      expect(result.success).toBe(true);
      expect(result.config.enabled).toBe(true);
    });
  });

  // ========== disableDispatch 测试 ==========
  describe("disableDispatch", () => {

    it("禁用派发模式成功（新签名：workspaceId, projectRoot）", async () => {
      const config: WorkspaceConfig = {
        id: "ws-test-001",
        name: "Test Workspace",
        dirName: "Test Workspace_test001",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
        dispatch: {
          enabled: true,
          enabledAt: Date.now(),
        },
      };

      const graph: NodeGraph = {
        version: "5.0",
        currentFocus: null,
        nodes: {
          root: {
            id: "root",
            dirName: "root",
            type: "planning",
            parentId: null,
            children: [],
            status: "planning",
            isolate: false,
            references: [],
            conclusion: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };

      mockFs = createMockFs();
      mockJson = createMockJson({ config, graph });
      mockMd = createMockMd();

      service = new DispatchService(mockJson, mockMd, mockFs);

      const result = await service.disableDispatch("ws-test-001", "/project");

      expect(result.success).toBe(true);
      expect(result.message).toContain("关闭");

      // 验证配置被清理
      const writeConfigCalls = (mockJson.writeWorkspaceConfig as any).mock.calls;
      expect(writeConfigCalls.length).toBe(1);
      const savedConfig = writeConfigCalls[0][2] as WorkspaceConfig;
      expect(savedConfig.dispatch).toBeUndefined();

      // 验证日志被记录
      const logCalls = (mockMd.appendLog as any).mock.calls;
      expect(logCalls.length).toBe(1);
    });

    it("有 executing 节点时禁用应抛出错误", async () => {
      const graph: NodeGraph = {
        version: "5.0",
        currentFocus: null,
        nodes: {
          root: {
            id: "root",
            dirName: "root",
            type: "planning",
            parentId: null,
            children: ["node-exec-001"],
            status: "monitoring",
            isolate: false,
            references: [],
            conclusion: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          "node-exec-001": {
            id: "node-exec-001",
            dirName: "执行任务_exec001",
            type: "execution",
            parentId: "root",
            children: [],
            status: "implementing",
            isolate: false,
            references: [],
            conclusion: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dispatch: {
              startMarker: "abc123",
              status: "executing",
            },
          },
        },
      };

      const config: WorkspaceConfig = {
        id: "ws-test-001",
        name: "Test Workspace",
        dirName: "Test Workspace_test001",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
        dispatch: {
          enabled: true,
          enabledAt: Date.now(),
        },
      };

      mockFs = createMockFs();
      mockJson = createMockJson({ config, graph });
      mockMd = createMockMd();

      service = new DispatchService(mockJson, mockMd, mockFs);

      await expect(
        service.disableDispatch("ws-test-001", "/project")
      ).rejects.toThrow(/正在派发执行中/);
    });

    it("passed/failed 状态节点不阻塞禁用", async () => {
      const graph: NodeGraph = {
        version: "5.0",
        currentFocus: null,
        nodes: {
          root: {
            id: "root",
            dirName: "root",
            type: "planning",
            parentId: null,
            children: ["node-exec-001"],
            status: "monitoring",
            isolate: false,
            references: [],
            conclusion: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          "node-exec-001": {
            id: "node-exec-001",
            dirName: "执行任务_exec001",
            type: "execution",
            parentId: "root",
            children: [],
            status: "completed",
            isolate: false,
            references: [],
            conclusion: "已完成",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dispatch: {
              startMarker: "abc123",
              endMarker: "def456",
              status: "passed",
            },
          },
        },
      };

      const config: WorkspaceConfig = {
        id: "ws-test-001",
        name: "Test Workspace",
        dirName: "Test Workspace_test001",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
        dispatch: {
          enabled: true,
          enabledAt: Date.now(),
        },
      };

      mockFs = createMockFs();
      mockJson = createMockJson({ config, graph });
      mockMd = createMockMd();

      service = new DispatchService(mockJson, mockMd, mockFs);

      const result = await service.disableDispatch("ws-test-001", "/project");
      expect(result.success).toBe(true);
    });

    it("派发模式未启用时，直接返回成功", async () => {
      const config: WorkspaceConfig = {
        id: "ws-test-001",
        name: "Test Workspace",
        dirName: "Test Workspace_test001",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
        // 没有 dispatch 配置
      };

      mockFs = createMockFs();
      mockJson = createMockJson({ config });
      mockMd = createMockMd();

      service = new DispatchService(mockJson, mockMd, mockFs);

      const result = await service.disableDispatch("ws-test-001", "/project");
      expect(result.success).toBe(true);
      expect(result.message).toContain("已禁用");
    });
  });

  // ========== 节点完成状态测试 ==========
  describe("completeDispatch 节点完成状态", () => {

    describe("成功路径", () => {
      it("success=true 时，节点状态变为 completed，dispatch.status 变为 passed", async () => {
        const graph: NodeGraph = {
          version: "5.0",
          currentFocus: "node-exec-001",
          nodes: {
            root: {
              id: "root",
              dirName: "root",
              type: "planning",
              parentId: null,
              children: ["node-exec-001"],
              status: "monitoring",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            "node-exec-001": {
              id: "node-exec-001",
              dirName: "执行任务_exec001",
              type: "execution",
              parentId: "root",
              children: [],
              status: "implementing",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              dispatch: {
                startMarker: "abc123",
                status: "executing",
              },
            },
          },
        };

        const config: WorkspaceConfig = {
          id: "ws-test-001",
          name: "Test Workspace",
          dirName: "Test Workspace_test001",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rootNodeId: "root",
          dispatch: {
            enabled: true,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        const result = await service.completeDispatch(
          "ws-test-001",
          "/project",
          "node-exec-001",
          true,
          "任务已完成"
        );

        expect(result.success).toBe(true);
        expect(result.endMarker).toBeDefined();

        // 验证 writeGraph 被调用，且节点状态正确
        const writeGraphCalls = (mockJson.writeGraph as any).mock.calls;
        expect(writeGraphCalls.length).toBe(1);

        const savedGraph = writeGraphCalls[0][2] as NodeGraph;
        const savedNode = savedGraph.nodes["node-exec-001"];

        expect(savedNode.status).toBe("completed");
        expect(savedNode.dispatch?.status).toBe("passed");
        expect(savedNode.dispatch?.endMarker).toBeDefined();
        expect(savedNode.conclusion).toBe("任务已完成");
      });

      it("success=false 时，节点状态变为 failed，dispatch.status 变为 failed", async () => {
        const graph: NodeGraph = {
          version: "5.0",
          currentFocus: "node-exec-001",
          nodes: {
            root: {
              id: "root",
              dirName: "root",
              type: "planning",
              parentId: null,
              children: ["node-exec-001"],
              status: "monitoring",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            "node-exec-001": {
              id: "node-exec-001",
              dirName: "执行任务_exec001",
              type: "execution",
              parentId: "root",
              children: [],
              status: "implementing",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              dispatch: {
                startMarker: "abc123",
                status: "executing",
              },
            },
          },
        };

        const config: WorkspaceConfig = {
          id: "ws-test-001",
          name: "Test Workspace",
          dirName: "Test Workspace_test001",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rootNodeId: "root",
          dispatch: {
            enabled: true,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        const result = await service.completeDispatch(
          "ws-test-001",
          "/project",
          "node-exec-001",
          false,
          "执行失败原因"
        );

        expect(result.success).toBe(false);

        const writeGraphCalls = (mockJson.writeGraph as any).mock.calls;
        const savedGraph = writeGraphCalls[0][2] as NodeGraph;
        const savedNode = savedGraph.nodes["node-exec-001"];

        expect(savedNode.status).toBe("failed");
        expect(savedNode.dispatch?.status).toBe("failed");
        expect(savedNode.conclusion).toBe("执行失败原因");
      });
    });

    describe("dispatch 对象保留（不清空）", () => {
      it("完成后 dispatch 对象应该保留，不被删除", async () => {
        const graph: NodeGraph = {
          version: "5.0",
          currentFocus: "node-exec-001",
          nodes: {
            root: {
              id: "root",
              dirName: "root",
              type: "planning",
              parentId: null,
              children: ["node-exec-001"],
              status: "monitoring",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            "node-exec-001": {
              id: "node-exec-001",
              dirName: "执行任务_exec001",
              type: "execution",
              parentId: "root",
              children: [],
              status: "implementing",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              dispatch: {
                startMarker: "abc123",
                status: "executing",
              },
            },
          },
        };

        const config: WorkspaceConfig = {
          id: "ws-test-001",
          name: "Test Workspace",
          dirName: "Test Workspace_test001",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rootNodeId: "root",
          dispatch: {
            enabled: true,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        await service.completeDispatch(
          "ws-test-001",
          "/project",
          "node-exec-001",
          true,
          "完成"
        );

        const writeGraphCalls = (mockJson.writeGraph as any).mock.calls;
        const savedGraph = writeGraphCalls[0][2] as NodeGraph;
        const savedNode = savedGraph.nodes["node-exec-001"];

        // dispatch 对象应该保留，用于 WebUI 显示历史
        expect(savedNode.dispatch).toBeDefined();
        expect(savedNode.dispatch?.startMarker).toBe("abc123");
        expect(savedNode.dispatch?.endMarker).toBeDefined();
        expect(savedNode.dispatch?.status).toBe("passed");
      });
    });
  });

  // ========== 父节点提醒机制测试 ==========
  describe("completeDispatch 父节点提醒", () => {

    it("完成最后一个子节点时，hint 为 SUCCESS", async () => {
      const graph: NodeGraph = {
        version: "5.0",
        currentFocus: "node-exec-002",
        nodes: {
          root: {
            id: "root",
            dirName: "root",
            type: "planning",
            parentId: null,
            children: ["node-plan-001"],
            status: "monitoring",
            isolate: false,
            references: [],
            conclusion: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          "node-plan-001": {
            id: "node-plan-001",
            dirName: "规划节点_plan001",
            type: "planning",
            parentId: "root",
            children: ["node-exec-001", "node-exec-002"],
            status: "monitoring",
            isolate: false,
            references: [],
            conclusion: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          "node-exec-001": {
            id: "node-exec-001",
            dirName: "执行任务1_exec001",
            type: "execution",
            parentId: "node-plan-001",
            children: [],
            status: "completed",
            isolate: false,
            references: [],
            conclusion: "完成",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          "node-exec-002": {
            id: "node-exec-002",
            dirName: "执行任务2_exec002",
            type: "execution",
            parentId: "node-plan-001",
            children: [],
            status: "implementing",
            isolate: false,
            references: [],
            conclusion: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dispatch: {
              startMarker: "abc123",
              status: "executing",
            },
          },
        },
      };

      const config: WorkspaceConfig = {
        id: "ws-test-001",
        name: "Test Workspace",
        dirName: "Test Workspace_test001",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
        dispatch: {
          enabled: true,
          enabledAt: Date.now(),
        },
      };

      mockFs = createMockFs();
      mockJson = createMockJson({ config, graph });
      mockMd = createMockMd();

      service = new DispatchService(mockJson, mockMd, mockFs);

      const result = await service.completeDispatch(
        "ws-test-001",
        "/project",
        "node-exec-002",
        true,
        "最后一个任务完成"
      );

      expect(result.success).toBe(true);
      expect(result.hint).toBe(DISPATCH_HINT.SUCCESS);
    });

    it("还有其他子节点未完成时，hint 仍然是执行完成", async () => {
      const graph: NodeGraph = {
        version: "5.0",
        currentFocus: "node-exec-001",
        nodes: {
          root: {
            id: "root",
            dirName: "root",
            type: "planning",
            parentId: null,
            children: ["node-plan-001"],
            status: "monitoring",
            isolate: false,
            references: [],
            conclusion: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          "node-plan-001": {
            id: "node-plan-001",
            dirName: "规划节点_plan001",
            type: "planning",
            parentId: "root",
            children: ["node-exec-001", "node-exec-002"],
            status: "monitoring",
            isolate: false,
            references: [],
            conclusion: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          "node-exec-001": {
            id: "node-exec-001",
            dirName: "执行任务1_exec001",
            type: "execution",
            parentId: "node-plan-001",
            children: [],
            status: "implementing",
            isolate: false,
            references: [],
            conclusion: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dispatch: {
              startMarker: "abc123",
              status: "executing",
            },
          },
          "node-exec-002": {
            id: "node-exec-002",
            dirName: "执行任务2_exec002",
            type: "execution",
            parentId: "node-plan-001",
            children: [],
            status: "pending",
            isolate: false,
            references: [],
            conclusion: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };

      const config: WorkspaceConfig = {
        id: "ws-test-001",
        name: "Test Workspace",
        dirName: "Test Workspace_test001",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
        dispatch: {
          enabled: true,
          enabledAt: Date.now(),
        },
      };

      mockFs = createMockFs();
      mockJson = createMockJson({ config, graph });
      mockMd = createMockMd();

      service = new DispatchService(mockJson, mockMd, mockFs);

      const result = await service.completeDispatch(
        "ws-test-001",
        "/project",
        "node-exec-001",
        true,
        "第一个任务完成"
      );

      expect(result.success).toBe(true);
      expect(result.hint).toBe(DISPATCH_HINT.SUCCESS);
    });
  });

  // ========== dispatchNode 节点类型验证测试 ==========
  describe("upgradeToDispatchParent 节点类型验证", () => {

    describe("允许的节点类型", () => {
      it("execution 节点可以升级为派发母节点", async () => {
        const graph: NodeGraph = {
          version: "5.0",
          currentFocus: null,
          nodes: {
            root: {
              id: "root",
              dirName: "root",
              type: "planning",
              parentId: null,
              children: ["node-exec-001"],
              status: "planning",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            "node-exec-001": {
              id: "node-exec-001",
              dirName: "执行任务_exec001",
              type: "execution",
              parentId: "root",
              children: [],
              status: "pending",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        };

        const config: WorkspaceConfig = {
          id: "ws-test-001",
          name: "Test Workspace",
          dirName: "Test Workspace_test001",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rootNodeId: "root",
          dispatch: {
            enabled: true,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        const result = await service.upgradeToDispatchParent("ws-test-001", "/project", "node-exec-001");

        expect(result.success).toBe(true);
        expect(result.upgraded).toBe(true);
      });

      it("没有子节点的 planning 节点可以升级为派发母节点", async () => {
        const graph: NodeGraph = {
          version: "5.0",
          currentFocus: null,
          nodes: {
            root: {
              id: "root",
              dirName: "root",
              type: "planning",
              parentId: null,
              children: ["node-plan-001"],
              status: "planning",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            "node-plan-001": {
              id: "node-plan-001",
              dirName: "规划节点_plan001",
              type: "planning",
              parentId: "root",
              children: [],
              status: "planning",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        };

        const config: WorkspaceConfig = {
          id: "ws-test-001",
          name: "Test Workspace",
          dirName: "Test Workspace_test001",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rootNodeId: "root",
          dispatch: {
            enabled: true,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        const result = await service.upgradeToDispatchParent("ws-test-001", "/project", "node-plan-001");

        expect(result.success).toBe(true);
        expect(result.upgraded).toBe(true);
      });
    });

    describe("不允许的节点类型", () => {
      it("有子节点的 planning 节点不能升级为派发母节点", async () => {
        const graph: NodeGraph = {
          version: "5.0",
          currentFocus: null,
          nodes: {
            root: {
              id: "root",
              dirName: "root",
              type: "planning",
              parentId: null,
              children: ["node-plan-001"],
              status: "planning",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            "node-plan-001": {
              id: "node-plan-001",
              dirName: "规划节点_plan001",
              type: "planning",
              parentId: "root",
              children: ["node-exec-001"],
              status: "planning",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            "node-exec-001": {
              id: "node-exec-001",
              dirName: "执行任务_exec001",
              type: "execution",
              parentId: "node-plan-001",
              children: [],
              status: "pending",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        };

        const config: WorkspaceConfig = {
          id: "ws-test-001",
          name: "Test Workspace",
          dirName: "Test Workspace_test001",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rootNodeId: "root",
          dispatch: {
            enabled: true,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        await expect(
          service.upgradeToDispatchParent("ws-test-001", "/project", "node-plan-001")
        ).rejects.toThrow(/有子节点的规划节点不能升级为派发母节点/);
      });
    });
  });

  // ========== dirName 解析测试 ==========
  describe("dirName 解析", () => {

    describe("prepareDispatch 使用 dirName", () => {
      it("节点有 dirName 时，prepareDispatch 返回正确结果", async () => {
        const graph: NodeGraph = {
          version: "5.0",
          currentFocus: null,
          nodes: {
            root: {
              id: "root",
              dirName: "root",
              type: "planning",
              parentId: null,
              children: ["node-exec-001"],
              status: "monitoring",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            "node-exec-001": {
              id: "node-exec-001",
              dirName: "执行任务_exec001",
              type: "execution",
              parentId: "root",
              children: [],
              status: "pending",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        };

        const config: WorkspaceConfig = {
          id: "ws-test-001",
          name: "Test Workspace",
          dirName: "Test Workspace_test001",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rootNodeId: "root",
          dispatch: {
            enabled: true,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        const result = await service.prepareDispatch("ws-test-001", "/project", "node-exec-001");

        expect(result.success).toBe(true);
        expect(result.actionRequired).toBeDefined();
      });

      it("节点没有 dirName 时，prepareDispatch 仍返回正确结果", async () => {
        const graph: NodeGraph = {
          version: "5.0",
          currentFocus: null,
          nodes: {
            root: {
              id: "root",
              dirName: "root",
              type: "planning",
              parentId: null,
              children: ["node-exec-001"],
              status: "monitoring",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            "node-exec-001": {
              id: "node-exec-001",
              dirName: "",
              type: "execution",
              parentId: "root",
              children: [],
              status: "pending",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        };

        const config: WorkspaceConfig = {
          id: "ws-test-001",
          name: "Test Workspace",
          dirName: "Test Workspace_test001",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rootNodeId: "root",
          dispatch: {
            enabled: true,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        const result = await service.prepareDispatch("ws-test-001", "/project", "node-exec-001");

        expect(result.success).toBe(true);
        expect(result.actionRequired).toBeDefined();
      });
    });

    describe("completeDispatch 使用 dirName", () => {
      it("完成时使用 dirName 更新 Info.md", async () => {
        const graph: NodeGraph = {
          version: "5.0",
          currentFocus: "node-exec-001",
          nodes: {
            root: {
              id: "root",
              dirName: "root",
              type: "planning",
              parentId: null,
              children: ["node-exec-001"],
              status: "monitoring",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            "node-exec-001": {
              id: "node-exec-001",
              dirName: "Web 前端优化_exec001",
              type: "execution",
              parentId: "root",
              children: [],
              status: "implementing",
              isolate: false,
              references: [],
              conclusion: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              dispatch: {
                startMarker: "abc123",
                status: "executing",
              },
            },
          },
        };

        const config: WorkspaceConfig = {
          id: "ws-test-001",
          name: "Test Workspace",
          dirName: "Test Workspace_test001",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          rootNodeId: "root",
          dispatch: {
            enabled: true,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        await service.completeDispatch(
          "ws-test-001",
          "/project",
          "node-exec-001",
          true,
          "完成"
        );

        // 验证 updateNodeStatus 使用了 dirName
        const updateStatusCalls = (mockMd.updateNodeStatus as any).mock.calls;
        expect(updateStatusCalls.length).toBe(1);
        expect(updateStatusCalls[0][2]).toBe("Web 前端优化_exec001");

        // 验证 updateConclusion 使用了 dirName
        const updateConclusionCalls = (mockMd.updateConclusion as any).mock.calls;
        expect(updateConclusionCalls.length).toBe(1);
        expect(updateConclusionCalls[0][2]).toBe("Web 前端优化_exec001");
      });
    });
  });
});
