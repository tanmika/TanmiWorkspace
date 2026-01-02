// src/services/BackupService.ts

import * as path from "node:path";
import * as fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";
import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { BackupMeta, BackupListItem } from "../types/health.js";
import { TanmiError } from "../types/errors.js";

const execAsync = promisify(exec);

/**
 * 备份服务
 * 管理工作区级别的备份和恢复
 */
export class BackupService {
  private static readonly BACKUP_DIR = ".backups";
  private static readonly META_FILE = "backup-meta.json";
  private static readonly MAX_BACKUPS = 10;
  private static readonly DEBOUNCE_MS = 5 * 60 * 1000; // 5 分钟

  // 防抖：记录每个工作区最后一次自动备份时间
  private lastAutoBackup: Map<string, number> = new Map();

  // 缓存代码版本
  private currentCodeVersion: string | null = null;

  constructor(
    private json: JsonStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 获取当前代码版本
   */
  private getCurrentCodeVersion(): string {
    if (this.currentCodeVersion) return this.currentCodeVersion;
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const require = createRequire(import.meta.url);
      const pkg = require(join(__dirname, "..", "..", "package.json")) as { version: string };
      this.currentCodeVersion = pkg.version;
      return this.currentCodeVersion;
    } catch {
      return "0.0.0";
    }
  }

  /**
   * 获取备份目录路径
   */
  private getBackupDir(projectRoot: string, wsDirName: string): string {
    return path.join(this.fs.getWorkspacePath(projectRoot, wsDirName), BackupService.BACKUP_DIR);
  }

  /**
   * 获取备份元信息文件路径
   */
  private getMetaPath(projectRoot: string, wsDirName: string): string {
    return path.join(this.getBackupDir(projectRoot, wsDirName), BackupService.META_FILE);
  }

  /**
   * 读取备份元信息
   */
  private async readMeta(projectRoot: string, wsDirName: string): Promise<BackupMeta[]> {
    const metaPath = this.getMetaPath(projectRoot, wsDirName);
    try {
      if (!(await this.fs.exists(metaPath))) {
        return [];
      }
      const content = await this.fs.readFile(metaPath);
      return JSON.parse(content) as BackupMeta[];
    } catch {
      return [];
    }
  }

  /**
   * 写入备份元信息
   */
  private async writeMeta(projectRoot: string, wsDirName: string, metas: BackupMeta[]): Promise<void> {
    const metaPath = this.getMetaPath(projectRoot, wsDirName);
    await this.fs.writeFile(metaPath, JSON.stringify(metas, null, 2));
  }

  /**
   * 生成备份文件名
   */
  private generateBackupName(): string {
    // ISO 时间戳，替换冒号为短横线
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    return `backup_${timestamp}.tar.gz`;
  }

  /**
   * 创建工作区备份
   * @param workspaceId 工作区 ID
   * @param trigger 触发类型
   * @returns 备份元信息
   */
  async createBackup(
    workspaceId: string,
    trigger: BackupMeta["trigger"] = "manual"
  ): Promise<BackupMeta> {
    // 获取工作区信息
    const wsEntry = await this.json.findWorkspaceEntry(workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    const { projectRoot, dirName, name: workspaceName } = wsEntry;
    const wsDirName = dirName || workspaceId;

    // 自动备份防抖检查
    if (trigger === "auto") {
      const lastTime = this.lastAutoBackup.get(workspaceId);
      if (lastTime && Date.now() - lastTime < BackupService.DEBOUNCE_MS) {
        throw new TanmiError(
          "INVALID_PARAMS",
          `工作区 "${workspaceId}" 在 5 分钟内已自动备份，跳过`
        );
      }
    }

    // 确保备份目录存在
    const backupDir = this.getBackupDir(projectRoot, wsDirName);
    await this.fs.ensureDir(backupDir);

    // 生成备份文件名和路径
    const backupName = this.generateBackupName();
    const backupPath = path.join(backupDir, backupName);
    const workspacePath = this.fs.getWorkspacePath(projectRoot, wsDirName);

    // 创建压缩备份（排除 .backups 目录）
    try {
      await execAsync(
        `tar -czf "${backupPath}" --exclude='.backups' -C "${workspacePath}" .`
      );
    } catch (e) {
      throw new TanmiError(
        "INVALID_PARAMS",
        `备份创建失败: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    // 验证备份
    let verified = false;
    try {
      await execAsync(`tar -tzf "${backupPath}" > /dev/null`);
      verified = true;
    } catch {
      // 验证失败，记录但不阻止
      console.error(`[backup] 备份验证失败: ${backupPath}`);
    }

    // 获取文件大小
    const stats = await fs.stat(backupPath);

    // 创建备份元信息
    const meta: BackupMeta = {
      name: backupName,
      workspaceId,
      workspaceName,
      createdAt: new Date().toISOString(),
      trigger,
      codeVersion: this.getCurrentCodeVersion(),
      size: stats.size,
      verified,
    };

    // 更新元信息文件
    const metas = await this.readMeta(projectRoot, wsDirName);
    metas.push(meta);
    await this.writeMeta(projectRoot, wsDirName, metas);

    // 更新防抖时间戳
    if (trigger === "auto") {
      this.lastAutoBackup.set(workspaceId, Date.now());
    }

    // 轮转：超过最大数量时删除最旧的
    await this.rotateBackups(projectRoot, wsDirName);

    return meta;
  }

  /**
   * 轮转备份：删除超出数量限制的旧备份
   */
  private async rotateBackups(projectRoot: string, wsDirName: string): Promise<void> {
    const metas = await this.readMeta(projectRoot, wsDirName);

    if (metas.length <= BackupService.MAX_BACKUPS) {
      return;
    }

    // 按时间排序，保留最新的
    metas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const toDelete = metas.slice(BackupService.MAX_BACKUPS);
    const toKeep = metas.slice(0, BackupService.MAX_BACKUPS);

    // 删除旧备份文件
    const backupDir = this.getBackupDir(projectRoot, wsDirName);
    for (const meta of toDelete) {
      const filePath = path.join(backupDir, meta.name);
      try {
        await fs.unlink(filePath);
        console.log(`[backup] 轮转删除: ${meta.name}`);
      } catch {
        // 删除失败不阻止
      }
    }

    // 更新元信息
    await this.writeMeta(projectRoot, wsDirName, toKeep);
  }

  /**
   * 列出工作区备份
   */
  async listBackups(workspaceId: string): Promise<BackupListItem[]> {
    const wsEntry = await this.json.findWorkspaceEntry(workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    const { projectRoot, dirName } = wsEntry;
    const wsDirName = dirName || workspaceId;
    const backupDir = this.getBackupDir(projectRoot, wsDirName);

    const metas = await this.readMeta(projectRoot, wsDirName);

    // 添加完整路径
    return metas.map((meta) => ({
      ...meta,
      path: path.join(backupDir, meta.name),
    }));
  }

  /**
   * 恢复工作区备份
   * @param workspaceId 工作区 ID
   * @param backupName 备份文件名
   */
  async restoreBackup(workspaceId: string, backupName: string): Promise<void> {
    const wsEntry = await this.json.findWorkspaceEntry(workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    const { projectRoot, dirName } = wsEntry;
    const wsDirName = dirName || workspaceId;
    const backupDir = this.getBackupDir(projectRoot, wsDirName);
    const backupPath = path.join(backupDir, backupName);
    const workspacePath = this.fs.getWorkspacePath(projectRoot, wsDirName);

    // 验证备份文件存在
    if (!(await this.fs.exists(backupPath))) {
      throw new TanmiError("INVALID_PARAMS", `备份文件不存在: ${backupName}`);
    }

    // 恢复前先备份当前状态
    await this.createBackup(workspaceId, "pre_operation");

    // 清空工作区目录（保留 .backups）
    const entries = await fs.readdir(workspacePath);
    for (const entry of entries) {
      if (entry === BackupService.BACKUP_DIR) continue;
      const entryPath = path.join(workspacePath, entry);
      await fs.rm(entryPath, { recursive: true, force: true });
    }

    // 解压恢复
    try {
      await execAsync(`tar -xzf "${backupPath}" -C "${workspacePath}"`);
    } catch (e) {
      throw new TanmiError(
        "INVALID_PARAMS",
        `备份恢复失败: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  /**
   * 删除指定备份
   */
  async deleteBackup(workspaceId: string, backupName: string): Promise<void> {
    const wsEntry = await this.json.findWorkspaceEntry(workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }

    const { projectRoot, dirName } = wsEntry;
    const wsDirName = dirName || workspaceId;
    const backupDir = this.getBackupDir(projectRoot, wsDirName);
    const backupPath = path.join(backupDir, backupName);

    // 删除文件
    if (await this.fs.exists(backupPath)) {
      await fs.unlink(backupPath);
    }

    // 更新元信息
    const metas = await this.readMeta(projectRoot, wsDirName);
    const filtered = metas.filter((m) => m.name !== backupName);
    await this.writeMeta(projectRoot, wsDirName, filtered);
  }
}
