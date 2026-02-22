// src/services/ConfigService.ts

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import type {
  GlobalConfig,
  ConfigGetResult,
  ConfigSetParams,
  ConfigSetResult,
  LogLevel,
} from "../types/settings.js";
import { DEFAULT_CONFIG, VALID_LOG_LEVELS, DEFAULT_LOG_LEVEL } from "../types/settings.js";
import { TanmiError } from "../types/errors.js";
import { logger } from "../utils/logger.js";

/** 期望的配置版本 */
const EXPECTED_CONFIG_VERSION = "1.0";

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

      // 验证版本 - 版本不匹配时备份并重置
      if (config.version !== EXPECTED_CONFIG_VERSION) {
        const backupPath = this.configPath.replace(".json", ".backup.json");

        logger.warn("ConfigService", {
          event: "config_version_mismatch",
          expected: EXPECTED_CONFIG_VERSION,
          actual: config.version,
          action: "backup_and_reset",
          backupPath,
        });

        // 备份原配置
        await fs.writeFile(backupPath, content, "utf-8");

        // 重置为默认配置
        const defaultConfig = { ...DEFAULT_CONFIG };
        await this.writeConfig(defaultConfig);

        return defaultConfig;
      }

      // 验证 defaultDispatchMode（兼容迁移旧值 "git" / "no-git"）
      const rawMode = config.defaultDispatchMode as string;
      if (!["none", "enabled"].includes(rawMode)) {
        // 迁移旧值: "git" 和 "no-git" 统一为 "enabled"
        if (rawMode === "git" || rawMode === "no-git") {
          config.defaultDispatchMode = "enabled";
          await this.writeConfig(config);
        } else {
          throw new TanmiError("INVALID_CONFIG", `无效的 defaultDispatchMode: ${rawMode}`);
        }
      }

      // 验证 logLevel，非法值使用默认值
      if (config.logLevel !== undefined && !VALID_LOG_LEVELS.includes(config.logLevel)) {
        config.logLevel = DEFAULT_LOG_LEVEL;
      }

      // 迁移：如果 logLevel 不存在，添加默认值并写回
      if (config.logLevel === undefined) {
        config.logLevel = DEFAULT_LOG_LEVEL;
        await this.writeConfig(config);
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
   * 支持外部 API 参数和内部 tutorial 参数
   */
  async updateConfig(partial: ConfigSetParams & {
    tutorialCreated?: boolean;
    tutorialVersion?: string;
  }): Promise<GlobalConfig> {
    const current = await this.readConfig();

    const updated: GlobalConfig = {
      ...current,
      ...(partial.defaultDispatchMode !== undefined && {
        defaultDispatchMode: partial.defaultDispatchMode,
      }),
      ...(partial.logLevel !== undefined && {
        logLevel: partial.logLevel,
      }),
      ...(partial.security !== undefined && {
        security: {
          ...current.security,
          ...partial.security,
        },
      }),
      ...(partial.tutorialCreated !== undefined && {
        tutorialCreated: partial.tutorialCreated,
      }),
      ...(partial.tutorialVersion !== undefined && {
        tutorialVersion: partial.tutorialVersion,
      }),
    };

    await this.writeConfig(updated);
    return updated;
  }

  /**
   * 获取默认派发模式
   */
  async getDefaultDispatchMode(): Promise<"none" | "enabled"> {
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
