#!/usr/bin/env node
/**
 * tanmi-workspace setup 命令
 * 交互式配置向导，帮助用户快速配置 TanmiWorkspace
 */

import { select } from "@inquirer/prompts";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { execSync, exec } from "child_process";
import { promisify } from "util";
import {
  installClaudeAll,
  installCursorAll,
  installOpenCodeAll,
  installCodexAll,
  updateInstallationMeta,
  getPluginStatus,
} from "./plugins.js";
import { fileURLToPath } from "url";


// ES module 兼容：获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execAsync = promisify(exec);

// 路径配置
const HOME = homedir();
const CLAUDE_HOME = join(HOME, ".claude");
const CLAUDE_JSON = join(HOME, ".claude.json"); // MCP 配置
const CLAUDE_SETTINGS_LOCAL = join(CLAUDE_HOME, "settings.local.json"); // 权限配置
const CURSOR_HOME = join(HOME, ".cursor");
const CURSOR_MCP = join(CURSOR_HOME, "mcp.json");
const OPENCODE_HOME = join(HOME, ".config", "opencode");
const OPENCODE_CONFIG = join(OPENCODE_HOME, "opencode.json");
const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
const TANMI_BASE = IS_DEV ? ".tanmi-workspace-dev" : ".tanmi-workspace";
const TANMI_SCRIPTS = join(HOME, TANMI_BASE, "scripts");


// 颜色输出
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// 获取包版本
function getPackageVersion(): string {
  try {
    // __dirname = dist/cli/, 所以需要 ../../ 到项目根目录
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}



// 检测环境
interface Environment {
  nodeVersion: string;
  currentVersion: string;  // 当前 package 版本
  claudeCode: {
    installed: boolean;
    cliAvailable: boolean;
    mcpConfigured: boolean;
    permissionConfigured: boolean;
    hookInstalled: boolean;
    hookNeedsUpdate?: boolean;
    agentsInstalled: number;  // 已安装 Agent 数量
    agentsNeedsUpdate?: boolean;
    skillsInstalled: number;  // 已安装 Skill 数量
    skillsNeedsUpdate?: boolean;
  };
  cursor: {
    installed: boolean;
    mcpConfigured: boolean;
    hookInstalled: boolean;
    hookNeedsUpdate?: boolean;
    agentsInstalled: number;  // 已安装 Agent 数量
    agentsNeedsUpdate?: boolean;
    skillsInstalled: number;  // 已安装 Skill 数量
    skillsNeedsUpdate?: boolean;
  };
  opencode: {
    installed: boolean;
    mcpConfigured: boolean;
    pluginInstalled: boolean;
    pluginNeedsUpdate?: boolean;
    agentsInstalled: number;
    agentsNeedsUpdate?: boolean;
    skillsInstalled: number;
    skillsNeedsUpdate?: boolean;
  };
  codex: {
    installed: boolean;
    mcpConfigured: boolean;
    mcpNeedsUpdate?: boolean;
    skillsInstalled: number;
    skillsNeedsUpdate?: boolean;
    instructionsInstalled: boolean;
    instructionsNeedsUpdate?: boolean;
  };
}

async function detectEnvironment(): Promise<Environment> {
  // 检测 Claude CLI
  let claudeCliAvailable = false;
  try {
    execSync("claude --version", { stdio: "ignore" });
    claudeCliAvailable = true;
  } catch {
    // Claude CLI 不可用
  }

  // 检测 Claude MCP 配置 - 从 ~/.claude.json 读取
  let claudeMcpConfigured = false;
  if (existsSync(CLAUDE_JSON)) {
    try {
      const claudeJson = JSON.parse(readFileSync(CLAUDE_JSON, "utf-8"));
      if (claudeJson.mcpServers?.["tanmi-workspace"]) {
        claudeMcpConfigured = true;
      }
    } catch {
      // 解析失败
    }
  }

  // 检测 Claude 权限配置 - 从 ~/.claude/settings.local.json 读取
  let claudePermissionConfigured = false;
  if (existsSync(CLAUDE_SETTINGS_LOCAL)) {
    try {
      const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_LOCAL, "utf-8"));
      // 检查是否有服务器级权限 mcp__tanmi-workspace
      if (settings.permissions?.allow?.some((p: string) =>
        p === "mcp__tanmi-workspace"
      )) {
        claudePermissionConfigured = true;
      }
    } catch {
      // 解析失败
    }
  }

  // 检测 Cursor MCP 配置
  let cursorMcpConfigured = false;
  if (existsSync(CURSOR_MCP)) {
    try {
      const mcp = JSON.parse(readFileSync(CURSOR_MCP, "utf-8"));
      if (mcp.mcpServers?.["tanmi-workspace"]) {
        cursorMcpConfigured = true;
      }
    } catch {
      // 解析失败
    }
  }

  // 检测 OpenCode MCP 配置
  let opencodeMcpConfigured = false;
  if (existsSync(OPENCODE_CONFIG)) {
    try {
      const config = JSON.parse(readFileSync(OPENCODE_CONFIG, "utf-8"));
      // OpenCode 使用 mcp 字段而非 mcpServers
      if (config.mcp?.["tanmi-workspace"]) {
        opencodeMcpConfigured = true;
      }
    } catch {
      // 解析失败
    }
  }

  // 检测插件安装状态
  const pluginStatus = getPluginStatus();

  const codexHome = join(HOME, ".codex");

  return {
    nodeVersion: process.versions.node,
    currentVersion: pluginStatus.currentVersion,
    claudeCode: {
      installed: existsSync(CLAUDE_HOME),
      cliAvailable: claudeCliAvailable,
      mcpConfigured: claudeMcpConfigured,
      permissionConfigured: claudePermissionConfigured,
      hookInstalled: pluginStatus.claude.hooks,
      hookNeedsUpdate: pluginStatus.claude.hooksNeedsUpdate,
      agentsInstalled: pluginStatus.claude.agents.length,
      agentsNeedsUpdate: pluginStatus.claude.agentsNeedsUpdate,
      skillsInstalled: pluginStatus.claude.skills.length,
      skillsNeedsUpdate: pluginStatus.claude.skillsNeedsUpdate,
    },
    cursor: {
      installed: existsSync(CURSOR_HOME),
      mcpConfigured: cursorMcpConfigured,
      hookInstalled: pluginStatus.cursor.hooks,
      hookNeedsUpdate: pluginStatus.cursor.hooksNeedsUpdate,
      agentsInstalled: pluginStatus.cursor.agents.length,
      agentsNeedsUpdate: pluginStatus.cursor.agentsNeedsUpdate,
      skillsInstalled: pluginStatus.cursor.skills.length,
      skillsNeedsUpdate: pluginStatus.cursor.skillsNeedsUpdate,
    },
    opencode: {
      installed: existsSync(OPENCODE_HOME),
      mcpConfigured: opencodeMcpConfigured,
      pluginInstalled: pluginStatus.opencode?.plugins ?? false,
      pluginNeedsUpdate: pluginStatus.opencode?.pluginsNeedsUpdate,
      agentsInstalled: pluginStatus.opencode?.agents?.length ?? 0,
      agentsNeedsUpdate: pluginStatus.opencode?.agentsNeedsUpdate,
      skillsInstalled: pluginStatus.opencode?.skills?.length ?? 0,
      skillsNeedsUpdate: pluginStatus.opencode?.skillsNeedsUpdate,
    },
    codex: {
      installed: existsSync(codexHome),
      mcpConfigured: pluginStatus.codex?.mcp ?? false,
      mcpNeedsUpdate: pluginStatus.codex?.mcpNeedsUpdate,
      skillsInstalled: pluginStatus.codex?.skills?.length ?? 0,
      skillsNeedsUpdate: pluginStatus.codex?.skillsNeedsUpdate,
      instructionsInstalled: pluginStatus.codex?.instructions ?? false,
      instructionsNeedsUpdate: pluginStatus.codex?.instructionsNeedsUpdate,
    },
  };
}

// 格式化插件状态
function formatPluginStatus(installed: boolean, count: number | null, needsUpdate?: boolean): string {
  if (!installed && (count === null || count === 0)) {
    return colors.yellow("○ 未安装");
  }
  const countStr = count !== null ? ` (${count})` : "";
  if (needsUpdate) {
    return colors.yellow(`⚠ 需更新${countStr}`);
  }
  return colors.green(`✓ 已安装${countStr}`);
}

// 显示状态
function showStatus(env: Environment) {
  console.log("\n" + colors.bold("=== TanmiWorkspace 配置状态 ===\n"));

  console.log(`Node.js: v${env.nodeVersion}`);
  console.log("");

  console.log(colors.bold("Claude Code:"));
  console.log(`  目录:   ${env.claudeCode.installed ? colors.green("✓") : colors.red("✗")} ${CLAUDE_HOME}`);
  console.log(`  CLI:    ${env.claudeCode.cliAvailable ? colors.green("✓ 可用") : colors.yellow("✗ 未安装")}`);
  console.log(`  MCP:    ${env.claudeCode.mcpConfigured ? colors.green("✓ 已配置") : colors.yellow("○ 未配置")}`);
  console.log(`  权限:   ${env.claudeCode.permissionConfigured ? colors.green("✓ 已配置") : colors.yellow("○ 未配置")}`);
  console.log(`  Hooks:  ${formatPluginStatus(env.claudeCode.hookInstalled, null, env.claudeCode.hookNeedsUpdate)}`);
  console.log(`  Agents: ${formatPluginStatus(env.claudeCode.agentsInstalled > 0, env.claudeCode.agentsInstalled, env.claudeCode.agentsNeedsUpdate)}`);
  console.log(`  Skills: ${formatPluginStatus(env.claudeCode.skillsInstalled > 0, env.claudeCode.skillsInstalled, env.claudeCode.skillsNeedsUpdate)}`);
  console.log("");

  console.log(colors.bold("Cursor:"));
  console.log(`  目录:   ${env.cursor.installed ? colors.green("✓") : colors.red("✗")} ${CURSOR_HOME}`);
  console.log(`  MCP:    ${env.cursor.mcpConfigured ? colors.green("✓ 已配置") : colors.yellow("○ 未配置")}`);
  console.log(`  Hooks:  ${formatPluginStatus(env.cursor.hookInstalled, null, env.cursor.hookNeedsUpdate)}`);
  console.log(`  Agents: ${formatPluginStatus(env.cursor.agentsInstalled > 0, env.cursor.agentsInstalled, env.cursor.agentsNeedsUpdate)}`);
  console.log(`  Skills: ${formatPluginStatus(env.cursor.skillsInstalled > 0, env.cursor.skillsInstalled, env.cursor.skillsNeedsUpdate)}`);
  console.log("");

  console.log(colors.bold("OpenCode:"));
  console.log(`  目录:   ${env.opencode.installed ? colors.green("✓") : colors.red("✗")} ${OPENCODE_HOME}`);
  console.log(`  MCP:    ${env.opencode.mcpConfigured ? colors.green("✓ 已配置") : colors.yellow("○ 未配置")}`);
  console.log(`  Plugin: ${formatPluginStatus(env.opencode.pluginInstalled, null, env.opencode.pluginNeedsUpdate)}`);
  console.log(`  Agents: ${formatPluginStatus(env.opencode.agentsInstalled > 0, env.opencode.agentsInstalled, env.opencode.agentsNeedsUpdate)}`);
  console.log(`  Skills: ${formatPluginStatus(env.opencode.skillsInstalled > 0, env.opencode.skillsInstalled, env.opencode.skillsNeedsUpdate)}`);
  console.log("");

  const codexHome = join(HOME, ".codex");
  console.log(colors.bold("Codex CLI:"));
  console.log(`  目录:         ${env.codex.installed ? colors.green("✓") : colors.yellow("✗")} ${codexHome}`);
  console.log(`  MCP:          ${env.codex.mcpConfigured ? colors.green("✓ 已配置") : colors.yellow("○ 未配置")}`);
  console.log(`  Skills:       ${formatPluginStatus(env.codex.skillsInstalled > 0, env.codex.skillsInstalled, env.codex.skillsNeedsUpdate)}`);
  console.log(`  Instructions: ${formatPluginStatus(env.codex.instructionsInstalled, null, env.codex.instructionsNeedsUpdate)}`);
  console.log("");
}

// 配置 Claude Code MCP
async function configureClaudeMcp(env: Environment): Promise<boolean> {
  console.log("\n" + colors.blue("配置 Claude Code MCP..."));

  // 如果已配置，直接覆盖（用户调用 setup 就是想修复配置）
  if (env.claudeCode.mcpConfigured) {
    console.log(colors.yellow("  → 覆盖现有配置..."));
  }

  if (env.claudeCode.cliAvailable) {
    // 使用 claude mcp add 命令
    try {
      // 如果用户选择覆盖，先移除旧配置
      if (env.claudeCode.mcpConfigured) {
        try {
          await execAsync("claude mcp remove tanmi-workspace -s user");
          console.log("  已移除旧配置");
        } catch {
          // 移除失败不影响后续添加
        }
      }
      console.log("  执行: claude mcp add tanmi-workspace -s user -- npx tanmi-workspace");
      await execAsync("claude mcp add tanmi-workspace -s user -- npx tanmi-workspace");
      console.log(colors.green("  ✓ MCP 服务器已添加"));
      updateInstallationMeta("claudeCode", "mcp", "update");
      return true;
    } catch (error) {
      // 检查是否是因为已存在
      const errorMessage = (error as Error).message || "";
      if (errorMessage.includes("already exists") || errorMessage.includes("已存在")) {
        console.log(colors.green("  ✓ MCP 服务器已存在"));
        return true;
      }
      console.log(colors.yellow("  ⚠ claude mcp add 失败，尝试手动配置..."));
    }
  }

  // 手动配置 - 写入 ~/.claude.json
  try {
    let claudeJson: Record<string, unknown> = {};
    if (existsSync(CLAUDE_JSON)) {
      claudeJson = JSON.parse(readFileSync(CLAUDE_JSON, "utf-8"));
    }

    if (!claudeJson.mcpServers) {
      claudeJson.mcpServers = {};
    }

    (claudeJson.mcpServers as Record<string, unknown>)["tanmi-workspace"] = {
      command: "npx",
      args: ["tanmi-workspace"],
    };

    writeFileSync(CLAUDE_JSON, JSON.stringify(claudeJson, null, 2));
    console.log(colors.green("  ✓ MCP 配置已写入 " + CLAUDE_JSON));
    updateInstallationMeta("claudeCode", "mcp", "update");
    return true;
  } catch (error) {
    console.log(colors.red("  ✗ 配置失败: " + error));
    return false;
  }
}

// 配置 Claude Code 权限 - 写入 ~/.claude/settings.local.json
async function configureClaudePermission(): Promise<boolean> {
  console.log("\n" + colors.blue("配置 Claude Code 权限..."));

  try {
    if (!existsSync(CLAUDE_HOME)) {
      mkdirSync(CLAUDE_HOME, { recursive: true });
    }

    let settings: Record<string, unknown> = {};
    if (existsSync(CLAUDE_SETTINGS_LOCAL)) {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_LOCAL, "utf-8"));
    }

    if (!settings.permissions) {
      settings.permissions = { allow: [], deny: [] };
    }

    const permissions = settings.permissions as { allow: string[]; deny: string[] };
    if (!permissions.allow) {
      permissions.allow = [];
    }

    // 检查是否已存在服务器级权限
    const hasPermission = permissions.allow.some((p: string) =>
      p === "mcp__tanmi-workspace"
    );

    if (!hasPermission) {
      permissions.allow.push("mcp__tanmi-workspace");
      writeFileSync(CLAUDE_SETTINGS_LOCAL, JSON.stringify(settings, null, 2));
      console.log(colors.green("  ✓ 权限已添加: mcp__tanmi-workspace"));
    } else {
      console.log(colors.green("  ✓ 权限已存在"));
    }

    return true;
  } catch (error) {
    console.log(colors.red("  ✗ 配置失败: " + error));
    return false;
  }
}

// 配置 Cursor MCP
async function configureCursorMcp(): Promise<boolean> {
  console.log("\n" + colors.blue("配置 Cursor MCP..."));

  try {
    if (!existsSync(CURSOR_HOME)) {
      mkdirSync(CURSOR_HOME, { recursive: true });
    }

    let mcp: Record<string, unknown> = {};
    if (existsSync(CURSOR_MCP)) {
      mcp = JSON.parse(readFileSync(CURSOR_MCP, "utf-8"));
    }

    if (!mcp.mcpServers) {
      mcp.mcpServers = {};
    }

    // dev 模式指向本地编译产物，生产模式使用 npx
    const mcpEntry = IS_DEV
      ? {
          command: "node",
          args: [join(__dirname, "..", "..", "dist", "index.js")],
          env: {
            TANMI_DEV: "true",
            NODE_ENV: "development",
            DISABLE_HTTP: "true",
          },
        }
      : {
          command: "npx",
          args: ["tanmi-workspace"],
        };

    (mcp.mcpServers as Record<string, unknown>)["tanmi-workspace"] = mcpEntry;

    writeFileSync(CURSOR_MCP, JSON.stringify(mcp, null, 2));
    console.log(colors.green("  ✓ MCP 配置已写入 " + CURSOR_MCP));
    updateInstallationMeta("cursor", "mcp", "update");
    return true;
  } catch (error) {
    console.log(colors.red("  ✗ 配置失败: " + error));
    return false;
  }
}

// 配置 OpenCode MCP
async function configureOpenCodeMcp(): Promise<boolean> {
  console.log("\n" + colors.blue("配置 OpenCode MCP..."));

  try {
    if (!existsSync(OPENCODE_HOME)) {
      mkdirSync(OPENCODE_HOME, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (existsSync(OPENCODE_CONFIG)) {
      config = JSON.parse(readFileSync(OPENCODE_CONFIG, "utf-8"));
    }

    // OpenCode 使用 mcp 字段而非 mcpServers
    if (!config.mcp) {
      config.mcp = {};
    }

    // OpenCode MCP 配置格式: type + command (array)
    (config.mcp as Record<string, unknown>)["tanmi-workspace"] = {
      type: "local",
      command: ["npx", "tanmi-workspace"],
    };

    writeFileSync(OPENCODE_CONFIG, JSON.stringify(config, null, 2));
    console.log(colors.green("  ✓ MCP 配置已写入 " + OPENCODE_CONFIG));
    updateInstallationMeta("opencode", "mcp", "update");
    return true;
  } catch (error) {
    console.log(colors.red("  ✗ 配置失败: " + error));
    return false;
  }
}

// 安装插件（Hooks/Plugin + Agents + Skills）
async function installPlugins(platform: "claude" | "cursor" | "opencode" | "codex"): Promise<boolean> {
  try {
    if (platform === "claude") {
      installClaudeAll();
    } else if (platform === "cursor") {
      installCursorAll();
    } else if (platform === "opencode") {
      installOpenCodeAll();
    } else {
      installCodexAll();
    }
    return true;
  } catch (error) {
    console.log(colors.yellow(`  ⚠ 插件安装失败，请手动运行: tanmi-workspace plugins install --${platform}`));
    return false;
  }
}


// 显示帮助
function showHelp() {
  console.log(`
${colors.bold("tanmi-workspace setup")} - TanmiWorkspace 配置向导

${colors.bold("用法:")}
  tanmi-workspace setup              交互式配置向导
  tanmi-workspace setup --status     查看当前配置状态
  tanmi-workspace setup --claude-code  快速配置 Claude Code
  tanmi-workspace setup --cursor     快速配置 Cursor
  tanmi-workspace setup --opencode   快速配置 OpenCode
  tanmi-workspace setup --codex      快速配置 Codex CLI
  tanmi-workspace setup --help       显示帮助

${colors.bold("说明:")}
  此命令帮助你快速配置 TanmiWorkspace MCP 服务器。
  配置完成后需要重启对应的 AI 工具使配置生效。
`);
}

// 主函数
export default async function setup() {
  const args = process.argv.slice(3); // 跳过 node, script, setup

  // 处理命令行参数
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    return;
  }

  const env = await detectEnvironment();

  if (args.includes("--status")) {
    showStatus(env);
    return;
  }

  // 快速配置模式
  if (args.includes("--claude-code")) {
    console.log(colors.bold("\n=== TanmiWorkspace Claude Code 快速配置 ===\n"));

    // 显示当前状态
    console.log(colors.bold("当前状态:"));
    console.log(`  MCP:    ${env.claudeCode.mcpConfigured ? colors.green("已配置") : colors.yellow("未配置")}`);
    console.log(`  权限:   ${env.claudeCode.permissionConfigured ? colors.green("已配置") : colors.yellow("未配置")}`);
    console.log(`  Hooks:  ${formatPluginStatus(env.claudeCode.hookInstalled, null, env.claudeCode.hookNeedsUpdate).replace(/[✓○⚠]\s*/, "")}`);
    console.log(`  Agents: ${formatPluginStatus(env.claudeCode.agentsInstalled > 0, env.claudeCode.agentsInstalled, env.claudeCode.agentsNeedsUpdate).replace(/[✓○⚠]\s*/, "")}`);
    console.log(`  Skills: ${formatPluginStatus(env.claudeCode.skillsInstalled > 0, env.claudeCode.skillsInstalled, env.claudeCode.skillsNeedsUpdate).replace(/[✓○⚠]\s*/, "")}`);
    console.log("");

    await configureClaudeMcp(env);
    await configureClaudePermission();
    await installPlugins("claude");

    console.log("\n" + colors.green("配置完成！请重启 Claude Code。"));
    return;
  }

  if (args.includes("--cursor")) {
    console.log(colors.bold("\n=== TanmiWorkspace Cursor 快速配置 ===\n"));
    await configureCursorMcp();
    await installPlugins("cursor");

    console.log("\n" + colors.green("配置完成！请重启 Cursor。"));
    return;
  }

  if (args.includes("--codex") || args.includes("-c")) {
    console.log(colors.bold("\n=== TanmiWorkspace Codex CLI 快速配置 ===\n"));

    console.log(colors.bold("当前状态:"));
    console.log(`  MCP:          ${env.codex.mcpConfigured ? colors.green("已配置") : colors.yellow("未配置")}`);
    console.log(`  Skills:       ${formatPluginStatus(env.codex.skillsInstalled > 0, env.codex.skillsInstalled, env.codex.skillsNeedsUpdate).replace(/[✓○⚠]\s*/, "")}`);
    console.log(`  Instructions: ${formatPluginStatus(env.codex.instructionsInstalled, null, env.codex.instructionsNeedsUpdate).replace(/[✓○⚠]\s*/, "")}`);
    console.log("");

    await installPlugins("codex");

    console.log("\n" + colors.green("配置完成！Codex CLI 注意事项："));
    console.log("  - 无 Hook 系统，请手动调用 session_bind 绑定工作区");
    console.log("  - AGENTS.md 已注入工作流指引（全局生效）");
    return;
  }

  if (args.includes("--opencode") || args.includes("-o")) {
    console.log(colors.bold("\n=== TanmiWorkspace OpenCode 快速配置 ===\n"));

    // 显示当前状态
    console.log(colors.bold("当前状态:"));
    console.log(`  MCP:    ${env.opencode.mcpConfigured ? colors.green("已配置") : colors.yellow("未配置")}`);
    console.log(`  Plugin: ${formatPluginStatus(env.opencode.pluginInstalled, null, env.opencode.pluginNeedsUpdate).replace(/[✓○⚠]\s*/, "")}`);
    console.log(`  Agents: ${formatPluginStatus(env.opencode.agentsInstalled > 0, env.opencode.agentsInstalled, env.opencode.agentsNeedsUpdate).replace(/[✓○⚠]\s*/, "")}`);
    console.log(`  Skills: ${formatPluginStatus(env.opencode.skillsInstalled > 0, env.opencode.skillsInstalled, env.opencode.skillsNeedsUpdate).replace(/[✓○⚠]\s*/, "")}`);
    console.log("");

    await configureOpenCodeMcp();
    await installPlugins("opencode");

    console.log("\n" + colors.green("配置完成！请重启 OpenCode。"));
    return;
  }

  // 交互式向导
  console.log(colors.bold("\n=== TanmiWorkspace 配置向导 ===\n"));

  // 显示当前状态
  showStatus(env);

  // 选择平台
  const platforms: Array<{ name: string; value: string; disabled?: boolean | string }> = [];

  if (env.claudeCode.installed) {
    const status = env.claudeCode.mcpConfigured && env.claudeCode.permissionConfigured
      ? " (已配置)"
      : "";
    platforms.push({ name: `Claude Code${status}`, value: "claude" });
  }

  if (env.cursor.installed) {
    const status = env.cursor.mcpConfigured ? " (已配置)" : "";
    platforms.push({ name: `Cursor${status}`, value: "cursor" });
  }

  if (env.opencode.installed) {
    const status = env.opencode.mcpConfigured ? " (已配置)" : "";
    platforms.push({ name: `OpenCode${status}`, value: "opencode" });
  }

  if (env.codex.installed) {
    const status = env.codex.mcpConfigured ? " (已配置)" : "";
    platforms.push({ name: `Codex CLI${status}`, value: "codex" });
  }

  platforms.push({ name: "显示手动配置说明", value: "manual" });

  const platform = await select({
    message: "选择要配置的 AI 工具:",
    choices: platforms,
  });

  if (platform === "manual") {
    console.log(`
${colors.bold("手动配置说明:")}

${colors.bold("1. Claude Code")}
   运行: claude mcp add tanmi-workspace -s user -- npx tanmi-workspace

   然后编辑 ~/.claude/settings.json，添加权限:
   {
     "permissions": {
       "allow": ["mcp__tanmi-workspace"]
     }
   }

${colors.bold("2. Cursor")}
   编辑 ~/.cursor/mcp.json:
   {
     "mcpServers": {
       "tanmi-workspace": {
         "command": "npx",
         "args": ["tanmi-workspace"]
       }
     }
   }

${colors.bold("3. OpenCode")}
   编辑 ~/.config/opencode/opencode.json:
   {
     "mcp": {
       "tanmi-workspace": {
         "type": "local",
         "command": ["npx", "tanmi-workspace"]
       }
     }
   }

${colors.bold("4. 其他平台")}
   在 MCP 配置中添加:
   - command: npx
   - args: ["tanmi-workspace"]
`);
    return;
  }

  // 执行配置
  if (platform === "claude") {
    const mcpSuccess = await configureClaudeMcp(env);
    if (mcpSuccess) {
      await configureClaudePermission();
    }
    await installPlugins("claude");

    console.log("\n" + colors.green(colors.bold("✓ 配置完成！")));
    console.log("\n下一步:");
    console.log("  1. 重启 Claude Code");
    console.log("  2. 输入 /mcp 验证安装");
    console.log('  3. 说「介绍一下工作台的使用方式」开始使用\n');
  }

  if (platform === "cursor") {
    await configureCursorMcp();
    await installPlugins("cursor");

    console.log("\n" + colors.green(colors.bold("✓ 配置完成！")));
    console.log("\n下一步:");
    console.log("  1. 重启 Cursor");
    console.log('  2. 说「介绍一下工作台的使用方式」开始使用\n');
  }

  if (platform === "opencode") {
    await configureOpenCodeMcp();
    await installPlugins("opencode");

    console.log("\n" + colors.green(colors.bold("✓ 配置完成！")));
    console.log("\n下一步:");
    console.log("  1. 重启 OpenCode");
    console.log('  2. 说「介绍一下工作台的使用方式」开始使用\n');
  }

  if (platform === "codex") {
    await installPlugins("codex");

    console.log("\n" + colors.green(colors.bold("✓ 配置完成！")));
    console.log("\n注意事项:");
    console.log("  - Codex CLI 无 Hook 系统，请手动调用 session_bind");
    console.log("  - AGENTS.md 工作流指引已全局注入");
    console.log('  2. 说「介绍一下工作台的使用方式」开始使用\n');
  }
}
