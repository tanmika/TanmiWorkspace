// src/services/WorkspaceService.ts

import * as path from "node:path";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
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
import type { NodeGraph, NodeMeta } from "../types/node.js";
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
      version: "4.0",  // 新版本支持 dirName
      currentFocus: rootNodeId,
      nodes: {
        [rootNodeId]: rootNode,
      },
    };
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 9. 写入 Workspace.md
    await this.md.writeWorkspaceMd(projectRoot, wsDirName, {
      name: params.name,
      createdAt: currentTime,
      updatedAt: currentTime,
      rules: params.rules || [],
      docs: params.docs || [],
      goal: params.goal,
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

    // 强制调用 bootstrapping-workspace skill
    result.actionRequired = {
      type: "invoke_skill",
      message: `⚠️ MUST 调用 Skill(bootstrapping-workspace) 完成工作区启动流程。

${scenarioGuidance}

**强制规则**：
- MUST 调用 Skill(bootstrapping-workspace)
- NEVER 直接 node_create
- NEVER 跳过 capability_list → capability_select 流程

**如果 Skill 不可用**，使用 plugin_path 获取路径后 Read：
\`\`\`
plugin_path(type: "skill", name: "bootstrapping-workspace") → 获取路径
Read(file_path: <返回的路径>/SKILL.md)
\`\`\``,
      data: {
        skill: "bootstrapping-workspace",
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

    // 如果提供了 cwd，优先显示匹配的工作区
    if (cwd) {
      filteredWorkspaces = [...filteredWorkspaces].sort((a, b) => {
        const aMatch = a.projectRoot === cwd || cwd.startsWith(a.projectRoot + "/");
        const bMatch = b.projectRoot === cwd || cwd.startsWith(b.projectRoot + "/");
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        // 同级别按更新时间降序
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }

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

    const result: WorkspaceGetResult = {
      config,
      graph,
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
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, wsDirName, isArchived);

    // 计算统计信息（终态 = completed + failed + cancelled）
    const nodes = Object.values(graph.nodes);
    const totalNodes = nodes.length;
    const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
    const completedNodes = nodes.filter(n => terminalStatuses.has(n.status)).length;

    const summary = {
      name: config.name,
      goal: workspaceMdData.goal,
      status: config.status,
      totalNodes,
      completedNodes,
      currentFocus: graph.currentFocus,
    };

    // 生成输出
    let output: string;
    if (format === "markdown") {
      output = await this.generateMarkdownStatus(projectRoot, wsDirName, config, graph, workspaceMdData, summary, isArchived);
    } else {
      output = await this.generateBoxStatus(projectRoot, wsDirName, config, graph, workspaceMdData, summary, isArchived);
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
    workspaceMdData: { goal: string },
    summary: { totalNodes: number; completedNodes: number; currentFocus: string | null },
    isArchived: boolean = false
  ): Promise<string> {
    const lines: string[] = [];
    const width = 60;

    lines.push("┌" + "─".repeat(width - 2) + "┐");
    lines.push("│" + ` 工作区: ${config.name}`.padEnd(width - 2) + "│");
    lines.push("│" + ` 状态: ${config.status}`.padEnd(width - 2) + "│");
    lines.push("├" + "─".repeat(width - 2) + "┤");
    lines.push("│" + ` 目标: ${workspaceMdData.goal.substring(0, width - 10)}`.padEnd(width - 2) + "│");
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
    workspaceMdData: { goal: string },
    summary: { totalNodes: number; completedNodes: number; currentFocus: string | null },
    isArchived: boolean = false
  ): Promise<string> {
    const lines: string[] = [];

    lines.push(`# ${config.name}`);
    lines.push("");
    lines.push(`**状态**: ${config.status}`);
    lines.push(`**目标**: ${workspaceMdData.goal}`);

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
        const nodeDirName = node.dirName || nodeId;
        const nodeIssues: HealthIssue[] = [];

        // 跳过 root 节点（目录名固定为 "root"）
        if (nodeId === "root") {
          nodeDirName === "root"; // 确保 root 节点目录名正确
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
}
