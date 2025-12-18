// src/services/ConfigService.ts

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import type {
  GlobalConfig,
  ConfigGetResult,
  ConfigSetParams,
  ConfigSetResult,
} from "../types/settings.js";
import { DEFAULT_CONFIG } from "../types/settings.js";
import { TanmiError } from "../types/errors.js";

/**
 * 配置服务
 * 管理全局配置文件 ~/.tanmi-workspace/config.json
 */
export class ConfigService {
  private configPath: string;

  constructor() {
    const isDev = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
    const baseDir = isDev ? ".tanmi-workspace-dev" : ".tanmi-workspace";
    this.configPath = path.join(os.homedir(), baseDir, "config.json");
  }

  /**
   * 读取全局配置
   * 如果文件不存在，返回默认配置
   */
  async readConfig(): Promise<GlobalConfig> {
    try {
      const content = await fs.readFile(this.configPath, "utf-8");
      const config = JSON.parse(content) as GlobalConfig;

      // 验证版本
      if (config.version !== "1.0") {
        throw new TanmiError("INVALID_CONFIG", `不支持的配置版本: ${config.version}`);
      }

      // 验证 defaultDispatchMode
      if (!["none", "git", "no-git"].includes(config.defaultDispatchMode)) {
        throw new TanmiError("INVALID_CONFIG", `无效的 defaultDispatchMode: ${config.defaultDispatchMode}`);
      }

      return config;
    } catch (err) {
      // 文件不存在时返回默认配置
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { ...DEFAULT_CONFIG };
      }
      throw err;
    }
  }

  /**
   * 写入全局配置
   */
  async writeConfig(config: GlobalConfig): Promise<void> {
    // 确保目录存在
    const configDir = path.dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });

    // 写入配置文件
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  /**
   * 更新全局配置（部分更新）
   */
  async updateConfig(partial: ConfigSetParams): Promise<GlobalConfig> {
    const current = await this.readConfig();

    const updated: GlobalConfig = {
      ...current,
      ...(partial.defaultDispatchMode !== undefined && {
        defaultDispatchMode: partial.defaultDispatchMode,
      }),
    };

    await this.writeConfig(updated);
    return updated;
  }

  /**
   * 获取默认派发模式
   */
  async getDefaultDispatchMode(): Promise<"none" | "git" | "no-git"> {
    const config = await this.readConfig();
    return config.defaultDispatchMode;
  }

  /**
   * MCP 工具：获取全局配置
   */
  async get(): Promise<ConfigGetResult> {
    const config = await this.readConfig();
    return { config };
  }

  /**
   * MCP 工具：设置全局配置
   */
  async set(params: ConfigSetParams): Promise<ConfigSetResult> {
    const config = await this.updateConfig(params);
    return {
      success: true,
      config,
    };
  }
}
