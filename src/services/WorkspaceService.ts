// src/services/WorkspaceService.ts

import * as path from "node:path";
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
  WorkspaceConfig,
} from "../types/workspace.js";
import type { NodeGraph, NodeMeta } from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { generateWorkspaceId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { validateWorkspaceName } from "../utils/validation.js";

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

    // 2. 确定项目根目录（默认为当前工作目录）
    const projectRoot = params.projectRoot
      ? path.resolve(params.projectRoot)
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

    // 8. 写入 graph.json（含根节点）
    const rootNode: NodeMeta = {
      id: rootNodeId,
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
      version: "1.0",
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

    // 11. 创建根节点文件
    await this.md.writeNodeInfo(projectRoot, workspaceId, rootNodeId, {
      id: rootNodeId,
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
    };
  }

  /**
   * 列出工作区
   */
  async list(params: WorkspaceListParams): Promise<WorkspaceListResult> {
    const index = await this.json.readIndex();
    const statusFilter = params.status || "all";

    let filteredWorkspaces = index.workspaces;
    if (statusFilter !== "all") {
      filteredWorkspaces = filteredWorkspaces.filter(ws => ws.status === statusFilter);
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

    // 通过索引查找 projectRoot
    const projectRoot = await this.json.getProjectRoot(workspaceId);
    if (!projectRoot) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    // 验证项目目录存在
    const workspacePath = this.fs.getWorkspacePath(projectRoot, workspaceId);
    if (!(await this.fs.exists(workspacePath))) {
      // 清理无效索引
      await this.json.cleanupInvalidEntries();
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 的项目目录不存在`);
    }

    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const workspaceMd = await this.md.readWorkspaceMdRaw(projectRoot, workspaceId);

    return {
      config,
      graph,
      workspaceMd,
      webUrl: `http://localhost:${getHttpPort()}/workspace/${workspaceId}`,
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

    // 通过索引查找 projectRoot
    const projectRoot = await this.json.getProjectRoot(workspaceId);
    if (!projectRoot) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    // 验证项目目录存在
    const workspacePath = this.fs.getWorkspacePath(projectRoot, workspaceId);
    if (!(await this.fs.exists(workspacePath))) {
      await this.json.cleanupInvalidEntries();
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 的项目目录不存在`);
    }

    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, workspaceId);

    // 计算统计信息
    const nodes = Object.values(graph.nodes);
    const totalNodes = nodes.length;
    const completedNodes = nodes.filter(n => n.status === "completed").length;

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
      output = await this.generateMarkdownStatus(projectRoot, workspaceId, config, graph, workspaceMdData, summary);
    } else {
      output = await this.generateBoxStatus(projectRoot, workspaceId, config, graph, workspaceMdData, summary);
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
    summary: { totalNodes: number; completedNodes: number; currentFocus: string | null }
  ): Promise<string> {
    const lines: string[] = [];
    const width = 60;

    lines.push("┌" + "─".repeat(width - 2) + "┐");
    lines.push("│" + ` 工作区: ${config.name}`.padEnd(width - 2) + "│");
    lines.push("│" + ` 状态: ${config.status}`.padEnd(width - 2) + "│");
    lines.push("├" + "─".repeat(width - 2) + "┤");
    lines.push("│" + ` 目标: ${workspaceMdData.goal.substring(0, width - 10)}`.padEnd(width - 2) + "│");
    lines.push("├" + "─".repeat(width - 2) + "┤");
    lines.push("│" + ` 节点统计: ${summary.completedNodes}/${summary.totalNodes} 完成`.padEnd(width - 2) + "│");
    lines.push("│" + ` 当前聚焦: ${summary.currentFocus || "无"}`.padEnd(width - 2) + "│");
    lines.push("├" + "─".repeat(width - 2) + "┤");
    lines.push("│" + " 节点树:".padEnd(width - 2) + "│");

    // 生成节点树
    const treeLines = await this.generateNodeTree(projectRoot, workspaceId, graph, config.rootNodeId, 0);
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
    summary: { totalNodes: number; completedNodes: number; currentFocus: string | null }
  ): Promise<string> {
    const lines: string[] = [];

    lines.push(`# ${config.name}`);
    lines.push("");
    lines.push(`**状态**: ${config.status}`);
    lines.push(`**目标**: ${workspaceMdData.goal}`);
    lines.push("");
    lines.push("## 统计");
    lines.push(`- 节点总数: ${summary.totalNodes}`);
    lines.push(`- 已完成: ${summary.completedNodes}`);
    lines.push(`- 当前聚焦: ${summary.currentFocus || "无"}`);
    lines.push("");
    lines.push("## 节点树");
    lines.push("");

    const treeLines = await this.generateNodeTreeMd(projectRoot, workspaceId, graph, config.rootNodeId, 0);
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
    depth: number
  ): Promise<string[]> {
    const node = graph.nodes[nodeId];
    if (!node) return [];

    const lines: string[] = [];
    const indent = "  ".repeat(depth);
    const statusIcon = this.getStatusIcon(node.status);
    const focusIndicator = graph.currentFocus === nodeId ? " ◄" : "";

    // 读取节点标题
    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId);
    const title = nodeInfo.title || nodeId;

    lines.push(`${indent}${statusIcon} ${title}${focusIndicator}`);

    for (const childId of node.children) {
      lines.push(...await this.generateNodeTree(projectRoot, workspaceId, graph, childId, depth + 1));
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
    depth: number
  ): Promise<string[]> {
    const node = graph.nodes[nodeId];
    if (!node) return [];

    const lines: string[] = [];
    const indent = "  ".repeat(depth);
    const statusIcon = this.getStatusIcon(node.status);
    const focusIndicator = graph.currentFocus === nodeId ? " **◄ 当前聚焦**" : "";

    // 读取节点标题
    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId);
    const title = nodeInfo.title || nodeId;

    lines.push(`${indent}- ${statusIcon} ${title}${focusIndicator}`);

    for (const childId of node.children) {
      lines.push(...await this.generateNodeTreeMd(projectRoot, workspaceId, graph, childId, depth + 1));
    }

    return lines;
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case "pending":
        return "○";
      case "implementing":
        return "◐";
      case "validating":
        return "◑";
      case "completed":
        return "●";
      case "failed":
        return "✕";
      default:
        return "?";
    }
  }
}
