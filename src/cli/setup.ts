#!/usr/bin/env node
/**
 * tanmi-workspace setup 命令
 * 交互式配置向导，帮助用户快速配置 TanmiWorkspace
 */

import { select, confirm } from "@inquirer/prompts";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execSync, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// 路径配置
const HOME = homedir();
const CLAUDE_HOME = join(HOME, ".claude");
const CLAUDE_JSON = join(HOME, ".claude.json"); // MCP 配置
const CLAUDE_SETTINGS_LOCAL = join(CLAUDE_HOME, "settings.local.json"); // 权限配置
const CURSOR_HOME = join(HOME, ".cursor");
const CURSOR_MCP = join(CURSOR_HOME, "mcp.json");
const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
const TANMI_BASE = IS_DEV ? ".tanmi-workspace-dev" : ".tanmi-workspace";
const TANMI_SCRIPTS = join(HOME, TANMI_BASE, "scripts");
// update-installation-meta.cjs 位于 npm 包根目录的 scripts 目录
// __dirname = dist/cli/, 所以需要 ../../scripts/
const UPDATE_META_SCRIPT = join(__dirname, "..", "..", "scripts", "update-installation-meta.cjs");

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
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// 更新安装元信息
function updateInstallationMeta(platform: string, component: string): void {
  if (!existsSync(UPDATE_META_SCRIPT)) {
    return; // 脚本不存在，跳过
  }
  try {
    const version = getPackageVersion();
    execSync(`node "${UPDATE_META_SCRIPT}" update ${platform} ${component} ${version}`, {
      stdio: "ignore",
    });
  } catch {
    // 静默失败，不影响主流程
  }
}

// 检测环境
interface Environment {
  nodeVersion: string;
  claudeCode: {
    installed: boolean;
    cliAvailable: boolean;
    mcpConfigured: boolean;
    permissionConfigured: boolean;
    hookInstalled: boolean;
  };
  cursor: {
    installed: boolean;
    mcpConfigured: boolean;
    hookInstalled: boolean;
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
      if (settings.permissions?.allow?.some((p: string) =>
        p === "mcp__tanmi-workspace" || p.startsWith("mcp__tanmi-workspace__")
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

  // 检测 Hook 安装
  const claudeHookInstalled = existsSync(join(TANMI_SCRIPTS, "hook-entry.cjs"));
  const cursorHookInstalled = existsSync(join(TANMI_SCRIPTS, "cursor-hook-entry.cjs"));

  return {
    nodeVersion: process.versions.node,
    claudeCode: {
      installed: existsSync(CLAUDE_HOME),
      cliAvailable: claudeCliAvailable,
      mcpConfigured: claudeMcpConfigured,
      permissionConfigured: claudePermissionConfigured,
      hookInstalled: claudeHookInstalled,
    },
    cursor: {
      installed: existsSync(CURSOR_HOME),
      mcpConfigured: cursorMcpConfigured,
      hookInstalled: cursorHookInstalled,
    },
  };
}

// 显示状态
function showStatus(env: Environment) {
  console.log("\n" + colors.bold("=== TanmiWorkspace 配置状态 ===\n"));

  console.log(`Node.js: v${env.nodeVersion}`);
  console.log("");

  console.log(colors.bold("Claude Code:"));
  console.log(`  目录: ${env.claudeCode.installed ? colors.green("✓") : colors.red("✗")} ${CLAUDE_HOME}`);
  console.log(`  CLI:  ${env.claudeCode.cliAvailable ? colors.green("✓ 可用") : colors.yellow("✗ 未安装")}`);
  console.log(`  MCP:  ${env.claudeCode.mcpConfigured ? colors.green("✓ 已配置") : colors.yellow("○ 未配置")}`);
  console.log(`  权限: ${env.claudeCode.permissionConfigured ? colors.green("✓ 已配置") : colors.yellow("○ 未配置")}`);
  console.log(`  Hook: ${env.claudeCode.hookInstalled ? colors.green("✓ 已安装") : colors.yellow("○ 未安装")}`);
  console.log("");

  console.log(colors.bold("Cursor:"));
  console.log(`  目录: ${env.cursor.installed ? colors.green("✓") : colors.red("✗")} ${CURSOR_HOME}`);
  console.log(`  MCP:  ${env.cursor.mcpConfigured ? colors.green("✓ 已配置") : colors.yellow("○ 未配置")}`);
  console.log(`  Hook: ${env.cursor.hookInstalled ? colors.green("✓ 已安装") : colors.yellow("○ 未安装")}`);
  console.log("");
}

// 配置 Claude Code MCP
async function configureClaudeMcp(env: Environment): Promise<boolean> {
  console.log("\n" + colors.blue("配置 Claude Code MCP..."));

  if (env.claudeCode.cliAvailable) {
    // 使用 claude mcp add 命令
    try {
      console.log("  执行: claude mcp add tanmi-workspace -s user -- npx tanmi-workspace");
      await execAsync("claude mcp add tanmi-workspace -s user -- npx tanmi-workspace");
      console.log(colors.green("  ✓ MCP 服务器已添加"));
      updateInstallationMeta("claudeCode", "mcp");
      return true;
    } catch (error) {
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
    updateInstallationMeta("claudeCode", "mcp");
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

    // 检查是否已存在
    const hasPermission = permissions.allow.some((p: string) =>
      p === "mcp__tanmi-workspace" || p.startsWith("mcp__tanmi-workspace__")
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

    (mcp.mcpServers as Record<string, unknown>)["tanmi-workspace"] = {
      command: "npx",
      args: ["tanmi-workspace"],
    };

    writeFileSync(CURSOR_MCP, JSON.stringify(mcp, null, 2));
    console.log(colors.green("  ✓ MCP 配置已写入 " + CURSOR_MCP));
    updateInstallationMeta("cursor", "mcp");
    return true;
  } catch (error) {
    console.log(colors.red("  ✗ 配置失败: " + error));
    return false;
  }
}

// 安装 Hook
async function installHook(platform: "claude" | "cursor"): Promise<boolean> {
  console.log("\n" + colors.blue(`安装 ${platform === "claude" ? "Claude Code" : "Cursor"} Hook...`));

  try {
    // 查找 tanmi-workspace-hooks 命令
    const hookArg = platform === "claude" ? "--claude-hooks" : "--cursor-hooks";
    await execAsync(`npx tanmi-workspace-hooks ${hookArg}`);
    console.log(colors.green(`  ✓ Hook 已安装`));
    return true;
  } catch (error) {
    console.log(colors.yellow(`  ⚠ 自动安装失败，请手动运行: tanmi-workspace-hooks ${platform === "claude" ? "--claude-hooks" : "--cursor-hooks"}`));
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
    await configureClaudeMcp(env);
    await configureClaudePermission();

    const installHookAnswer = await confirm({
      message: "是否安装智能提醒 Hook？",
      default: true,
    });
    if (installHookAnswer) {
      await installHook("claude");
    }

    console.log("\n" + colors.green("配置完成！请重启 Claude Code。"));
    return;
  }

  if (args.includes("--cursor")) {
    console.log(colors.bold("\n=== TanmiWorkspace Cursor 快速配置 ===\n"));
    await configureCursorMcp();

    const installHookAnswer = await confirm({
      message: "是否安装智能提醒 Hook？",
      default: true,
    });
    if (installHookAnswer) {
      await installHook("cursor");
    }

    console.log("\n" + colors.green("配置完成！请重启 Cursor。"));
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

${colors.bold("3. 其他平台")}
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

    if (!env.claudeCode.hookInstalled) {
      const installHookAnswer = await confirm({
        message: "是否安装智能提醒 Hook？(自动注入工作区上下文)",
        default: true,
      });
      if (installHookAnswer) {
        await installHook("claude");
      }
    }

    console.log("\n" + colors.green(colors.bold("✓ 配置完成！")));
    console.log("\n下一步:");
    console.log("  1. 重启 Claude Code");
    console.log("  2. 输入 /mcp 验证安装");
    console.log('  3. 说「介绍一下工作台的使用方式」开始使用\n');
  }

  if (platform === "cursor") {
    await configureCursorMcp();

    if (!env.cursor.hookInstalled) {
      const installHookAnswer = await confirm({
        message: "是否安装智能提醒 Hook？(自动注入工作区上下文)",
        default: true,
      });
      if (installHookAnswer) {
        await installHook("cursor");
      }
    }

    console.log("\n" + colors.green(colors.bold("✓ 配置完成！")));
    console.log("\n下一步:");
    console.log("  1. 重启 Cursor");
    console.log('  2. 说「介绍一下工作台的使用方式」开始使用\n');
  }
}
