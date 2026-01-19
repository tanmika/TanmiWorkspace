// src/services/BackupService.ts

import * as path from "node:path";
import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";
import { createHash } from "node:crypto";
import { createWriteStream, createReadStream } from "node:fs";
import archiver from "archiver";
import AdmZip from "adm-zip";
import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type {
  BackupMeta,
  BackupListItem,
  GlobalBackupTrigger,
  GlobalBackupManifest,
  GlobalBackupItem,
} from "../types/health.js";
import { TanmiError } from "../types/errors.js";
import { devLog } from "../utils/devLog.js";

/**
 * 安全执行 tar 命令（避免命令注入）
 * 使用 spawn 而非 exec，路径作为参数传递而非字符串拼接
 */
function spawnTar(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (data) => { stderr += data.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `tar exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

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
    } catch (error) {
      // 元数据解析失败：用户层面无感知，但可能导致备份列表丢失
      devLog.warn("[BackupService] 备份元数据解析失败，返回空列表", { metaPath, error: error instanceof Error ? error.message : String(error) });
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
    // 使用 spawn 参数数组避免命令注入风险
    try {
      await spawnTar(["-czf", backupPath, "--exclude=.backups", "-C", workspacePath, "."]);
    } catch (e) {
      throw new TanmiError(
        "INVALID_PARAMS",
        `备份创建失败: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    // 验证备份
    let verified = false;
    try {
      await spawnTar(["-tzf", backupPath]);
      verified = true;
    } catch (error) {
      // 验证失败，记录但不阻止（双重打印：console 供用户快速排查，devLog 供后台日志）
      const errMsg = `[backup] 备份验证失败: ${backupPath}`;
      console.error(errMsg);
      devLog.warn(errMsg, { error: error instanceof Error ? error.message : String(error) });
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
        devLog.debug("[BackupService] 轮转删除成功", { backupName: meta.name });
      } catch (error) {
        // 删除失败不阻止，但记录日志
        devLog.warn("[BackupService] 轮转删除失败", { backupName: meta.name, filePath, error: error instanceof Error ? error.message : String(error) });
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

    // 解压恢复（使用 spawn 参数数组避免命令注入风险）
    try {
      await spawnTar(["-xzf", backupPath, "-C", workspacePath]);
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

  // ========== 全局备份方法 ==========

  private static readonly GLOBAL_BACKUP_DIR = "backups";
  private static readonly GLOBAL_BACKUP_FILES = [
    "index.json",
    "config.json",
    "installation-meta.json",
  ];

  /**
   * 获取全局备份目录路径
   */
  private getGlobalBackupDir(): string {
    return path.join(this.fs.getGlobalBasePath(), BackupService.GLOBAL_BACKUP_DIR);
  }

  /**
   * 生成全局备份文件名
   */
  private generateGlobalBackupName(): string {
    // ISO 时间戳，替换不安全字符
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\./g, "-");
    return `tanmi-backup-${timestamp}.twbak`;
  }

  /**
   * 计算文件内容的 SHA256 校验和
   */
  private async calculateChecksum(filePaths: string[]): Promise<string> {
    const hash = createHash("sha256");

    for (const filePath of filePaths.sort()) {
      try {
        const content = await fs.readFile(filePath);
        hash.update(content);
      } catch {
        // 文件不存在时跳过，但记录日志
        devLog.debug("[BackupService] checksum 跳过不存在的文件", { filePath });
      }
    }

    return hash.digest("hex");
  }

  /**
   * 创建全局备份
   * @param trigger 触发类型
   * @returns 备份信息
   */
  async createGlobalBackup(trigger: GlobalBackupTrigger): Promise<GlobalBackupItem> {
    devLog.debug("[BackupService] createGlobalBackup 开始", { trigger });

    const globalBasePath = this.fs.getGlobalBasePath();
    const backupDir = this.getGlobalBackupDir();

    // 确保备份目录存在
    await this.fs.ensureDir(backupDir);
    devLog.debug("[BackupService] 备份目录已确保存在", { backupDir });

    // 收集要备份的文件
    const filesToBackup: { name: string; path: string }[] = [];
    for (const fileName of BackupService.GLOBAL_BACKUP_FILES) {
      const filePath = path.join(globalBasePath, fileName);
      if (await this.fs.exists(filePath)) {
        filesToBackup.push({ name: fileName, path: filePath });
      }
    }

    if (filesToBackup.length === 0) {
      throw new TanmiError("INVALID_PARAMS", "没有可备份的文件");
    }

    devLog.debug("[BackupService] 找到待备份文件", { count: filesToBackup.length });

    // 计算 checksum（备份前的源文件）
    const checksum = await this.calculateChecksum(filesToBackup.map((f) => f.path));
    devLog.debug("[BackupService] checksum 计算完成", { checksum: checksum.substring(0, 16) });

    // 读取 index.json 获取工作区数量
    let workspaceCount = 0;
    const indexPath = path.join(globalBasePath, "index.json");
    if (await this.fs.exists(indexPath)) {
      try {
        const indexContent = await this.fs.readFile(indexPath);
        const indexData = JSON.parse(indexContent) as { workspaces?: unknown[] };
        workspaceCount = indexData.workspaces?.length ?? 0;
      } catch {
        // 解析失败时保持为 0
      }
    }

    // 创建 manifest
    const manifest: GlobalBackupManifest = {
      format: "twbak",
      version: "1.0",
      createdAt: new Date().toISOString(),
      codeVersion: this.getCurrentCodeVersion(),
      trigger,
      checksum,
      contents: {
        workspaceCount,
      },
    };

    // 生成备份文件名和路径
    const backupName = this.generateGlobalBackupName();
    const backupPath = path.join(backupDir, backupName);
    devLog.debug("[BackupService] 备份文件路径", { backupPath });

    // 创建 zip 包
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(backupPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        devLog.debug("[BackupService] 压缩完成", { size: archive.pointer() });
        resolve();
      });

      archive.on("error", (err) => {
        devLog.error("[BackupService] 压缩失败", err);
        reject(err);
      });

      archive.pipe(output);

      // 添加 manifest.json
      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

      // 添加备份文件
      for (const file of filesToBackup) {
        archive.file(file.path, { name: file.name });
      }

      archive.finalize();
    });

    // 获取文件大小
    const stats = await fs.stat(backupPath);

    const result: GlobalBackupItem = {
      name: backupName,
      path: backupPath,
      createdAt: manifest.createdAt,
      codeVersion: manifest.codeVersion,
      trigger,
      size: stats.size,
    };

    devLog.debug("[BackupService] 全局备份创建成功", { backupName });
    return result;
  }

  /**
   * 列出全局备份
   * @returns 备份列表，按时间倒序
   */
  async listGlobalBackups(): Promise<GlobalBackupItem[]> {
    devLog.debug("[BackupService] listGlobalBackups 开始扫描全局备份");

    const backupDir = this.getGlobalBackupDir();

    // 检查备份目录是否存在
    if (!(await this.fs.exists(backupDir))) {
      devLog.debug("[BackupService] 备份目录不存在", { backupDir });
      return [];
    }

    // 扫描 .twbak 文件
    const entries = await fs.readdir(backupDir);
    const backupFiles = entries.filter((e) => e.endsWith(".twbak"));
    devLog.debug("[BackupService] 找到备份文件", { count: backupFiles.length });

    const backups: GlobalBackupItem[] = [];

    for (const fileName of backupFiles) {
      const filePath = path.join(backupDir, fileName);

      try {
        // 读取 manifest
        const zip = new AdmZip(filePath);
        const manifestEntry = zip.getEntry("manifest.json");

        if (!manifestEntry) {
          devLog.warn("[BackupService] 备份文件缺少 manifest", { fileName });
          continue;
        }

        const manifestContent = manifestEntry.getData().toString("utf-8");
        const manifest = JSON.parse(manifestContent) as GlobalBackupManifest;

        // 获取文件大小
        const stats = await fs.stat(filePath);

        backups.push({
          name: fileName,
          path: filePath,
          createdAt: manifest.createdAt,
          codeVersion: manifest.codeVersion,
          trigger: manifest.trigger,
          size: stats.size,
        });
      } catch (err) {
        devLog.warn("[BackupService] 读取备份文件失败", { fileName, error: String(err) });
        // 跳过损坏的备份文件
      }
    }

    // 按时间倒序排序
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    devLog.debug("[BackupService] 返回有效备份", { count: backups.length });
    return backups;
  }

  /**
   * 恢复全局备份
   * @param backupPath 备份文件完整路径
   * @returns 恢复前自动创建的 pre_restore 备份信息
   */
  async restoreGlobalBackup(backupPath: string): Promise<GlobalBackupItem> {
    devLog.debug("[BackupService] 开始恢复全局备份", { backupPath });

    // 验证备份文件存在
    if (!(await this.fs.exists(backupPath))) {
      throw new TanmiError("INVALID_PARAMS", "备份文件不存在");
    }

    // 验证文件扩展名
    if (!backupPath.endsWith(".twbak")) {
      throw new TanmiError("INVALID_PARAMS", "无效的 .twbak 格式");
    }

    // 读取并验证 manifest
    let zip: AdmZip;
    let manifest: GlobalBackupManifest;

    try {
      zip = new AdmZip(backupPath);
      const manifestEntry = zip.getEntry("manifest.json");

      if (!manifestEntry) {
        throw new TanmiError("INVALID_PARAMS", "无效的 .twbak 格式：缺少 manifest.json");
      }

      const manifestContent = manifestEntry.getData().toString("utf-8");
      manifest = JSON.parse(manifestContent) as GlobalBackupManifest;
      devLog.debug("[BackupService] manifest 解析成功", { version: manifest.version });
    } catch (err) {
      if (err instanceof TanmiError) throw err;
      throw new TanmiError("INVALID_PARAMS", `无效的 .twbak 格式：${err instanceof Error ? err.message : String(err)}`);
    }

    // 提取文件到临时目录验证 checksum
    const globalBasePath = this.fs.getGlobalBasePath();
    const tempDir = path.join(globalBasePath, ".restore-temp");

    try {
      // 清理并创建临时目录
      if (await this.fs.exists(tempDir)) {
        await this.fs.remove(tempDir);
      }
      await this.fs.ensureDir(tempDir);

      // 提取文件到临时目录
      for (const fileName of BackupService.GLOBAL_BACKUP_FILES) {
        const entry = zip.getEntry(fileName);
        if (entry) {
          const content = entry.getData();
          await fs.writeFile(path.join(tempDir, fileName), content);
        }
      }

      // 验证 checksum（calculateChecksum 内部会跳过不存在的文件）
      const actualChecksum = await this.calculateChecksum(
        BackupService.GLOBAL_BACKUP_FILES.map((f) => path.join(tempDir, f))
      );

      if (actualChecksum !== manifest.checksum) {
        devLog.error("[BackupService] checksum 不匹配", undefined, { expected: manifest.checksum.substring(0, 16), actual: actualChecksum.substring(0, 16) });
        throw new TanmiError("INVALID_PARAMS", "备份文件损坏或被篡改");
      }

      devLog.debug("[BackupService] checksum 验证通过");

      // 自动备份当前状态
      devLog.debug("[BackupService] 恢复前自动备份当前状态");
      const preRestoreBackup = await this.createGlobalBackup("pre_restore");

      // 覆盖目标文件
      for (const fileName of BackupService.GLOBAL_BACKUP_FILES) {
        const tempFilePath = path.join(tempDir, fileName);
        const targetFilePath = path.join(globalBasePath, fileName);

        if (await this.fs.exists(tempFilePath)) {
          const content = await fs.readFile(tempFilePath, "utf-8");
          await this.fs.writeFile(targetFilePath, content);
          devLog.debug("[BackupService] 已恢复文件", { fileName });
        }
      }

      devLog.debug("[BackupService] 全局备份恢复成功");

      return preRestoreBackup;
    } finally {
      // 清理临时目录
      if (await this.fs.exists(tempDir)) {
        try {
          await this.fs.remove(tempDir);
        } catch (err) {
          devLog.warn("[BackupService] 清理临时目录失败", { tempDir, error: String(err) });
        }
      }
    }
  }

  /**
   * 删除全局备份
   * @param backupName 备份文件名
   */
  async deleteGlobalBackup(backupName: string): Promise<void> {
    devLog.debug("[BackupService] 删除全局备份", { backupName });

    const backupDir = this.getGlobalBackupDir();
    const backupPath = path.join(backupDir, backupName);

    // 验证文件存在
    if (!(await this.fs.exists(backupPath))) {
      throw new TanmiError("INVALID_PARAMS", "备份文件不存在");
    }

    // 删除文件
    await fs.unlink(backupPath);
    devLog.debug("[BackupService] 全局备份已删除", { backupName });
  }
}
