// tests/dispatch.test.ts
// DispatchService 完备测试套件
// 覆盖 Bug 1-4 的所有修复场景

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DispatchService } from "../src/services/DispatchService.js";
import type { FileSystemAdapter } from "../src/storage/FileSystemAdapter.js";
import type { JsonStorage } from "../src/storage/JsonStorage.js";
import type { MarkdownStorage } from "../src/storage/MarkdownStorage.js";
import type { ConfigService } from "../src/services/ConfigService.js";
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

function createMockConfigService(defaultMode: "git" | "no-git" | "none" = "none"): ConfigService {
  return {
    getDefaultDispatchMode: vi.fn().mockResolvedValue(defaultMode),
  } as unknown as ConfigService;
}

// ========== Git 工具 Mock ==========

// 注意：需要 mock git 工具模块
vi.mock("../src/utils/git.js", () => ({
  isGitRepo: vi.fn().mockResolvedValue(true),
  ensureGitExclude: vi.fn().mockResolvedValue(undefined),
  getCurrentBranch: vi.fn().mockResolvedValue("main"),
  hasUncommittedChanges: vi.fn().mockResolvedValue(false),
  createBackupBranch: vi.fn().mockResolvedValue("tanmi-backup/ws-test-001/1"),
  createProcessBranch: vi.fn().mockResolvedValue("tanmi-process/ws-test-001"),
  checkoutProcessBranch: vi.fn().mockResolvedValue(undefined),
  checkoutBranch: vi.fn().mockResolvedValue(undefined),
  getCurrentCommit: vi.fn().mockResolvedValue("abc1234567890"),
  commitDispatch: vi.fn().mockResolvedValue("def0987654321"),
  resetToCommit: vi.fn().mockResolvedValue(undefined),
  mergeProcessBranch: vi.fn().mockResolvedValue(undefined),
  deleteAllWorkspaceBranches: vi.fn().mockResolvedValue(undefined),
  deleteProcessBranch: vi.fn().mockResolvedValue(undefined),
  deleteBackupBranch: vi.fn().mockResolvedValue(undefined),
  getActiveDispatchWorkspace: vi.fn().mockResolvedValue(null),
  getProcessBranchName: vi.fn().mockReturnValue("tanmi-process/ws-test-001"),
  isOnProcessBranch: vi.fn().mockResolvedValue(true),
  getCommitsBetween: vi.fn().mockResolvedValue([]),
  getUncommittedChangesSummary: vi.fn().mockResolvedValue(""),
  squashMergeProcessBranch: vi.fn().mockResolvedValue(undefined),
  rebaseMergeProcessBranch: vi.fn().mockResolvedValue(undefined),
  cherryPickToWorkingTree: vi.fn().mockResolvedValue(undefined),
  getLatestBackupBranch: vi.fn().mockResolvedValue(null),
}));

// ========== 测试套件 ==========

describe("DispatchService", () => {
  let service: DispatchService;
  let mockFs: FileSystemAdapter;
  let mockJson: JsonStorage;
  let mockMd: MarkdownStorage;
  let mockConfig: ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========== Bug 1: 派发模式冲突限制逻辑测试 ==========
  describe("Bug 1: 冲突检测逻辑", () => {

    describe("1.1 无 Git 模式不检查冲突", () => {
      it("无 Git 模式启用后，另一个工作区可以启用无 Git 模式", async () => {
        // 场景：ws-001 已用无 Git 模式启用，ws-002 也要用无 Git 模式
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
            useGit: false,  // 无 Git 模式
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
        mockConfig = createMockConfigService("no-git");

        // 根据 workspaceId 返回不同配置
        (mockJson.readWorkspaceConfig as any).mockImplementation(
          async (_projectRoot: string, wsDirName: string) => {
            if (wsDirName === "ws-002" || wsDirName === "Workspace 2_002") {
              return ws002Config;
            }
            return ws001Config;
          }
        );

        service = new DispatchService(mockJson, mockMd, mockFs, mockConfig);

        // ws-002 启用无 Git 模式应该成功（不检查冲突）
        const result = await service.enableDispatch("ws-002", "/project", { useGit: false });

        expect(result.success).toBe(true);
        expect(result.config.useGit).toBe(false);
      });

      it("无 Git 模式启用后，另一个工作区可以启用 Git 模式", async () => {
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
            useGit: false,  // 已有无 Git 模式
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
        mockConfig = createMockConfigService();

        (mockJson.readWorkspaceConfig as any).mockImplementation(
          async (_projectRoot: string, wsDirName: string) => {
            if (wsDirName === "ws-002" || wsDirName === "Workspace 2_002") {
              return ws002Config;
            }
            return ws001Config;
          }
        );

        service = new DispatchService(mockJson, mockMd, mockFs, mockConfig);

        // ws-002 启用 Git 模式应该成功（ws-001 是无 Git 模式，不冲突）
        const result = await service.enableDispatch("ws-002", "/project", { useGit: true });

        expect(result.success).toBe(true);
        expect(result.config.useGit).toBe(true);
      });
    });

    describe("1.2 Git 模式检查同仓库冲突", () => {
      it("Git 模式启用后，同一 git 仓库的另一个工作区不能启用 Git 模式", async () => {
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
            projectRoot: "/project",  // 同一 projectRoot
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
            useGit: true,  // 已有 Git 模式
            enabledAt: Date.now(),
            originalBranch: "main",
            processBranch: "tanmi-process/ws-001",
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
        mockConfig = createMockConfigService();

        (mockJson.readWorkspaceConfig as any).mockImplementation(
          async (_projectRoot: string, wsDirName: string) => {
            if (wsDirName === "ws-002" || wsDirName === "Workspace 2_002") {
              return ws002Config;
            }
            return ws001Config;
          }
        );

        service = new DispatchService(mockJson, mockMd, mockFs, mockConfig);

        // ws-002 启用 Git 模式应该失败（ws-001 已用 Git 模式）
        await expect(
          service.enableDispatch("ws-002", "/project", { useGit: true })
        ).rejects.toThrow(/正在使用 Git 模式派发/);
      });

      it("Git 模式启用后，另一个工作区可以启用无 Git 模式", async () => {
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
            useGit: true,  // 已有 Git 模式
            enabledAt: Date.now(),
            originalBranch: "main",
            processBranch: "tanmi-process/ws-001",
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
        mockConfig = createMockConfigService("no-git");

        (mockJson.readWorkspaceConfig as any).mockImplementation(
          async (_projectRoot: string, wsDirName: string) => {
            if (wsDirName === "ws-002" || wsDirName === "Workspace 2_002") {
              return ws002Config;
            }
            return ws001Config;
          }
        );

        service = new DispatchService(mockJson, mockMd, mockFs, mockConfig);

        // ws-002 启用无 Git 模式应该成功
        const result = await service.enableDispatch("ws-002", "/project", { useGit: false });

        expect(result.success).toBe(true);
        expect(result.config.useGit).toBe(false);
      });
    });
  });

  // ========== Bug 2: 节点完成状态测试 ==========
  describe("Bug 2: 节点完成状态", () => {

    describe("2.1 completeDispatch 成功路径", () => {
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
            useGit: false,
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
            useGit: false,
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

    describe("2.2 dispatch.status 保留（不清空）", () => {
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
            useGit: false,
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

  // ========== Bug 3: 父节点提醒机制测试 ==========
  describe("Bug 3: 父节点提醒机制", () => {

    describe("3.1 completeDispatch 父节点完成提醒", () => {
      it("完成最后一个子节点时，如果父节点是 planning 且 monitoring，应该有提醒", async () => {
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
              status: "monitoring",  // 父节点在监控状态
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
              status: "completed",  // 已完成
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
              status: "implementing",  // 正在执行
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
            useGit: false,
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
        expect(result.hint).toContain("提醒");
        expect(result.hint).toContain("node-plan-001");
        expect(result.hint).toContain("dispatch_disable");
      });

      it("还有其他子节点未完成时，不应该有父节点提醒", async () => {
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
              status: "implementing",  // 正在执行
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
              status: "pending",  // 还未开始
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
            useGit: false,
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
        // 应该没有父节点完成提醒
        expect(result.hint).not.toContain("node-plan-001");
      });
    });

    describe("3.2 queryDisableDispatch 提醒", () => {
      it("存在可完成的 planning 节点时，actionRequired.message 应包含提醒", async () => {
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
              children: ["node-exec-001"],
              status: "monitoring",  // monitoring 状态
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
              status: "completed",  // 子节点已完成
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
            useGit: false,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        const result = await service.queryDisableDispatch("ws-test-001", "/project");

        expect("actionRequired" in result).toBe(true);
        if ("actionRequired" in result) {
          expect(result.actionRequired.message).toContain("提醒");
          expect(result.actionRequired.message).toContain("node-plan-001");
        }
      });

      it("无 executing 状态节点时，应该允许查询（passed/failed 不阻塞）", async () => {
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
                status: "passed",  // passed 状态不阻塞
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
            useGit: false,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        // 应该成功返回，不抛出 DISPATCH_IN_PROGRESS 错误
        const result = await service.queryDisableDispatch("ws-test-001", "/project");
        expect("actionRequired" in result || "success" in result).toBe(true);
      });

      it("有 executing 状态节点时，应该抛出错误", async () => {
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
                status: "executing",  // executing 状态阻塞
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
            useGit: false,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        await expect(
          service.queryDisableDispatch("ws-test-001", "/project")
        ).rejects.toThrow(/正在派发执行中/);
      });
    });
  });

  // ========== Bug 4: dirName 解析测试 ==========
  describe("Bug 4: dirName 解析", () => {

    describe("4.1 prepareDispatch 使用 dirName", () => {
      it("节点有 dirName 时，使用 dirName 读取 Info.md", async () => {
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
              dirName: "执行任务_exec001",  // 有 dirName
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
            useGit: false,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        await service.prepareDispatch("ws-test-001", "/project", "node-exec-001");

        // 验证 readNodeInfo 使用了 dirName
        const readNodeInfoCalls = (mockMd.readNodeInfo as any).mock.calls;
        expect(readNodeInfoCalls.length).toBe(1);
        expect(readNodeInfoCalls[0][2]).toBe("执行任务_exec001");  // 使用 dirName
      });

      it("节点没有 dirName 时，使用 nodeId 读取 Info.md", async () => {
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
              dirName: "",  // 空 dirName
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
            useGit: false,
            enabledAt: Date.now(),
          },
        };

        mockFs = createMockFs();
        mockJson = createMockJson({ config, graph });
        mockMd = createMockMd();

        service = new DispatchService(mockJson, mockMd, mockFs);

        await service.prepareDispatch("ws-test-001", "/project", "node-exec-001");

        // 验证 readNodeInfo 使用了 nodeId（因为 dirName 为空）
        const readNodeInfoCalls = (mockMd.readNodeInfo as any).mock.calls;
        expect(readNodeInfoCalls.length).toBe(1);
        expect(readNodeInfoCalls[0][2]).toBe("node-exec-001");  // 回退到 nodeId
      });
    });

    describe("4.2 completeDispatch 使用 dirName", () => {
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
              dirName: "Web 前端优化_exec001",  // 有 dirName（含空格）
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
            useGit: false,
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
