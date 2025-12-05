// src/storage/JsonStorage.ts

import type { FileSystemAdapter } from "./FileSystemAdapter.js";
import type { WorkspaceIndex, WorkspaceConfig, WorkspaceEntry } from "../types/workspace.js";
import type { NodeGraph } from "../types/node.js";

/**
 * JSON 存储封装
 * 提供类型安全的 JSON 文件读写
 *
 * 架构：
 * - 全局索引：~/.tanmi-workspace[-dev]/index.json
 * - 项目数据：{projectRoot}/.tanmi-workspace[-dev]/{workspaceId}/
 */
export class JsonStorage {
  constructor(private fs: FileSystemAdapter) {}

  // ========== Global Index ==========

  /**
   * 读取全局工作区索引
   */
  async readIndex(): Promise<WorkspaceIndex> {
    const indexPath = this.fs.getIndexPath();
    if (!(await this.fs.exists(indexPath))) {
      return {
        version: "2.0",
        workspaces: []
      };
    }
    const content = await this.fs.readFile(indexPath);
    const index = JSON.parse(content) as WorkspaceIndex;

    // 版本迁移：1.0 -> 2.0
    if (index.version === "1.0") {
      index.version = "2.0";
      // 旧版本没有 projectRoot，标记为需要清理
      index.workspaces = index.workspaces.map(ws => ({
        ...ws,
        projectRoot: (ws as WorkspaceEntry).projectRoot || ""
      }));
    }

    return index;
  }

  /**
   * 写入全局工作区索引
   */
  async writeIndex(index: WorkspaceIndex): Promise<void> {
    const indexPath = this.fs.getIndexPath();
    await this.fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * 根据 workspaceId 查找工作区条目
   */
  async findWorkspaceEntry(workspaceId: string): Promise<WorkspaceEntry | null> {
    const index = await this.readIndex();
    return index.workspaces.find(ws => ws.id === workspaceId) || null;
  }

  /**
   * 根据 workspaceId 获取 projectRoot
   */
  async getProjectRoot(workspaceId: string): Promise<string | null> {
    const entry = await this.findWorkspaceEntry(workspaceId);
    return entry?.projectRoot || null;
  }

  /**
   * 验证索引中的工作区路径是否有效
   * 返回无效的工作区列表
   */
  async validateIndexPaths(): Promise<WorkspaceEntry[]> {
    const index = await this.readIndex();
    const invalid: WorkspaceEntry[] = [];

    for (const ws of index.workspaces) {
      if (!ws.projectRoot) {
        invalid.push(ws);
        continue;
      }
      const configPath = this.fs.getWorkspaceConfigPath(ws.projectRoot, ws.id);
      if (!(await this.fs.exists(configPath))) {
        invalid.push(ws);
      }
    }

    return invalid;
  }

  /**
   * 清理索引中无效的工作区条目
   */
  async cleanupInvalidEntries(): Promise<string[]> {
    const invalid = await this.validateIndexPaths();
    if (invalid.length === 0) return [];

    const index = await this.readIndex();
    const invalidIds = new Set(invalid.map(ws => ws.id));
    index.workspaces = index.workspaces.filter(ws => !invalidIds.has(ws.id));
    await this.writeIndex(index);

    return invalid.map(ws => ws.id);
  }

  /**
   * 检查特定项目下是否存在同名工作区
   */
  async hasWorkspaceByName(projectRoot: string, name: string): Promise<boolean> {
    const index = await this.readIndex();
    return index.workspaces.some(
      ws => ws.projectRoot === projectRoot && ws.name === name && ws.status === "active"
    );
  }

  // ========== Workspace Config (项目级) ==========

  /**
   * 读取工作区配置
   * @param projectRoot 项目根目录
   * @param workspaceId 工作区 ID
   */
  async readWorkspaceConfig(projectRoot: string, workspaceId: string): Promise<WorkspaceConfig> {
    const configPath = this.fs.getWorkspaceConfigPath(projectRoot, workspaceId);
    const content = await this.fs.readFile(configPath);
    return JSON.parse(content) as WorkspaceConfig;
  }

  /**
   * 写入工作区配置
   * @param projectRoot 项目根目录
   * @param workspaceId 工作区 ID
   * @param config 工作区配置
   */
  async writeWorkspaceConfig(projectRoot: string, workspaceId: string, config: WorkspaceConfig): Promise<void> {
    const configPath = this.fs.getWorkspaceConfigPath(projectRoot, workspaceId);
    await this.fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * 检查特定工作区是否存在
   */
  async hasWorkspace(projectRoot: string, workspaceId: string): Promise<boolean> {
    const configPath = this.fs.getWorkspaceConfigPath(projectRoot, workspaceId);
    return this.fs.exists(configPath);
  }

  // ========== Node Graph (项目级) ==========

  /**
   * 读取节点图
   * @param projectRoot 项目根目录
   * @param workspaceId 工作区 ID
   */
  async readGraph(projectRoot: string, workspaceId: string): Promise<NodeGraph> {
    const graphPath = this.fs.getGraphPath(projectRoot, workspaceId);
    const content = await this.fs.readFile(graphPath);
    return JSON.parse(content) as NodeGraph;
  }

  /**
   * 写入节点图
   * @param projectRoot 项目根目录
   * @param workspaceId 工作区 ID
   * @param graph 节点图
   */
  async writeGraph(projectRoot: string, workspaceId: string, graph: NodeGraph): Promise<void> {
    const graphPath = this.fs.getGraphPath(projectRoot, workspaceId);
    await this.fs.writeFile(graphPath, JSON.stringify(graph, null, 2));
  }
}
