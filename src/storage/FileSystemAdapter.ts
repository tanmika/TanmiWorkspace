// src/storage/FileSystemAdapter.ts

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

/**
 * 判断是否为开发模式
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
}

/**
 * 文件系统适配器
 * 负责底层文件操作，封装路径管理
 *
 * 架构：
 * - 全局索引：~/.tanmi-workspace[-dev]/index.json
 * - 项目数据：{projectRoot}/.tanmi-workspace[-dev]/{workspaceId}/
 */
export class FileSystemAdapter {
  private globalBasePath: string;
  private localDirName: string;

  constructor() {
    // 根据环境选择目录名
    const suffix = isDevelopment() ? "-dev" : "";
    this.localDirName = `.tanmi-workspace${suffix}`;

    // 全局索引目录（用户主目录下）
    this.globalBasePath = path.join(os.homedir(), this.localDirName);
  }

  /**
   * 是否为开发模式
   */
  isDev(): boolean {
    return isDevelopment();
  }

  /**
   * 获取目录名（供外部使用）
   */
  getDirName(): string {
    return this.localDirName;
  }

  // ========== 全局路径方法 ==========

  /**
   * 获取全局基础路径
   */
  getGlobalBasePath(): string {
    return this.globalBasePath;
  }

  /**
   * 获取全局索引文件路径
   */
  getIndexPath(): string {
    return path.join(this.globalBasePath, "index.json");
  }

  // ========== 项目级路径方法 ==========

  /**
   * 获取项目内工作区根目录路径 (包含所有工作区)
   */
  getWorkspaceRootPath(projectRoot: string): string {
    return path.join(projectRoot, this.localDirName);
  }

  /**
   * 获取特定工作区目录路径
   */
  getWorkspacePath(projectRoot: string, workspaceId: string): string {
    return path.join(projectRoot, this.localDirName, workspaceId);
  }

  /**
   * 获取工作区配置文件路径
   */
  getWorkspaceConfigPath(projectRoot: string, workspaceId: string): string {
    return path.join(projectRoot, this.localDirName, workspaceId, "workspace.json");
  }

  /**
   * 获取节点图文件路径
   */
  getGraphPath(projectRoot: string, workspaceId: string): string {
    return path.join(projectRoot, this.localDirName, workspaceId, "graph.json");
  }

  /**
   * 获取工作区 Markdown 文件路径
   */
  getWorkspaceMdPath(projectRoot: string, workspaceId: string): string {
    return path.join(projectRoot, this.localDirName, workspaceId, "Workspace.md");
  }

  /**
   * 获取工作区日志文件路径
   */
  getWorkspaceLogPath(projectRoot: string, workspaceId: string): string {
    return path.join(projectRoot, this.localDirName, workspaceId, "Log.md");
  }

  /**
   * 获取工作区问题文件路径
   */
  getWorkspaceProblemPath(projectRoot: string, workspaceId: string): string {
    return path.join(projectRoot, this.localDirName, workspaceId, "Problem.md");
  }

  /**
   * 获取节点目录路径
   */
  getNodePath(projectRoot: string, workspaceId: string, nodeId: string): string {
    return path.join(projectRoot, this.localDirName, workspaceId, "nodes", nodeId);
  }

  /**
   * 获取节点 Info.md 文件路径
   */
  getNodeInfoPath(projectRoot: string, workspaceId: string, nodeId: string): string {
    return path.join(projectRoot, this.localDirName, workspaceId, "nodes", nodeId, "Info.md");
  }

  /**
   * 获取节点日志文件路径
   */
  getNodeLogPath(projectRoot: string, workspaceId: string, nodeId: string): string {
    return path.join(projectRoot, this.localDirName, workspaceId, "nodes", nodeId, "Log.md");
  }

  /**
   * 获取节点问题文件路径
   */
  getNodeProblemPath(projectRoot: string, workspaceId: string, nodeId: string): string {
    return path.join(projectRoot, this.localDirName, workspaceId, "nodes", nodeId, "Problem.md");
  }

  /**
   * 获取节点目录路径 (nodes/)
   */
  getNodesDir(projectRoot: string, workspaceId: string): string {
    return path.join(projectRoot, this.localDirName, workspaceId, "nodes");
  }

  // ========== 文件操作 ==========

  /**
   * 检查路径是否存在
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 创建目录（递归）
   */
  async mkdir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * 删除目录（递归）
   */
  async rmdir(dirPath: string): Promise<void> {
    await fs.rm(dirPath, { recursive: true, force: true });
  }

  /**
   * 读取文件内容
   */
  async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, "utf-8");
  }

  /**
   * 写入文件（原子写入：先写临时文件再重命名）
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await this.mkdir(dir);

    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, content, "utf-8");
    await fs.rename(tempPath, filePath);
  }

  /**
   * 删除文件
   */
  async deleteFile(filePath: string): Promise<void> {
    await fs.unlink(filePath);
  }

  // ========== 初始化 ==========

  /**
   * 确保全局基础目录存在
   */
  async ensureGlobalDir(): Promise<void> {
    await this.mkdir(this.globalBasePath);
  }

  /**
   * 确保项目内工作区根目录存在
   */
  async ensureProjectDir(projectRoot: string): Promise<void> {
    await this.mkdir(this.getWorkspaceRootPath(projectRoot));
  }

  /**
   * 确保特定工作区目录存在
   */
  async ensureWorkspaceDir(projectRoot: string, workspaceId: string): Promise<void> {
    await this.mkdir(this.getWorkspacePath(projectRoot, workspaceId));
  }

  /**
   * 初始化空的全局索引文件（如果不存在）
   */
  async ensureIndex(): Promise<void> {
    await this.ensureGlobalDir();
    const indexPath = this.getIndexPath();
    if (!(await this.exists(indexPath))) {
      await this.writeFile(indexPath, JSON.stringify({
        version: "2.0",
        workspaces: []
      }, null, 2));
    }
  }
}
