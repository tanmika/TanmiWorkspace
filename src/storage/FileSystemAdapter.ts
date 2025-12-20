// src/storage/FileSystemAdapter.ts

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { devLog } from "../utils/devLog.js";

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
 * - 项目数据：{projectRoot}/.tanmi-workspace[-dev]/{wsDirName}/
 *
 * 目录命名规范（v2）：
 * - 工作区目录：{名称}_{短ID}，如 "UI优化_mjb65az5"
 * - 节点目录：{标题}_{短ID}，如 "功能分析_mjb6mj4h"
 * - 根节点目录固定为 "root"
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
   * @param wsDirName 工作区目录名（如 "UI优化_mjb65az5"）
   */
  getWorkspacePath(projectRoot: string, wsDirName: string): string {
    return path.join(projectRoot, this.localDirName, wsDirName);
  }

  /**
   * 获取工作区配置文件路径
   * @param wsDirName 工作区目录名
   */
  getWorkspaceConfigPath(projectRoot: string, wsDirName: string): string {
    return path.join(projectRoot, this.localDirName, wsDirName, "workspace.json");
  }

  /**
   * 获取节点图文件路径
   * @param wsDirName 工作区目录名
   */
  getGraphPath(projectRoot: string, wsDirName: string): string {
    return path.join(projectRoot, this.localDirName, wsDirName, "graph.json");
  }

  /**
   * 获取工作区 Markdown 文件路径
   * @param wsDirName 工作区目录名
   */
  getWorkspaceMdPath(projectRoot: string, wsDirName: string): string {
    return path.join(projectRoot, this.localDirName, wsDirName, "Workspace.md");
  }

  /**
   * 获取工作区日志文件路径
   * @param wsDirName 工作区目录名
   */
  getWorkspaceLogPath(projectRoot: string, wsDirName: string): string {
    return path.join(projectRoot, this.localDirName, wsDirName, "Log.md");
  }

  /**
   * 获取工作区问题文件路径
   * @param wsDirName 工作区目录名
   */
  getWorkspaceProblemPath(projectRoot: string, wsDirName: string): string {
    return path.join(projectRoot, this.localDirName, wsDirName, "Problem.md");
  }

  /**
   * 获取节点目录路径
   * @param wsDirName 工作区目录名
   * @param nodeDirName 节点目录名（如 "功能分析_mjb6mj4h" 或 "root"）
   */
  getNodePath(projectRoot: string, wsDirName: string, nodeDirName: string): string {
    return path.join(projectRoot, this.localDirName, wsDirName, "nodes", nodeDirName);
  }

  /**
   * 获取节点 Info.md 文件路径
   * @param wsDirName 工作区目录名
   * @param nodeDirName 节点目录名
   */
  getNodeInfoPath(projectRoot: string, wsDirName: string, nodeDirName: string): string {
    return path.join(projectRoot, this.localDirName, wsDirName, "nodes", nodeDirName, "Info.md");
  }

  /**
   * 获取节点日志文件路径
   * @param wsDirName 工作区目录名
   * @param nodeDirName 节点目录名
   */
  getNodeLogPath(projectRoot: string, wsDirName: string, nodeDirName: string): string {
    return path.join(projectRoot, this.localDirName, wsDirName, "nodes", nodeDirName, "Log.md");
  }

  /**
   * 获取节点问题文件路径
   * @param wsDirName 工作区目录名
   * @param nodeDirName 节点目录名
   */
  getNodeProblemPath(projectRoot: string, wsDirName: string, nodeDirName: string): string {
    return path.join(projectRoot, this.localDirName, wsDirName, "nodes", nodeDirName, "Problem.md");
  }

  /**
   * 获取节点目录路径 (nodes/)
   * @param wsDirName 工作区目录名
   */
  getNodesDir(projectRoot: string, wsDirName: string): string {
    return path.join(projectRoot, this.localDirName, wsDirName, "nodes");
  }

  // ========== 归档路径方法 ==========

  /**
   * 获取归档目录路径
   */
  getArchiveDir(projectRoot: string): string {
    return path.join(projectRoot, this.localDirName, "archive");
  }

  /**
   * 获取归档工作区目录路径
   * @param wsDirName 工作区目录名
   */
  getArchivePath(projectRoot: string, wsDirName: string): string {
    return path.join(projectRoot, this.localDirName, "archive", wsDirName);
  }

  /**
   * 获取工作区基础路径（根据归档状态返回正确路径）
   * @param wsDirName 工作区目录名
   */
  getWorkspaceBasePath(projectRoot: string, wsDirName: string, isArchived: boolean): string {
    if (isArchived) {
      return this.getArchivePath(projectRoot, wsDirName);
    }
    return this.getWorkspacePath(projectRoot, wsDirName);
  }

  /**
   * 获取节点图文件路径（支持归档）
   * @param wsDirName 工作区目录名
   */
  getGraphPathWithArchive(projectRoot: string, wsDirName: string, isArchived: boolean): string {
    const basePath = this.getWorkspaceBasePath(projectRoot, wsDirName, isArchived);
    return path.join(basePath, "graph.json");
  }

  /**
   * 获取工作区 Markdown 文件路径（支持归档）
   * @param wsDirName 工作区目录名
   */
  getWorkspaceMdPathWithArchive(projectRoot: string, wsDirName: string, isArchived: boolean): string {
    const basePath = this.getWorkspaceBasePath(projectRoot, wsDirName, isArchived);
    return path.join(basePath, "Workspace.md");
  }

  /**
   * 获取节点 Info.md 文件路径（支持归档）
   * @param wsDirName 工作区目录名
   * @param nodeDirName 节点目录名
   */
  getNodeInfoPathWithArchive(projectRoot: string, wsDirName: string, nodeDirName: string, isArchived: boolean): string {
    const basePath = this.getWorkspaceBasePath(projectRoot, wsDirName, isArchived);
    return path.join(basePath, "nodes", nodeDirName, "Info.md");
  }

  /**
   * 获取节点日志文件路径（支持归档）
   * @param wsDirName 工作区目录名
   * @param nodeDirName 节点目录名
   */
  getNodeLogPathWithArchive(projectRoot: string, wsDirName: string, nodeDirName: string, isArchived: boolean): string {
    const basePath = this.getWorkspaceBasePath(projectRoot, wsDirName, isArchived);
    return path.join(basePath, "nodes", nodeDirName, "Log.md");
  }

  /**
   * 获取节点问题文件路径（支持归档）
   * @param wsDirName 工作区目录名
   * @param nodeDirName 节点目录名
   */
  getNodeProblemPathWithArchive(projectRoot: string, wsDirName: string, nodeDirName: string, isArchived: boolean): string {
    const basePath = this.getWorkspaceBasePath(projectRoot, wsDirName, isArchived);
    return path.join(basePath, "nodes", nodeDirName, "Problem.md");
  }

  /**
   * 获取工作区问题文件路径（支持归档）
   * @param wsDirName 工作区目录名
   */
  getWorkspaceProblemPathWithArchive(projectRoot: string, wsDirName: string, isArchived: boolean): string {
    const basePath = this.getWorkspaceBasePath(projectRoot, wsDirName, isArchived);
    return path.join(basePath, "Problem.md");
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
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (error) {
      devLog.fileError("readFile", filePath, error);
      throw error;
    }
  }

  /**
   * 读取目录内容
   */
  async readdir(dirPath: string): Promise<string[]> {
    try {
      return await fs.readdir(dirPath);
    } catch (error) {
      devLog.fileError("readdir", dirPath, error);
      throw error;
    }
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
   * @param wsDirName 工作区目录名
   */
  async ensureWorkspaceDir(projectRoot: string, wsDirName: string): Promise<void> {
    await this.mkdir(this.getWorkspacePath(projectRoot, wsDirName));
  }

  /**
   * 确保归档目录存在
   */
  async ensureArchiveDir(projectRoot: string): Promise<void> {
    await this.mkdir(this.getArchiveDir(projectRoot));
  }

  /**
   * 移动目录
   */
  async moveDir(src: string, dest: string): Promise<void> {
    await fs.rename(src, dest);
  }

  /**
   * 安全重命名目录（处理名称冲突）
   * @returns 实际使用的新目录名（可能带序号后缀）
   */
  async safeRenameDir(src: string, destDir: string, newName: string): Promise<string> {
    let finalName = newName;
    let destPath = path.join(destDir, finalName);
    let counter = 1;

    // 如果目标已存在且不是源目录本身，添加序号
    while (await this.exists(destPath) && destPath !== src) {
      finalName = `${newName}_${counter}`;
      destPath = path.join(destDir, finalName);
      counter++;
    }

    // 如果源和目标相同，无需操作
    if (destPath === src) {
      return finalName;
    }

    await fs.rename(src, destPath);
    return finalName;
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
