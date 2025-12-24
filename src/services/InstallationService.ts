// src/services/InstallationService.ts

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  InstallationMeta,
  PlatformType,
  PlatformInstallation,
  ComponentInfo,
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
      // 优先使用 npm 环境变量
      if (process.env.npm_package_version) {
        return process.env.npm_package_version;
      }

      // 从 package.json 读取（支持直接 node 运行）
      // import.meta.url 指向 dist/services/InstallationService.js
      // package.json 在 ../../package.json
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const pkgPath = path.join(__dirname, "..", "..", "package.json");
      const pkgContent = readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgContent);
      return pkg.version || "0.0.0";
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
      components: {
        hooks: this.mergeComponent(existing?.components?.hooks, info.components?.hooks),
        mcp: this.mergeComponent(existing?.components?.mcp, info.components?.mcp),
        ...(platform === "claudeCode" && {
          agents: this.mergeComponent(existing?.components?.agents, info.components?.agents),
          skills: this.mergeComponent(existing?.components?.skills, info.components?.skills),
        }),
        ...(platform === "codex" && {
          agentsMd: this.mergeComponent(existing?.components?.agentsMd, info.components?.agentsMd),
        }),
        ...(platform === "cursor" && {
          modes: this.mergeComponent(existing?.components?.modes, info.components?.modes),
        }),
      },
    };

    await this.write(meta);
    return meta;
  }

  /**
   * 合并组件信息
   */
  private mergeComponent(
    existing: ComponentInfo | undefined,
    update: ComponentInfo | undefined
  ): ComponentInfo {
    if (!update) {
      return existing ?? { installed: false };
    }
    return {
      installed: update.installed,
      version: update.installed ? (update.version ?? this.packageVersion) : undefined,
    };
  }

  /**
   * 更新单个组件
   */
  async updateComponent(
    platform: PlatformType,
    component: string,
    installed: boolean,
    version?: string
  ): Promise<InstallationMeta> {
    const meta = await this.read();
    const now = new Date().toISOString();

    // 确保平台存在
    if (!meta.global.platforms[platform]) {
      meta.global.platforms[platform] = {
        enabled: true,
        installedAt: now,
        components: {
          hooks: { installed: false },
          mcp: { installed: false },
        },
      };
    }

    const platformInfo = meta.global.platforms[platform]!;
    (platformInfo.components as Record<string, ComponentInfo>)[component] = {
      installed,
      version: installed ? (version ?? this.packageVersion) : undefined,
    };

    // 检查是否所有组件都未安装
    const allDisabled = Object.values(platformInfo.components).every(
      (c) => !(c as ComponentInfo).installed
    );
    platformInfo.enabled = !allDisabled;

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
   * 检查平台组件版本
   * 返回需要更新的组件列表
   */
  async checkComponentUpdates(platform: PlatformType): Promise<Array<{
    component: string;
    installedVersion: string;
    currentVersion: string;
  }>> {
    const platformInfo = await this.getPlatform(platform);
    if (!platformInfo) {
      return [];
    }

    const outdated: Array<{
      component: string;
      installedVersion: string;
      currentVersion: string;
    }> = [];

    for (const [name, info] of Object.entries(platformInfo.components)) {
      const componentInfo = info as ComponentInfo;
      if (componentInfo.installed && componentInfo.version && componentInfo.version !== this.packageVersion) {
        outdated.push({
          component: name,
          installedVersion: componentInfo.version,
          currentVersion: this.packageVersion,
        });
      }
    }

    return outdated;
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
