// src/storage/JsonStorage.ts

import type { FileSystemAdapter } from "./FileSystemAdapter.js";
import type { WorkspaceIndex, WorkspaceConfig, WorkspaceEntry } from "../types/workspace.js";
import type { NodeGraph } from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { generateWorkspaceDirName, generateNodeDirName, extractShortId } from "../utils/id.js";

/**
 * JSON 存储封装
 * 提供类型安全的 JSON 文件读写
 *
 * 架构：
 * - 全局索引：~/.tanmi-workspace[-dev]/index.json
 * - 项目数据：{projectRoot}/.tanmi-workspace[-dev]/{wsDirName}/
 *
 * 目录命名规范（v2）：
 * - 工作区目录：{名称}_{短ID}，如 "UI优化_mjb65az5"
 * - 节点目录：{标题}_{短ID}，如 "功能分析_mjb6mj4h"
 * - 根节点目录固定为 "root"
 */
export class JsonStorage {
  constructor(private fs: FileSystemAdapter) {}

  // ========== Global Index ==========

  /**
   * 统一存储版本（index.json 和 graph.json 共享）
   * - 1.0: 初始版本
   * - 2.0: index 添加 projectRoot
   * - 3.0: 添加节点 type 字段
   * - 4.0: 添加 dirName 字段（UUID 格式）
   * - 5.0: dirName 改为可读格式（名称_短ID）
   */
  static readonly STORAGE_VERSION = "5.0";

  /**
   * 读取全局工作区索引
   */
  async readIndex(): Promise<WorkspaceIndex> {
    const indexPath = this.fs.getIndexPath();
    if (!(await this.fs.exists(indexPath))) {
      return {
        version: JsonStorage.STORAGE_VERSION,
        workspaces: []
      };
    }
    const content = await this.fs.readFile(indexPath);
    const index = JSON.parse(content) as WorkspaceIndex;

    // 版本检查：数据版本高于代码版本
    if (this.compareVersion(index.version, JsonStorage.STORAGE_VERSION) > 0) {
      // 备份高版本 index，创建新的空 index
      await this.backupAndResetIndex(indexPath, index.version);
      console.error(
        `[version] 检测到高版本数据 (${index.version} > ${JsonStorage.STORAGE_VERSION})，` +
        `已备份原 index 并创建空索引。请升级 tanmi-workspace 以访问原有工作区。`
      );
      return {
        version: JsonStorage.STORAGE_VERSION,
        workspaces: []
      };
    }

    // 版本迁移：一次性升级 index + 所有工作区的 graph
    if (index.version !== JsonStorage.STORAGE_VERSION) {
      await this.migrateAll(index);
    }

    return index;
  }

  /**
   * 备份高版本 index 并重置
   */
  private async backupAndResetIndex(indexPath: string, version: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = indexPath.replace(".json", `.backup.v${version}.${timestamp}.json`);

    // 读取原内容并添加备份标记
    const content = await this.fs.readFile(indexPath);
    const index = JSON.parse(content);
    index._backupReason = `版本 ${version} 高于当前支持的 ${JsonStorage.STORAGE_VERSION}`;
    index._backupTime = new Date().toISOString();

    // 写入备份
    await this.fs.writeFile(backupPath, JSON.stringify(index, null, 2));

    // 写入新的空 index
    const newIndex: WorkspaceIndex = {
      version: JsonStorage.STORAGE_VERSION,
      workspaces: []
    };
    await this.fs.writeFile(indexPath, JSON.stringify(newIndex, null, 2));
  }

  /**
   * 比较版本号
   * @returns >0 表示 a > b, <0 表示 a < b, =0 表示相等
   */
  private compareVersion(a: string, b: string): number {
    const [aMajor, aMinor = 0] = a.split(".").map(Number);
    const [bMajor, bMinor = 0] = b.split(".").map(Number);
    if (aMajor !== bMajor) return aMajor - bMajor;
    return aMinor - bMinor;
  }

  /**
   * 全量迁移：index + 所有工作区的 graph.json + 目录重命名
   * 在 readIndex 时一次性完成，避免分散迁移导致遗漏
   */
  private async migrateAll(index: WorkspaceIndex): Promise<void> {
    const oldVersion = index.version;
    const errors: { workspaceId: string; error: string }[] = [];

    console.error(`[migration] 开始全量迁移 (${oldVersion} → ${JsonStorage.STORAGE_VERSION})...`);

    // 1. 迁移所有工作区（目录重命名 + graph.json）
    for (const ws of index.workspaces) {
      try {
        // 1.1 重命名工作区目录（如果需要）
        const newDirName = await this.migrateWorkspaceDir(ws);
        if (newDirName) {
          ws.dirName = newDirName;
        }

        // 1.2 迁移 graph.json（包括节点目录重命名）
        await this.migrateWorkspaceGraph(ws);
      } catch (e) {
        errors.push({
          workspaceId: ws.id,
          error: e instanceof Error ? e.message : String(e)
        });
        // 继续处理其他工作区，不中断
      }
    }

    // 2. 迁移 index 数据（更新版本号）
    this.migrateIndexData(index);

    // 3. 保存 index
    try {
      await this.writeIndex(index);
    } catch (e) {
      console.error("[migration] 保存 index.json 失败:", e);
    }

    // 4. 报告迁移结果
    const successCount = index.workspaces.length - errors.length;
    console.error(`[migration] 迁移完成: ${successCount}/${index.workspaces.length} 工作区成功`);
    if (errors.length > 0) {
      console.error(`[migration] 失败的工作区:`, errors.map(e => e.workspaceId).join(", "));
    }
  }

  /**
   * 迁移工作区目录名（UUID → 可读名称）
   * @returns 新的目录名，如果无需迁移返回 undefined
   */
  private async migrateWorkspaceDir(ws: WorkspaceEntry): Promise<string | undefined> {
    const oldDirName = ws.dirName || ws.id;

    // 如果目录名不是以 ws- 开头，说明已经是可读格式，跳过
    if (!oldDirName.startsWith("ws-")) {
      return undefined;
    }

    // 生成可读目录名
    const newDirName = generateWorkspaceDirName(ws.name, ws.id);

    // 如果新旧相同，跳过
    if (newDirName === oldDirName) {
      return undefined;
    }

    // 确定源目录和目标目录
    const isArchived = ws.status === "archived";
    const baseDir = isArchived
      ? this.fs.getArchiveDir(ws.projectRoot)
      : this.fs.getWorkspaceRootPath(ws.projectRoot);
    const srcPath = isArchived
      ? this.fs.getArchivePath(ws.projectRoot, oldDirName)
      : this.fs.getWorkspacePath(ws.projectRoot, oldDirName);

    // 检查源目录是否存在
    if (!(await this.fs.exists(srcPath))) {
      console.error(`[migration] 工作区目录不存在，跳过: ${srcPath}`);
      return undefined;
    }

    // 安全重命名（处理冲突）
    const actualDirName = await this.fs.safeRenameDir(srcPath, baseDir, newDirName);
    console.error(`[migration] 工作区目录重命名: ${oldDirName} → ${actualDirName}`);

    return actualDirName;
  }

  /**
   * 迁移单个工作区的 graph.json（包括节点目录重命名）
   */
  private async migrateWorkspaceGraph(ws: WorkspaceEntry): Promise<void> {
    // 获取目录名（此时 dirName 可能已被 migrateWorkspaceDir 更新）
    const wsDirName = ws.dirName || ws.id;
    const isArchived = ws.status === "archived";

    // 获取 graph.json 路径
    const graphPath = isArchived
      ? this.fs.getGraphPathWithArchive(ws.projectRoot, wsDirName, true)
      : this.fs.getGraphPath(ws.projectRoot, wsDirName);

    if (!(await this.fs.exists(graphPath))) {
      return;
    }

    const content = await this.fs.readFile(graphPath);
    const graph = JSON.parse(content) as NodeGraph;

    // 迁移节点目录名
    await this.migrateNodeDirs(ws.projectRoot, wsDirName, graph, isArchived);

    // 迁移 graph 数据结构
    if (graph.version !== JsonStorage.STORAGE_VERSION) {
      this.migrateGraphData(graph);
    }

    // 保存更新后的 graph.json
    if (isArchived) {
      await this.fs.writeFile(graphPath, JSON.stringify(graph, null, 2));
    } else {
      await this.writeGraph(ws.projectRoot, wsDirName, graph);
    }
  }

  /**
   * 迁移节点目录名（UUID → 可读名称）
   */
  private async migrateNodeDirs(
    projectRoot: string,
    wsDirName: string,
    graph: NodeGraph,
    isArchived: boolean
  ): Promise<void> {
    const nodesDir = isArchived
      ? `${this.fs.getArchivePath(projectRoot, wsDirName)}/nodes`
      : this.fs.getNodesDir(projectRoot, wsDirName);

    // 检查 nodes 目录是否存在
    if (!(await this.fs.exists(nodesDir))) {
      return;
    }

    // 遍历所有节点
    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      // 跳过根节点
      if (nodeId === "root") {
        continue;
      }

      const oldDirName = node.dirName || nodeId;

      // 如果目录名不是以 node- 开头，说明已经是可读格式，跳过
      if (!oldDirName.startsWith("node-")) {
        continue;
      }

      // 从 Info.md 读取标题
      const title = await this.readNodeTitle(nodesDir, oldDirName);

      // 生成可读目录名
      const newDirName = generateNodeDirName(title, nodeId);

      // 如果新旧相同，跳过
      if (newDirName === oldDirName) {
        continue;
      }

      const srcPath = `${nodesDir}/${oldDirName}`;

      // 检查源目录是否存在
      if (!(await this.fs.exists(srcPath))) {
        // 源目录不存在，可能已经被迁移过但 graph.json 没有更新
        // 查找以节点短 ID 结尾的目录
        const shortId = nodeId.split("-").pop();  // 提取短 ID
        const existingDir = await this.findDirBySuffix(nodesDir, shortId!);
        if (existingDir && existingDir !== oldDirName) {
          // 找到已存在的可读格式目录，更新 graph.json
          node.dirName = existingDir;
          console.error(`[migration] 修复节点目录名: ${nodeId} → ${existingDir}`);
        }
        continue;
      }

      // 安全重命名（处理冲突）
      const actualDirName = await this.fs.safeRenameDir(srcPath, nodesDir, newDirName);
      node.dirName = actualDirName;
      console.error(`[migration] 节点目录重命名: ${oldDirName} → ${actualDirName}`);
    }
  }

  /**
   * 从 Info.md 读取节点标题
   */
  private async readNodeTitle(nodesDir: string, nodeDirName: string): Promise<string> {
    const infoPath = `${nodesDir}/${nodeDirName}/Info.md`;
    try {
      if (!(await this.fs.exists(infoPath))) {
        return "节点";  // 默认标题
      }
      const content = await this.fs.readFile(infoPath);
      // 从 frontmatter 提取 title
      const match = content.match(/^---\n[\s\S]*?title:\s*(.+?)\n[\s\S]*?---/);
      if (match && match[1]) {
        return match[1].trim();
      }
      return "节点";  // 默认标题
    } catch {
      return "节点";  // 读取失败使用默认标题
    }
  }

  /**
   * 在目录中查找以指定后缀结尾的子目录
   */
  private async findDirBySuffix(parentDir: string, suffix: string): Promise<string | null> {
    try {
      const entries = await this.fs.readdir(parentDir);
      for (const entry of entries) {
        // 检查是否以 _suffix 结尾（可读格式为 名称_短ID）
        if (entry.endsWith(`_${suffix}`)) {
          return entry;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 迁移 index 数据（纯数据操作）
   * 注意：dirName 已在 migrateWorkspaceDir 中设置为可读名称
   */
  private migrateIndexData(index: WorkspaceIndex): void {
    // 1.0 -> 2.0: 添加 projectRoot
    if (index.version === "1.0") {
      index.workspaces = index.workspaces.map(ws => ({
        ...ws,
        projectRoot: (ws as WorkspaceEntry).projectRoot || ""
      }));
      index.version = "2.0";
    }

    // 2.0/3.0 -> 4.0: 添加 dirName（兼容旧版本）
    if (index.version === "2.0" || index.version === "3.0") {
      index.workspaces = index.workspaces.map(ws => ({
        ...ws,
        dirName: ws.dirName || ws.id
      }));
      index.version = "4.0";
    }

    // 4.0 -> 5.0: dirName 改为可读格式
    // 实际的目录重命名已在 migrateWorkspaceDir 中完成
    // 这里只做兜底处理（确保 dirName 存在）
    if (index.version === "4.0") {
      index.workspaces = index.workspaces.map(ws => ({
        ...ws,
        dirName: ws.dirName || generateWorkspaceDirName(ws.name, ws.id)
      }));
      index.version = "5.0";
    }
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
      // 使用 dirName 来定位配置文件，如果没有 dirName 则回退到 id
      const dirName = ws.dirName || ws.id;
      const configPath = this.fs.getWorkspaceConfigPath(ws.projectRoot, dirName);
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
   * 获取工作区配置文件路径（根据是否归档）
   * @param wsDirName 工作区目录名
   */
  private getConfigPath(projectRoot: string, wsDirName: string, isArchived = false): string {
    if (isArchived) {
      return this.fs.getArchivePath(projectRoot, wsDirName) + "/workspace.json";
    }
    return this.fs.getWorkspaceConfigPath(projectRoot, wsDirName);
  }

  /**
   * 读取工作区配置
   * @param projectRoot 项目根目录
   * @param wsDirName 工作区目录名
   * @param isArchived 是否从归档目录读取
   */
  async readWorkspaceConfig(projectRoot: string, wsDirName: string, isArchived = false): Promise<WorkspaceConfig> {
    const configPath = this.getConfigPath(projectRoot, wsDirName, isArchived);
    const content = await this.fs.readFile(configPath);
    return JSON.parse(content) as WorkspaceConfig;
  }

  /**
   * 写入工作区配置
   * @param projectRoot 项目根目录
   * @param wsDirName 工作区目录名
   * @param config 工作区配置
   * @param isArchived 是否写入归档目录
   */
  async writeWorkspaceConfig(projectRoot: string, wsDirName: string, config: WorkspaceConfig, isArchived = false): Promise<void> {
    const configPath = this.getConfigPath(projectRoot, wsDirName, isArchived);
    await this.fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * 检查特定工作区是否存在
   * @param wsDirName 工作区目录名
   */
  async hasWorkspace(projectRoot: string, wsDirName: string): Promise<boolean> {
    const configPath = this.fs.getWorkspaceConfigPath(projectRoot, wsDirName);
    return this.fs.exists(configPath);
  }

  // ========== Node Graph (项目级) ==========

  /**
   * 读取节点图
   * @param projectRoot 项目根目录
   * @param wsDirName 工作区目录名
   * @param isArchived 是否为归档工作区
   */
  async readGraph(projectRoot: string, wsDirName: string, isArchived = false): Promise<NodeGraph> {
    const graphPath = isArchived
      ? this.fs.getGraphPathWithArchive(projectRoot, wsDirName, true)
      : this.fs.getGraphPath(projectRoot, wsDirName);
    const content = await this.fs.readFile(graphPath);
    const graph = JSON.parse(content) as NodeGraph;

    // 版本检查：拒绝降级
    if (this.compareVersion(graph.version, JsonStorage.STORAGE_VERSION) > 0) {
      throw new TanmiError(
        "VERSION_TOO_HIGH",
        `工作区数据版本 (${graph.version}) 高于当前支持的版本 (${JsonStorage.STORAGE_VERSION})，请升级 tanmi-workspace`
      );
    }

    // 兜底迁移：理论上 migrateAll 已处理，这里防止遗漏
    if (graph.version !== JsonStorage.STORAGE_VERSION) {
      this.migrateGraphData(graph);
      if (!isArchived) {
        await this.writeGraph(projectRoot, wsDirName, graph);
      }
    }

    return graph;
  }

  /**
   * 迁移 graph 数据（纯数据操作）
   * - 1.0/2.0 节点没有 type 字段，需要推断
   * - 3.0 节点没有 dirName 字段，需要从 id 推导
   */
  private migrateGraphData(graph: NodeGraph): void {
    // 迁移节点
    for (const nodeId in graph.nodes) {
      const node = graph.nodes[nodeId];

      // 如果没有 type 字段，推断类型
      if (!node.type) {
        // 根节点必须是 planning（否则无法创建子节点）
        if (node.parentId === null) {
          node.type = "planning";
          // 如果是 implementing 状态，转为 planning 或 monitoring
          if (node.status === "implementing") {
            node.status = node.children.length > 0 ? "monitoring" : "planning";
          }
        }
        // 有子节点 → planning
        else if (node.children && node.children.length > 0) {
          node.type = "planning";
          // 如果是 implementing 状态但有子节点，转为 monitoring
          if (node.status === "implementing") {
            node.status = "monitoring";
          }
        }
        // 无子节点的非根节点 → execution
        else {
          node.type = "execution";
        }
      }

      // 如果没有 dirName 字段，使用 nodeId 作为 dirName（向后兼容）
      if (!node.dirName) {
        node.dirName = nodeId;
      }
    }

    // 更新版本号
    graph.version = JsonStorage.STORAGE_VERSION;
  }

  /**
   * 写入节点图
   * @param projectRoot 项目根目录
   * @param wsDirName 工作区目录名
   * @param graph 节点图
   */
  async writeGraph(projectRoot: string, wsDirName: string, graph: NodeGraph): Promise<void> {
    const graphPath = this.fs.getGraphPath(projectRoot, wsDirName);
    await this.fs.writeFile(graphPath, JSON.stringify(graph, null, 2));
  }
}
