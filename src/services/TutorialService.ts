// src/services/TutorialService.ts

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import type { WorkspaceService } from "./WorkspaceService.js";
import type { NodeService } from "./NodeService.js";
import type { StateService } from "./StateService.js";
import type { LogService } from "./LogService.js";
import type { ContextService } from "./ContextService.js";
import type { ReferenceService } from "./ReferenceService.js";
import type { DispatchService } from "./DispatchService.js";
import type { ConfigService } from "./ConfigService.js";
import type { MemoService } from "./MemoService.js";
import pkg from "../../package.json" with { type: "json" };

/**
 * 版本说明数据结构
 */
interface VersionNote {
  version: string;
  requirement: string;
  conclusion: string;
  note: string;
}

interface VersionNotesFile {
  versions: VersionNote[];
}

/**
 * 教程节点定义
 */
interface TutorialNode {
  type: "planning" | "execution";
  title: string;
  requirement: string;
  role?: "info_collection";
  targetStatus?: string;  // 目标状态
  conclusion?: string;    // 结论
  note?: string;          // 备注
  problem?: string;       // 问题
  docs?: Array<{ path: string; description: string }>;  // 节点文档引用
  logs?: Array<{ operator: "AI" | "Human"; event: string }>;
  setFocus?: boolean;     // 是否设为焦点
  children?: TutorialNode[];
  // hack: 派发信息（直接写入节点）
  dispatchInfo?: {
    status: "pending" | "executing" | "testing" | "passed" | "failed";
    startMarker: string;
    endMarker?: string;
  };
  // memo: 创建备忘并添加引用
  memo?: {
    title: string;
    summary: string;
    content: string;
  };
}

/**
 * 教程版本 - 与系统版本同步，版本变更时会自动重建教程工作区
 */
const TUTORIAL_VERSION = pkg.version as string;

/**
 * 教程工作区内容
 */
const TUTORIAL_CONTENT = {
  name: "TanmiWorkspace 功能简介",
  goal: "了解 TanmiWorkspace 的核心功能和使用方式",
  rules: [
    "这是一个演示用的工作区，可以随意操作",
    "规则用于约束 AI 行为，如代码风格、提交规范等",
  ],
  docs: [
    { path: "README.md", description: "项目说明文档（演示用）" },
  ],
  nodes: [
    // 界面导航
    {
      type: "planning" as const,
      title: "界面导航",
      requirement: "熟悉 WebUI 的基本操作",
      // 有子节点的规划节点自动进入 monitoring，不设置 targetStatus
      children: [
        {
          type: "execution" as const,
          title: "视图切换",
          requirement: `WebUI 提供两种视图查看工作区：
- **列表视图**：树形结构，适合查看层级关系
- **图形视图**：可视化节点图，适合把握全局

可在左侧面板顶部切换视图模式。`,
          targetStatus: "completed",
          conclusion: "已了解两种视图的切换方式和适用场景",
        },
        {
          type: "execution" as const,
          title: "焦点功能",
          requirement: `本节点已被设为焦点，注意观察：
- 左侧树中焦点节点有特殊标记（红色准星）
- AI 通过 context_get 获取焦点节点的完整上下文
- AI 可通过 context_focus 设置焦点节点`,
          setFocus: true,
          targetStatus: "completed",
          conclusion: "焦点功能帮助 AI 聚焦当前工作节点",
        },
        {
          type: "execution" as const,
          title: "工作区详情",
          requirement: `工作区包含以下全局信息：
- **Goal**：工作区目标，描述整体任务方向
- **Rules**：所有节点可见的工作规则，AI 执行时需遵守的约束
- **Docs**：全局文档，将在规划子节点时选择性传递

可在页面顶部「Detail」按钮查看详情。`,
          targetStatus: "completed",
          conclusion: "工作区详情包含全局配置信息",
        },
        {
          type: "execution" as const,
          title: "数据刷新",
          requirement: `WebUI 提供两种刷新方式：
- **自动刷新**：页面每 5 秒自动刷新一次
- **手动刷新**：点击「刷新」按钮立即更新

刷新可获取 AI 的最新操作结果。`,
          targetStatus: "completed",
          conclusion: "刷新机制确保 WebUI 与后端数据同步",
        },
      ],
    },
    // 节点体系 - 规划节点
    {
      type: "planning" as const,
      title: "规划节点演示",
      requirement: `规划节点用于分解复杂任务，可以创建子节点。

**状态流转：** pending → planning → monitoring → completed/cancelled

本节点处于 **monitoring** 状态，正在等待子节点完成。
当所有子节点完成后，可以点击「完成」汇总结论。`,
      children: [
        {
          type: "planning" as const,
          title: "待规划节点",
          requirement: `这是一个 **pending** 状态的规划节点。

任务尚未开始规划，AI 获取此节点后将分析任务并创建子节点。`,
        },
        {
          type: "planning" as const,
          title: "规划中节点",
          requirement: `这是一个 **planning** 状态的规划节点。

AI 正在分析任务、设计方案，完成后将创建子节点进入 monitoring 状态。`,
          targetStatus: "planning",
        },
        {
          type: "planning" as const,
          title: "已完成的规划",
          requirement: `这是一个已完成的规划节点。

完成规划节点时需要填写结论（Conclusion），总结子任务的执行结果。
结论会显示在父节点的「Child Conclusions」区域。`,
          targetStatus: "completed",
          conclusion: "演示规划节点的完成状态，结论会向上汇报给父节点",
          children: [
            {
              type: "execution" as const,
              title: "已完成子任务",
              requirement: "这是已完成规划下的子任务",
              targetStatus: "completed",
              conclusion: "子任务执行完毕",
            },
          ],
        },
        {
          type: "planning" as const,
          title: "已取消的规划",
          requirement: `这是一个已取消的规划节点。

当 AI 判断任务不再需要执行时，会取消规划并填写结论说明原因。`,
          targetStatus: "cancelled",
          conclusion: "演示规划节点的取消状态",
          children: [
            {
              type: "execution" as const,
              title: "被跳过的任务",
              requirement: "父节点取消后，子任务也不再执行",
            },
          ],
        },
      ],
    },
    // 节点体系 - 执行节点
    {
      type: "planning" as const,
      title: "执行节点演示",
      requirement: `执行节点用于具体任务执行，不能有子节点。

**状态流转：** pending → implementing → validating → completed/failed

同一父节点下同时只能有一个节点在执行状态。

**文档引用**
规划子节点时可以从全局文档中选择性分发给子节点。
本规划节点引用了演示文档，查看「Docs」区域可以看到引用列表。`,
      docs: [
        { path: "README.md", description: "项目说明文档（演示用）" },
      ],
      children: [
        {
          type: "execution" as const,
          title: "待执行",
          requirement: `这是一个 **pending** 状态的执行节点。

任务尚未开始，AI 获取此节点后将开始执行。`,
        },
        {
          type: "planning" as const,
          title: "执行中状态",
          requirement: `这是一个包含执行中任务的规划节点。

子节点正在 **implementing** 状态（蓝白斜纹图标）。`,
          children: [
            {
              type: "execution" as const,
              title: "正在执行",
              requirement: `这是一个 **implementing** 状态的执行节点。

任务正在执行中，完成后 AI 将提交验证或直接完成任务。`,
              targetStatus: "implementing",
            },
          ],
        },
        {
          type: "planning" as const,
          title: "验证中状态",
          requirement: `这是一个包含验证中任务的规划节点。

子节点正在 **validating** 状态（橙色图标）。`,
          children: [
            {
              type: "execution" as const,
              title: "等待验证",
              requirement: `这是一个 **validating** 状态的执行节点。

任务已提交验证，AI 将根据验证结果决定完成或标记失败。`,
              targetStatus: "validating",
            },
          ],
        },
        {
          type: "execution" as const,
          title: "已完成",
          requirement: `这是一个 **completed** 状态的执行节点。

任务已完成，结论会显示在父节点的「Child Conclusions」区域。

**备注（Note）**
节点可以记录备注信息，用于临时笔记、补充说明等。
本节点的备注区域有演示内容。`,
          targetStatus: "completed",
          conclusion: "执行节点完成后的结论示例",
          note: "这是一个演示用的备注内容。备注可以记录任务执行过程中的临时笔记、补充信息等。",
        },
        {
          type: "execution" as const,
          title: "已失败",
          requirement: `这是一个 **failed** 状态的执行节点。

任务执行失败，AI 可以根据失败原因决定是否重试。

**问题（Problem）**
节点可以记录当前遇到的障碍或待解决事项。
AI 会在执行时关注问题内容，本节点的问题区域有演示内容。`,
          targetStatus: "failed",
          conclusion: "失败原因：演示失败状态",
          problem: "这是一个演示用的问题内容，实际使用时会记录具体的障碍或待解决事项。",
        },
        {
          type: "execution" as const,
          title: "信息收集节点",
          requirement: `这是一个特殊角色的执行节点：**信息收集 (info_collection)**

信息收集节点用于需求澄清、调研分析、方案评审等场景。
在树视图中节点标签后显示 INFO 标牌，便于快速识别。

**MEMO 功能**
本节点创建了一个 MEMO，用于记录长篇内容。点击「References」区域查看引用。`,
          role: "info_collection",
          targetStatus: "completed",
          conclusion: "信息收集节点适合需求澄清和调研分析",
          note: "短内容用 Note，长内容用 MEMO",
          memo: {
            title: "MEMO 功能说明",
            summary: "演示 MEMO 的使用方式和适用场景",
            content: `# MEMO 功能说明

## 什么是 MEMO

MEMO 是节点级的长篇内容记录功能，适合存储：
- 技术调研笔记
- 方案设计文档
- 会议记录
- 知识沉淀

## MEMO的特点
- 独立存储且可被节点引用
- 方便临时记录再后续分析

## 与 Note 的区别

| 特性 | Note（备注） | MEMO |
|------|-------------|------|
| 长度 | 短文本 | 长篇内容 |
| 显示 | 直接展示 | 独立标签页 |
| 关系 | 绑定节点 | 独立存储且可被节点引用 |

## 使用方法

在对话中告知AI使用memo创建草稿/总结上文/跟进讨论
`,
          },
        },
      ],
    },
    // 日志系统
    {
      type: "execution" as const,
      title: "日志系统",
      requirement: `每个节点都有操作日志，记录任务执行过程。

查看下方「Log」区域，可以看到：
- 状态变更记录
- 操作者标识（AI / Human）
- 时间戳

日志用于追踪任务执行过程、问题排查和复盘。`,
      logs: [
        { operator: "AI", event: "开始执行任务" },
        { operator: "AI", event: "分析需求完成" },
        { operator: "Human", event: "补充了额外的需求说明" },
        { operator: "AI", event: "根据补充需求调整方案" },
        { operator: "AI", event: "任务执行完成" },
      ],
      targetStatus: "completed",
      conclusion: "日志记录了完整的任务执行过程",
    },
    // 手动变更
    {
      type: "execution" as const,
      title: "手动变更",
      requirement: `这是一个演示 **validating** 状态的节点。

任务正在等待验证，AI 将根据验证结果决定后续操作。

---

**关于手动操作**

在特殊情况下（如 AI 不在线、需要紧急干预），可以通过 WebUI 进行手动操作：

- **手动变更标记**：WebUI 编辑后会显示标记，AI 读取时自动清除
- **协作建议**：避免与 AI 同时操作同一节点，如有冲突以最新保存为准`,
      targetStatus: "validating",
    },
    // 派发模式
    {
      type: "planning" as const,
      title: "派发模式",
      requirement: `派发模式用于自动化任务执行流程。

**工作流程**
1. AI 规划完成一阶段任务
2. 按照逻辑循序，逐步准备待派发的细分任务需求和验收标准
3. 将任务使用 SubAgent 进行派发，其具有明确的任务需求与完成单个任务的信息
4. 完成后，SubAgent 将信息结论写入派发节点，并将控制权转回主 AI
5. 在执行中，SubAgent 自行判断提供的信息与任务规模，在超出能力范围时将主动设置失败以让主 AI 重新规划

**注意**：派发模式默认关闭，需要用户主动提出启用或在 WebUI 手动开启。`,
      children: [
        {
          type: "execution" as const,
          title: "派发控制",
          requirement: `派发模式需要主动启用才能生效。

**如何启用**
- 用户主动提出为项目开启派发模式
- 或在 WebUI 工作区详情中手动启用

**默认行为**
- 项目默认关闭派发模式
- 可在全局设置中修改默认派发模式

**WebUI 显示**
- 「Dispatch: none」表示未启用
- 「Dispatch: no-git」或「git」表示已启用`,
        },
        // 无派发模式必须在最后（implementing 状态会阻止后续节点状态转换）
        {
          type: "planning" as const,
          title: "启用派发",
          requirement: `派发分为两种模式：**默认派发** 和 **Git 派发**。

两种模式各有适用场景，建议根据任务性质选择。

**重要提示**：不建议在任务进行中切换派发模式，可能导致状态不一致。`,
          children: [
            {
              type: "execution" as const,
              title: "默认派发",
              requirement: `**推荐模式** - 自动化任务流转

使用场景：
- 日常开发任务
- 文档编写
- 已细化的大型任务

特点：
- 自动分配下一个待执行节点
- 任务完成后自动流转到下一个
- 不涉及 Git 操作，简单快速`,
              targetStatus: "completed",
              conclusion: "默认派发适合大多数日常任务",
              dispatchInfo: {
                status: "passed",
                startMarker: "2025-12-21T19:30:00.000Z",
                endMarker: "2025-12-21T19:45:00.000Z",
              },
            },
            {
              type: "execution" as const,
              title: "Git 派发",
              requirement: `**代码隔离模式** - 实验性功能

使用场景：
- 复杂代码修改任务
- 可能失败需要回滚的操作
- 需要版本控制的变更

工作原理：
1. 创建独立 Git 分支
2. 在分支上执行任务
3. 所有任务完成后根据用户需要进行分支操作
4. 失败时可丢弃分支回滚

要求：项目必须是 Git 仓库`,
              targetStatus: "validating",
              problem: "此功能为实验性功能，请注意 AI 行为，避免信息丢失。建议在使用前确保代码已提交。",
              logs: [
                { operator: "AI", event: "创建分支 tanmi/task-xxx" },
                { operator: "AI", event: "执行任务" },
                { operator: "AI", event: "任务完成，等待验证" },
              ],
              dispatchInfo: {
                status: "testing",
                startMarker: "abc1234",
              },
            },
          ],
        },
        {
          type: "execution" as const,
          title: "无派发模式",
          requirement: `**手动管理模式** - 项目默认状态

使用场景：
- 探索性任务，不确定下一步做什么
- 需要逐个审核每个节点的执行结果

AI 需要自行管理状态切换，并选择下一个要执行的节点。

本节点正在模拟手动执行中的状态。`,
          targetStatus: "implementing",
          logs: [
            { operator: "AI", event: "手动选择任务开始执行" },
            { operator: "AI", event: "正在执行任务..." },
          ],
        },
      ],
    },
  ] as TutorialNode[],
};

/**
 * 教程服务
 * 负责创建新手教程工作区
 */
export class TutorialService {
  constructor(
    private workspace: WorkspaceService,
    private node: NodeService,
    private state: StateService,
    private log: LogService,
    private context: ContextService,
    private reference: ReferenceService,
    private dispatch: DispatchService,
    private config: ConfigService,
    private memo: MemoService
  ) {}

  /**
   * 获取教程目录路径
   */
  private getTutorialDir(): string {
    const isDev = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
    const baseDir = isDev ? ".tanmi-workspace-dev" : ".tanmi-workspace";
    return path.join(os.homedir(), baseDir, "tutorial");
  }

  /**
   * 检查并创建教程工作区和版本更新工作区
   * - 教程工作区：只创建一次（通过 tutorialCreated 标记）
   * - 版本更新工作区：版本变更时创建（如果不存在）
   */
  async ensureTutorial(): Promise<boolean> {
    const currentConfig = await this.config.readConfig();
    let needsConfigUpdate = false;
    const configUpdates: Partial<typeof currentConfig> = {};

    // 1. 检查是否需要创建教程工作区（只创建一次）
    if (!currentConfig.tutorialCreated) {
      try {
        await this.createTutorialWorkspace();
        configUpdates.tutorialCreated = true;
        configUpdates.tutorialVersion = TUTORIAL_VERSION;
        needsConfigUpdate = true;
      } catch (err) {
        console.error("[Tutorial] Failed to create tutorial workspace:", err);
      }
    }

    // 2. 检查是否需要创建版本更新工作区
    const oldVersion = currentConfig.tutorialVersion;
    if (oldVersion !== TUTORIAL_VERSION) {
      try {
        // 对于老用户升级，显示所有版本差异
        await this.ensureVersionUpdateWorkspace(oldVersion, false);
        configUpdates.tutorialVersion = TUTORIAL_VERSION;
        needsConfigUpdate = true;
      } catch (err) {
        console.error("[Tutorial] Failed to create version update workspace:", err);
      }
    }

    // 3. 更新配置
    if (needsConfigUpdate) {
      await this.config.writeConfig({
        ...currentConfig,
        ...configUpdates,
      });
    }

    return needsConfigUpdate;
  }

  /**
   * 手动触发创建教程工作区（通过设置页面连续点击版本号5次触发）
   * 如果教程不存在，创建完整版本历史
   */
  async manualTriggerTutorial(): Promise<{ created: boolean; message: string }> {
    const tutorialDir = this.getTutorialDir();
    const existingWorkspaces = await this.workspace.list({});

    // 检查功能简介工作区
    const introWs = existingWorkspaces.workspaces.find(
      ws => ws.name === "TanmiWorkspace 功能简介" && ws.projectRoot === tutorialDir
    );

    // 检查版本更新工作区
    const versionWs = existingWorkspaces.workspaces.find(
      ws => ws.name === "TanmiWorkspace 版本更新" && ws.projectRoot === tutorialDir
    );

    const results: string[] = [];

    // 创建缺失的工作区
    if (!introWs) {
      await this.createTutorialWorkspace();
      results.push("功能简介");
    }

    if (!versionWs) {
      // 手动触发时显示完整版本历史
      await this.createVersionUpdateWorkspace(undefined, true);
      results.push("版本更新（完整历史）");
    }

    if (results.length === 0) {
      return { created: false, message: "教程工作区已存在" };
    }

    // 更新配置
    const currentConfig = await this.config.readConfig();
    await this.config.writeConfig({
      ...currentConfig,
      tutorialCreated: true,
      tutorialVersion: TUTORIAL_VERSION,
    });

    return { created: true, message: `已创建：${results.join("、")}` };
  }

  /**
   * 确保版本更新工作区存在
   * 如果不存在则创建，存在则添加新版本节点
   * @param oldVersion 旧版本号（用于筛选需要显示的版本）
   * @param fullHistory 是否显示完整历史（手动触发时为 true）
   */
  private async ensureVersionUpdateWorkspace(oldVersion: string | undefined, fullHistory: boolean = false): Promise<void> {
    const tutorialDir = this.getTutorialDir();
    await fs.mkdir(tutorialDir, { recursive: true });

    // 检查是否已存在版本更新工作区
    const existingWorkspaces = await this.workspace.list({});
    const versionWs = existingWorkspaces.workspaces.find(
      ws => ws.name === "TanmiWorkspace 版本更新" && ws.projectRoot === tutorialDir
    );

    if (versionWs) {
      // 已存在，添加新版本节点
      await this.addVersionNodes(versionWs.id, oldVersion, fullHistory);
    } else {
      // 创建新的版本更新工作区
      await this.createVersionUpdateWorkspace(oldVersion, fullHistory);
    }
  }

  /**
   * 读取版本说明文件
   * 向后兼容：优先尝试 assets/，回退到 docs/
   */
  private async readVersionNotes(): Promise<VersionNote[]> {
    // 使用模块相对路径，避免 process.cwd() 在不同启动目录下的问题
    const paths = [
      path.join(__dirname, "../../assets/version-notes.yaml"),
      path.join(__dirname, "../../docs/version-notes.yaml"), // 向后兼容旧目录
    ];

    for (const notesPath of paths) {
      try {
        const content = await fs.readFile(notesPath, "utf-8");
        const data = YAML.parse(content) as VersionNotesFile;
        return data.versions || [];
      } catch {
        continue;
      }
    }
    return [];
  }

  /**
   * 比较版本号，返回 1 如果 a > b，-1 如果 a < b，0 如果相等
   */
  private compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if (pa[i] > pb[i]) return 1;
      if (pa[i] < pb[i]) return -1;
    }
    return 0;
  }

  /**
   * 获取版本的 major.minor
   */
  private getMajorMinor(version: string): string {
    const [major, minor] = version.split(".");
    return `${major}.${minor}`;
  }

  /**
   * 判断是否是 major/minor 版本 (x.y.0)
   */
  private isMajorMinorVersion(version: string): boolean {
    return version.endsWith(".0");
  }

  /**
   * 筛选并分组版本
   * @param versions 所有版本数据
   * @param oldVersion 旧版本号（用于筛选升级用户需要看到的版本）
   * @param fullHistory 是否显示完整历史（true: 手动触发，false: 自动创建时限制为3个大版本）
   */
  private groupVersions(
    versions: VersionNote[],
    oldVersion: string | undefined,
    fullHistory: boolean = false
  ): Map<string, { major: VersionNote | null; patches: VersionNote[]; hasMinorStart: boolean }> {
    // 筛选 oldVersion < v <= currentVersion 的版本
    let filtered = versions.filter(v => {
      const gtOld = !oldVersion || this.compareVersions(v.version, oldVersion) > 0;
      const leqCurrent = this.compareVersions(v.version, TUTORIAL_VERSION) <= 0;
      return gtOld && leqCurrent;
    });

    // 如果不是完整历史模式，且 oldVersion 为 undefined（新用户），则只显示最近 3 个大版本
    if (!fullHistory && oldVersion === undefined) {
      // 获取所有不同的 major.minor 版本
      const majorMinors = new Set<string>();
      for (const v of filtered) {
        majorMinors.add(this.getMajorMinor(v.version));
      }

      // 按版本号排序（降序）
      const sortedMM = Array.from(majorMinors).sort((a, b) => {
        const [aMajor, aMinor] = a.split(".").map(Number);
        const [bMajor, bMinor] = b.split(".").map(Number);
        if (aMajor !== bMajor) return bMajor - aMajor;
        return bMinor - aMinor;
      });

      // 只保留最近 3 个大版本
      const recentMM = new Set(sortedMM.slice(0, 3));
      filtered = filtered.filter(v => recentMM.has(this.getMajorMinor(v.version)));
    }

    // 按 major.minor 分组
    const groups = new Map<string, { major: VersionNote | null; patches: VersionNote[]; hasMinorStart: boolean }>();

    for (const v of filtered) {
      const mm = this.getMajorMinor(v.version);
      if (!groups.has(mm)) {
        groups.set(mm, { major: null, patches: [], hasMinorStart: false });
      }
      const group = groups.get(mm)!;

      if (this.isMajorMinorVersion(v.version)) {
        group.major = v;
        group.hasMinorStart = true;
      } else {
        group.patches.push(v);
      }
    }

    // 按 patch 版本号排序（降序，新版本在前）
    for (const group of groups.values()) {
      group.patches.sort((a, b) => this.compareVersions(b.version, a.version));
    }

    return groups;
  }

  /**
   * 创建版本更新工作区
   * @param oldVersion 旧版本号
   * @param fullHistory 是否显示完整历史
   */
  private async createVersionUpdateWorkspace(oldVersion: string | undefined, fullHistory: boolean = false): Promise<void> {
    const tutorialDir = this.getTutorialDir();

    const result = await this.workspace.init({
      name: "TanmiWorkspace 版本更新",
      goal: `查看 TanmiWorkspace 版本更新内容`,
      projectRoot: tutorialDir,
      rules: ["这是版本更新说明工作区，记录各版本的功能变更"],
    });

    await this.addVersionNodes(result.workspaceId, oldVersion, fullHistory);
  }

  /**
   * 添加版本节点到工作区
   * @param workspaceId 工作区ID
   * @param oldVersion 旧版本号
   * @param fullHistory 是否显示完整历史
   */
  private async addVersionNodes(workspaceId: string, oldVersion: string | undefined, fullHistory: boolean = false): Promise<void> {
    const versions = await this.readVersionNotes();
    const groups = this.groupVersions(versions, oldVersion, fullHistory);

    if (groups.size === 0) {
      return;
    }

    const rulesHash = crypto.createHash("md5")
      .update("这是版本更新说明工作区，记录各版本的功能变更")
      .digest("hex")
      .substring(0, 8);

    // 按 major.minor 版本号排序（降序，新版本在前）
    const sortedMajorMinors = Array.from(groups.keys()).sort((a, b) => {
      const [aMajor, aMinor] = a.split(".").map(Number);
      const [bMajor, bMinor] = b.split(".").map(Number);
      if (aMajor !== bMajor) return bMajor - aMajor;
      return bMinor - aMinor;
    });

    let latestNodeId: string | null = null; // 记录最新版本节点 ID
    let rootReopened = false; // 标记是否已 reopen 根节点

    for (const mm of sortedMajorMinors) {
      // 如果根节点已完成，需要先 reopen 才能添加新子节点
      if (!rootReopened) {
        const rootNode = await this.node.get({ workspaceId, nodeId: "root" });
        if (rootNode.meta.status === "completed") {
          await this.state.transition({
            workspaceId,
            nodeId: "root",
            action: "reopen",
          });
        }
        rootReopened = true;
      }

      const group = groups.get(mm)!;

      // 创建 major.minor 规划节点
      let majorRequirement: string;
      let majorConclusion: string | undefined;
      let majorNote: string | undefined;

      if (group.hasMinorStart && group.major) {
        // 用户从这个 minor 版本开始，显示完整内容
        majorRequirement = group.major.requirement || `v${mm} 版本更新`;
        majorConclusion = group.major.conclusion;
        majorNote = group.major.note;
      } else {
        // 用户中途加入，只显示简要说明
        majorRequirement = `这是 v${mm} 版本期间的优化`;
      }

      const majorNodeResult = await this.node.create({
        workspaceId,
        parentId: "root",
        type: "planning",
        title: `V${mm} 版本更新`,
        requirement: majorRequirement,
        rulesHash,
      });

      // 如果有 major 节点的结论，设置到节点
      if (majorConclusion || majorNote) {
        await this.node.update({
          workspaceId,
          nodeId: majorNodeResult.nodeId,
          note: majorNote,
        });
      }

      // 创建 patch 版本子节点
      for (const patch of group.patches) {
        // 需求：版本更新详情 + requirement
        const patchRequirement = patch.requirement
          ? `V${patch.version} 版本更新详情：\n${patch.requirement}`
          : `V${patch.version} 版本更新`;

        const patchNodeResult = await this.node.create({
          workspaceId,
          parentId: majorNodeResult.nodeId,
          type: "execution",
          title: `V${patch.version} 版本更新`,
          requirement: patchRequirement,
          rulesHash,
        });

        // 记录第一个（最新）节点 ID 用于设置 focus
        if (!latestNodeId) {
          latestNodeId = patchNodeResult.nodeId;
        }

        // 开始并完成节点
        // 结论：使用 requirement（简洁描述，展示到父节点）
        await this.state.transition({
          workspaceId,
          nodeId: patchNodeResult.nodeId,
          action: "start",
        });
        await this.state.transition({
          workspaceId,
          nodeId: patchNodeResult.nodeId,
          action: "complete",
          conclusion: patch.requirement || "版本更新",
        });

        // 备注：changelog 内容
        if (patch.conclusion) {
          await this.node.update({
            workspaceId,
            nodeId: patchNodeResult.nodeId,
            note: patch.conclusion,
          });
        }
      }

      // 如果有 major 版本自身（x.y.0），也作为子节点添加
      if (group.major && group.hasMinorStart) {
        // 需求：版本更新详情 + requirement
        const majorVersionRequirement = group.major.requirement
          ? `V${group.major.version} 版本更新详情：\n${group.major.requirement}`
          : `V${group.major.version} 版本发布`;

        const majorVersionResult = await this.node.create({
          workspaceId,
          parentId: majorNodeResult.nodeId,
          type: "execution",
          title: `V${group.major.version} 版本更新`,
          requirement: majorVersionRequirement,
          rulesHash,
        });

        // 结论：使用 requirement（简洁描述）
        await this.state.transition({
          workspaceId,
          nodeId: majorVersionResult.nodeId,
          action: "start",
        });
        await this.state.transition({
          workspaceId,
          nodeId: majorVersionResult.nodeId,
          action: "complete",
          conclusion: group.major.requirement || "版本发布",
        });

        // 备注：changelog 内容
        if (group.major.conclusion) {
          await this.node.update({
            workspaceId,
            nodeId: majorVersionResult.nodeId,
            note: group.major.conclusion,
          });
        }
      }

      // 将 major 规划节点标记为已完成
      // 由于添加子节点后，规划节点已自动进入 monitoring 状态
      // 所有子节点已完成，可直接标记 complete
      await this.state.transition({
        workspaceId,
        nodeId: majorNodeResult.nodeId,
        action: "complete",
        conclusion: majorConclusion || `v${mm} 版本更新完成`,
      });
    }

    // 按版本号降序排序根节点的子节点（新版本在前）
    const rootNodeForSort = await this.node.get({ workspaceId, nodeId: "root" });
    const childIds = rootNodeForSort.meta.children;
    if (childIds.length > 1) {
      // 获取每个子节点的版本号
      const childVersions: { id: string; version: string }[] = [];
      for (const childId of childIds) {
        const child = await this.node.get({ workspaceId, nodeId: childId });
        // 从 dirName 中提取版本号，格式如 "V1.6 版本更新_mjgrvwam"
        const match = child.meta.dirName?.match(/V(\d+\.\d+)/);
        if (match) {
          childVersions.push({ id: childId, version: match[1] });
        }
      }
      // 按版本号降序排序
      childVersions.sort((a, b) => this.compareVersions(b.version + ".0", a.version + ".0"));
      const sortedChildIds = childVersions.map(c => c.id);

      // 如果顺序有变化，重新排序
      if (sortedChildIds.length === childIds.length &&
          sortedChildIds.some((id, i) => id !== childIds[i])) {
        await this.node.reorderChildren({
          workspaceId,
          nodeId: "root",
          orderedChildIds: sortedChildIds,
        });
      }
    }

    // 完成根节点（如果还未完成）
    const rootNode = await this.node.get({ workspaceId, nodeId: "root" });
    if (rootNode.meta.status === "monitoring") {
      await this.state.transition({
        workspaceId,
        nodeId: "root",
        action: "complete",
        conclusion: "版本更新说明",
      });
    }

    // 设置 focus 到最新版本节点
    if (latestNodeId) {
      await this.context.focus({
        workspaceId,
        nodeId: latestNodeId,
      });
    }
  }

  /**
   * 创建教程工作区
   */
  private async createTutorialWorkspace(): Promise<void> {
    const tutorialDir = this.getTutorialDir();

    // 确保目录存在
    await fs.mkdir(tutorialDir, { recursive: true });

    // 创建工作区
    const result = await this.workspace.init({
      name: TUTORIAL_CONTENT.name,
      goal: TUTORIAL_CONTENT.goal,
      projectRoot: tutorialDir,
      rules: TUTORIAL_CONTENT.rules,
      docs: TUTORIAL_CONTENT.docs,
    });

    // 计算 rulesHash（绕过规则确认检查）
    const rulesHash = crypto.createHash("md5")
      .update(TUTORIAL_CONTENT.rules.join("\n"))
      .digest("hex")
      .substring(0, 8);

    // 创建子节点
    const focusNodeId = await this.createNodes(
      result.workspaceId,
      "root",
      TUTORIAL_CONTENT.nodes,
      rulesHash
    );

    // 最后设置焦点（避免被后续操作覆盖）
    if (focusNodeId) {
      await this.context.focus({ workspaceId: result.workspaceId, nodeId: focusNodeId });
    }

    // 启用 no-git 派发模式
    await this.dispatch.enable({ workspaceId: result.workspaceId, useGit: false });
  }

  /**
   * 递归创建节点，返回需要设为焦点的节点ID
   */
  private async createNodes(
    workspaceId: string,
    parentId: string,
    nodes: TutorialNode[],
    rulesHash: string
  ): Promise<string | null> {
    let focusNodeId: string | null = null;

    for (const nodeDef of nodes) {
      // 1. 创建节点
      const result = await this.node.create({
        workspaceId,
        parentId,
        type: nodeDef.type,
        title: nodeDef.title,
        requirement: nodeDef.requirement,
        role: nodeDef.role,
        docs: nodeDef.docs,
        rulesHash,
      });

      const nodeId = result.nodeId;

      // 2. 递归创建子节点
      if (nodeDef.children && nodeDef.children.length > 0) {
        const childFocusId = await this.createNodes(workspaceId, nodeId, nodeDef.children, rulesHash);
        if (childFocusId) focusNodeId = childFocusId;
      }

      // 3. 设置目标状态
      if (nodeDef.targetStatus) {
        const hasChildren = nodeDef.children && nodeDef.children.length > 0;
        await this.transitionToStatus(workspaceId, nodeId, nodeDef.type, nodeDef.targetStatus, nodeDef.conclusion, hasChildren);
      }

      // 4. 设置备注（状态转换后设置，避免被覆盖）
      if (nodeDef.note) {
        await this.node.update({
          workspaceId,
          nodeId,
          note: nodeDef.note,
        });
      }

      // 5. 设置问题（状态转换后设置，避免被覆盖）
      if (nodeDef.problem) {
        await this.log.updateProblem({
          workspaceId,
          nodeId,
          problem: nodeDef.problem,
        });
      }

      // 6. 添加日志
      if (nodeDef.logs) {
        for (const logEntry of nodeDef.logs) {
          await this.log.append({
            workspaceId,
            nodeId,
            operator: logEntry.operator,
            event: logEntry.event,
          });
        }
      }

      // 7. 记录焦点节点（不立即设置）
      if (nodeDef.setFocus) {
        focusNodeId = nodeId;
      }

      // 8. Hack: 直接写入派发信息
      if (nodeDef.dispatchInfo) {
        await this.hackSetDispatchInfo(workspaceId, nodeId, nodeDef.dispatchInfo);
      }

      // 9. 创建 MEMO 并添加引用
      if (nodeDef.memo) {
        const memoResult = await this.memo.create({
          workspaceId,
          title: nodeDef.memo.title,
          summary: nodeDef.memo.summary,
          content: nodeDef.memo.content,
        });
        // 使用 reference 服务添加引用（会同时更新 graph.json 和 Info.md）
        await this.reference.reference({
          workspaceId,
          nodeId,
          targetIdOrPath: `memo://${memoResult.memoId}`,
          action: "add",
          description: nodeDef.memo.title,
        });
      }
    }

    return focusNodeId;
  }

  /**
   * Hack: 直接写入节点的派发信息（绕过正常派发流程）
   */
  private async hackSetDispatchInfo(
    workspaceId: string,
    nodeId: string,
    dispatchInfo: NonNullable<TutorialNode["dispatchInfo"]>
  ): Promise<void> {
    // 获取工作区配置以拿到 dirName
    const wsResult = await this.workspace.get({ workspaceId });
    const wsConfig = wsResult.config;

    // 读取 graph.json
    const tutorialDir = this.getTutorialDir();
    const isDev = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
    const baseDir = isDev ? ".tanmi-workspace-dev" : ".tanmi-workspace";
    const graphPath = path.join(tutorialDir, baseDir, wsConfig.dirName, "graph.json");

    const graphContent = await fs.readFile(graphPath, "utf-8");
    const graph = JSON.parse(graphContent);

    // 设置节点的 dispatch 字段
    if (graph.nodes && graph.nodes[nodeId]) {
      graph.nodes[nodeId].dispatch = {
        startMarker: dispatchInfo.startMarker,
        endMarker: dispatchInfo.endMarker,
        status: dispatchInfo.status,
      };

      await fs.writeFile(graphPath, JSON.stringify(graph, null, 2), "utf-8");
    }
  }

  /**
   * 将节点转换到目标状态
   */
  private async transitionToStatus(
    workspaceId: string,
    nodeId: string,
    type: "planning" | "execution",
    targetStatus: string,
    conclusion?: string,
    hasChildren?: boolean
  ): Promise<void> {
    const transitions = this.getTransitionPath(type, targetStatus, hasChildren);
    for (const action of transitions) {
      await this.state.transition({
        workspaceId,
        nodeId,
        action: action as any,
        conclusion: action === transitions[transitions.length - 1] ? conclusion : undefined,
      });
    }
  }

  /**
   * 获取到达目标状态需要的转换路径
   * @param hasChildren 规划节点是否有子节点（有子节点的会自动进入 monitoring）
   */
  private getTransitionPath(type: "planning" | "execution", targetStatus: string, hasChildren?: boolean): string[] {
    if (type === "execution") {
      switch (targetStatus) {
        case "implementing": return ["start"];
        case "validating": return ["start", "submit"];
        case "completed": return ["start", "complete"];
        case "failed": return ["start", "fail"];
        default: return [];
      }
    } else {
      // 规划节点：有子节点的会自动进入 monitoring，只需要 complete/cancel
      if (hasChildren) {
        switch (targetStatus) {
          case "completed": return ["complete"];
          case "cancelled": return ["cancel"];
          default: return [];
        }
      }
      // 无子节点的规划节点需要先 start
      switch (targetStatus) {
        case "planning": return ["start"];
        case "monitoring": return ["start"];
        case "completed": return ["start", "complete"];
        case "cancelled": return ["start", "cancel"];
        default: return [];
      }
    }
  }
}
