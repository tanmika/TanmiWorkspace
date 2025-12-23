// src/services/DetectionService.ts

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import type { PlatformType } from "../types/settings.js";

/**
 * 组件检测结果
 */
export interface ComponentDetection {
  installed: boolean;
  path?: string;
}

/**
 * 平台检测结果
 */
export interface DetectionResult {
  platform: PlatformType;
  detected: boolean;
  components: {
    hooks: ComponentDetection;
    mcp: ComponentDetection;
  };
}

/**
 * 所有平台检测结果
 */
export interface AllDetectionResults {
  claudeCode?: DetectionResult;
  cursor?: DetectionResult;
  codex?: DetectionResult;
}

/**
 * 检测服务
 * 检测各平台的 TanmiWorkspace 组件安装状态
 */
export class DetectionService {
  private claudeSettingsPath: string;
  private cursorHooksPath: string;
  private tanmiScriptsPath: string;

  constructor() {
    const isDev = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
    const tanmiBaseDir = isDev ? ".tanmi-workspace-dev" : ".tanmi-workspace";

    this.claudeSettingsPath = path.join(os.homedir(), ".claude", "settings.json");
    this.cursorHooksPath = path.join(os.homedir(), ".cursor", "hooks.json");
    this.tanmiScriptsPath = path.join(os.homedir(), tanmiBaseDir, "scripts");
  }

  /**
   * 检测 Claude Code 组件安装状态
   */
  async detectClaudeCode(): Promise<DetectionResult> {
    const result: DetectionResult = {
      platform: "claudeCode",
      detected: false,
      components: {
        hooks: { installed: false },
        mcp: { installed: false },
      },
    };

    try {
      const content = await fs.readFile(this.claudeSettingsPath, "utf-8");
      const settings = JSON.parse(content);

      // 检测 Hooks
      if (settings.hooks) {
        const hooksJson = JSON.stringify(settings.hooks);
        // 检查是否包含 tanmi-workspace 相关脚本
        if (hooksJson.includes("tanmi-workspace") || hooksJson.includes("hook-entry.cjs")) {
          result.components.hooks = {
            installed: true,
            path: path.join(this.tanmiScriptsPath, "hook-entry.cjs"),
          };
          result.detected = true;
        }
      }

      // 检测 MCP
      if (settings.mcpServers) {
        // 检查是否有 tanmi-workspace 相关的 MCP 服务器
        const mcpJson = JSON.stringify(settings.mcpServers);
        if (mcpJson.includes("tanmi-workspace")) {
          result.components.mcp = { installed: true };
          result.detected = true;
        }
      }
    } catch (err) {
      // 文件不存在或解析失败，返回未检测到
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("检测 Claude Code 配置失败:", err);
      }
    }

    return result;
  }

  /**
   * 检测 Cursor 组件安装状态
   */
  async detectCursor(): Promise<DetectionResult> {
    const result: DetectionResult = {
      platform: "cursor",
      detected: false,
      components: {
        hooks: { installed: false },
        mcp: { installed: false },
      },
    };

    try {
      const content = await fs.readFile(this.cursorHooksPath, "utf-8");
      const config = JSON.parse(content);

      // 检测 Hooks
      if (config.hooks) {
        const hooksJson = JSON.stringify(config.hooks);
        // 检查是否包含 tanmi-workspace 相关脚本
        if (hooksJson.includes("tanmi-workspace") || hooksJson.includes("cursor-hook-entry.cjs")) {
          result.components.hooks = {
            installed: true,
            path: path.join(this.tanmiScriptsPath, "cursor-hook-entry.cjs"),
          };
          result.detected = true;
        }
      }

      // Cursor MCP 通过 GUI 配置，暂不检测
    } catch (err) {
      // 文件不存在或解析失败，返回未检测到
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("检测 Cursor 配置失败:", err);
      }
    }

    return result;
  }

  /**
   * 检测 Codex 组件安装状态（预留）
   */
  async detectCodex(): Promise<DetectionResult> {
    // Codex 检测暂未实现，返回未检测到
    return {
      platform: "codex",
      detected: false,
      components: {
        hooks: { installed: false },
        mcp: { installed: false },
      },
    };
  }

  /**
   * 检测所有平台
   */
  async detectAll(): Promise<AllDetectionResults> {
    const [claudeCode, cursor, codex] = await Promise.all([
      this.detectClaudeCode(),
      this.detectCursor(),
      this.detectCodex(),
    ]);

    const results: AllDetectionResults = {};

    if (claudeCode.detected) {
      results.claudeCode = claudeCode;
    }
    if (cursor.detected) {
      results.cursor = cursor;
    }
    if (codex.detected) {
      results.codex = codex;
    }

    return results;
  }

  /**
   * 检查 Hook 脚本文件是否存在
   */
  async checkHookScriptExists(platform: PlatformType): Promise<boolean> {
    const scriptName = platform === "cursor" ? "cursor-hook-entry.cjs" : "hook-entry.cjs";
    const scriptPath = path.join(this.tanmiScriptsPath, scriptName);

    try {
      await fs.access(scriptPath);
      return true;
    } catch {
      return false;
    }
  }
}
