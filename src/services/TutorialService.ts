// src/services/TutorialService.ts

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import type { WorkspaceService } from "./WorkspaceService.js";
import { INTERNAL_RULES_HASH, type NodeService } from "./NodeService.js";
import type { StateService } from "./StateService.js";
import type { LogService } from "./LogService.js";
import type { ContextService } from "./ContextService.js";
import type { ReferenceService } from "./ReferenceService.js";
import type { DispatchService } from "./DispatchService.js";
import type { ConfigService } from "./ConfigService.js";
import type { MemoService } from "./MemoService.js";
import { capabilityService, ALL_CAPABILITY_IDS } from "./CapabilityService.js";
import type { CapabilityId } from "../types/capability.js";
import { computeConclusionsHash } from "../utils/hash.js";
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
  role?: "info_collection" | "info_summary";
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
    tags: string[];
  };
  // 使用能力系统创建子节点（info_collection/info_summary 节点专用）
  useCapabilities?: boolean;
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
        {
          type: "execution" as const,
          title: "数据管理",
          requirement: `管理工作区索引和全局备份。

**工作区索引**
设置 → 数据管理 → 工作区索引 → 管理
- 拖拽 .twsp 文件直接导入
- 拖拽项目目录自动扫描
- 手动输入路径
- 同步清理无效条目

**导出工作区**
工作区详情页 →「EXPORT」按钮
- 导出为 .twsp 文件，包含完整工作区数据

**全局备份**
设置 → 数据管理 → 全局备份 → 管理
- 创建/恢复/删除备份
- 导入/导出 .twbak 备份文件
- 备份仅包含全局索引配置，不含工作区内容`,
          targetStatus: "completed",
          conclusion: "通过数据管理可以导入导出工作区和管理全局备份",
        },
        {
          type: "execution" as const,
          title: "置顶功能",
          requirement: `工作区支持置顶功能，将重要工作区固定在列表顶部：

- **悬浮显示**：鼠标悬浮卡片时，标题右侧显示 \`>PIN\` 徽派
- **点击置顶**：点击徽派后变为红色 \`PIN\` 常驻显示
- **再次点击**：点击红色 \`PIN\` 取消置顶
- **排序优先**：置顶工作区始终排在最前，不受排序方式影响

功能简介和版本更新工作区默认置顶，方便快速访问。`,
          targetStatus: "completed",
          conclusion: "置顶功能帮助快速访问重要工作区",
        },
      ],
    },
    // 流程阶段介绍
    {
      type: "planning" as const,
      title: "流程阶段",
      requirement: `TanmiWorkspace 采用三阶段工作流程，引导 AI 有条不紊地完成复杂任务。

**阶段概览**
1. **信息阶段 (flow-info)** - 选择能力、收集和整理信息
2. **规划阶段 (flow-design)** - 分解方案为规划和执行节点
3. **执行阶段 (flow-impl)** - 按规划执行，支持派发模式

**阶段间的流转**
- 每个阶段通过 signal 命令确认进入
- 完成后展示成果并询问用户是否进入下一阶段
- 用户可以要求补充或调整，灵活回退

每个阶段都有对应的 Skill 引导 AI 行为，确保工作质量和一致性。`,
      children: [
        {
          type: "execution" as const,
          title: "信息阶段",
          requirement: `**信息阶段 (flow-info)** - 选择能力、收集和整理信息

**触发时机**
- 工作区初始化后
- 开始新的研究任务时
- 需要补充信息时

**核心流程**
1. 调用 \`capability_list\` 获取场景推荐的能力包
2. 展示能力并询问用户选择（必选 + 可选）
3. 调用 \`capability_select\` 创建信息节点
4. 依次执行各能力对应的 Skill
5. 完成后展示方案设计，询问是否进入下一阶段

**阶段约束**
- ✅ 允许：Read/Search/Grep/Glob 探索代码
- ✅ 允许：capability_list/capability_select 选择能力
- ❌ 禁止：Write/Edit/MultiEdit 修改文件

**典型产出**
- 验收标准表、依赖关系图、技术方案对比表

信息阶段确保 AI 在动手之前充分理解任务背景和约束。`,
          targetStatus: "completed",
          conclusion: "信息阶段完成后，输出方案设计，等待用户确认进入规划阶段",
        },
        {
          type: "execution" as const,
          title: "规划阶段",
          requirement: `**规划阶段 (flow-design)** - 分解方案为规划和执行节点

**核心职责**
- 从信息阶段结论中提取设计方案
- 按场景模板分解为任务树
- 为每个节点定义详细需求和验收标准

**场景化任务模板**
- **Feature**：TDD 驱动（测试定义 → 功能实现 → 集成验证）
- **Debug**：诊断驱动（问题复现 → 根因定位 → 修复实现 → 回归验证）
- **Optimize**：基准驱动（基准测量 → 优化实现 → 效果验证）
- **Summary**：任务分解驱动（规模评估 → 分主题执行 → 完整性验证）

**质量要求**
- 8/80 规则：每个执行节点工作量在 8-80 小时
- 100% 规则：子任务之和 = 父任务全部工作
- 需求描述 ≥3 行，验收标准 ≥2 条

**阶段约束**
- ✅ 允许：创建 planning/execution 节点
- ❌ 禁止：Write/Edit 修改文件、派发执行

完成后所有 planning 节点为 monitoring，execution 节点为 pending。`,
          targetStatus: "implementing",
        },
        {
          type: "execution" as const,
          title: "执行阶段",
          requirement: `**执行阶段 (flow-impl)** - 按规划执行，支持派发模式

**执行模式选择**
- **全部派发**：所有任务派发给 SubAgent 执行
- **智能派发**：AI 推断哪些任务需人工核验
- **不派发**：主 AI 直接执行所有任务

**场景执行指导**
- **Feature**：按测试用例实现，记录 API 契约
- **Debug**：按诊断流程修复，详记调试过程
- **Optimize**：对比基准数据，验证优化效果
- **Summary**：结论详尽记录，确保覆盖所有主题

**执行节点完成条件**
- 需求完成 + 验收标准逐条通过
- 无 TODO/FIXME + 测试通过
- conclusion 已填写

**状态流转**
pending → implementing → validating → completed/failed

执行阶段强调严格遵循需求计划，发现矛盾立即停止核查。`,
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
          type: "planning" as const,
          title: "信息收集",
          requirement: `**信息收集 (info_collection)** 是一种特殊角色的规划节点。

用于在任务开始前**主动探索和收集**所需信息：
- **意图对齐**：通过结构化提问消除歧义，确认验收标准
- **上下文探索**：扫描项目结构、分析依赖关系、追踪数据流
- **诊断分析**：追踪问题根因，建立因果链
- **技术调研**：评估多个技术方案，给出选型建议
- **度量分析**：建立性能基准，验证优化效果
- **方案设计**：定义接口和数据结构，规划实现路径
- **验证策略**：设计测试用例和验收步骤

**场景化能力推荐**
系统会根据任务场景推荐不同的能力组合：
- **新功能开发**：意图对齐 + 上下文探索 + 方案设计
- **问题修复**：意图对齐 + 上下文探索 + 诊断分析
- **性能优化**：意图对齐 + 上下文探索 + 度量分析
- **技术调研**：意图对齐 + 技术调研 + 方案设计

**使用流程**
1. AI 调用 \`capability_list\` 获取场景推荐的能力包
2. 向用户展示并确认选择
3. 调用 \`capability_select\` 创建能力子节点
4. 依次执行各能力对应的 Skill

本节点展示了所有可用能力，实际使用时会根据场景智能推荐。`,
          role: "info_collection",
          useCapabilities: true,  // 使用能力系统创建子节点
          // 不设置 targetStatus，保持 monitoring 状态（等待子节点完成）
          note: "信息收集 = 主动探索（扫描项目、阅读文档、调研技术）",
          memo: {
            title: "MEMO 功能说明",
            summary: "演示 MEMO 的使用方式和适用场景",
            tags: ["功能演示", "MEMO"],
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

## 导出功能

MEMO 支持导出为独立 Markdown 文件，点击详情页「下载」按钮即可导出。
`,
          },
        },
        {
          type: "execution" as const,
          title: "信息总结",
          requirement: `**信息总结 (info_summary)** 是另一种特殊角色的节点。

除了信息收集之外，在**对话中已产生大量信息需要整理**的情况下，还可以使用信息总结来**主动整理已有信息**，从对话中提炼归纳，而非探索新内容。

**典型使用场景**
- 长对话后整理讨论要点
- 从已有对话中提炼结构化内容
- 快速形成共识和方案设计基础
- 需求确认后归纳验收标准

**收集 vs 总结对比**

| 特性 | 信息收集 | 信息总结 |
|------|----------|----------|
| 信息来源 | 代码库、文档、外部资源 | 对话中已有信息 |
| 活动方向 | 主动探索新内容 | 主动整理已有内容 |
| 时机 | 任务开始前 | 任务进行中/完成后 |
| 产出 | 新发现的信息 | 结构化的已有信息 |

**可用能力**
信息总结可以使用所有能力，与信息收集相同。区别仅在于执行时的信息来源：
- 收集：扫描项目、阅读文档、调研技术
- 总结：从对话中提炼、归纳总结`,
          role: "info_summary",
          targetStatus: "completed",
          conclusion: "信息总结用于从对话已有信息中提炼结构化内容",
          note: "收集=探索新内容，总结=整理已有内容",
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

    // 3. 更新配置（使用 updateConfig 避免覆盖其他配置）
    if (needsConfigUpdate) {
      await this.config.updateConfig(configUpdates);
    }

    return needsConfigUpdate;
  }

  /**
   * 手动触发创建教程工作区（覆盖模式）
   * 删除现有工作区后重新创建
   */
  async manualTriggerTutorial(): Promise<{ created: boolean; message: string }> {
    const tutorialDir = this.getTutorialDir();
    const existingWorkspaces = await this.workspace.list({});

    // 查找并删除现有工作区
    const introWs = existingWorkspaces.workspaces.find(
      ws => ws.name === "TanmiWorkspace 功能简介" && ws.projectRoot === tutorialDir
    );
    const versionWs = existingWorkspaces.workspaces.find(
      ws => ws.name === "TanmiWorkspace 版本更新" && ws.projectRoot === tutorialDir
    );

    // 删除现有工作区
    if (introWs) {
      await this.workspace.delete({ workspaceId: introWs.id, force: true });
    }
    if (versionWs) {
      await this.workspace.delete({ workspaceId: versionWs.id, force: true });
    }

    // 重新创建工作区
    await this.createTutorialWorkspace();
    await this.createVersionUpdateWorkspace(undefined, true);

    // 更新配置（使用 updateConfig 避免覆盖其他配置）
    await this.config.updateConfig({
      tutorialCreated: true,
      tutorialVersion: TUTORIAL_VERSION,
    });

    return { created: true, message: "已重新生成功能简介与版本更新记录" };
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
      path.join(__dirname, "../../config/version-notes.yaml"),
      path.join(__dirname, "../../assets/version-notes.yaml"), // 向后兼容旧目录
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

    // 置顶版本更新工作区，方便用户快速访问（失败不阻断主流程）
    try {
      await this.workspace.togglePin(result.workspaceId);
    } catch {
      // 置顶是辅助功能，失败时静默忽略
    }
  }

  /**
   * 查找已存在的 major.minor 规划节点
   * @returns Map<majorMinor, nodeId>
   */
  private async findExistingMajorNodes(workspaceId: string): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    try {
      const rootNode = await this.node.get({ workspaceId, nodeId: "root" });
      for (const childId of rootNode.meta.children) {
        const child = await this.node.get({ workspaceId, nodeId: childId });
        // 从 dirName 中提取版本号，格式如 "V1.9 版本更新_mjmqarcp"
        const match = child.meta.dirName?.match(/V(\d+\.\d+)/);
        if (match) {
          result.set(match[1], childId);
        }
      }
    } catch {
      // 如果获取失败，返回空映射
    }

    return result;
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

    // 按 major.minor 版本号排序（降序，新版本在前）
    const sortedMajorMinors = Array.from(groups.keys()).sort((a, b) => {
      const [aMajor, aMinor] = a.split(".").map(Number);
      const [bMajor, bMinor] = b.split(".").map(Number);
      if (aMajor !== bMajor) return bMajor - aMajor;
      return bMinor - aMinor;
    });

    let latestNodeId: string | null = null; // 记录最新版本节点 ID
    let rootReopened = false; // 标记是否已 reopen 根节点

    // 预先获取已存在的 major.minor 节点映射
    const existingMajorNodes = await this.findExistingMajorNodes(workspaceId);

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

      // 检查是否已存在对应的 major.minor 节点
      let majorNodeId: string;
      let isExistingNode = false;

      if (existingMajorNodes.has(mm)) {
        // 使用已存在的节点
        majorNodeId = existingMajorNodes.get(mm)!;
        isExistingNode = true;

        // 如果节点已完成，需要先 reopen 才能添加子节点
        const existingNode = await this.node.get({ workspaceId, nodeId: majorNodeId });
        if (existingNode.meta.status === "completed") {
          await this.state.transition({
            workspaceId,
            nodeId: majorNodeId,
            action: "reopen",
          });
        }
      } else {
        // 创建新的 major.minor 规划节点
        // 从完整版本列表中获取该 minor 的所有版本（包括 x.y.0）
        const allMinorVersions = versions.filter(v => this.getMajorMinor(v.version) === mm);
        const minorStartVersion = allMinorVersions.find(v => this.isMajorMinorVersion(v.version));

        let majorRequirement: string;
        let majorNote: string | undefined;

        if (minorStartVersion) {
          // 使用 x.y.0 版本的信息作为父节点内容
          majorRequirement = minorStartVersion.requirement || `v${mm} 版本更新`;
          majorNote = minorStartVersion.note;
        } else {
          // 兜底：没有 x.y.0 版本时使用默认文案
          majorRequirement = `v${mm} 版本更新`;
        }

        // 更新 group，包含该 minor 的所有版本
        group.patches = allMinorVersions
          .filter(v => !this.isMajorMinorVersion(v.version))
          .sort((a, b) => this.compareVersions(b.version, a.version));
        group.major = minorStartVersion || null;
        group.hasMinorStart = !!minorStartVersion;

        const majorNodeResult = await this.node.create({
          workspaceId,
          parentId: "root",
          type: "planning",
          title: `V${mm} 版本更新`,
          requirement: majorRequirement,
          rulesHash: INTERNAL_RULES_HASH,
        });

        majorNodeId = majorNodeResult.nodeId;

        // 如果有 note，设置到节点
        if (majorNote) {
          await this.node.update({
            workspaceId,
            nodeId: majorNodeId,
            note: majorNote,
          });
        }
      }

      // 创建 patch 版本子节点
      for (const patch of group.patches) {
        // 需求：版本更新详情 + requirement
        const patchRequirement = patch.requirement
          ? `V${patch.version} 版本更新详情：\n${patch.requirement}`
          : `V${patch.version} 版本更新`;

        const patchNodeResult = await this.node.create({
          workspaceId,
          parentId: majorNodeId,
          type: "execution",
          title: `V${patch.version} 版本更新`,
          requirement: patchRequirement,
          rulesHash: INTERNAL_RULES_HASH,
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

      // 如果有 major 版本自身（x.y.0），也作为子节点添加（仅新创建的节点需要）
      if (!isExistingNode && group.major && group.hasMinorStart) {
        // 需求：版本更新详情 + requirement
        const majorVersionRequirement = group.major.requirement
          ? `V${group.major.version} 版本更新详情：\n${group.major.requirement}`
          : `V${group.major.version} 版本发布`;

        const majorVersionResult = await this.node.create({
          workspaceId,
          parentId: majorNodeId,
          type: "execution",
          title: `V${group.major.version} 版本更新`,
          requirement: majorVersionRequirement,
          rulesHash: INTERNAL_RULES_HASH,
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

      // 对 major.minor 节点的子节点按版本号降序排序（新版本在前）
      const majorNode = await this.node.get({ workspaceId, nodeId: majorNodeId });
      const patchChildIds = majorNode.meta.children;
      if (patchChildIds.length > 1) {
        const patchVersions: { id: string; version: string }[] = [];
        for (const patchId of patchChildIds) {
          const patchNode = await this.node.get({ workspaceId, nodeId: patchId });
          // 从 dirName 中提取版本号，格式如 "V1.9.1 版本更新_mjoeaxds"
          const match = patchNode.meta.dirName?.match(/V(\d+\.\d+\.\d+)/);
          if (match) {
            patchVersions.push({ id: patchId, version: match[1] });
          }
        }
        // 按版本号降序排序
        patchVersions.sort((a, b) => this.compareVersions(b.version, a.version));
        const sortedPatchIds = patchVersions.map(p => p.id);

        // 如果顺序有变化，重新排序
        if (sortedPatchIds.length === patchChildIds.length &&
            sortedPatchIds.some((id, i) => id !== patchChildIds[i])) {
          await this.node.reorderChildren({
            workspaceId,
            nodeId: majorNodeId,
            orderedChildIds: sortedPatchIds,
          });
        }
      }

      // 将 major 规划节点标记为已完成
      // 由于添加子节点后，规划节点已自动进入 monitoring 状态
      // 所有子节点已完成，可直接标记 complete
      // 需要计算 conclusionsHash 以通过校验
      const majorNodeForComplete = await this.node.get({ workspaceId, nodeId: majorNodeId });
      const majorChildConclusions = [];
      for (const childId of majorNodeForComplete.meta.children) {
        const child = await this.node.get({ workspaceId, nodeId: childId });
        majorChildConclusions.push({ nodeId: childId, conclusion: child.meta.conclusion || "" });
      }
      const majorConclusionsHash = computeConclusionsHash(majorChildConclusions);

      await this.state.transition({
        workspaceId,
        nodeId: majorNodeId,
        action: "complete",
        conclusion: `v${mm} 版本更新完成`,
        conclusionsHash: majorConclusionsHash,
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
      // 计算根节点子节点的 conclusionsHash
      const rootChildConclusions = [];
      for (const childId of rootNode.meta.children) {
        const child = await this.node.get({ workspaceId, nodeId: childId });
        rootChildConclusions.push({ nodeId: childId, conclusion: child.meta.conclusion || "" });
      }
      const rootConclusionsHash = computeConclusionsHash(rootChildConclusions);

      await this.state.transition({
        workspaceId,
        nodeId: "root",
        action: "complete",
        conclusion: "版本更新说明",
        conclusionsHash: rootConclusionsHash,
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

    // 创建独立 MEMO：版本更新与帮助系统（在 MEMO 功能说明之前创建）
    await this.memo.create({
      workspaceId: result.workspaceId,
      title: "版本更新与帮助系统",
      summary: "版本更新、插件更新方式和 WebUI 帮助入口",
      tags: ["新手教程", "帮助"],
      content: `# 版本更新与帮助系统

## 版本更新

### npm 全局包更新
TanmiWorkspace 作为 npm 全局包发布，更新命令：
\`\`\`bash
npm i -g tanmi-workspace
\`\`\`

### 版本检查机制
- 启动时自动检查版本
- 有新版本时创建「版本更新」工作区
- 可在工作区中查看各版本的更新内容

## 插件更新

插件（Hooks、Agents、Skills）随 npm 包一起更新。

### 更新流程
1. 更新 npm 包：\`npm i -g tanmi-workspace\`
2. 重新安装插件：\`tanmi-workspace plugins install --claude\`
  或通过\`tanmi-workspace setup\`重新安装所有插件

### 查看插件状态
\`\`\`bash
tanmi-workspace plugins
\`\`\`

### 插件管理命令
- 安装 Claude 插件：\`tanmi-workspace plugins install --claude\`
- 安装 Cursor 插件：\`tanmi-workspace plugins install --cursor\`
- 卸载：\`tanmi-workspace plugins uninstall --claude\`

## WebUI 帮助入口

### 设置面板
点击主页面顶部「设置」按钮：
- 查看用户帮助（快速入门、触发词速查）
- 查看插件详情和版本信息
- 配置派发模式默认设置

### 用户帮助区域
- **快速入门**：工作流程和核心概念
- **触发词速查**：常用对话触发词参考
- **查看完整手册**：详细用户文档
`,
    });

    // 创建子节点（使用 INTERNAL_RULES_HASH 绕过规则确认检查）
    const focusNodeId = await this.createNodes(
      result.workspaceId,
      "root",
      TUTORIAL_CONTENT.nodes
    );

    // 最后设置焦点（避免被后续操作覆盖）
    if (focusNodeId) {
      await this.context.focus({ workspaceId: result.workspaceId, nodeId: focusNodeId });
    }

    // 启用 no-git 派发模式
    await this.dispatch.enable({ workspaceId: result.workspaceId, useGit: false });

    // 置顶教程工作区，方便用户快速访问（失败不阻断主流程）
    try {
      await this.workspace.togglePin(result.workspaceId);
    } catch {
      // 置顶是辅助功能，失败时静默忽略
    }
  }

  /**
   * 递归创建节点，返回需要设为焦点的节点ID
   */
  private async createNodes(
    workspaceId: string,
    parentId: string,
    nodes: TutorialNode[]
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
        rulesHash: INTERNAL_RULES_HASH,
      });

      const nodeId = result.nodeId;

      // 2. 使用能力系统创建子节点（useCapabilities 标记）
      let capabilityChildrenCreated = false;
      if (nodeDef.useCapabilities) {
        await this.createCapabilityChildren(workspaceId, nodeId, nodeDef.role);
        capabilityChildrenCreated = true;
      }

      // 3. 递归创建静态定义的子节点
      if (nodeDef.children && nodeDef.children.length > 0) {
        const childFocusId = await this.createNodes(workspaceId, nodeId, nodeDef.children);
        if (childFocusId) focusNodeId = childFocusId;
      }

      // 4. 设置目标状态
      // 如果有能力子节点或静态子节点，hasChildren 为 true
      if (nodeDef.targetStatus) {
        const hasChildren = capabilityChildrenCreated || (nodeDef.children && nodeDef.children.length > 0);
        await this.transitionToStatus(workspaceId, nodeId, nodeDef.type, nodeDef.targetStatus, nodeDef.conclusion, hasChildren);
      }

      // 5. 设置备注（状态转换后设置，避免被覆盖）
      if (nodeDef.note) {
        await this.node.update({
          workspaceId,
          nodeId,
          note: nodeDef.note,
        });
      }

      // 6. 设置问题（状态转换后设置，避免被覆盖）
      if (nodeDef.problem) {
        await this.log.updateProblem({
          workspaceId,
          nodeId,
          problem: nodeDef.problem,
        });
      }

      // 7. 添加日志
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

      // 8. 记录焦点节点（不立即设置）
      if (nodeDef.setFocus) {
        focusNodeId = nodeId;
      }

      // 9. Hack: 直接写入派发信息
      if (nodeDef.dispatchInfo) {
        await this.hackSetDispatchInfo(workspaceId, nodeId, nodeDef.dispatchInfo);
      }

      // 10. 创建 MEMO 并添加引用
      if (nodeDef.memo) {
        const memoResult = await this.memo.create({
          workspaceId,
          title: nodeDef.memo.title,
          summary: nodeDef.memo.summary,
          tags: nodeDef.memo.tags,
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
   * 能力详细描述（用于教程展示）
   */
  private readonly CAPABILITY_DETAILS: Record<CapabilityId, { requirement: string; conclusion: string }> = {
    intent_alignment: {
      requirement: `**意图对齐** - 通过结构化提问消除歧义

**核心流程**
1. 快速扫描项目现状（结构、相关模块、近期变更）
2. 识别歧义点（主观描述、隐藏假设、缺失信息）
3. 结构化提问（一次一个问题，优先选择题）
4. 确认验收标准（转化为 WHEN/THEN 格式）
5. 置信度检查（>=85% 才能继续）

**输出产物**
- 需求摘要（用户故事）
- 验收标准表（WHEN/THEN 格式）
- 置信度评分

**适用场景**：需求模糊、存在歧义、需要确认验收标准`,
      conclusion: "通过结构化提问完成意图对齐，输出验收标准表",
    },
    context_discovery: {
      requirement: `**上下文探索** - 系统性信息收集构建认知模型

**核心流程**
1. 定位入口点（README、docs、package.json）
2. 依赖分析（模块依赖、外部依赖、数据依赖）
3. 数据流追踪（输入→模块→输出，用 Mermaid 可视化）
4. 输出知识快照

**输出产物**
- 关键文件表（入口、类型定义、配置）
- 依赖关系图
- 数据流图（Mermaid sequenceDiagram）

**适用场景**：陌生代码库、需要理解架构、新领域调研`,
      conclusion: "完成项目上下文探索，输出依赖关系和数据流图",
    },
    diagnosis: {
      requirement: `**诊断分析** - 追踪问题根因，建立因果链

**核心流程**
1. 再现/定位问题（收集错误信息、确认复现步骤）
2. 因果链分析（从入口追踪到问题点再回溯根源）
3. 假设测试（构造假设→验证→记录）
4. 根因确认（能解释所有症状、能稳定复现）

**输出产物**
- 复现路径（步骤列表）
- 因果链（Entry → Func A → Problem）
- 根因分析和修复建议

**适用场景**：Bug 调试、性能问题定位、行为异常分析`,
      conclusion: "完成问题诊断，定位根因并给出修复建议",
    },
    tech_research: {
      requirement: `**技术调研** - 多维度评估技术方案

**核心流程**
1. 识别候选方案（至少 2 个选项）
2. 约束兼容性检查
3. 多维度对比（实现复杂度、性能、维护成本）
4. 给出推荐和理由（至少 3 条）

**输出产物**
- 方案比较表
- 推荐选项及理由
- 风险记录

**适用场景**：技术选型、框架对比、架构方案评估`,
      conclusion: "完成技术方案调研，输出对比表和推荐建议",
    },
    measurement_analysis: {
      requirement: `**度量分析** - 建立基准，验证优化效果

**核心流程**
1. 定义度量指标（FPS、RTT、CPU 等）
2. 建立测试环境（硬件、软件、数据规模）
3. 获取基线数据
4. 优化后对比测量

**输出产物**
- 基线数据表
- 优化前后对比（含改进率）
- 分析结论（目标是否达成）

**适用场景**：性能优化验证、容量规划、算法效率对比`,
      conclusion: "完成度量分析，建立基线并对比优化效果",
    },
    solution_design: {
      requirement: `**方案设计** - 在编码前完成系统性设计

**核心流程**
1. 定义变更范围
2. 接口设计（参数、返回值、兼容性）
3. 数据结构设计
4. 实现步骤规划（YAGNI 检查）
5. 测试和可观测性设计

**输出产物**
- 变更范围清单
- 接口和数据结构定义
- 分步实现计划
- 风险识别

**适用场景**：新功能开发、系统重构、API 设计`,
      conclusion: "完成方案设计，输出接口定义和实现计划",
    },
    verification_strategy: {
      requirement: `**验证策略** - 设计测试用例和验收步骤

**核心流程**
1. 识别验证点（功能点 + 非功能点）
2. 设计测试用例（正常流、边界、错误处理）
3. 确定验证方法（单元/集成/E2E/手动）
4. 编写验收步骤（Given/When/Then）

**输出产物**
- 测试计划（用例编号、优先级）
- 验收步骤清单
- 预期结果说明

**适用场景**：实现前规划测试、定义验收标准、质量保证`,
      conclusion: "完成验证策略设计，输出测试计划和验收步骤",
    },
  };

  /**
   * 使用能力系统创建子节点
   * 模拟 capability_select 的行为，为所有能力创建执行节点
   */
  private async createCapabilityChildren(
    workspaceId: string,
    parentId: string,
    role?: "info_collection" | "info_summary"
  ): Promise<void> {
    // 使用 CapabilityService 导出的单一数据源
    const allCapabilities = ALL_CAPABILITY_IDS;

    // 根据 role 类型筛选能力
    // info_collection: 使用所有能力
    // info_summary: 只使用 summary 类型的能力（上下文探索、诊断分析）
    const selectedCapabilities = role === "info_summary"
      ? allCapabilities.filter(id => {
          const info = capabilityService.getCapabilityInfo(id);
          return info.type === "summary";
        })
      : allCapabilities;

    // 定义各能力节点的目标状态（用于教程演示不同的执行阶段）
    // - 前 3 个（意图对齐、上下文探索、诊断分析）：已完成
    // - 第 4 个（技术调研）：执行中
    // - 后 3 个（度量分析、方案设计、验证策略）：待执行
    const capabilityTargetStatus: Record<CapabilityId, "completed" | "implementing" | "pending"> = {
      intent_alignment: "completed",
      context_discovery: "completed",
      diagnosis: "completed",
      tech_research: "implementing",
      measurement_analysis: "pending",
      solution_design: "pending",
      verification_strategy: "pending",
    };

    // 为每个能力创建执行节点
    for (const capabilityId of selectedCapabilities) {
      const capInfo = capabilityService.getCapabilityInfo(capabilityId);
      const acceptanceCriteria = capabilityService.getAcceptanceCriteria(capabilityId);
      const details = this.CAPABILITY_DETAILS[capabilityId];
      const targetStatus = capabilityTargetStatus[capabilityId];

      const childResult = await this.node.create({
        workspaceId,
        parentId,
        type: "execution",
        title: capInfo.name,
        requirement: details.requirement,
        acceptanceCriteria,
        rulesHash: INTERNAL_RULES_HASH,
      });

      // 根据目标状态设置节点状态
      if (targetStatus === "completed") {
        // 完成子节点
        await this.state.transition({
          workspaceId,
          nodeId: childResult.nodeId,
          action: "start",
        });
        await this.state.transition({
          workspaceId,
          nodeId: childResult.nodeId,
          action: "complete",
          conclusion: details.conclusion,
        });
      } else if (targetStatus === "implementing") {
        // 执行中
        await this.state.transition({
          workspaceId,
          nodeId: childResult.nodeId,
          action: "start",
        });
        // 保持 implementing 状态，不调用 complete
      }
      // pending 状态不需要任何转换，创建后默认就是 pending
    }
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
      let conclusionsHash: string | undefined;

      // 规划节点 complete 时，如果有子节点需要计算 conclusionsHash
      if (type === "planning" && action === "complete" && hasChildren) {
        const nodeInfo = await this.node.get({ workspaceId, nodeId });
        const childConclusions = [];
        for (const childId of nodeInfo.meta.children) {
          const childInfo = await this.node.get({ workspaceId, nodeId: childId });
          childConclusions.push({ nodeId: childId, conclusion: childInfo.meta.conclusion || "" });
        }
        conclusionsHash = computeConclusionsHash(childConclusions);
      }

      await this.state.transition({
        workspaceId,
        nodeId,
        action: action as any,
        conclusion: action === transitions[transitions.length - 1] ? conclusion : undefined,
        conclusionsHash,
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
