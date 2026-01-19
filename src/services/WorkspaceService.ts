// src/services/WorkspaceService.ts

import * as path from "node:path";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pipeline } from "node:stream/promises";
import * as os from "node:os";
import archiver from "archiver";
import AdmZip from "adm-zip";
import { INTERNAL_RULES_HASH } from "./NodeService.js";
import { FLOW_SKILLS } from "../constants/skills.js";
import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  WorkspaceInitParams,
  WorkspaceInitResult,
  WorkspaceListParams,
  WorkspaceListResult,
  WorkspaceGetParams,
  WorkspaceGetResult,
  WorkspaceDeleteParams,
  WorkspaceDeleteResult,
  WorkspaceStatusParams,
  WorkspaceStatusResult,
  WorkspaceUpdateRulesParams,
  WorkspaceUpdateRulesResult,
  WorkspaceArchiveParams,
  WorkspaceArchiveResult,
  WorkspaceRestoreParams,
  WorkspaceRestoreResult,
  WorkspaceConfig,
  ProjectDocInfo,
  ProjectDocsScanResult,
  WorkspaceErrorInfo,
  ManualChange,
} from "../types/workspace.js";
import type { HealthIssue } from "../types/health.js";
import { logError } from "../utils/errorLogger.js";
import type { NodeGraph, NodeMeta, WorkflowPhase } from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { generateWorkspaceId, generateWorkspaceDirName, generateNodeDirName, extractShortId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { validateWorkspaceName, validateProjectRoot } from "../utils/validation.js";
import { devLog } from "../utils/devLog.js";
import { taskScenarioToGuidance, getGuidanceConfig } from "../prompts/guidanceContent.js";
import { eventService } from "./EventService.js";

/**
 * 获取 HTTP 服务端口
 * 开发模式默认 19541，正式模式默认 19540
 */
function getHttpPort(): number {
  const isDev = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
  const defaultPort = isDev ? "19541" : "19540";
  return parseInt(process.env.HTTP_PORT ?? process.env.PORT ?? defaultPort, 10);
}

/**
 * Signal Code 到 WorkflowPhase 的硬编码映射
 * 生成方式：Buffer.from('sw_xxx').toString('base64').replace(/[+=]/g, '').slice(-6)
 */
const SIGNAL_CODES: Record<string, WorkflowPhase> = {
  "aW5mbw": "info",    // from 'sw_info'
  "VzaWdu": "design",  // from 'sw_design'
  "aW1wbA": "impl",    // from 'sw_impl'
};

/**
 * 阶段转换验证结果
 */
interface PhaseTransitionValidation {
  allowed: boolean;
  reason?: string;
  issues?: Array<{ nodeId: string; title: string; status: string; type: string }>;
}

/**
 * 任务边界
 */
interface TaskBoundary {
  focusPath: Set<string>;
  directChildren: Set<string>;
  allRelevantNodes: Set<string>;
}

/**
 * 有效的工作流阶段值
 */
const VALID_WORKFLOW_PHASES: ReadonlySet<WorkflowPhase> = new Set(["info", "design", "impl"]);

/**
 * 规范化工作流阶段值
 * 如果传入无效值，返回 "info" 作为默认值
 */
function normalizeWorkflowPhase(phase: string | undefined | null): WorkflowPhase {
  if (phase && VALID_WORKFLOW_PHASES.has(phase as WorkflowPhase)) {
    return phase as WorkflowPhase;
  }
  if (phase && phase !== "info") {
    devLog.warn(`检测到无效的 workflow.phase: "${phase}"，已重置为 "info"`);
  }
  return "info";
}

/**
 * 工作区服务
 * 处理工作区相关的业务逻辑
 *
 * 架构：
 * - 全局索引：~/.tanmi-workspace/index.json
 * - 项目数据：{projectRoot}/.tanmi-workspace/
 */
export class WorkspaceService {
  private stateService?: import("./StateService.js").StateService;

  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 设置 StateService 依赖（用于 token 生成）
   */
  setStateService(stateService: import("./StateService.js").StateService): void {
    this.stateService = stateService;
  }

  /**
   * 根据 workspaceId 获取工作区信息（包括 dirName 和归档状态）
   * 用于从 workspaceId 查找 dirName 以访问文件系统
   */
  private async resolveWorkspaceInfo(workspaceId: string): Promise<{
    projectRoot: string;
    dirName: string;
    isArchived: boolean;
  }> {
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      devLog.workspaceLookup(workspaceId, false);
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    const isArchived = wsEntry.status === "archived";
    // 如果旧工作区没有 dirName，回退到使用 id
    const dirName = wsEntry.dirName || wsEntry.id;
    devLog.workspaceLookup(workspaceId, true, wsEntry.status);
    return {
      projectRoot: wsEntry.projectRoot,
      dirName,
      isArchived,
    };
  }

  /**
   * 初始化工作区
   */
  async init(params: WorkspaceInitParams): Promise<WorkspaceInitResult> {
    // 1. 验证名称合法性
    validateWorkspaceName(params.name);

    // 2. 确定并验证项目根目录（默认为当前工作目录）
    const projectRoot = params.projectRoot
      ? validateProjectRoot(params.projectRoot)
      : process.cwd();

    // 3. 检查同一项目下是否存在同名工作区（允许多工作区，但名称需唯一）
    if (await this.json.hasWorkspaceByName(projectRoot, params.name)) {
      throw new TanmiError("WORKSPACE_EXISTS", `项目 "${projectRoot}" 下工作区 "${params.name}" 已存在`);
    }

    // 4. 读取索引（后续更新用）
    const index = await this.json.readIndex();

    // 5. 生成工作区 ID 和目录名
    const workspaceId = generateWorkspaceId();
    const wsDirName = generateWorkspaceDirName(params.name, workspaceId);
    const currentTime = now();
    const rootNodeId = "root";
    const rootNodeDirName = "root";  // 根节点目录名固定为 "root"

    // 5.1 处理场景参数（默认 misc）
    const scenario = params.scenario || 'misc';

    // 6. 创建项目内目录结构（使用可读的目录名）
    await this.fs.ensureProjectDir(projectRoot);
    await this.fs.ensureWorkspaceDir(projectRoot, wsDirName);
    await this.fs.mkdir(this.fs.getNodesDir(projectRoot, wsDirName));
    await this.fs.mkdir(this.fs.getNodePath(projectRoot, wsDirName, rootNodeDirName));

    // 7. 写入 workspace.json
    const config: WorkspaceConfig = {
      id: workspaceId,
      name: params.name,
      dirName: wsDirName,
      status: "active",
      createdAt: currentTime,
      updatedAt: currentTime,
      rootNodeId,
      scenario,  // 保存场景类型
    };
    await this.json.writeWorkspaceConfig(projectRoot, wsDirName, config);

    // 8. 写入 graph.json（含根节点，类型为 planning）
    const rootNode: NodeMeta = {
      id: rootNodeId,
      dirName: rootNodeDirName,
      type: "planning",  // 根节点固定为规划节点
      parentId: null,
      children: [],
      status: "pending",
      isolate: false,
      references: [],
      conclusion: null,
      createdAt: currentTime,
      updatedAt: currentTime,
    };
    const graph: NodeGraph = {
      version: JsonStorage.STORAGE_VERSION,
      currentFocus: rootNodeId,
      nodes: {
        [rootNodeId]: rootNode,
      },
      workflow: {
        phase: 'info',
        phaseSkillInvoked: false
      }
    };
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 9. 写入 Workspace.md（goal 已移至根节点 requirement，不再写入 Workspace.md）
    await this.md.writeWorkspaceMd(projectRoot, wsDirName, {
      name: params.name,
      createdAt: currentTime,
      updatedAt: currentTime,
      rules: params.rules || [],
      docs: params.docs || [],
    });

    // 10. 创建空的 Log.md 和 Problem.md (工作区级别)
    await this.md.createEmptyLog(projectRoot, wsDirName);
    await this.md.createEmptyProblem(projectRoot, wsDirName);

    // 11. 创建根节点文件（规划节点）
    await this.md.writeNodeInfo(projectRoot, wsDirName, rootNodeDirName, {
      id: rootNodeId,
      type: "planning",  // 根节点固定为规划节点
      title: params.name,
      status: "pending",
      createdAt: currentTime,
      updatedAt: currentTime,
      requirement: params.goal,
      docs: params.docs || [],
      notes: "",
      conclusion: "",
    });
    await this.md.createEmptyLog(projectRoot, wsDirName, rootNodeDirName);
    await this.md.createEmptyProblem(projectRoot, wsDirName, rootNodeDirName);

    // 12. 更新全局索引
    await this.fs.ensureIndex();
    index.workspaces.push({
      id: workspaceId,
      name: params.name,
      dirName: wsDirName,
      projectRoot,
      status: "active",
      createdAt: currentTime,
      updatedAt: currentTime,
    });
    await this.json.writeIndex(index);

    // 13. 追加日志
    await this.md.appendLog(projectRoot, wsDirName, {
      time: currentTime,
      operator: "system",
      event: `工作区 "${params.name}" 已创建`,
    });

    // 14. 扫描项目文档
    const projectDocs = await this.scanProjectDocs(projectRoot);

    // 15. 生成 hint（包含项目文档信息）
    // 使用 guidanceContent.ts 中的 workspace_init L0 引导
    const wsInitGuidance = getGuidanceConfig("workspace_init");
    let hint = `💡 ${wsInitGuidance?.l0 || "工作区已创建。下一步：调用 capability_list 获取场景推荐能力，然后创建信息收集节点。"}`;

    if (projectDocs.totalFound > 0) {
      hint += `\n\n📚 项目文档扫描结果：发现 ${projectDocs.totalFound} 个 .md 文件`;
      if (projectDocs.degraded) {
        hint += `（超过限制，仅显示部分）`;
      }
      // 统计无元文件的文档
      const noFrontmatter = projectDocs.files.filter(f => !f.hasFrontmatter);
      if (noFrontmatter.length > 0) {
        hint += `\n⚠️ 其中 ${noFrontmatter.length} 个文档缺少元文件(frontmatter)，建议在相关任务中补充。`;
      }
      if (projectDocs.folders.length > 0) {
        hint += `\n📁 文档文件夹: ${projectDocs.folders.join(", ")}`;
      }
      hint += `\n💡 使用 node_reference 引用相关文档，便于任务跟踪和文档同步。`;
    } else {
      hint += `\n\n📭 未在项目中发现 .md 文档文件。`;
    }

    // 生成场景化引导内容
    const scenarioGuidance = this.getScenarioGuidance(scenario);

    // 构建返回结果
    const result: WorkspaceInitResult = {
      workspaceId,
      path: this.fs.getWorkspacePath(projectRoot, wsDirName),
      projectRoot,
      rootNodeId,
      scenario,
      webUrl: `http://localhost:${getHttpPort()}/workspace/${workspaceId}`,
      hint,
      projectDocs,
    };

    // 强制调用 flow-info skill 进入信息阶段
    result.actionRequired = {
      type: "invoke_skill",
      message: `⚠️ MUST 调用 Skill(flow-info) 进入信息收集阶段。

${scenarioGuidance}

**强制规则**：
- MUST 调用 Skill(flow-info)
- NEVER 直接 node_create
- NEVER 跳过 capability_list → capability_select 流程
- 若要跳过流程，MUST 先告知用户并获取同意（禁止自行判断跳过）

**如果 Skill 不可用**，使用 plugin_path 获取路径后 Read：
\`\`\`
plugin_path(type: "skill", name: "flow-info") → 获取路径
Read(file_path: <返回的路径>/SKILL.md)
\`\`\``,
      data: {
        skill: FLOW_SKILLS.INFO,
        scenario,
        workspaceId,
        webUrl: result.webUrl,
        projectDocs: projectDocs.totalFound > 0 ? {
          totalFound: projectDocs.totalFound,
          folders: projectDocs.folders,
        } : null,
      },
    };

    // 16. 发送事件通知
    eventService.emitWorkspaceUpdate(workspaceId);

    return result;
  }

  /**
   * 列出工作区
   */
  async list(params: WorkspaceListParams): Promise<WorkspaceListResult> {
    const index = await this.json.readIndex();
    const statusFilter = params.status || "active";
    const cwd = params.cwd;

    let filteredWorkspaces = index.workspaces;
    if (statusFilter !== "all") {
      filteredWorkspaces = filteredWorkspaces.filter(ws => ws.status === statusFilter);
    }

    // 排序逻辑：置顶 > cwd匹配 > 更新时间
    filteredWorkspaces = [...filteredWorkspaces].sort((a, b) => {
      // 1. 置顶优先
      const aPinned = a.pinned === true;
      const bPinned = b.pinned === true;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      // 2. cwd 匹配优先（如果提供了 cwd）
      if (cwd) {
        const aMatch = a.projectRoot === cwd || cwd.startsWith(a.projectRoot + "/");
        const bMatch = b.projectRoot === cwd || cwd.startsWith(b.projectRoot + "/");
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
      }

      // 3. 按更新时间降序
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    // 为每个工作区添加 webUrl 和 hasWarning 状态
    const port = getHttpPort();
    const workspaces = filteredWorkspaces.map(ws => ({
      ...ws,
      webUrl: `http://localhost:${port}/workspace/${ws.id}`,
      hasWarning: ws.hasUnresolvedIssues === true,
    }));

    // 检查是否有错误状态的工作区，添加排查提示
    const errorWorkspaces = workspaces.filter(ws => ws.status === "error");
    let hint: string | undefined;
    if (errorWorkspaces.length > 0) {
      const errorIds = errorWorkspaces.map(ws => ws.id).join(", ");
      hint = `⚠️ 发现 ${errorWorkspaces.length} 个错误状态的工作区（${errorIds}）。\n\n` +
        "**排查建议**：\n" +
        "1. 检查工作区目录是否存在（可能被误删或移动）\n" +
        "2. 检查 workspace.json 和 graph.json 文件是否完整\n" +
        "3. 查看 error.log 获取详细错误信息：~/.tanmi-workspace[-dev]/error.log\n" +
        "4. 如果无法修复，可使用 workspace_delete(force=true) 删除错误工作区";
    }

    return { workspaces, hint };
  }

  /**
   * 获取工作区详情
   */
  async get(params: WorkspaceGetParams): Promise<WorkspaceGetResult> {
    const { workspaceId } = params;

    // 通过索引查找工作区条目（获取 projectRoot 和 status）
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      devLog.workspaceLookup(workspaceId, false);
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    const { projectRoot, status } = wsEntry;
    let wsDirName = wsEntry.dirName || wsEntry.id;  // 向后兼容
    const isArchived = status === "archived";
    devLog.workspaceLookup(workspaceId, true, status);

    // 如果工作区处于 error 状态，返回错误信息而不是尝试读取文件
    if (status === "error" && wsEntry.errorInfo) {
      throw new TanmiError(
        "WORKSPACE_ERROR",
        `工作区 "${workspaceId}" 处于错误状态: ${wsEntry.errorInfo.message}\n` +
        `错误类型: ${wsEntry.errorInfo.type}\n` +
        `检测时间: ${wsEntry.errorInfo.detectedAt}\n\n` +
        `**修复建议**：\n` +
        `- WebUI: 在首页找到该工作区，点击"查看错误"进行诊断和修复\n` +
        `- CLI: 运行 tanmi-workspace repair ${workspaceId}\n` +
        `- 强制删除: workspace_delete(workspaceId, force=true)`
      );
    }

    // 验证项目目录存在（根据归档状态选择正确路径）
    let workspacePath = this.fs.getWorkspaceBasePath(projectRoot, wsDirName, isArchived);
    devLog.archivePath(workspaceId, isArchived, workspacePath);
    if (!(await this.fs.exists(workspacePath))) {
      // 尝试自动修复：查找可能存在的正确目录
      const fixedDirName = await this.tryFixWorkspaceDir(workspaceId, projectRoot, wsDirName, isArchived);
      if (fixedDirName) {
        wsDirName = fixedDirName;
        workspacePath = this.fs.getWorkspaceBasePath(projectRoot, wsDirName, isArchived);
        // 更新 index.json 中的 dirName
        wsEntry.dirName = fixedDirName;
        await this.json.writeIndex(index);
        devLog.debug(`自动修复工作区目录名: ${wsEntry.dirName} → ${fixedDirName}`);
      } else {
        devLog.fileError("exists", workspacePath, new Error("目录不存在"));
        // 标记为 error 状态而不是删除
        await this.markAsError(workspaceId, "dir_missing", `工作区目录不存在: ${workspacePath}`);
        throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 的项目目录不存在（已标记为错误状态，可通过 workspace_list 查看）`);
      }
    }

    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName, isArchived);

    // 读取 graph 时捕获版本过高错误
    let graph;
    try {
      graph = await this.json.readGraph(projectRoot, wsDirName, isArchived);
    } catch (e) {
      if (e instanceof TanmiError && e.code === "VERSION_TOO_HIGH") {
        await this.markAsError(workspaceId, "version_too_high", e.message);
        throw e;
      }
      throw e;
    }

    const workspaceMd = await this.md.readWorkspaceMdRaw(projectRoot, wsDirName, isArchived);

    // 读取完整日志（原始表格格式）
    // 压缩处理在 MCP 层通过 OutputAdapter 完成
    const logMd = await this.md.readLogRaw(projectRoot, wsDirName, undefined, isArchived);

    // 解析规则并计算哈希
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, wsDirName, isArchived);
    const rulesCount = workspaceMdData.rules.length;
    const rulesHash = rulesCount > 0
      ? crypto.createHash("md5").update(workspaceMdData.rules.join("\n")).digest("hex").substring(0, 8)
      : "";

    // 清除手动变更清单（AI 已获取工作区详情，无需再提醒历史变更）
    // 注意：只在非归档状态下清除，归档工作区为只读
    if (!isArchived) {
      try {
        await this.clearManualChanges(workspaceId);
      } catch (error) {
        // 清除失败不影响主流程
        devLog.warn("清除手动变更失败", { workspaceId, error });
      }
    }

    // 节点完整性检测（并行检测）
    const issues = await this.validateNodesIntegrity(projectRoot, wsDirName, graph, isArchived);

    // 构建轻量级拓扑结构
    // 1. 计算 focusPath（从 currentFocus 到 root 的路径）
    const focusPath = new Set<string>();
    let currentNodeId = graph.currentFocus;
    while (currentNodeId) {
      focusPath.add(currentNodeId);
      const node = graph.nodes[currentNodeId];
      if (!node || currentNodeId === "root") break;
      currentNodeId = node.parentId || "";
    }

    // 2. 收集各节点的标题（并行读取所有节点的 info.md）
    const nodeIds = Object.keys(graph.nodes);
    const titles: Record<string, string> = {};
    await Promise.all(
      nodeIds.map(async (nodeId) => {
        const node = graph.nodes[nodeId];
        const nodeDirName = node.dirName || nodeId;
        try {
          const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName, isArchived);
          titles[nodeId] = nodeInfo.title || nodeId;
        } catch {
          // 读取失败时使用 nodeId 作为标题
          titles[nodeId] = nodeId;
        }
      })
    );

    // 3. 构建拓扑结构
    const topology = this.buildTopology(graph.nodes, "root", focusPath, titles);

    // 构建轻量 graph（移除 nodes，用 topology 替代）
    // 压缩 memos：只保留 id, title, summary
    const lightMemos = graph.memos
      ? Object.fromEntries(
          Object.entries(graph.memos).map(([key, memo]) => [
            key,
            { id: memo.id, title: memo.title, summary: memo.summary },
          ])
        )
      : undefined;

    const lightGraph = {
      version: graph.version,
      currentFocus: graph.currentFocus,
      lastWriteCodeVersion: graph.lastWriteCodeVersion,
      memos: lightMemos,
    };

    const result: WorkspaceGetResult = {
      config,
      graph: lightGraph as typeof graph,
      workspaceMd,
      logMd,
      webUrl: `http://localhost:${getHttpPort()}/workspace/${workspaceId}`,
      rulesCount,
      rulesHash,
      topology,
    };

    // 如果有问题，添加 warning 字段并设置警告标记
    if (issues.length > 0) {
      // 检查是否应该显示警告（24小时内只警告一次）
      const shouldWarn = await this.shouldShowWarning(workspaceId);
      if (shouldWarn) {
        await this.setWarningFlag(workspaceId, issues);
      }

      result.warning = {
        message: `检测到 ${issues.length} 个节点完整性问题`,
        issues,
        suggestion: "可使用 workspace_health 工具查看详情并进行修复",
      };
    } else {
      // 检测通过，清除警告标记
      await this.clearWarningFlag(workspaceId);
    }

    return result;
  }

  /**
   * 删除工作区
   */
  async delete(params: WorkspaceDeleteParams): Promise<WorkspaceDeleteResult> {
    const { workspaceId, force = false } = params;

    // 通过索引查找
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    // 检查状态
    if (wsEntry.status === "active" && !force) {
      throw new TanmiError(
        "WORKSPACE_ACTIVE",
        `工作区 "${workspaceId}" 处于活动状态，使用 force=true 强制删除`
      );
    }

    // 注意：不清理 Git 分支，用户可能选择保留分支用于对比
    // 孤儿分支可通过 git branch -D tanmi_workspace/... 手动清理

    // 删除项目内目录（使用 dirName）
    const wsDirName = wsEntry.dirName || wsEntry.id;  // 向后兼容
    const workspacePath = this.fs.getWorkspacePath(wsEntry.projectRoot, wsDirName);
    if (await this.fs.exists(workspacePath)) {
      await this.fs.rmdir(workspacePath);
    }

    // 更新全局索引
    index.workspaces = index.workspaces.filter(ws => ws.id !== workspaceId);
    await this.json.writeIndex(index);

    // 发送事件通知
    eventService.emitWorkspaceUpdate(workspaceId);

    return { success: true };
  }

  /**
   * 获取工作区状态（可视化输出）
   */
  async status(params: WorkspaceStatusParams): Promise<WorkspaceStatusResult> {
    const { workspaceId, format = "box" } = params;

    // 通过索引查找工作区条目（获取 projectRoot 和 status）
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    const { projectRoot, status } = wsEntry;
    const wsDirName = wsEntry.dirName || wsEntry.id;  // 向后兼容
    const isArchived = status === "archived";

    // 验证项目目录存在（根据归档状态选择正确路径）
    const workspacePath = this.fs.getWorkspaceBasePath(projectRoot, wsDirName, isArchived);
    if (!(await this.fs.exists(workspacePath))) {
      // 标记为 error 状态而不是删除
      await this.markAsError(workspaceId, "dir_missing", `工作区目录不存在: ${workspacePath}`);
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 的项目目录不存在（已标记为错误状态）`);
    }

    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName, isArchived);
    const graph = await this.json.readGraph(projectRoot, wsDirName, isArchived);

    // 从根节点读取 goal（requirement 字段）- goal 已统一到根节点
    const rootNodeId = config.rootNodeId || "root";
    const rootNodeMeta = graph.nodes[rootNodeId];
    const rootNodeDirName = rootNodeMeta?.dirName || rootNodeId;
    let rootNodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, rootNodeDirName, isArchived);
    let goal = rootNodeInfo.requirement || "";

    // 懒迁移：如果根节点 requirement 为空，检查旧版 Workspace.md 中是否有 goal
    // 仅对非归档工作区执行迁移（归档工作区为只读）
    if (!goal && !isArchived) {
      const legacyGoal = await this.md.readLegacyGoal(projectRoot, wsDirName, false);
      if (legacyGoal) {
        // 将旧版 goal 迁移到根节点 requirement
        rootNodeInfo = {
          ...rootNodeInfo,
          requirement: legacyGoal,
        };
        await this.md.writeNodeInfo(projectRoot, wsDirName, rootNodeDirName, rootNodeInfo);
        goal = legacyGoal;
        devLog.debug("懒迁移完成", { workspaceId, goal: legacyGoal.substring(0, 50) });
      }
    }

    // 计算统计信息（终态 = completed + failed + cancelled）
    const nodes = Object.values(graph.nodes);
    const totalNodes = nodes.length;
    const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
    const completedNodes = nodes.filter(n => terminalStatuses.has(n.status)).length;

    const summary = {
      name: config.name,
      goal,
      status: config.status,
      totalNodes,
      completedNodes,
      currentFocus: graph.currentFocus,
    };

    // 生成输出
    let output: string;
    if (format === "markdown") {
      output = await this.generateMarkdownStatus(projectRoot, wsDirName, config, graph, summary, isArchived);
    } else {
      output = await this.generateBoxStatus(projectRoot, wsDirName, config, graph, summary, isArchived);
    }

    // 收集 memo 信息
    const memosIndex = graph.memos || {};
    const memosList = Object.values(memosIndex);

    // 收集所有已使用的 tags
    const allTagsSet = new Set<string>();
    memosList.forEach(memo => {
      memo.tags.forEach(tag => allTagsSet.add(tag));
    });
    const allTags = Array.from(allTagsSet).sort();

    // 按更新时间倒序排序
    memosList.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return {
      output,
      summary,
      webUrl: `http://localhost:${getHttpPort()}/workspace/${workspaceId}`,
      memos: memosList.length > 0 ? {
        items: memosList.map(m => ({
          id: m.id,
          title: m.title,
          summary: m.summary,
          tags: m.tags,
          updatedAt: m.updatedAt,
        })),
        allTags,
        totalCount: memosList.length,
      } : undefined,
    };
  }

  /**
   * 根据 workspaceId 获取 projectRoot（供其他服务使用）
   */
  async resolveProjectRoot(workspaceId: string): Promise<string> {
    const projectRoot = await this.json.getProjectRoot(workspaceId);
    if (!projectRoot) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    return projectRoot;
  }

  /**
   * 解析工作区位置信息（projectRoot 和 dirName）
   * 用于需要访问文件系统的操作
   */
  async resolveWorkspaceLocation(workspaceId: string): Promise<{ projectRoot: string; dirName: string }> {
    const location = await this.json.getWorkspaceLocation(workspaceId);
    if (!location) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    return location;
  }

  /**
   * 生成 Box 格式状态输出
   */
  private async generateBoxStatus(
    projectRoot: string,
    wsDirName: string,
    config: WorkspaceConfig,
    graph: NodeGraph,
    summary: { goal: string; totalNodes: number; completedNodes: number; currentFocus: string | null },
    isArchived: boolean = false
  ): Promise<string> {
    const lines: string[] = [];
    const width = 60;

    lines.push("┌" + "─".repeat(width - 2) + "┐");
    lines.push("│" + ` 工作区: ${config.name}`.padEnd(width - 2) + "│");
    lines.push("│" + ` 状态: ${config.status}`.padEnd(width - 2) + "│");
    lines.push("├" + "─".repeat(width - 2) + "┤");
    lines.push("│" + ` 目标: ${summary.goal.substring(0, width - 10)}`.padEnd(width - 2) + "│");
    lines.push("├" + "─".repeat(width - 2) + "┤");
    lines.push("│" + ` 节点统计: ${summary.completedNodes}/${summary.totalNodes} 已处理`.padEnd(width - 2) + "│");
    lines.push("│" + ` 当前聚焦: ${summary.currentFocus || "无"}`.padEnd(width - 2) + "│");

    // 派发模式信息
    if (config.dispatch?.enabled) {
      const dispatchMode = config.dispatch.useGit ? "Git 模式" : "无 Git 模式";
      lines.push("│" + ` 派发: 已启用 (${dispatchMode})`.padEnd(width - 2) + "│");
    } else {
      lines.push("│" + ` 派发: 未启用`.padEnd(width - 2) + "│");
    }

    lines.push("├" + "─".repeat(width - 2) + "┤");
    lines.push("│" + " 节点树:".padEnd(width - 2) + "│");

    // 生成节点树
    const treeLines = await this.generateNodeTree(projectRoot, wsDirName, graph, config.rootNodeId, 0, isArchived);
    for (const treeLine of treeLines) {
      const truncated = treeLine.length > width - 4 ? treeLine.substring(0, width - 7) + "..." : treeLine;
      lines.push("│" + ` ${truncated}`.padEnd(width - 2) + "│");
    }

    lines.push("└" + "─".repeat(width - 2) + "┘");

    return lines.join("\n");
  }

  /**
   * 生成 Markdown 格式状态输出
   */
  private async generateMarkdownStatus(
    projectRoot: string,
    wsDirName: string,
    config: WorkspaceConfig,
    graph: NodeGraph,
    summary: { goal: string; totalNodes: number; completedNodes: number; currentFocus: string | null },
    isArchived: boolean = false
  ): Promise<string> {
    const lines: string[] = [];

    lines.push(`# ${config.name}`);
    lines.push("");
    lines.push(`**状态**: ${config.status}`);
    lines.push(`**目标**: ${summary.goal}`);

    // 派发模式信息
    if (config.dispatch?.enabled) {
      const dispatchMode = config.dispatch.useGit ? "Git 模式" : "无 Git 模式";
      lines.push(`**派发模式**: 已启用 (${dispatchMode})`);
    } else {
      lines.push(`**派发模式**: 未启用`);
    }

    lines.push("");
    lines.push("## 统计");
    lines.push(`- 节点总数: ${summary.totalNodes}`);
    lines.push(`- 已处理: ${summary.completedNodes}`);
    lines.push(`- 当前聚焦: ${summary.currentFocus || "无"}`);
    lines.push("");
    lines.push("## 节点树");
    lines.push("");

    const treeLines = await this.generateNodeTreeMd(projectRoot, wsDirName, graph, config.rootNodeId, 0, isArchived);
    lines.push(...treeLines);

    return lines.join("\n");
  }

  /**
   * 生成节点树（Box 格式）
   */
  private async generateNodeTree(
    projectRoot: string,
    wsDirName: string,
    graph: NodeGraph,
    nodeId: string,
    depth: number,
    isArchived: boolean = false
  ): Promise<string[]> {
    const node = graph.nodes[nodeId];
    if (!node) return [];

    const lines: string[] = [];
    const indent = "  ".repeat(depth);
    const statusIcon = this.getStatusIcon(node.status);
    const focusIndicator = graph.currentFocus === nodeId ? " ◄" : "";

    // 读取节点标题（使用 dirName 或回退到 nodeId）
    const nodeDirName = node.dirName || nodeId;
    const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName, isArchived);
    const title = nodeInfo.title || nodeId;

    lines.push(`${indent}${statusIcon} ${title}${focusIndicator}`);

    for (const childId of node.children) {
      lines.push(...await this.generateNodeTree(projectRoot, wsDirName, graph, childId, depth + 1, isArchived));
    }

    return lines;
  }

  /**
   * 生成节点树（Markdown 格式）
   */
  private async generateNodeTreeMd(
    projectRoot: string,
    wsDirName: string,
    graph: NodeGraph,
    nodeId: string,
    depth: number,
    isArchived: boolean = false
  ): Promise<string[]> {
    const node = graph.nodes[nodeId];
    if (!node) return [];

    const lines: string[] = [];
    const indent = "  ".repeat(depth);
    const statusIcon = this.getStatusIcon(node.status);
    const focusIndicator = graph.currentFocus === nodeId ? " **◄ 当前聚焦**" : "";

    // 读取节点标题（使用 dirName 或回退到 nodeId）
    const nodeDirName = node.dirName || nodeId;
    const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName, isArchived);
    const title = nodeInfo.title || nodeId;

    lines.push(`${indent}- ${statusIcon} ${title}${focusIndicator}`);

    for (const childId of node.children) {
      lines.push(...await this.generateNodeTreeMd(projectRoot, wsDirName, graph, childId, depth + 1, isArchived));
    }

    return lines;
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      // 通用状态
      case "pending":
        return "○";
      case "completed":
        return "●";
      // 执行节点状态
      case "implementing":
        return "◐";
      case "validating":
        return "◑";
      case "failed":
        return "✕";
      // 规划节点状态
      case "planning":
        return "◇";
      case "monitoring":
        return "◈";
      case "cancelled":
        return "⊘";
      default:
        return "?";
    }
  }

  /**
   * 切换工作区置顶状态
   * @param workspaceId 工作区 ID
   * @returns 新的置顶状态
   */
  async togglePin(workspaceId: string): Promise<{ pinned: boolean }> {
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);

    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    // 切换置顶状态（false 时删除字段以节省空间）
    const newPinned = !wsEntry.pinned;
    wsEntry.pinned = newPinned ? true : undefined;
    wsEntry.updatedAt = now();

    await this.json.writeIndex(index);

    // 发送事件通知
    eventService.emitWorkspaceUpdate(workspaceId);

    return { pinned: newPinned };
  }

  /**
   * 更新工作区规则
   */
  async updateRules(params: WorkspaceUpdateRulesParams): Promise<WorkspaceUpdateRulesResult> {
    const { workspaceId, action, rule, rules } = params;

    // 获取工作区位置信息
    const { projectRoot, dirName: wsDirName } = await this.resolveWorkspaceLocation(workspaceId);

    // 读取当前工作区数据
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, wsDirName);
    let currentRules = [...workspaceMdData.rules];

    // 执行操作
    switch (action) {
      case "add":
        if (!rule) {
          throw new TanmiError("INVALID_PARAMS", "add 操作需要提供 rule 参数");
        }
        if (!currentRules.includes(rule)) {
          currentRules.push(rule);
        }
        break;

      case "remove":
        if (!rule) {
          throw new TanmiError("INVALID_PARAMS", "remove 操作需要提供 rule 参数");
        }
        currentRules = currentRules.filter(r => r !== rule);
        break;

      case "replace":
        if (!rules) {
          throw new TanmiError("INVALID_PARAMS", "replace 操作需要提供 rules 参数");
        }
        currentRules = [...rules];
        break;
    }

    // 更新 Workspace.md
    workspaceMdData.rules = currentRules;
    workspaceMdData.updatedAt = now();
    await this.md.writeWorkspaceMd(projectRoot, wsDirName, workspaceMdData);

    // 计算新的哈希
    const rulesHash = currentRules.length > 0
      ? crypto.createHash("md5").update(currentRules.join("\n")).digest("hex").substring(0, 8)
      : "";

    // 发送事件通知
    eventService.emitWorkspaceUpdate(workspaceId);

    return {
      success: true,
      rulesCount: currentRules.length,
      rulesHash,
      rules: currentRules,
    };
  }

  /**
   * 归档工作区
   */
  async archive(params: WorkspaceArchiveParams): Promise<WorkspaceArchiveResult> {
    const { workspaceId } = params;

    // 1. 通过索引查找工作区
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    // 2. 验证状态为 active
    if (wsEntry.status !== "active") {
      throw new TanmiError("WORKSPACE_ARCHIVED", `工作区 "${workspaceId}" 已经处于归档状态`);
    }

    const { projectRoot } = wsEntry;
    const dirName = wsEntry.dirName || workspaceId;
    const currentTime = now();

    // 3. 验证源目录存在
    const srcPath = this.fs.getWorkspacePath(projectRoot, dirName);
    if (!(await this.fs.exists(srcPath))) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区目录不存在: ${srcPath}`);
    }

    // 注意：归档时不清理 Git 分支，用户可能选择保留分支用于对比

    // 4. 确保归档目录存在
    await this.fs.ensureArchiveDir(projectRoot);

    // 5. 移动目录到归档位置
    const archivePath = this.fs.getArchivePath(projectRoot, dirName);
    await this.fs.moveDir(srcPath, archivePath);

    // 6. 更新索引状态
    wsEntry.status = "archived";
    wsEntry.updatedAt = currentTime;
    await this.json.writeIndex(index);

    // 7. 更新 workspace.json 状态
    const config = await this.json.readWorkspaceConfig(projectRoot, dirName, true);
    config.status = "archived";
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, dirName, config, true);

    // 8. 追加日志
    await this.md.appendLog(projectRoot, dirName, {
      time: currentTime,
      operator: "system",
      event: `工作区已归档`,
    }, true);

    // 9. 发送事件通知
    eventService.emitWorkspaceUpdate(workspaceId);

    return {
      success: true,
      archivePath,
    };
  }

  /**
   * 恢复归档的工作区
   */
  async restore(params: WorkspaceRestoreParams): Promise<WorkspaceRestoreResult> {
    const { workspaceId } = params;

    // 1. 通过索引查找工作区
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    // 2. 验证状态为 archived
    if (wsEntry.status !== "archived") {
      throw new TanmiError("WORKSPACE_ACTIVE", `工作区 "${workspaceId}" 不是归档状态，无需恢复`);
    }

    const { projectRoot } = wsEntry;
    const dirName = wsEntry.dirName || workspaceId;
    const currentTime = now();

    // 3. 验证归档目录存在
    const archivePath = this.fs.getArchivePath(projectRoot, dirName);
    if (!(await this.fs.exists(archivePath))) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `归档工作区目录不存在: ${archivePath}`);
    }

    // 4. 移动目录回原位置
    const destPath = this.fs.getWorkspacePath(projectRoot, dirName);
    await this.fs.moveDir(archivePath, destPath);

    // 5. 更新索引状态
    wsEntry.status = "active";
    wsEntry.updatedAt = currentTime;
    await this.json.writeIndex(index);

    // 6. 更新 workspace.json 状态
    const config = await this.json.readWorkspaceConfig(projectRoot, dirName);
    config.status = "active";
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, dirName, config);

    // 7. 追加日志
    await this.md.appendLog(projectRoot, dirName, {
      time: currentTime,
      operator: "system",
      event: `工作区已从归档恢复`,
    });

    // 8. 发送事件通知
    eventService.emitWorkspaceUpdate(workspaceId);

    return {
      success: true,
      path: destPath,
      webUrl: `http://localhost:${getHttpPort()}/workspace/${workspaceId}`,
    };
  }

  // ========== 项目文档扫描 ==========

  /** 排除的目录名 */
  private static readonly EXCLUDED_DIRS = new Set([
    "node_modules",
    ".git",
    ".tanmi-workspace",
    ".tanmi-workspace-dev",
    "dist",
    "build",
    "coverage",
    ".next",
    ".nuxt",
    ".output",
    "__pycache__",
    ".venv",
    "venv",
  ]);

  /** 文件数量限制 */
  private static readonly MAX_FILES = 50;

  /**
   * 扫描项目文档
   * 扫描 1-2 级目录的 .md 文件，检测元文件，限制文件数
   */
  async scanProjectDocs(projectRoot: string): Promise<ProjectDocsScanResult> {
    const files: ProjectDocInfo[] = [];
    const folders: string[] = [];
    let totalFound = 0;

    try {
      // 扫描根目录的 .md 文件
      const rootEntries = await fs.readdir(projectRoot, { withFileTypes: true });

      for (const entry of rootEntries) {
        if (entry.name.startsWith(".") && entry.name !== ".") continue;
        if (WorkspaceService.EXCLUDED_DIRS.has(entry.name)) continue;

        const entryPath = path.join(projectRoot, entry.name);

        if (entry.isFile() && entry.name.endsWith(".md")) {
          // 根目录 .md 文件
          totalFound++;
          if (files.length < WorkspaceService.MAX_FILES) {
            const hasFrontmatter = await this.checkFrontmatter(entryPath);
            files.push({ path: entry.name, hasFrontmatter });
          }
        } else if (entry.isDirectory()) {
          // 扫描一级子目录
          await this.scanSubDirectory(
            projectRoot,
            entry.name,
            1,
            files,
            folders,
            { total: totalFound }
          ).then(count => { totalFound = count; });
        }
      }
    } catch {
      // 扫描失败时返回空结果
      return { files: [], folders: [], totalFound: 0, degraded: false };
    }

    const degraded = totalFound > WorkspaceService.MAX_FILES;

    // 如果退化模式，只保留文件夹信息
    if (degraded) {
      return {
        files: files.slice(0, 10), // 保留少量示例文件
        folders,
        totalFound,
        degraded: true,
      };
    }

    return { files, folders, totalFound, degraded: false };
  }

  /**
   * 扫描子目录
   */
  private async scanSubDirectory(
    projectRoot: string,
    relativePath: string,
    depth: number,
    files: ProjectDocInfo[],
    folders: string[],
    counter: { total: number }
  ): Promise<number> {
    if (depth > 2) return counter.total;

    const fullPath = path.join(projectRoot, relativePath);

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      let allMd = true;
      let hasMd = false;

      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        if (WorkspaceService.EXCLUDED_DIRS.has(entry.name)) continue;

        const entryRelPath = path.join(relativePath, entry.name);
        const entryFullPath = path.join(fullPath, entry.name);

        if (entry.isFile()) {
          if (entry.name.endsWith(".md")) {
            hasMd = true;
            counter.total++;
            if (files.length < WorkspaceService.MAX_FILES) {
              const hasFrontmatter = await this.checkFrontmatter(entryFullPath);
              files.push({ path: entryRelPath, hasFrontmatter });
            }
          } else {
            allMd = false;
          }
        } else if (entry.isDirectory()) {
          allMd = false;
          // 检查 3 级目录是否全是 .md
          if (depth === 2) {
            const isDocFolder = await this.isDocFolder(entryFullPath);
            if (isDocFolder) {
              folders.push(entryRelPath);
            }
          } else {
            // 继续扫描下一级
            await this.scanSubDirectory(
              projectRoot,
              entryRelPath,
              depth + 1,
              files,
              folders,
              counter
            );
          }
        }
      }

      // 如果当前目录全是 .md 文件且有文件，标记为文档文件夹
      if (depth === 2 && allMd && hasMd && !folders.includes(relativePath)) {
        folders.push(relativePath);
      }
    } catch {
      // 目录读取失败，跳过
    }

    return counter.total;
  }

  /**
   * 检查文件是否有 frontmatter（以 --- 开头）
   */
  private async checkFrontmatter(filePath: string): Promise<boolean> {
    try {
      const fd = await fs.open(filePath, "r");
      const buffer = Buffer.alloc(4);
      await fd.read(buffer, 0, 4, 0);
      await fd.close();
      return buffer.toString("utf-8").startsWith("---");
    } catch {
      return false;
    }
  }

  /**
   * 检查目录是否为文档文件夹（全是 .md 文件）
   */
  private async isDocFolder(dirPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      if (entries.length === 0) return false;

      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory()) return false;
        if (entry.isFile() && !entry.name.endsWith(".md")) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 验证节点完整性（并行检测）
   * 检测节点目录和 Info.md 是否存在
   */
  private async validateNodesIntegrity(
    projectRoot: string,
    wsDirName: string,
    graph: NodeGraph,
    isArchived: boolean
  ): Promise<HealthIssue[]> {
    const issues: HealthIssue[] = [];
    const nodeIds = Object.keys(graph.nodes);

    // 并行检测所有节点
    const results = await Promise.all(
      nodeIds.map(async (nodeId) => {
        const node = graph.nodes[nodeId];
        let nodeDirName = node.dirName || nodeId;
        const nodeIssues: HealthIssue[] = [];

        // root 节点目录名固定为 "root"
        if (nodeId === "root") {
          nodeDirName = "root";
        }

        // 获取节点目录路径
        const nodesDir = isArchived
          ? `${this.fs.getArchivePath(projectRoot, wsDirName)}/nodes`
          : this.fs.getNodesDir(projectRoot, wsDirName);
        const nodePath = `${nodesDir}/${nodeDirName}`;

        // 1. 检测目录存在
        if (!(await this.fs.exists(nodePath))) {
          nodeIssues.push({
            type: "node_corrupt",
            severity: "error",
            target: nodeId,
            message: `节点目录不存在: ${nodeDirName}`,
            suggestion: "从备份恢复或删除该节点",
          });
          return nodeIssues; // 目录不存在则跳过文件检测
        }

        // 2. 检测 Info.md 存在
        const infoPath = `${nodePath}/Info.md`;
        if (!(await this.fs.exists(infoPath))) {
          nodeIssues.push({
            type: "node_corrupt",
            severity: "warning",
            target: nodeId,
            message: `节点 Info.md 缺失: ${nodeDirName}`,
            suggestion: "可尝试重建节点信息文件",
          });
        }

        return nodeIssues;
      })
    );

    // 合并所有问题
    for (const nodeIssues of results) {
      issues.push(...nodeIssues);
    }

    return issues;
  }

  /**
   * 尝试修复工作区目录名（当记录的目录不存在时，查找可能存在的正确目录）
   * @returns 修复后的目录名，如果无法修复则返回 undefined
   */
  private async tryFixWorkspaceDir(
    workspaceId: string,
    projectRoot: string,
    currentDirName: string,
    isArchived: boolean
  ): Promise<string | undefined> {
    // 获取工作区根目录
    const baseDir = isArchived
      ? this.fs.getArchiveDir(projectRoot)
      : this.fs.getWorkspaceRootPath(projectRoot);

    // 检查根目录是否存在
    if (!(await this.fs.exists(baseDir))) {
      return undefined;
    }

    // 提取工作区 ID 的短 ID
    const shortId = extractShortId(workspaceId);

    // 在目录中查找包含短 ID 的子目录
    try {
      const entries = await this.fs.readdir(baseDir);

      // 优先级 1: 精确匹配 `_shortId` 后缀（当前标准格式）
      for (const entry of entries) {
        if (entry.endsWith(`_${shortId}`)) {
          return entry;
        }
      }

      // 优先级 2: 匹配 `shortId` 后缀（无下划线，可能的早期格式）
      for (const entry of entries) {
        if (entry.endsWith(shortId) && !entry.endsWith(`_${shortId}`)) {
          return entry;
        }
      }

      // 优先级 3: 包含短 ID 的任意目录
      for (const entry of entries) {
        if (entry.includes(shortId)) {
          return entry;
        }
      }
    } catch {
      // 读取目录失败
    }

    return undefined;
  }

  /**
   * 将工作区标记为错误状态
   * @param workspaceId 工作区 ID
   * @param errorType 错误类型
   * @param message 错误信息
   */
  async markAsError(
    workspaceId: string,
    errorType: WorkspaceErrorInfo["type"],
    message: string
  ): Promise<WorkspaceErrorInfo> {
    // 更新索引中的状态
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);

    // 保存原始状态（仅当不是已经处于 error 状态时）
    const previousStatus = wsEntry?.status !== "error" ? wsEntry?.status as "active" | "archived" : wsEntry?.errorInfo?.previousStatus;

    const errorInfo: WorkspaceErrorInfo = {
      message,
      detectedAt: now(),
      type: errorType,
      previousStatus,
    };

    if (wsEntry) {
      wsEntry.status = "error";
      wsEntry.errorInfo = errorInfo;
      wsEntry.updatedAt = now();
      await this.json.writeIndex(index);
    }

    // 记录到 error.log
    logError(errorType || "unknown", workspaceId, message);

    return errorInfo;
  }

  /**
   * 清除工作区的错误状态（用于修复后）
   * 恢复为错误前的原始状态（active 或 archived）
   * @param workspaceId 工作区 ID
   */
  async clearError(workspaceId: string): Promise<void> {
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (wsEntry && wsEntry.status === "error") {
      // 恢复为原始状态，默认为 active
      wsEntry.status = wsEntry.errorInfo?.previousStatus || "active";
      delete wsEntry.errorInfo;
      wsEntry.updatedAt = now();
      await this.json.writeIndex(index);
    }
  }

  // ========== 手动变更清单管理 ==========

  /**
   * 添加手动变更记录
   * @param workspaceId 工作区 ID
   * @param change 变更记录（不含 id，由方法生成）
   */
  async addManualChange(
    workspaceId: string,
    change: Omit<ManualChange, "id">
  ): Promise<void> {
    const { projectRoot, dirName } = await this.resolveWorkspaceLocation(workspaceId);
    const config = await this.json.readWorkspaceConfig(projectRoot, dirName);

    // 初始化变更清单
    if (!config.pendingManualChanges) {
      config.pendingManualChanges = [];
    }

    // 生成 ID 并添加变更
    const newChange: ManualChange = {
      id: `change-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      ...change,
    };

    config.pendingManualChanges.push(newChange);

    // 保持上限 20 条（移除最旧的）
    if (config.pendingManualChanges.length > 20) {
      config.pendingManualChanges = config.pendingManualChanges.slice(-20);
    }

    config.updatedAt = now();
    await this.json.writeWorkspaceConfig(projectRoot, dirName, config);
  }

  /**
   * 获取手动变更清单
   * @param workspaceId 工作区 ID
   * @returns 变更清单（按时间顺序）
   */
  async getManualChanges(workspaceId: string): Promise<ManualChange[]> {
    const { projectRoot, dirName } = await this.resolveWorkspaceLocation(workspaceId);
    const config = await this.json.readWorkspaceConfig(projectRoot, dirName);
    return config.pendingManualChanges || [];
  }

  /**
   * 清除手动变更清单
   * @param workspaceId 工作区 ID
   */
  async clearManualChanges(workspaceId: string): Promise<void> {
    const { projectRoot, dirName } = await this.resolveWorkspaceLocation(workspaceId);
    const config = await this.json.readWorkspaceConfig(projectRoot, dirName);

    config.pendingManualChanges = [];
    config.updatedAt = now();
    await this.json.writeWorkspaceConfig(projectRoot, dirName, config);
  }

  /**
   * 获取场景化引导内容（用于 workspace_init）
   * @param scenario 任务场景类型
   * @returns 场景引导文本
   */
  private getScenarioGuidance(scenario: import("../types/workspace.js").TaskScenario): string {
    const guidanceScenario = taskScenarioToGuidance(scenario);
    const config = getGuidanceConfig(guidanceScenario);

    if (!config) {
      return "";
    }

    // 返回 L1 级别的引导内容（关键步骤列表）
    return `**📋 ${this.getScenarioDisplayName(scenario)}场景引导**\n${config.l1}`;
  }

  /**
   * 获取场景显示名称
   */
  private getScenarioDisplayName(scenario: import("../types/workspace.js").TaskScenario): string {
    switch (scenario) {
      case "feature":
        return "功能开发";
      case "summary":
        return "文档总结";
      case "optimize":
        return "性能优化";
      case "debug":
        return "问题调试";
      case "misc":
        return "杂项任务";
      default:
        return "通用";
    }
  }

  // ========== 警告机制 ==========

  /** 警告频率限制：24 小时 */
  private static readonly WARNING_DEBOUNCE_MS = 24 * 60 * 60 * 1000;

  /**
   * 设置工作区警告标记
   * 用于标记检测到问题的工作区
   * @param workspaceId 工作区 ID
   * @param issues 检测到的问题列表（用于日志记录）
   */
  async setWarningFlag(workspaceId: string, issues: HealthIssue[]): Promise<void> {
    const index = await this.json.readIndex();
    const entry = index.workspaces.find(w => w.id === workspaceId);
    if (!entry) return;

    entry.hasUnresolvedIssues = true;
    entry.lastWarningAt = new Date().toISOString();
    entry.updatedAt = now();

    await this.json.writeIndex(index);

    // 记录日志
    devLog.debug(`工作区 ${workspaceId} 设置警告标记，发现 ${issues.length} 个问题`);
  }

  /**
   * 清除工作区警告标记
   * 在健康检测通过时调用
   * @param workspaceId 工作区 ID
   */
  async clearWarningFlag(workspaceId: string): Promise<void> {
    const index = await this.json.readIndex();
    const entry = index.workspaces.find(w => w.id === workspaceId);
    if (!entry) return;

    // 只有存在警告标记时才更新
    if (entry.hasUnresolvedIssues || entry.lastWarningAt) {
      delete entry.hasUnresolvedIssues;
      delete entry.lastWarningAt;
      entry.updatedAt = now();

      await this.json.writeIndex(index);
      devLog.debug(`工作区 ${workspaceId} 清除警告标记`);
    }
  }

  /**
   * 检查是否应该显示警告
   * 同一工作区 24 小时内只警告一次
   * @param workspaceId 工作区 ID
   * @returns 是否应该警告
   */
  async shouldShowWarning(workspaceId: string): Promise<boolean> {
    const index = await this.json.readIndex();
    const entry = index.workspaces.find(w => w.id === workspaceId);
    if (!entry) return false;

    // 如果没有上次警告时间，应该警告
    if (!entry.lastWarningAt) {
      return true;
    }

    // 检查是否超过 24 小时
    const lastWarningTime = new Date(entry.lastWarningAt).getTime();
    return Date.now() - lastWarningTime > WorkspaceService.WARNING_DEBOUNCE_MS;
  }

  // ========== 拓扑构建 ==========

  /** 状态缩写映射表 */
  private static readonly STATUS_ABBREV: Record<string, string> = {
    completed: "com",
    implementing: "imp",
    validating: "val",
    planning: "pla",
    pending: "pen",
    monitoring: "mon",
    cancelled: "can",
    failed: "fai",
  };

  /** 递归深度限制 */
  private static readonly MAX_TOPOLOGY_DEPTH = 10;

  /** 结论摘要最大长度 */
  private static readonly MAX_CONCLUSION_LENGTH = 100;

  /**
   * 构建轻量级拓扑结构
   * 基于状态的智能折叠策略，压缩完整节点树
   *
   * 压缩策略（优先级从高到低）：
   * 1. 焦点路径 - focusPath 中的节点 → children 递归展开
   * 2. 活跃状态 - implementing/validating/monitoring → children 递归展开
   * 3. 完成子树 - completed 节点：
   *    - 一级子节点数 ≤5 → _done: [子节点标题列表]
   *    - 一级子节点数 >5 且有 conclusion → _sum: conclusion
   *    - 一级子节点数 >5 且无 conclusion → _c: 子节点数量
   * 4. 其他 - pending/cancelled/failed 等 → children 递归展开
   *
   * @param nodes 节点记录（从 graph.nodes）
   * @param rootId 根节点 ID
   * @param focusPath 焦点路径 ID 集合
   * @param titles 节点标题映射（nodeId → title）
   * @returns 压缩后的拓扑节点
   */
  buildTopology(
    nodes: Record<string, NodeMeta>,
    rootId: string,
    focusPath: Set<string>,
    titles: Record<string, string>
  ): import("../types/workspace.js").TopologyNode {
    const visited = new Set<string>();
    return this.buildTopologyNode(nodes, rootId, focusPath, titles, visited, 0);
  }

  /**
   * 递归构建拓扑节点
   */
  private buildTopologyNode(
    nodes: Record<string, NodeMeta>,
    nodeId: string,
    focusPath: Set<string>,
    titles: Record<string, string>,
    visited: Set<string>,
    depth: number
  ): import("../types/workspace.js").TopologyNode {
    // 循环引用检测
    if (visited.has(nodeId)) {
      return {
        id: nodeId,
        title: titles[nodeId] || nodeId,
        status: "err",
      };
    }
    visited.add(nodeId);

    // 深度限制
    if (depth >= WorkspaceService.MAX_TOPOLOGY_DEPTH) {
      const node = nodes[nodeId];
      return {
        id: nodeId,
        title: titles[nodeId] || nodeId,
        status: WorkspaceService.STATUS_ABBREV[node?.status] || "???",
        _c: node?.children?.length || 0,
      };
    }

    const node = nodes[nodeId];
    if (!node) {
      return {
        id: nodeId,
        title: titles[nodeId] || nodeId,
        status: "???",
      };
    }

    const statusAbbrev = WorkspaceService.STATUS_ABBREV[node.status] || "???";
    const title = titles[nodeId] || nodeId;

    // 构建基础拓扑节点
    const result: import("../types/workspace.js").TopologyNode = {
      id: nodeId,
      title,
      status: statusAbbrev,
    };

    // 添加角色（如果存在）
    if (node.role) {
      result.role = node.role;
    }

    // 无子节点时直接返回
    if (!node.children || node.children.length === 0) {
      return result;
    }

    // 决定子节点展示策略
    const childIds = node.children;

    // 策略1: 焦点路径 → children 递归展开
    if (focusPath.has(nodeId)) {
      result.children = childIds.map(childId =>
        this.buildTopologyNode(nodes, childId, focusPath, titles, visited, depth + 1)
      );
      return result;
    }

    // 策略2: 活跃状态(implementing/validating/monitoring) → children 递归展开
    if (node.status === "implementing" || node.status === "validating" || node.status === "monitoring") {
      result.children = childIds.map(childId =>
        this.buildTopologyNode(nodes, childId, focusPath, titles, visited, depth + 1)
      );
      return result;
    }

    // 策略3: 完成子树(completed) → 折叠
    if (node.status === "completed") {
      if (childIds.length <= 5) {
        // 一级子节点 ≤5 → _done: [子节点标题列表]
        result._done = childIds.map(childId => titles[childId] || childId);
      } else if (node.conclusion) {
        // 一级子节点 >5 且有结论 → _sum: conclusion
        result._sum = node.conclusion.length > WorkspaceService.MAX_CONCLUSION_LENGTH
          ? node.conclusion.substring(0, WorkspaceService.MAX_CONCLUSION_LENGTH) + "..."
          : node.conclusion;
      } else {
        // 一级子节点 >5 且无结论 → _c: 子节点数量
        result._c = childIds.length;
      }
      return result;
    }

    // 策略4: 其他状态(pending/cancelled/failed/planning) → children 递归展开
    result.children = childIds.map(childId =>
      this.buildTopologyNode(nodes, childId, focusPath, titles, visited, depth + 1)
    );

    return result;
  }

  // ========== 工作区导出 ==========

  /**
   * 导出工作区为 .twsp 格式
   * @param workspaceId 工作区 ID
   * @returns 包含 buffer 和 filename 的对象
   */
  async exportAsTwsp(workspaceId: string): Promise<{
    buffer: Buffer;
    filename: string;
    warnings: string[];
  }> {
    // 1. 获取工作区位置信息
    const { projectRoot, dirName, isArchived } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 验证工作区目录存在
    const workspaceDir = this.fs.getWorkspaceBasePath(projectRoot, dirName, isArchived);
    if (!(await this.fs.exists(workspaceDir))) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区目录不存在: ${workspaceDir}`);
    }

    // 3. 读取工作区配置和图
    const config = await this.json.readWorkspaceConfig(projectRoot, dirName, isArchived);
    const graph = await this.json.readGraph(projectRoot, dirName, isArchived);

    // 4. 检查外部引用，生成警告
    const warnings = await this.checkExternalReferences(projectRoot, dirName, graph, isArchived);

    // 5. 清洗数据
    const cleanedConfig = this.cleanWorkspaceConfig(config);
    const cleanedGraph = this.cleanNodeGraph(graph);

    // 6. 获取当前版本号
    const tanmiVersion = this.getCurrentVersion();

    // 6.1 从根节点读取 goal（requirement 字段）- goal 已统一到根节点
    const rootNodeId = config.rootNodeId || "root";
    const rootNodeMeta = graph.nodes[rootNodeId];
    const rootNodeDirName = rootNodeMeta?.dirName || rootNodeId;
    const rootNodeInfo = await this.md.readNodeInfo(projectRoot, dirName, rootNodeDirName, isArchived);
    const goal = rootNodeInfo.requirement || "";

    // 7. 生成 manifest
    const manifest: TwspManifest = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      tanmiVersion,
      workspace: {
        originalId: workspaceId,
        name: config.name,
        goal,  // 从根节点 requirement 读取
        scenario: config.scenario,
      },
      stats: {
        nodeCount: Object.keys(graph.nodes).length,
        memoCount: Object.keys(graph.memos || {}).length,
      },
      warnings,
    };

    // 8. 创建 zip 并打包
    const buffer = await this.createTwspArchive(
      workspaceDir,
      dirName,
      manifest,
      cleanedConfig,
      cleanedGraph
    );

    // 9. 生成文件名
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const safeName = config.name.replace(/[/\\:*?"<>|]/g, "_");
    const filename = `${safeName}_${date}.twsp`;

    return { buffer, filename, warnings };
  }

  /**
   * 创建 .twsp 归档文件
   */
  private async createTwspArchive(
    workspaceDir: string,
    dirName: string,
    manifest: TwspManifest,
    cleanedConfig: WorkspaceConfig,
    cleanedGraph: NodeGraph
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const archive = archiver("zip", { zlib: { level: 9 } });
      const chunks: Buffer[] = [];

      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", (err: Error) => reject(err));

      // 添加 manifest.json
      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

      // 添加清洗后的 workspace.json
      archive.append(
        JSON.stringify(cleanedConfig, null, 2),
        { name: `${dirName}/workspace.json` }
      );

      // 添加清洗后的 graph.json
      archive.append(
        JSON.stringify(cleanedGraph, null, 2),
        { name: `${dirName}/graph.json` }
      );

      // 添加 Workspace.md（原样复制）
      const workspaceMdPath = path.join(workspaceDir, "Workspace.md");
      if (existsSync(workspaceMdPath)) {
        archive.file(workspaceMdPath, { name: `${dirName}/Workspace.md` });
      }

      // 添加 Log.md（原样复制）
      const logMdPath = path.join(workspaceDir, "Log.md");
      if (existsSync(logMdPath)) {
        archive.file(logMdPath, { name: `${dirName}/Log.md` });
      }

      // 添加 Problem.md（原样复制）
      const problemMdPath = path.join(workspaceDir, "Problem.md");
      if (existsSync(problemMdPath)) {
        archive.file(problemMdPath, { name: `${dirName}/Problem.md` });
      }

      // 添加 nodes 目录（原样复制）
      const nodesDir = path.join(workspaceDir, "nodes");
      if (existsSync(nodesDir)) {
        archive.directory(nodesDir, `${dirName}/nodes`);
      }

      // 添加 memos 目录（原样复制）
      const memosDir = path.join(workspaceDir, "memos");
      if (existsSync(memosDir)) {
        archive.directory(memosDir, `${dirName}/memos`);
      }

      archive.finalize();
    });
  }

  /**
   * 清洗工作区配置（删除本地信息）
   */
  private cleanWorkspaceConfig(config: WorkspaceConfig): WorkspaceConfig {
    const cleaned = { ...config };

    // 删除派发本地信息
    if (cleaned.dispatch) {
      // 重建 dispatch 对象，只保留需要导出的字段
      // enabledAt 设为 0 表示导出状态（导入时会重置）
      const cleanedDispatch: typeof cleaned.dispatch = {
        enabled: cleaned.dispatch.enabled,
        useGit: cleaned.dispatch.useGit,
        enabledAt: 0, // 导出时重置为 0，导入后需要重新启用
        limits: cleaned.dispatch.limits,
        review: cleaned.dispatch.review,
      };
      // 不复制 Git 相关的本地信息（originalBranch, processBranch, backupBranches）
      cleaned.dispatch = cleanedDispatch;
    }

    // 删除临时状态
    delete cleaned.pendingManualChanges;

    return cleaned;
  }

  /**
   * 清洗节点图（删除本地信息）
   */
  private cleanNodeGraph(graph: NodeGraph): NodeGraph {
    const cleaned: NodeGraph = {
      version: graph.version,
      currentFocus: null, // 清除聚焦状态
      nodes: {},
      memos: graph.memos,
    };

    // 不导出 lastWriteCodeVersion

    // 清洗节点派发信息
    for (const nodeId in graph.nodes) {
      const node = graph.nodes[nodeId];
      const cleanedNode = { ...node };

      if (cleanedNode.dispatch) {
        cleanedNode.dispatch = {
          status: cleanedNode.dispatch.status,
          // 清除执行标记
        };
        // 删除 startMarker, endMarker, attempts
        delete cleanedNode.dispatch.startMarker;
        delete cleanedNode.dispatch.endMarker;
        delete cleanedNode.dispatch.attempts;
      }

      cleaned.nodes[nodeId] = cleanedNode;
    }

    return cleaned;
  }

  /**
   * 检查工作区导出的警告信息（公开方法，用于预检查）
   */
  async checkExportWarnings(workspaceId: string): Promise<string[]> {
    const { projectRoot, dirName, isArchived } = await this.resolveWorkspaceInfo(workspaceId);
    const graph = await this.json.readGraph(projectRoot, dirName, isArchived);
    return this.checkExternalReferences(projectRoot, dirName, graph, isArchived);
  }

  /**
   * 检查外部引用并生成警告
   * 读取每个节点的 Info.md，检查 docs 字段中的外部文件引用
   */
  private async checkExternalReferences(
    projectRoot: string,
    wsDirName: string,
    graph: NodeGraph,
    isArchived?: boolean
  ): Promise<string[]> {
    const warnings: string[] = [];

    for (const nodeId in graph.nodes) {
      const node = graph.nodes[nodeId];

      try {
        // 读取节点 Info.md 获取 docs 字段
        const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, node.dirName, isArchived);

        // 检查 docs 中的外部引用
        if (nodeInfo.docs && nodeInfo.docs.length > 0) {
          for (const doc of nodeInfo.docs) {
            // 检查是否为外部文件引用（绝对路径或 file:// 协议）
            // memo:// 是内部引用，不算外部
            if (doc.path.startsWith("/") || doc.path.startsWith("file://")) {
              warnings.push(`节点 "${nodeInfo.title}" 包含外部文件引用: ${doc.path}`);
            }
          }
        }
      } catch {
        // 读取失败时跳过（可能是节点目录不存在）
      }
    }

    return warnings;
  }

  /**
   * 获取当前版本号
   */
  private getCurrentVersion(): string {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const requireFn = createRequire(import.meta.url);
      const pkg = requireFn(path.join(__dirname, "..", "..", "package.json")) as { version: string };
      return pkg.version;
    } catch {
      return "unknown";
    }
  }

  // ========== 工作区导入 ==========

  /**
   * 从 .twsp 文件导入工作区
   * @param twspPath .twsp 文件路径
   * @param targetDir 目标目录（默认 ~/.tanmi-workspace/import/）
   * @returns 导入结果
   */
  async importFromTwsp(
    twspPath: string,
    targetDir?: string
  ): Promise<{
    workspaceId: string;
    name: string;
    path: string;
    warnings: string[];
  }> {
    // 1. 确定目标目录（默认 ~/{localDirName}/import/）
    const localDirName = this.fs.getDirName();
    // 展开 ~ 为用户主目录
    const expandedTargetDir = targetDir?.startsWith("~")
      ? targetDir.replace("~", os.homedir())
      : targetDir;
    const finalTargetDir = expandedTargetDir || path.join(os.homedir(), localDirName, "import");

    // 2. 创建临时解压目录
    const extractDir = path.join(os.tmpdir(), `twsp-extract-${Date.now()}`);
    await fs.mkdir(extractDir, { recursive: true });

    try {
      // 3. 解压 .twsp 文件（使用 adm-zip 以正确处理中文路径）
      const zip = new AdmZip(twspPath);
      zip.extractAllTo(extractDir, true);

      // 4. 读取并验证 manifest.json
      const manifestPath = path.join(extractDir, "manifest.json");
      if (!existsSync(manifestPath)) {
        throw new TanmiError("INVALID_PATH", "无效的 .twsp 文件：缺少 manifest.json");
      }

      const manifest: TwspManifest = JSON.parse(
        await fs.readFile(manifestPath, "utf-8")
      );

      // 5. 查找工作区目录（manifest.json 同级的第一个目录）
      const entries = await fs.readdir(extractDir, { withFileTypes: true });
      const workspaceDirEntry = entries.find(e => e.isDirectory());

      if (!workspaceDirEntry) {
        throw new TanmiError("INVALID_PATH", "无效的 .twsp 文件：缺少工作区目录");
      }

      const extractedWorkspaceDir = path.join(extractDir, workspaceDirEntry.name);

      // 6. 验证 workspace.json 存在
      const wsConfigPath = path.join(extractedWorkspaceDir, "workspace.json");
      if (!existsSync(wsConfigPath)) {
        throw new TanmiError("INVALID_PATH", "无效的 .twsp 文件：缺少 workspace.json");
      }

      // 7. 生成新的工作区 ID
      const newWorkspaceId = generateWorkspaceId();

      // 8. 确定目标目录名（处理重名）
      const baseName = manifest.workspace.name;
      const shortId = newWorkspaceId.replace("ws-", "");
      let finalDirName = `${baseName}_${shortId}`;

      // 确保目标目录存在
      await fs.mkdir(finalTargetDir, { recursive: true });
      const targetWorkspaceDir = path.join(finalTargetDir, localDirName, finalDirName);

      // 检查目标目录是否存在（重名处理）
      if (existsSync(targetWorkspaceDir)) {
        // 重名，添加时间戳后缀
        const timestamp = Date.now().toString(36);
        finalDirName = `${baseName}_${timestamp}_${shortId}`;
      }

      const finalWorkspacePath = path.join(finalTargetDir, localDirName, finalDirName);

      // 9. 确保父目录存在并复制文件
      await fs.mkdir(path.dirname(finalWorkspacePath), { recursive: true });
      await fs.cp(extractedWorkspaceDir, finalWorkspacePath, { recursive: true });

      // 10. 更新 workspace.json 中的 ID 和 dirName
      const wsConfig = JSON.parse(await fs.readFile(path.join(finalWorkspacePath, "workspace.json"), "utf-8"));
      wsConfig.id = newWorkspaceId;
      wsConfig.dirName = finalDirName;
      wsConfig.updatedAt = now();
      await fs.writeFile(
        path.join(finalWorkspacePath, "workspace.json"),
        JSON.stringify(wsConfig, null, 2)
      );

      // 11. 注册到索引（使用 smartImport 逻辑）
      const index = await this.json.readIndex();

      // 构建工作区条目
      const currentTime = now();
      index.workspaces.push({
        id: newWorkspaceId,
        name: manifest.workspace.name,
        dirName: finalDirName,
        projectRoot: finalTargetDir,
        status: "active",
        createdAt: currentTime,
        updatedAt: currentTime,
      });

      await this.json.writeIndex(index);

      // 12. 追加日志
      await this.md.appendLog(finalTargetDir, finalDirName, {
        time: currentTime,
        operator: "system",
        event: `工作区从 .twsp 文件导入（原 ID: ${manifest.workspace.originalId}）`,
      });

      // 13. 发送事件通知
      eventService.emitWorkspaceUpdate(newWorkspaceId);

      return {
        workspaceId: newWorkspaceId,
        name: manifest.workspace.name,
        path: finalWorkspacePath,
        warnings: manifest.warnings || [],
      };
    } finally {
      // 14. 清理临时解压目录
      try {
        await fs.rm(extractDir, { recursive: true, force: true });
      } catch {
        // 清理失败不影响主流程
      }
    }
  }

  // ========== 工作流状态同步 ==========

  /**
   * 获取当前任务边界
   * 基于 currentFocus 确定验证范围
   */
  private getTaskBoundary(graph: NodeGraph): TaskBoundary {
    const focusId = graph.currentFocus;
    const focusPath = new Set<string>();
    const allDescendants = new Set<string>();

    if (focusId) {
      // 向上收集 focusPath（从 focus 到 root）
      let currentId: string | null = focusId;
      while (currentId) {
        focusPath.add(currentId);
        const node: NodeMeta | undefined = graph.nodes[currentId];
        if (!node) break;
        if (currentId === "root" || !node.parentId) break;
        currentId = node.parentId;
      }

      // 递归收集所有后代节点
      const collectDescendants = (nodeId: string) => {
        const node = graph.nodes[nodeId];
        if (!node?.children) return;
        for (const childId of node.children) {
          allDescendants.add(childId);
          collectDescendants(childId);
        }
      };
      // 从 focusPath 中的每个节点开始收集后代
      for (const pathNodeId of focusPath) {
        collectDescendants(pathNodeId);
      }
    } else {
      // 无聚焦节点，所有节点都在边界内
      Object.keys(graph.nodes).forEach(id => focusPath.add(id));
    }

    return {
      focusPath,
      directChildren: allDescendants, // 保持字段名兼容，但实际包含所有后代
      allRelevantNodes: new Set([...focusPath, ...allDescendants]),
    };
  }

  /**
   * 验证阶段转换
   */
  private validatePhaseTransition(
    graph: NodeGraph,
    currentPhase: WorkflowPhase,
    targetPhase: WorkflowPhase
  ): PhaseTransitionValidation {
    // 同阶段转换：no-op，静默成功
    if (currentPhase === targetPhase) {
      return { allowed: true };
    }

    const boundary = this.getTaskBoundary(graph);
    const nodesInBoundary = Object.values(graph.nodes).filter(
      node => boundary.allRelevantNodes.has(node.id)
    );

    const transitionKey = `${currentPhase}_to_${targetPhase}`;
    switch (transitionKey) {
      case "info_to_design":
        return this.validateInfoToDesign(nodesInBoundary);
      case "design_to_impl":
        return this.validateDesignToImpl(nodesInBoundary);
      case "impl_to_info":
        return this.validateImplToInfo(nodesInBoundary);
      case "impl_to_design":
        return this.validateImplToDesign(nodesInBoundary);
      case "design_to_info":
        return this.validateDesignToInfo(nodesInBoundary);
      case "info_to_impl":
        return { allowed: false, reason: "不允许从 info 直接跳转到 impl，请先进入 design 阶段" };
      default:
        return { allowed: false, reason: `不支持的阶段转换: ${currentPhase} → ${targetPhase}` };
    }
  }

  /**
   * 验证 info → design
   * 条件：信息节点需 completed 或 cancelled（空集视为满足条件）
   * 注：cancelled 表示用户主动放弃，应允许继续；failed 需要处理
   */
  private validateInfoToDesign(nodes: NodeMeta[]): PhaseTransitionValidation {
    const infoNodes = nodes.filter(
      n => n.role === "info_collection" || n.role === "info_summary"
    );
    // 允许 completed 和 cancelled 状态通过
    const incompleteInfoNodes = infoNodes.filter(
      n => n.status !== "completed" && n.status !== "cancelled"
    );

    if (incompleteInfoNodes.length > 0) {
      return {
        allowed: false,
        reason: `请先完成所有信息收集节点（${incompleteInfoNodes.length} 个未完成）`,
        issues: incompleteInfoNodes.map(n => ({
          nodeId: n.id,
          title: n.dirName,
          status: n.status,
          type: n.type,
        })),
      };
    }
    return { allowed: true };
  }

  /**
   * 验证 design → impl
   * 条件：planning 需 monitoring/completed/cancelled，且至少存在一个 execution 节点
   */
  private validateDesignToImpl(nodes: NodeMeta[]): PhaseTransitionValidation {
    const planningNodes = nodes.filter(n => n.type === "planning" && n.id !== "root");
    const executionNodes = nodes.filter(n => n.type === "execution");

    // 检查 planning 节点状态
    const invalidPlanningNodes = planningNodes.filter(
      n => n.status === "pending" || n.status === "planning"
    );
    if (invalidPlanningNodes.length > 0) {
      return {
        allowed: false,
        reason: `请先完成规划节点（${invalidPlanningNodes.length} 个未完成规划）`,
        issues: invalidPlanningNodes.map(n => ({
          nodeId: n.id,
          title: n.dirName,
          status: n.status,
          type: n.type,
        })),
      };
    }

    // 检查是否有执行节点
    if (executionNodes.length === 0) {
      return {
        allowed: false,
        reason: "请先创建至少一个执行节点",
      };
    }

    return { allowed: true };
  }

  /**
   * 验证 impl → info
   * 条件：execution 节点需静止态
   */
  private validateImplToInfo(nodes: NodeMeta[]): PhaseTransitionValidation {
    const executionNodes = nodes.filter(n => n.type === "execution");
    const nonStaticExecNodes = executionNodes.filter(
      n => n.status === "implementing" || n.status === "validating"
    );

    if (nonStaticExecNodes.length > 0) {
      return {
        allowed: false,
        reason: `请先完成或暂停进行中的执行任务（${nonStaticExecNodes.length} 个进行中）`,
        issues: nonStaticExecNodes.map(n => ({
          nodeId: n.id,
          title: n.dirName,
          status: n.status,
          type: n.type,
        })),
      };
    }
    return { allowed: true };
  }

  /**
   * 验证 impl → design
   * 条件：execution 节点需静止态
   */
  private validateImplToDesign(nodes: NodeMeta[]): PhaseTransitionValidation {
    // 与 impl → info 规则相同
    return this.validateImplToInfo(nodes);
  }

  /**
   * 验证 design → info
   * 条件：允许（可暂停规划）
   */
  private validateDesignToInfo(_nodes: NodeMeta[]): PhaseTransitionValidation {
    return { allowed: true };
  }

  /**
   * 处理 signal 工具调用
   * 用于切换工作流阶段，不暴露当前 phase
   *
   * @param workspaceId 工作区 ID
   * @param code 操作码（硬编码映射到 WorkflowPhase）
   * @returns 状态同步结果
   */
  async signal(workspaceId: string, code: string): Promise<{ success: boolean; message?: string; error?: string; issues?: Array<{ nodeId: string; title: string; status: string; type: string }> }> {
    // 1. 验证 code 是否有效
    const targetPhase = SIGNAL_CODES[code];
    if (!targetPhase) {
      devLog.debug("signal: 无效的操作码", { workspaceId, code });
      return {
        success: false,
        error: "信号无效，请根据相关指引操作：tanmi_help",
      };
    }

    // 2. 获取工作区位置信息
    const { projectRoot, dirName } = await this.resolveWorkspaceLocation(workspaceId);

    // 3. 读取 graph.json
    const graph = await this.json.readGraph(projectRoot, dirName);
    const currentPhase = normalizeWorkflowPhase(graph.workflow?.phase);

    // 4. 验证阶段转换
    const validation = this.validatePhaseTransition(graph, currentPhase, targetPhase);
    if (!validation.allowed) {
      devLog.debug("signal: 阶段转换被阻止", { workspaceId, from: currentPhase, to: targetPhase, reason: validation.reason });
      return {
        success: false,
        error: validation.reason,
        issues: validation.issues,
      };
    }

    // 5. 更新 workflow 状态
    if (currentPhase === targetPhase) {
      // 相同阶段，只更新 phaseSkillInvoked
      graph.workflow = {
        ...graph.workflow,
        phase: currentPhase,
        phaseSkillInvoked: true,
      };
      devLog.debug("signal: 相同阶段，更新 phaseSkillInvoked", { workspaceId, phase: currentPhase });
    } else {
      // 切换阶段
      graph.workflow = {
        phase: targetPhase,
        phaseSkillInvoked: true,
      };
      devLog.debug("signal: 切换阶段", { workspaceId, from: currentPhase, to: targetPhase });
    }

    // 6. 写入 graph.json
    await this.json.writeGraph(projectRoot, dirName, graph);

    // 7. 发送事件通知
    eventService.emitWorkspaceUpdate(workspaceId);

    return {
      success: true,
      message: "状态已同步",
    };
  }

  // ========== 工作区配置 ==========

  /**
   * 获取工作区配置项
   * @param workspaceId 工作区 ID
   * @param key 配置键（可选，不传则返回整个配置对象）
   */
  async getWorkspaceConfig(
    workspaceId: string,
    key?: string
  ): Promise<{ value: unknown; config: import("../types/node.js").GraphConfig }> {
    const { projectRoot, dirName } = await this.resolveWorkspaceLocation(workspaceId);
    const graph = await this.json.readGraph(projectRoot, dirName);
    const config = graph.config || {};

    if (key) {
      return { value: config[key as keyof typeof config], config };
    }
    return { value: config, config };
  }

  /**
   * 设置工作区配置项
   * @param workspaceId 工作区 ID
   * @param key 配置键
   * @param value 配置值（null 表示删除）
   */
  async setWorkspaceConfig(
    workspaceId: string,
    key: string,
    value: unknown
  ): Promise<{ success: boolean; config: import("../types/node.js").GraphConfig }> {
    const { projectRoot, dirName } = await this.resolveWorkspaceLocation(workspaceId);
    const graph = await this.json.readGraph(projectRoot, dirName);

    if (!graph.config) {
      graph.config = {};
    }

    if (value === null || value === undefined) {
      delete graph.config[key as keyof typeof graph.config];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (graph.config as any)[key] = value;
    }

    await this.json.writeGraph(projectRoot, dirName, graph);
    eventService.emitWorkspaceUpdate(workspaceId);

    return { success: true, config: graph.config };
  }

  // ========== 阶段约束检查 ==========

  /**
   * 检查 createNode 的阶段约束
   *
   * @param workspaceId 工作区 ID
   * @param type 节点类型
   * @param role 节点角色
   * @param rulesHash 规则哈希（内部调用使用 INTERNAL_RULES_HASH 绕过检查）
   * @returns null 表示通过，error 对象表示约束违规
   */
  async checkCreateNodeConstraint(
    workspaceId: string,
    type: "planning" | "execution",
    role?: string,
    rulesHash?: string
  ): Promise<{ error: { code: string; message: string } } | null> {
    // 内部调用（如 capability_select）绕过检查
    if (rulesHash === INTERNAL_RULES_HASH) {
      return null;
    }

    const { projectRoot, dirName } = await this.resolveWorkspaceLocation(workspaceId);
    const graph = await this.json.readGraph(projectRoot, dirName);
    const phase = normalizeWorkflowPhase(graph.workflow?.phase);

    // 规则1: info 阶段禁止创建 planning/execution 节点（需先完成信息收集）
    if (phase === "info" && (type === "planning" || type === "execution")) {
      // 排除 info 角色节点（由其他拦截处理）
      if (role !== "info_collection" && role !== "info_summary") {
        return {
          error: {
            code: "PHASE_CONSTRAINT",
            message: "当前处于信息阶段，需先完成信息收集。调用 Skill(flow-info) 进入信息收集流程，完成后再创建任务节点。",
          },
        };
      }
    }

    // 规则2: impl 阶段禁止创建 planning 节点
    if (phase === "impl" && type === "planning") {
      return {
        error: {
          code: "PHASE_CONSTRAINT",
          message: `当前处于实现阶段，不允许创建规划节点。

- 如需讨论新需求，调用 Skill(flow-info)
- 如需调整现有计划，调用 Skill(flow-design)`,
        },
      };
    }

    // 注：重复信息节点检查已移至 capability_select，此处不再检查

    return null;
  }

  /**
   * 检查 dispatchNode 的阶段约束
   *
   * @param workspaceId 工作区 ID
   * @returns null 表示通过，error 对象表示约束违规
   */
  async checkDispatchNodeConstraint(
    workspaceId: string
  ): Promise<{ error: { code: string; message: string } } | null> {
    const { projectRoot, dirName } = await this.resolveWorkspaceLocation(workspaceId);
    const graph = await this.json.readGraph(projectRoot, dirName);
    const phase = normalizeWorkflowPhase(graph.workflow?.phase);

    // 规则: info/design 阶段禁止 dispatch_node
    if (phase === "info") {
      return {
        error: {
          code: "PHASE_CONSTRAINT",
          message: `只有实现阶段才能派发任务。当前处于信息阶段。

- 调用 Skill(flow-info) 完成信息收集
- 然后 Skill(flow-design) 进行规划
- 最后 Skill(flow-impl) 进入实现阶段`,
        },
      };
    }
    if (phase === "design") {
      return {
        error: {
          code: "PHASE_CONSTRAINT",
          message: `只有实现阶段才能派发任务。当前处于设计阶段。

- 完成规划后，调用 Skill(flow-impl) 进入实现阶段`,
        },
      };
    }

    return null;
  }
}

/**
 * .twsp 文件 manifest 结构
 */
interface TwspManifest {
  version: string;              // 格式版本
  exportedAt: string;           // 导出时间 (ISO 8601)
  tanmiVersion: string;         // TanmiWorkspace 版本号
  workspace: {
    originalId: string;         // 原工作区 ID
    name: string;               // 工作区名称
    goal?: string;              // 工作区目标
    scenario?: string;          // 场景类型
  };
  stats: {
    nodeCount: number;          // 节点数量
    memoCount: number;          // MEMO 数量
  };
  warnings: string[];           // 导出警告（如外部引用被移除）
}
