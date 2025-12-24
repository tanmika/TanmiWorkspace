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
    agents?: ComponentDetection;  // Claude Code 专有
    skills?: ComponentDetection;  // Claude Code 专有
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
  private claudeConfigPath: string;  // ~/.claude.json (MCP 配置所在)
  private claudeAgentsPath: string;
  private claudeSkillsPath: string;
  private cursorHooksPath: string;
  private cursorMcpPath: string;
  private tanmiScriptsPath: string;
  private tanmiSkillsSource: string;

  constructor() {
    const isDev = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
    const tanmiBaseDir = isDev ? ".tanmi-workspace-dev" : ".tanmi-workspace";

    this.claudeSettingsPath = path.join(os.homedir(), ".claude", "settings.json");
    this.claudeConfigPath = path.join(os.homedir(), ".claude.json");  // MCP 配置在这里
    this.claudeAgentsPath = path.join(os.homedir(), ".claude", "agents");
    this.claudeSkillsPath = path.join(os.homedir(), ".claude", "skills");
    this.cursorHooksPath = path.join(os.homedir(), ".cursor", "hooks.json");
    this.cursorMcpPath = path.join(os.homedir(), ".cursor", "mcp.json");
    this.tanmiScriptsPath = path.join(os.homedir(), tanmiBaseDir, "scripts");
    this.tanmiSkillsSource = path.join(os.homedir(), tanmiBaseDir, "templates", "skills");
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
        agents: { installed: false },
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

    } catch (err) {
      // 文件不存在或解析失败，返回未检测到
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("检测 Claude Code settings.json 失败:", err);
      }
    }

    // 检测 MCP（配置在 ~/.claude.json 中）
    try {
      const content = await fs.readFile(this.claudeConfigPath, "utf-8");
      const config = JSON.parse(content);
      if (config.mcpServers) {
        const mcpJson = JSON.stringify(config.mcpServers);
        if (mcpJson.includes("tanmi-workspace")) {
          result.components.mcp = { installed: true };
          result.detected = true;
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("检测 Claude Code .claude.json 失败:", err);
      }
    }

    // 检测 Agents（独立于 settings.json）
    try {
      const agentsDetected = await this.checkAgentsInstalled();
      if (agentsDetected) {
        result.components.agents = {
          installed: true,
          path: this.claudeAgentsPath,
        };
        result.detected = true;
      }
    } catch (err) {
      // agents 检测失败不影响其他组件
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("检测 Claude Code agents 失败:", err);
      }
    }

    // 检测 Skills（独立于 settings.json）
    try {
      const skillsDetected = await this.checkSkillsInstalled();
      if (skillsDetected) {
        result.components.skills = {
          installed: true,
          path: this.claudeSkillsPath,
        };
        result.detected = true;
      }
    } catch (err) {
      // skills 检测失败不影响其他组件
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("检测 Claude Code skills 失败:", err);
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

    // 检测 Hooks
    try {
      const content = await fs.readFile(this.cursorHooksPath, "utf-8");
      const config = JSON.parse(content);

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
    } catch (err) {
      // 文件不存在或解析失败
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("检测 Cursor Hooks 配置失败:", err);
      }
    }

    // 检测 MCP
    try {
      const content = await fs.readFile(this.cursorMcpPath, "utf-8");
      const config = JSON.parse(content);

      if (config.mcpServers) {
        const mcpJson = JSON.stringify(config.mcpServers);
        if (mcpJson.includes("tanmi-workspace")) {
          result.components.mcp = {
            installed: true,
            path: this.cursorMcpPath,
          };
          result.detected = true;
        }
      }
    } catch (err) {
      // 文件不存在或解析失败
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("检测 Cursor MCP 配置失败:", err);
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

  /**
   * 检查 TanmiWorkspace dispatch agents 是否已安装
   * 检测 ~/.claude/agents/ 下是否存在 tanmi-executor.md 和 tanmi-tester.md
   */
  async checkAgentsInstalled(): Promise<boolean> {
    const agentFiles = ["tanmi-executor.md", "tanmi-tester.md"];

    try {
      // 检查所有 agent 文件是否存在
      for (const agentFile of agentFiles) {
        const agentPath = path.join(this.claudeAgentsPath, agentFile);
        await fs.access(agentPath);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查 TanmiWorkspace skills 是否已安装
   * 检测 ~/.claude/skills/ 下是否存在任何 TanmiWorkspace 提供的 skill 文件
   * 由于 skills 目录可能为空（模板尚未创建），返回 false 表示未安装
   */
  async checkSkillsInstalled(): Promise<boolean> {
    try {
      // 检查 skills 目录是否存在
      await fs.access(this.claudeSkillsPath);

      // 读取目录内容，检查是否有 .md 文件
      const files = await fs.readdir(this.claudeSkillsPath);
      const skillFiles = files.filter(f => f.endsWith(".md"));

      // 只有存在 skill 文件时才认为已安装
      return skillFiles.length > 0;
    } catch {
      return false;
    }
  }
}
