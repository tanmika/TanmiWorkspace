// src/services/WorkspaceService.ts

import * as path from "node:path";
import * as crypto from "node:crypto";
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
} from "../types/workspace.js";
import type { NodeGraph, NodeMeta } from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { generateWorkspaceId } from "../utils/id.js";
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
  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

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

    // 5. 生成工作区 ID
    const workspaceId = generateWorkspaceId();
    const currentTime = now();
    const rootNodeId = "root";

    // 6. 创建项目内目录结构
    await this.fs.ensureProjectDir(projectRoot);
    await this.fs.ensureWorkspaceDir(projectRoot, workspaceId);
    await this.fs.mkdir(this.fs.getNodesDir(projectRoot, workspaceId));
    await this.fs.mkdir(this.fs.getNodePath(projectRoot, workspaceId, rootNodeId));

    // 7. 写入 workspace.json
    const config: WorkspaceConfig = {
      id: workspaceId,
      name: params.name,
      status: "active",
      createdAt: currentTime,
      updatedAt: currentTime,
      rootNodeId,
    };
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 8. 写入 graph.json（含根节点，类型为 planning）
    const rootNode: NodeMeta = {
      id: rootNodeId,
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
      version: "3.0",  // 新版本支持节点类型
      currentFocus: rootNodeId,
      nodes: {
        [rootNodeId]: rootNode,
      },
    };
    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 9. 写入 Workspace.md
    await this.md.writeWorkspaceMd(projectRoot, workspaceId, {
      name: params.name,
      createdAt: currentTime,
      updatedAt: currentTime,
      rules: params.rules || [],
      docs: params.docs || [],
      goal: params.goal,
    });

    // 10. 创建空的 Log.md 和 Problem.md (工作区级别)
    await this.md.createEmptyLog(projectRoot, workspaceId);
    await this.md.createEmptyProblem(projectRoot, workspaceId);

    // 11. 创建根节点文件（规划节点）
    await this.md.writeNodeInfo(projectRoot, workspaceId, rootNodeId, {
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
    await this.md.createEmptyLog(projectRoot, workspaceId, rootNodeId);
    await this.md.createEmptyProblem(projectRoot, workspaceId, rootNodeId);

    // 12. 更新全局索引
    await this.fs.ensureIndex();
    index.workspaces.push({
      id: workspaceId,
      name: params.name,
      projectRoot,
      status: "active",
      createdAt: currentTime,
      updatedAt: currentTime,
    });
    await this.json.writeIndex(index);

    // 13. 追加日志
    await this.md.appendLog(projectRoot, workspaceId, {
      time: currentTime,
      operator: "system",
      event: `工作区 "${params.name}" 已创建`,
    });

    return {
      workspaceId,
      path: this.fs.getWorkspacePath(projectRoot, workspaceId),
      projectRoot,
      rootNodeId,
      webUrl: `http://localhost:${getHttpPort()}/workspace/${workspaceId}`,
      hint: "💡 工作区已创建。根节点是规划节点。下一步：调用 node_transition(action=\"start\") 进入规划状态，分析需求后使用 node_create 创建执行节点或子规划节点。",
    };
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

    return { workspaces };
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
    const isArchived = status === "archived";
    devLog.workspaceLookup(workspaceId, true, status);

    // 验证项目目录存在（根据归档状态选择正确路径）
    const workspacePath = this.fs.getWorkspaceBasePath(projectRoot, workspaceId, isArchived);
    devLog.archivePath(workspaceId, isArchived, workspacePath);
    if (!(await this.fs.exists(workspacePath))) {
      devLog.fileError("exists", workspacePath, new Error("目录不存在"));
      // 清理无效索引
      await this.json.cleanupInvalidEntries();
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 的项目目录不存在`);
    }

    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId, isArchived);
    const graph = await this.json.readGraph(projectRoot, workspaceId, isArchived);
    const workspaceMd = await this.md.readWorkspaceMdRaw(projectRoot, workspaceId, isArchived);

    // 解析规则并计算哈希
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, workspaceId, isArchived);
    const rulesCount = workspaceMdData.rules.length;
    const rulesHash = rulesCount > 0
      ? crypto.createHash("md5").update(workspaceMdData.rules.join("\n")).digest("hex").substring(0, 8)
      : "";

    return {
      config,
      graph,
      workspaceMd,
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

    // 删除项目内目录
    const workspacePath = this.fs.getWorkspacePath(wsEntry.projectRoot, workspaceId);
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
    const isArchived = status === "archived";

    // 验证项目目录存在（根据归档状态选择正确路径）
    const workspacePath = this.fs.getWorkspaceBasePath(projectRoot, workspaceId, isArchived);
    if (!(await this.fs.exists(workspacePath))) {
      await this.json.cleanupInvalidEntries();
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 的项目目录不存在`);
    }

    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId, isArchived);
    const graph = await this.json.readGraph(projectRoot, workspaceId, isArchived);
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, workspaceId, isArchived);

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
      output = await this.generateMarkdownStatus(projectRoot, workspaceId, config, graph, workspaceMdData, summary, isArchived);
    } else {
      output = await this.generateBoxStatus(projectRoot, workspaceId, config, graph, workspaceMdData, summary, isArchived);
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
}
