import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

// 为每个测试文件生成唯一的测试目录
const testBasePath = `.test-tanmi-workspace-tutorial-${crypto.randomUUID()}`;
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
const { StateService } = await import("../../src/services/StateService.js");
const { LogService } = await import("../../src/services/LogService.js");
const { ContextService } = await import("../../src/services/ContextService.js");
const { ReferenceService } = await import("../../src/services/ReferenceService.js");
const { DispatchService } = await import("../../src/services/DispatchService.js");
const { ConfigService } = await import("../../src/services/ConfigService.js");
const { MemoService } = await import("../../src/services/MemoService.js");
const { TutorialService } = await import("../../src/services/TutorialService.js");
const { ALL_CAPABILITY_IDS, capabilityService } = await import("../../src/services/CapabilityService.js");

// 状态缩写映射
const STATUS_ABBREV: Record<string, string> = {
  completed: "com",
  implementing: "imp",
  validating: "val",
  planning: "pla",
  pending: "pen",
  monitoring: "mon",
  cancelled: "can",
  failed: "fai",
};

describe("TutorialService", () => {
  let basePath: string;
  let fsAdapter: FileSystemAdapter;
  let json: JsonStorage;
  let md: MarkdownStorage;
  let workspaceService: WorkspaceService;
  let nodeService: NodeService;
  let stateService: StateService;
  let logService: LogService;
  let contextService: ContextService;
  let referenceService: ReferenceService;
  let dispatchService: DispatchService;
  let configService: ConfigService;
  let memoService: MemoService;
  let tutorialService: TutorialService;

  beforeEach(async () => {
    // 清理测试目录
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {
      // 忽略
    }

    basePath = path.join(process.cwd(), testBasePath);
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});

    // 创建必要的目录结构
    await fs.mkdir(mockHomeDir, { recursive: true });

    // 初始化所有服务
    fsAdapter = new FileSystemAdapter();
    json = new JsonStorage(fsAdapter);
    md = new MarkdownStorage(fsAdapter);
    workspaceService = new WorkspaceService(json, md, fsAdapter);
    nodeService = new NodeService(json, md, fsAdapter);
    stateService = new StateService(json, md, fsAdapter);
    logService = new LogService(json, md, fsAdapter);
    contextService = new ContextService(json, md, fsAdapter);
    referenceService = new ReferenceService(json, md, fsAdapter);
    configService = new ConfigService();
    dispatchService = new DispatchService(json, md, fsAdapter, configService);
    memoService = new MemoService(json, md, fsAdapter);

    tutorialService = new TutorialService(
      workspaceService,
      nodeService,
      stateService,
      logService,
      contextService,
      referenceService,
      dispatchService,
      configService,
      memoService
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => {});
  });

  describe("ensureTutorial", () => {
    it("应该创建功能简介工作区", async () => {
      const result = await tutorialService.ensureTutorial();
      expect(result).toBe(true);

      // 验证功能简介工作区已创建
      const list = await workspaceService.list({});
      const introWs = list.workspaces.find(ws => ws.name === "TanmiWorkspace 功能简介");
      expect(introWs).toBeDefined();
    });

    it("应该创建版本更新工作区", async () => {
      await tutorialService.ensureTutorial();

      // 验证版本更新工作区已创建
      const list = await workspaceService.list({});
      const versionWs = list.workspaces.find(ws => ws.name === "TanmiWorkspace 版本更新");
      expect(versionWs).toBeDefined();
    });

    it("不应该重复创建教程工作区", async () => {
      // 第一次创建
      await tutorialService.ensureTutorial();

      // 第二次调用不应该重复创建
      const result = await tutorialService.ensureTutorial();
      expect(result).toBe(false);

      // 验证只有一个功能简介工作区
      const list = await workspaceService.list({});
      const introWorkspaces = list.workspaces.filter(ws => ws.name === "TanmiWorkspace 功能简介");
      expect(introWorkspaces).toHaveLength(1);
    });
  });

  describe("manualTriggerTutorial", () => {
    it("应该能手动触发重建教程工作区", async () => {
      // 先创建教程工作区
      await tutorialService.ensureTutorial();

      // 手动触发重建
      const result = await tutorialService.manualTriggerTutorial();
      expect(result.created).toBe(true);
      expect(result.message).toContain("重新生成");
    });
  });

  describe("功能简介工作区结构", () => {
    it("应该包含流程阶段节点", async () => {
      await tutorialService.ensureTutorial();

      const list = await workspaceService.list({});
      const introWs = list.workspaces.find(ws => ws.name === "TanmiWorkspace 功能简介");
      expect(introWs).toBeDefined();

      const wsDetail = await workspaceService.get({ workspaceId: introWs!.id });

      // 验证流程阶段节点存在（topology 使用 title 字段）
      const flowStageNode = findNodeByTitle(wsDetail.topology, "流程阶段");
      expect(flowStageNode).toBeDefined();
      // topology 没有 type 字段，检查 status 缩写表示处于 monitoring 状态
      expect(flowStageNode!.status).toBe(STATUS_ABBREV.monitoring);

      // 验证流程阶段有3个子节点
      expect(flowStageNode!.children).toHaveLength(3);

      // 验证子节点标题和状态（使用缩写）
      const infoStage = flowStageNode!.children!.find((n: any) => n.title === "信息阶段");
      const designStage = flowStageNode!.children!.find((n: any) => n.title === "规划阶段");
      const implStage = flowStageNode!.children!.find((n: any) => n.title === "执行阶段");

      expect(infoStage).toBeDefined();
      expect(designStage).toBeDefined();
      expect(implStage).toBeDefined();

      expect(infoStage!.status).toBe(STATUS_ABBREV.completed);
      expect(designStage!.status).toBe(STATUS_ABBREV.implementing);
      expect(implStage!.status).toBe(STATUS_ABBREV.pending);
    });

    it("应该包含信息收集节点且处于监视状态", async () => {
      await tutorialService.ensureTutorial();

      const list = await workspaceService.list({});
      const introWs = list.workspaces.find(ws => ws.name === "TanmiWorkspace 功能简介");
      const wsDetail = await workspaceService.get({ workspaceId: introWs!.id });

      // 找到执行节点演示下的信息收集节点
      const execDemoNode = findNodeByTitle(wsDetail.topology, "执行节点演示");
      expect(execDemoNode).toBeDefined();

      const infoCollectionNode = execDemoNode!.children!.find((n: any) => n.title === "信息收集");
      expect(infoCollectionNode).toBeDefined();
      expect(infoCollectionNode!.status).toBe(STATUS_ABBREV.monitoring);
    });

    it("信息收集节点的能力子节点应有不同状态", async () => {
      await tutorialService.ensureTutorial();

      const list = await workspaceService.list({});
      const introWs = list.workspaces.find(ws => ws.name === "TanmiWorkspace 功能简介");
      const wsDetail = await workspaceService.get({ workspaceId: introWs!.id });

      // 找到信息收集节点
      const execDemoNode = findNodeByTitle(wsDetail.topology, "执行节点演示");
      const infoCollectionNode = execDemoNode!.children!.find((n: any) => n.title === "信息收集");
      expect(infoCollectionNode).toBeDefined();
      expect(infoCollectionNode!.children).toBeDefined();

      // 验证能力子节点状态（使用缩写）
      // 前3个应该是 completed
      const intentAlignment = infoCollectionNode!.children!.find((n: any) => n.title === "意图对齐");
      const contextDiscovery = infoCollectionNode!.children!.find((n: any) => n.title === "上下文探索");
      const diagnosis = infoCollectionNode!.children!.find((n: any) => n.title === "诊断分析");

      expect(intentAlignment?.status).toBe(STATUS_ABBREV.completed);
      expect(contextDiscovery?.status).toBe(STATUS_ABBREV.completed);
      expect(diagnosis?.status).toBe(STATUS_ABBREV.completed);

      // 技术调研应该是 implementing
      const techResearch = infoCollectionNode!.children!.find((n: any) => n.title === "技术调研");
      expect(techResearch?.status).toBe(STATUS_ABBREV.implementing);

      // 后3个应该是 pending
      const measurement = infoCollectionNode!.children!.find((n: any) => n.title === "度量分析");
      const solution = infoCollectionNode!.children!.find((n: any) => n.title === "方案设计");
      const verification = infoCollectionNode!.children!.find((n: any) => n.title === "验证策略");

      expect(measurement?.status).toBe(STATUS_ABBREV.pending);
      expect(solution?.status).toBe(STATUS_ABBREV.pending);
      expect(verification?.status).toBe(STATUS_ABBREV.pending);
    });

    it("应该包含界面导航节点", async () => {
      await tutorialService.ensureTutorial();

      const list = await workspaceService.list({});
      const introWs = list.workspaces.find(ws => ws.name === "TanmiWorkspace 功能简介");
      const wsDetail = await workspaceService.get({ workspaceId: introWs!.id });

      // 界面导航节点应该存在（由于子节点全部完成，可能在 _done 数组中）
      // 先尝试在 children 中找，如果没有就检查 _done
      let navNode = findNodeByTitle(wsDetail.topology, "界面导航");
      if (!navNode && wsDetail.topology._done) {
        // 如果节点已完成，它可能只显示在 _done 标题列表中
        expect(wsDetail.topology._done).toContain("界面导航");
        return;
      }
      expect(navNode).toBeDefined();
    });

    it("应该包含规划节点演示", async () => {
      await tutorialService.ensureTutorial();

      const list = await workspaceService.list({});
      const introWs = list.workspaces.find(ws => ws.name === "TanmiWorkspace 功能简介");
      const wsDetail = await workspaceService.get({ workspaceId: introWs!.id });

      const planDemoNode = findNodeByTitle(wsDetail.topology, "规划节点演示");
      // 规划节点演示处于 monitoring 状态，应该在 children 中
      expect(planDemoNode).toBeDefined();
    });

    it("应该包含日志系统节点", async () => {
      await tutorialService.ensureTutorial();

      const list = await workspaceService.list({});
      const introWs = list.workspaces.find(ws => ws.name === "TanmiWorkspace 功能简介");
      const wsDetail = await workspaceService.get({ workspaceId: introWs!.id });

      // 日志系统节点已完成，可能在 _done 中
      let logNode = findNodeByTitle(wsDetail.topology, "日志系统");
      if (!logNode && wsDetail.topology._done) {
        expect(wsDetail.topology._done).toContain("日志系统");
        return;
      }
      expect(logNode).toBeDefined();
    });

    it("应该包含派发模式节点", async () => {
      await tutorialService.ensureTutorial();

      const list = await workspaceService.list({});
      const introWs = list.workspaces.find(ws => ws.name === "TanmiWorkspace 功能简介");
      const wsDetail = await workspaceService.get({ workspaceId: introWs!.id });

      const dispatchNode = findNodeByTitle(wsDetail.topology, "派发模式");
      // 派发模式处于 monitoring 状态，应该在 children 中
      expect(dispatchNode).toBeDefined();
    });
  });

  describe("版本更新工作区结构", () => {
    it("应该包含版本节点", async () => {
      await tutorialService.ensureTutorial();

      const list = await workspaceService.list({});
      const versionWs = list.workspaces.find(ws => ws.name === "TanmiWorkspace 版本更新");
      expect(versionWs).toBeDefined();

      const wsDetail = await workspaceService.get({ workspaceId: versionWs!.id });

      // 根节点应该有子节点（版本分组）
      expect(wsDetail.topology.children).toBeDefined();
      expect(wsDetail.topology.children!.length).toBeGreaterThan(0);
    });
  });

  describe("能力列表同步检测", () => {
    it("教程中的能力子节点应与 ALL_CAPABILITY_IDS 保持同步", async () => {
      await tutorialService.ensureTutorial();

      const list = await workspaceService.list({});
      const introWs = list.workspaces.find(ws => ws.name === "TanmiWorkspace 功能简介");
      expect(introWs).toBeDefined();

      const wsDetail = await workspaceService.get({ workspaceId: introWs!.id });

      // 找到信息收集节点
      const execDemoNode = findNodeByTitle(wsDetail.topology, "执行节点演示");
      expect(execDemoNode).toBeDefined();

      const infoCollectionNode = execDemoNode!.children!.find((n: any) => n.title === "信息收集");
      expect(infoCollectionNode).toBeDefined();
      expect(infoCollectionNode!.children).toBeDefined();

      // 获取信息收集下所有能力子节点的标题
      const capabilityNodeTitles = infoCollectionNode!.children!.map((n: any) => n.title);

      // 获取 ALL_CAPABILITY_IDS 对应的显示名称
      const expectedTitles = ALL_CAPABILITY_IDS.map(id => capabilityService.getCapabilityInfo(id).name);

      // 验证所有能力都有对应的节点
      for (const expectedTitle of expectedTitles) {
        expect(capabilityNodeTitles).toContain(expectedTitle);
      }

      // 验证数量一致（没有多余的节点）
      expect(capabilityNodeTitles.length).toBe(expectedTitles.length);
    });

    it("ALL_CAPABILITY_IDS 应包含所有已定义的能力", () => {
      // 验证 ALL_CAPABILITY_IDS 不为空
      expect(ALL_CAPABILITY_IDS.length).toBeGreaterThan(0);

      // 验证每个 ID 都能获取到能力信息（不会抛出异常）
      for (const capabilityId of ALL_CAPABILITY_IDS) {
        const info = capabilityService.getCapabilityInfo(capabilityId);
        expect(info).toBeDefined();
        expect(info.id).toBe(capabilityId);
        expect(info.name).toBeTruthy();
      }
    });
  });
});

/**
 * 递归查找节点
 */
function findNodeByTitle(node: any, title: string): any | undefined {
  if (node.title === title) {
    return node;
  }
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByTitle(child, title);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}
