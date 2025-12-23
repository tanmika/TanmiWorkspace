// src/services/InstallationService.ts

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import type {
  InstallationMeta,
  PlatformType,
  PlatformInstallation,
  ProjectInstallation,
} from "../types/settings.js";
import { DEFAULT_INSTALLATION_META } from "../types/settings.js";

/**
 * 安装服务
 * 管理安装元信息文件 ~/.tanmi-workspace/installation-meta.json
 * 用于跟踪各平台组件的安装状态和版本
 */
export class InstallationService {
  private metaPath: string;
  private packageVersion: string;

  constructor() {
    const isDev = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
    const baseDir = isDev ? ".tanmi-workspace-dev" : ".tanmi-workspace";
    this.metaPath = path.join(os.homedir(), baseDir, "installation-meta.json");
    this.packageVersion = this.loadPackageVersion();
  }

  /**
   * 获取包版本号
   */
  private loadPackageVersion(): string {
    try {
      // 在运行时动态获取版本，避免硬编码
      // 实际版本通过 npm/node 环境变量或 package.json 读取
      return process.env.npm_package_version || "0.0.0";
    } catch {
      return "0.0.0";
    }
  }

  /**
   * 获取元信息文件路径
   */
  getPath(): string {
    return this.metaPath;
  }

  /**
   * 获取当前包版本
   */
  getPackageVersion(): string {
    return this.packageVersion;
  }

  /**
   * 读取安装元信息
   * 如果文件不存在，返回默认结构
   */
  async read(): Promise<InstallationMeta> {
    try {
      const content = await fs.readFile(this.metaPath, "utf-8");
      const meta = JSON.parse(content) as InstallationMeta;

      // 版本迁移（如果需要）
      if (meta.schemaVersion !== "1.0") {
        // 未来可在此处理版本迁移
        meta.schemaVersion = "1.0";
      }

      return meta;
    } catch (err) {
      // 文件不存在时返回默认结构
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return this.createDefaultMeta();
      }
      throw err;
    }
  }

  /**
   * 写入安装元信息
   */
  async write(meta: InstallationMeta): Promise<void> {
    // 确保目录存在
    const metaDir = path.dirname(this.metaPath);
    await fs.mkdir(metaDir, { recursive: true });

    // 更新时间戳
    meta.global.lastUpdatedAt = new Date().toISOString();

    // 写入文件
    await fs.writeFile(this.metaPath, JSON.stringify(meta, null, 2), "utf-8");
  }

  /**
   * 更新指定平台的安装信息
   */
  async updatePlatform(
    platform: PlatformType,
    info: Partial<PlatformInstallation>
  ): Promise<InstallationMeta> {
    const meta = await this.read();
    const now = new Date().toISOString();

    const existing = meta.global.platforms[platform];
    meta.global.platforms[platform] = {
      enabled: info.enabled ?? existing?.enabled ?? true,
      installedAt: existing?.installedAt ?? now,
      version: info.version ?? this.packageVersion,
      components: {
        hooks: info.components?.hooks ?? existing?.components?.hooks ?? false,
        mcp: info.components?.mcp ?? existing?.components?.mcp ?? false,
        ...(platform === "codex" && {
          agentsMd: info.components?.agentsMd ?? existing?.components?.agentsMd ?? false,
        }),
        ...(platform === "cursor" && {
          modes: info.components?.modes ?? existing?.components?.modes ?? false,
        }),
      },
    };

    await this.write(meta);
    return meta;
  }

  /**
   * 更新项目组件安装信息
   */
  async updateProject(
    projectPath: string,
    info: Partial<ProjectInstallation>
  ): Promise<InstallationMeta> {
    const meta = await this.read();
    const now = new Date().toISOString();

    if (!meta.projects) {
      meta.projects = {};
    }

    const existing = meta.projects[projectPath];
    meta.projects[projectPath] = {
      installedAt: existing?.installedAt ?? now,
      version: info.version ?? this.packageVersion,
      agents: info.agents ?? existing?.agents ?? false,
      skills: info.skills ?? existing?.skills ?? false,
    };

    await this.write(meta);
    return meta;
  }

  /**
   * 获取指定平台的安装信息
   */
  async getPlatform(platform: PlatformType): Promise<PlatformInstallation | undefined> {
    const meta = await this.read();
    return meta.global.platforms[platform];
  }

  /**
   * 获取指定项目的安装信息
   */
  async getProject(projectPath: string): Promise<ProjectInstallation | undefined> {
    const meta = await this.read();
    return meta.projects?.[projectPath];
  }

  /**
   * 检查平台是否需要更新
   * 比较已安装版本与当前包版本
   */
  async checkPlatformUpdate(platform: PlatformType): Promise<{
    needsUpdate: boolean;
    installedVersion: string | null;
    currentVersion: string;
  }> {
    const platformInfo = await this.getPlatform(platform);
    const installedVersion = platformInfo?.version ?? null;

    return {
      needsUpdate: installedVersion !== null && installedVersion !== this.packageVersion,
      installedVersion,
      currentVersion: this.packageVersion,
    };
  }

  /**
   * 检查项目组件是否需要更新
   * 比较已安装版本与当前包版本
   */
  async checkProjectUpdate(projectPath: string): Promise<{
    needsUpdate: boolean;
    installedVersion: string | null;
    currentVersion: string;
    hasAgents: boolean;
    hasSkills: boolean;
  }> {
    const projectInfo = await this.getProject(projectPath);
    const installedVersion = projectInfo?.version ?? null;

    return {
      needsUpdate: installedVersion !== null && installedVersion !== this.packageVersion,
      installedVersion,
      currentVersion: this.packageVersion,
      hasAgents: projectInfo?.agents ?? false,
      hasSkills: projectInfo?.skills ?? false,
    };
  }

  /**
   * 创建默认的元信息结构
   */
  private createDefaultMeta(): InstallationMeta {
    const now = new Date().toISOString();
    return {
      ...DEFAULT_INSTALLATION_META,
      global: {
        installedAt: now,
        lastUpdatedAt: now,
        packageVersion: this.packageVersion,
        platforms: {},
      },
    };
  }
}
