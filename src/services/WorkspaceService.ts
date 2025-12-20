// src/services/WorkspaceService.ts

import * as path from "node:path";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import { deleteAllWorkspaceBranches } from "../utils/git.js";
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
} from "../types/workspace.js";
import { logError } from "../utils/errorLogger.js";
import type { NodeGraph, NodeMeta } from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { generateWorkspaceId, generateWorkspaceDirName, generateNodeDirName } from "../utils/id.js";
import { now } from "../utils/time.js";
import { validateWorkspaceName, validateProjectRoot } from "../utils/validation.js";
import { devLog } from "../utils/devLog.js";

/**
 * 获取 HTTP 服务端口
 * 开发模式默认 3001，正式模式默认 3000
 */
function getHttpPort(): number {
  const isDev = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
  const defaultPort = isDev ? "3001" : "3000";
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
    let hint = "💡 工作区已创建。根节点是规划节点。下一步：调用 node_transition(action=\"start\") 进入规划状态，分析需求后使用 node_create 创建执行节点或子规划节点。";

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

    // 构建返回结果
    const result: WorkspaceInitResult = {
      workspaceId,
      path: this.fs.getWorkspacePath(projectRoot, wsDirName),
      projectRoot,
      rootNodeId,
      webUrl: `http://localhost:${getHttpPort()}/workspace/${workspaceId}`,
      hint,
      projectDocs,
    };

    // 文档相关的 actionRequired
    if (projectDocs.totalFound > 0) {
      // 有文档：询问是否使用
      const actionData = {
        found: true,
        totalFound: projectDocs.totalFound,
        files: projectDocs.files.slice(0, 10),
        hasMore: projectDocs.totalFound > 10,
      };

      // 生成 confirmation token（如果 StateService 可用）
      let confirmationToken: string | undefined;
      if (this.stateService) {
        const confirmation = this.stateService.createPendingConfirmation(workspaceId, rootNodeId, "ask_user", actionData);
        confirmationToken = confirmation.token;
      }

      result.actionRequired = {
        type: "ask_user",
        message: "项目中发现了文档文件，请询问用户是否需要将这些文档添加到工作区的文档引用中，以便后续任务参考。",
        data: actionData,
        confirmationToken,
      };
    } else {
      // 无文档：询问用户是否有其他文档
      const actionData = {
        found: false,
      };

      // 生成 confirmation token（如果 StateService 可用）
      let confirmationToken: string | undefined;
      if (this.stateService) {
        const confirmation = this.stateService.createPendingConfirmation(workspaceId, rootNodeId, "ask_user", actionData);
        confirmationToken = confirmation.token;
      }

      result.actionRequired = {
        type: "ask_user",
        message: "项目中未发现文档文件，请询问用户是否有相关的需求文档、设计文档或 API 文档可供参考。",
        data: actionData,
        confirmationToken,
      };
    }

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

    // 为每个工作区添加 webUrl
    const port = getHttpPort();
    const workspaces = filteredWorkspaces.map(ws => ({
      ...ws,
      webUrl: `http://localhost:${port}/workspace/${ws.id}`,
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
    const wsDirName = wsEntry.dirName || wsEntry.id;  // 向后兼容
    const isArchived = status === "archived";
    devLog.workspaceLookup(workspaceId, true, status);

    // 验证项目目录存在（根据归档状态选择正确路径）
    const workspacePath = this.fs.getWorkspaceBasePath(projectRoot, wsDirName, isArchived);
    devLog.archivePath(workspaceId, isArchived, workspacePath);
    if (!(await this.fs.exists(workspacePath))) {
      devLog.fileError("exists", workspacePath, new Error("目录不存在"));
      // 标记为 error 状态而不是删除
      await this.markAsError(workspaceId, "dir_missing", `工作区目录不存在: ${workspacePath}`);
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 的项目目录不存在（已标记为错误状态，可通过 workspace_list 查看）`);
    }

    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName, isArchived);
    const graph = await this.json.readGraph(projectRoot, wsDirName, isArchived);
    const workspaceMd = await this.md.readWorkspaceMdRaw(projectRoot, wsDirName, isArchived);
    const logMd = await this.md.readLogRaw(projectRoot, wsDirName, undefined, isArchived);

    // 解析规则并计算哈希
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, wsDirName, isArchived);
    const rulesCount = workspaceMdData.rules.length;
    const rulesHash = rulesCount > 0
      ? crypto.createHash("md5").update(workspaceMdData.rules.join("\n")).digest("hex").substring(0, 8)
      : "";

    return {
      config,
      graph,
      workspaceMd,
      logMd,
      webUrl: `http://localhost:${getHttpPort()}/workspace/${workspaceId}`,
      rulesCount,
      rulesHash,
    };
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

    // 清理派发相关的 git 分支（如果存在）
    try {
      await deleteAllWorkspaceBranches(workspaceId, wsEntry.projectRoot);
    } catch {
      // 分支清理失败不阻塞删除流程
    }

    // 删除项目内目录（使用 dirName）
    const wsDirName = wsEntry.dirName || wsEntry.id;  // 向后兼容
    const workspacePath = this.fs.getWorkspacePath(wsEntry.projectRoot, wsDirName);
    if (await this.fs.exists(workspacePath)) {
      await this.fs.rmdir(workspacePath);
    }

    // 更新全局索引
    index.workspaces = index.workspaces.filter(ws => ws.id !== workspaceId);
    await this.json.writeIndex(index);

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

    return {
      output,
      summary,
      webUrl: `http://localhost:${getHttpPort()}/workspace/${workspaceId}`,
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
   * 生成 Box 格式状态输出
   */
  private async generateBoxStatus(
    projectRoot: string,
    workspaceId: string,
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
    const treeLines = await this.generateNodeTree(projectRoot, workspaceId, graph, config.rootNodeId, 0, isArchived);
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
    workspaceId: string,
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

    const treeLines = await this.generateNodeTreeMd(projectRoot, workspaceId, graph, config.rootNodeId, 0, isArchived);
    lines.push(...treeLines);

    return lines.join("\n");
  }

  /**
   * 生成节点树（Box 格式）
   */
  private async generateNodeTree(
    projectRoot: string,
    workspaceId: string,
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

    // 读取节点标题
    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId, isArchived);
    const title = nodeInfo.title || nodeId;

    lines.push(`${indent}${statusIcon} ${title}${focusIndicator}`);

    for (const childId of node.children) {
      lines.push(...await this.generateNodeTree(projectRoot, workspaceId, graph, childId, depth + 1, isArchived));
    }

    return lines;
  }

  /**
   * 生成节点树（Markdown 格式）
   */
  private async generateNodeTreeMd(
    projectRoot: string,
    workspaceId: string,
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

    // 读取节点标题
    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId, isArchived);
    const title = nodeInfo.title || nodeId;

    lines.push(`${indent}- ${statusIcon} ${title}${focusIndicator}`);

    for (const childId of node.children) {
      lines.push(...await this.generateNodeTreeMd(projectRoot, workspaceId, graph, childId, depth + 1, isArchived));
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

    // 获取 projectRoot
    const projectRoot = await this.json.getProjectRoot(workspaceId);
    if (!projectRoot) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    // 读取当前工作区数据
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, workspaceId);
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
    await this.md.writeWorkspaceMd(projectRoot, workspaceId, workspaceMdData);

    // 计算新的哈希
    const rulesHash = currentRules.length > 0
      ? crypto.createHash("md5").update(currentRules.join("\n")).digest("hex").substring(0, 8)
      : "";

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
    const currentTime = now();

    // 3. 验证源目录存在
    const srcPath = this.fs.getWorkspacePath(projectRoot, workspaceId);
    if (!(await this.fs.exists(srcPath))) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区目录不存在: ${srcPath}`);
    }

    // 3.1 清理派发相关的 git 分支（如果存在）
    try {
      await deleteAllWorkspaceBranches(workspaceId, projectRoot);
    } catch {
      // 分支清理失败不阻塞归档流程
    }

    // 4. 确保归档目录存在
    await this.fs.ensureArchiveDir(projectRoot);

    // 5. 移动目录到归档位置
    const archivePath = this.fs.getArchivePath(projectRoot, workspaceId);
    await this.fs.moveDir(srcPath, archivePath);

    // 6. 更新索引状态
    wsEntry.status = "archived";
    wsEntry.updatedAt = currentTime;
    await this.json.writeIndex(index);

    // 7. 更新 workspace.json 状态
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId, true);
    config.status = "archived";
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config, true);

    // 8. 追加日志
    await this.md.appendLog(projectRoot, workspaceId, {
      time: currentTime,
      operator: "system",
      event: `工作区已归档`,
    }, true);

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
    const currentTime = now();

    // 3. 验证归档目录存在
    const archivePath = this.fs.getArchivePath(projectRoot, workspaceId);
    if (!(await this.fs.exists(archivePath))) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `归档工作区目录不存在: ${archivePath}`);
    }

    // 4. 移动目录回原位置
    const destPath = this.fs.getWorkspacePath(projectRoot, workspaceId);
    await this.fs.moveDir(archivePath, destPath);

    // 5. 更新索引状态
    wsEntry.status = "active";
    wsEntry.updatedAt = currentTime;
    await this.json.writeIndex(index);

    // 6. 更新 workspace.json 状态
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    config.status = "active";
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 7. 追加日志
    await this.md.appendLog(projectRoot, workspaceId, {
      time: currentTime,
      operator: "system",
      event: `工作区已从归档恢复`,
    });

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
    const errorInfo: WorkspaceErrorInfo = {
      message,
      detectedAt: now(),
      type: errorType,
    };

    // 更新索引中的状态
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
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
   * @param workspaceId 工作区 ID
   */
  async clearError(workspaceId: string): Promise<void> {
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (wsEntry && wsEntry.status === "error") {
      wsEntry.status = "active";
      delete wsEntry.errorInfo;
      wsEntry.updatedAt = now();
      await this.json.writeIndex(index);
    }
  }
}
