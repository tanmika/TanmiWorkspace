#!/usr/bin/env node
/**
 * tanmi-workspace plugins 命令
 * 插件管理：安装/卸载/查看状态
 *
 * 功能：
 * - 显示插件安装状态
 * - 安装 Claude Code / Cursor 插件（Hooks, Agents, Skills）
 * - 卸载插件
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
  statSync,
} from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// ES module 兼容
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// ============================================================================
// 配置
// ============================================================================

// 项目根目录（从 dist/cli/ 回到项目根目录）
const PROJECT_ROOT = join(__dirname, "..", "..");

// 全局安装目录
const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
const HOME = homedir();
const TANMI_BASE = IS_DEV ? ".tanmi-workspace-dev" : ".tanmi-workspace";
const TANMI_HOME = join(HOME, TANMI_BASE);
const TANMI_SCRIPTS = join(TANMI_HOME, "scripts");
const TANMI_SHARED = join(TANMI_SCRIPTS, "shared");

// Claude Code 配置
const CLAUDE_HOME = join(HOME, ".claude");
const CLAUDE_SETTINGS = join(CLAUDE_HOME, "settings.json");

// Cursor 配置
const CURSOR_HOME = join(HOME, ".cursor");
const CURSOR_HOOKS = join(CURSOR_HOME, "hooks.json");

// 安装元信息
const INSTALLATION_META_PATH = join(TANMI_HOME, "installation-meta.json");

// 插件源目录
const PLUGIN_ROOT = join(PROJECT_ROOT, "plugin");
const PLUGIN_SCRIPTS = join(PLUGIN_ROOT, "scripts");
const PLUGIN_AGENTS = join(PLUGIN_ROOT, "agents");
const PLUGIN_SKILLS = join(PLUGIN_ROOT, "skills");

// ============================================================================
// 颜色输出
// ============================================================================

const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function info(msg: string) {
  console.log(`${colors.blue("[INFO]")} ${msg}`);
}

function success(msg: string) {
  console.log(`${colors.green("[OK]")} ${msg}`);
}

function warn(msg: string) {
  console.log(`${colors.yellow("[WARN]")} ${msg}`);
}

function error(msg: string) {
  console.log(`${colors.red("[ERROR]")} ${msg}`);
}

// ============================================================================
// 工具函数
// ============================================================================

function getPackageVersion(): string {
  try {
    const pkg = require(join(PROJECT_ROOT, "package.json"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

interface InstallationMeta {
  schemaVersion: string;
  global: {
    installedAt: string;
    lastUpdatedAt: string;
    packageVersion: string;
    platforms: Record<string, {
      enabled: boolean;
      installedAt: string;
      components: Record<string, { installed: boolean; version?: string }>;
    }>;
  };
}

function readInstallationMeta(): InstallationMeta {
  try {
    if (existsSync(INSTALLATION_META_PATH)) {
      return JSON.parse(readFileSync(INSTALLATION_META_PATH, "utf-8"));
    }
  } catch {
    // 解析失败
  }
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    global: {
      installedAt: now,
      lastUpdatedAt: now,
      packageVersion: "0.0.0",
      platforms: {},
    },
  };
}

function writeInstallationMeta(meta: InstallationMeta): void {
  const dir = dirname(INSTALLATION_META_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  meta.global.lastUpdatedAt = new Date().toISOString();
  writeFileSync(INSTALLATION_META_PATH, JSON.stringify(meta, null, 2), "utf-8");
}

export function updateInstallationMeta(platform: string, component: string, action: "update" | "remove"): void {
  try {
    const meta = readInstallationMeta();
    const now = new Date().toISOString();
    const version = getPackageVersion();

    // 初始化平台
    if (!meta.global.platforms[platform]) {
      meta.global.platforms[platform] = {
        enabled: true,
        installedAt: now,
        components: {
          hooks: { installed: false },
          mcp: { installed: false },
        },
      };
      // 平台特有组件
      if (platform === "claudeCode") {
        meta.global.platforms[platform].components.agents = { installed: false };
        meta.global.platforms[platform].components.skills = { installed: false };
      }
      if (platform === "cursor") {
        meta.global.platforms[platform].components.modes = { installed: false };
      }
    }

    if (action === "update") {
      meta.global.platforms[platform].components[component] = { installed: true, version };
      meta.global.packageVersion = version;
    } else {
      meta.global.platforms[platform].components[component] = { installed: false };
      const allDisabled = Object.values(meta.global.platforms[platform].components).every((c) => !c.installed);
      if (allDisabled) {
        meta.global.platforms[platform].enabled = false;
      }
    }

    writeInstallationMeta(meta);
  } catch {
    // 静默失败
  }
}

function readJsonFile(filePath: string): Record<string, unknown> {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, "utf-8"));
    }
  } catch {
    // 解析失败
  }
  return {};
}

function writeJsonFile(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src: string, dest: string): void {
  const destDir = dirname(dest);
  ensureDir(destDir);
  cpSync(src, dest);
}

function copyDir(src: string, dest: string): void {
  ensureDir(dest);
  cpSync(src, dest, { recursive: true });
}

function removeFile(filePath: string): boolean {
  if (existsSync(filePath)) {
    rmSync(filePath);
    return true;
  }
  return false;
}

function removeDir(dirPath: string): boolean {
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true });
    return true;
  }
  return false;
}

function isDirEmpty(dirPath: string): boolean {
  if (!existsSync(dirPath)) return true;
  const files = readdirSync(dirPath);
  return files.length === 0;
}

// ============================================================================
// 状态检测
// ============================================================================

interface PluginStatus {
  claude: {
    hooks: boolean;
    agents: string[]; // 已安装的 agent 文件名
    skills: string[]; // 已安装的 skill 目录名
  };
  cursor: {
    hooks: boolean;
  };
}

function getPluginStatus(): PluginStatus {
  // Claude hooks
  const claudeHooksInstalled = existsSync(join(TANMI_SCRIPTS, "hook-entry.cjs"));

  // Claude agents
  const agentsDir = join(CLAUDE_HOME, "agents");
  const installedAgents: string[] = [];
  if (existsSync(agentsDir)) {
    const expectedAgents = ["tanmi-executor.md", "tanmi-tester.md"];
    for (const agent of expectedAgents) {
      if (existsSync(join(agentsDir, agent))) {
        installedAgents.push(agent);
      }
    }
  }

  // Claude skills
  const skillsDir = join(CLAUDE_HOME, "skills");
  const installedSkills: string[] = [];
  if (existsSync(PLUGIN_SKILLS) && existsSync(skillsDir)) {
    const sourceSkills = readdirSync(PLUGIN_SKILLS).filter((name) => {
      const fullPath = join(PLUGIN_SKILLS, name);
      return statSync(fullPath).isDirectory() && existsSync(join(fullPath, "SKILL.md"));
    });
    for (const skill of sourceSkills) {
      if (existsSync(join(skillsDir, skill, "SKILL.md"))) {
        installedSkills.push(skill);
      }
    }
  }

  // Cursor hooks
  const cursorHooksInstalled = existsSync(join(TANMI_SCRIPTS, "cursor-hook-entry.cjs"));

  return {
    claude: {
      hooks: claudeHooksInstalled,
      agents: installedAgents,
      skills: installedSkills,
    },
    cursor: {
      hooks: cursorHooksInstalled,
    },
  };
}

function showStatus(): void {
  const status = getPluginStatus();
  const version = getPackageVersion();

  console.log("");
  console.log(colors.bold(`TanmiWorkspace 插件状态 (v${version})`));
  console.log("");

  // Claude Code
  console.log(colors.bold("Claude Code:"));
  console.log(`  Hooks:  ${status.claude.hooks ? colors.green("已安装") : colors.gray("未安装")}`);
  console.log(
    `  Agents: ${status.claude.agents.length > 0 ? colors.green(`已安装 (${status.claude.agents.length})`) : colors.gray("未安装")}`
  );
  if (status.claude.agents.length > 0) {
    for (const agent of status.claude.agents) {
      console.log(`          ${colors.gray("-")} ${agent}`);
    }
  }
  console.log(
    `  Skills: ${status.claude.skills.length > 0 ? colors.green(`已安装 (${status.claude.skills.length})`) : colors.gray("未安装")}`
  );
  if (status.claude.skills.length > 0) {
    for (const skill of status.claude.skills) {
      console.log(`          ${colors.gray("-")} ${skill}`);
    }
  }
  console.log("");

  // Cursor
  console.log(colors.bold("Cursor:"));
  console.log(`  Hooks:  ${status.cursor.hooks ? colors.green("已安装") : colors.gray("未安装")}`);
  console.log("");

  // 安装路径
  console.log(colors.gray("安装路径:"));
  console.log(colors.gray(`  Scripts: ${TANMI_SCRIPTS}`));
  console.log(colors.gray(`  Agents:  ${join(CLAUDE_HOME, "agents")}`));
  console.log(colors.gray(`  Skills:  ${join(CLAUDE_HOME, "skills")}`));
  console.log("");
}

// ============================================================================
// 共享脚本安装
// ============================================================================

function installSharedScripts(): void {
  info("安装共享模块...");

  ensureDir(TANMI_SHARED);

  const sharedSrc = join(PLUGIN_SCRIPTS, "shared");
  if (!existsSync(sharedSrc)) {
    warn(`共享模块源目录不存在: ${sharedSrc}`);
    return;
  }

  const files = readdirSync(sharedSrc).filter((f) => f.endsWith(".cjs"));
  for (const file of files) {
    copyFile(join(sharedSrc, file), join(TANMI_SHARED, file));
  }

  success(`共享模块已安装到 ${TANMI_SHARED}/`);
}

// ============================================================================
// Claude Code 插件
// ============================================================================

function installClaudeHooks(): void {
  info("安装 Claude Code Hook 脚本...");

  ensureDir(TANMI_SCRIPTS);
  installSharedScripts();

  const hookSrc = join(PLUGIN_SCRIPTS, "hook-entry.cjs");
  const hookDest = join(TANMI_SCRIPTS, "hook-entry.cjs");

  if (!existsSync(hookSrc)) {
    error(`Hook 脚本不存在: ${hookSrc}`);
    return;
  }

  copyFile(hookSrc, hookDest);
  success(`Hook 脚本已安装到 ${hookDest}`);
}

function configureClaudeHooks(): void {
  info("配置 Claude Code Hooks...");

  ensureDir(CLAUDE_HOME);

  const settings = readJsonFile(CLAUDE_SETTINGS);
  const hookScript = join(TANMI_SCRIPTS, "hook-entry.cjs");

  const hooksConfig = {
    SessionStart: [
      {
        matcher: "startup|clear|compact",
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" SessionStart`,
            timeout: 10000,
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" UserPromptSubmit`,
            timeout: 5000,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "mcp__tanmi-workspace__.*",
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" PostToolUse`,
            timeout: 3000,
          },
        ],
      },
    ],
  };

  settings.hooks = hooksConfig;
  writeJsonFile(CLAUDE_SETTINGS, settings);

  success(`Hooks 已配置到 ${CLAUDE_SETTINGS}`);
  updateInstallationMeta("claudeCode", "hooks", "update");
}

function installDispatchAgents(): void {
  info("安装派发 Agent 模板...");

  const executorSrc = join(PLUGIN_AGENTS, "tanmi-executor.md");
  const testerSrc = join(PLUGIN_AGENTS, "tanmi-tester.md");

  if (!existsSync(executorSrc) || !existsSync(testerSrc)) {
    error(`Agent 模板文件不存在`);
    return;
  }

  const agentsDir = join(CLAUDE_HOME, "agents");
  ensureDir(agentsDir);

  copyFile(executorSrc, join(agentsDir, "tanmi-executor.md"));
  copyFile(testerSrc, join(agentsDir, "tanmi-tester.md"));

  success(`派发 Agent 已安装到 ${agentsDir}/`);
  info("  - tanmi-executor.md (任务执行者)");
  info("  - tanmi-tester.md (任务测试者)");

  updateInstallationMeta("claudeCode", "agents", "update");
}

function installSkills(): void {
  info("安装 Skills 模板...");

  if (!existsSync(PLUGIN_SKILLS)) {
    warn(`Skills 模板目录不存在: ${PLUGIN_SKILLS}`);
    return;
  }

  const skillDirs = readdirSync(PLUGIN_SKILLS).filter((name) => {
    const fullPath = join(PLUGIN_SKILLS, name);
    return statSync(fullPath).isDirectory();
  });

  if (skillDirs.length === 0) {
    warn("Skills 模板目录为空");
    return;
  }

  const skillsDestDir = join(CLAUDE_HOME, "skills");
  ensureDir(skillsDestDir);

  let count = 0;
  for (const skillName of skillDirs) {
    const skillSrcDir = join(PLUGIN_SKILLS, skillName);
    const skillMdPath = join(skillSrcDir, "SKILL.md");

    if (existsSync(skillMdPath)) {
      const skillDestDir = join(skillsDestDir, skillName);

      if (existsSync(skillDestDir)) {
        removeDir(skillDestDir);
      }

      copyDir(skillSrcDir, skillDestDir);
      info(`  - ${skillName}/`);
      count++;
    }
  }

  if (count === 0) {
    warn("未找到有效的 Skill 目录（需包含 SKILL.md）");
    return;
  }

  success(`已安装 ${count} 个 Skill 模板到 ${skillsDestDir}/`);
  updateInstallationMeta("claudeCode", "skills", "update");
}

function uninstallClaudeHooks(): void {
  info("卸载 Claude Code Hook...");

  const hookPath = join(TANMI_SCRIPTS, "hook-entry.cjs");
  if (removeFile(hookPath)) {
    success(`已删除 ${hookPath}`);
  }

  if (existsSync(CLAUDE_SETTINGS)) {
    const settings = readJsonFile(CLAUDE_SETTINGS);
    delete settings.hooks;
    writeJsonFile(CLAUDE_SETTINGS, settings);
    success(`已从 ${CLAUDE_SETTINGS} 移除 hooks 配置`);
  }

  updateInstallationMeta("claudeCode", "hooks", "remove");
}

function uninstallDispatchAgents(): void {
  info("卸载派发 Agent...");

  const agentsDir = join(CLAUDE_HOME, "agents");
  const files = ["tanmi-executor.md", "tanmi-tester.md"];

  for (const file of files) {
    const filePath = join(agentsDir, file);
    if (removeFile(filePath)) {
      success(`已删除 ${filePath}`);
    }
  }

  if (isDirEmpty(agentsDir)) {
    removeDir(agentsDir);
  }

  updateInstallationMeta("claudeCode", "agents", "remove");
}

function uninstallSkills(): void {
  info("卸载 Skills...");

  const skillsDestDir = join(CLAUDE_HOME, "skills");

  if (!existsSync(PLUGIN_SKILLS) || !existsSync(skillsDestDir)) {
    return;
  }

  const skillDirs = readdirSync(PLUGIN_SKILLS).filter((name) => {
    const fullPath = join(PLUGIN_SKILLS, name);
    return statSync(fullPath).isDirectory();
  });

  for (const skillName of skillDirs) {
    const skillDestDir = join(skillsDestDir, skillName);
    if (removeDir(skillDestDir)) {
      success(`已删除 ${skillDestDir}/`);
    }
  }

  if (isDirEmpty(skillsDestDir)) {
    removeDir(skillsDestDir);
  }

  updateInstallationMeta("claudeCode", "skills", "remove");
}

function cleanupSharedIfUnused(): void {
  const claudeHook = join(TANMI_SCRIPTS, "hook-entry.cjs");
  const cursorHook = join(TANMI_SCRIPTS, "cursor-hook-entry.cjs");

  if (!existsSync(claudeHook) && !existsSync(cursorHook)) {
    if (removeDir(TANMI_SHARED)) {
      success(`已清理共享模块 ${TANMI_SHARED}`);
    }
  }
}

// ============================================================================
// Cursor 插件
// ============================================================================

function installCursorHooks(): void {
  info("安装 Cursor Hook 脚本...");

  ensureDir(TANMI_SCRIPTS);
  installSharedScripts();

  const hookSrc = join(PLUGIN_SCRIPTS, "cursor-hook-entry.cjs");
  const hookDest = join(TANMI_SCRIPTS, "cursor-hook-entry.cjs");

  if (!existsSync(hookSrc)) {
    error(`Hook 脚本不存在: ${hookSrc}`);
    return;
  }

  copyFile(hookSrc, hookDest);
  success(`Hook 脚本已安装到 ${hookDest}`);
}

function configureCursorHooks(): void {
  info("配置 Cursor Hooks...");

  ensureDir(CURSOR_HOME);

  const hookScript = join(TANMI_SCRIPTS, "cursor-hook-entry.cjs");

  let cursorConfig = readJsonFile(CURSOR_HOOKS);

  if (Object.keys(cursorConfig).length === 0) {
    cursorConfig = { version: 1, hooks: {} };
  }

  if (!cursorConfig.hooks) {
    cursorConfig.hooks = {};
  }

  const hooks = cursorConfig.hooks as Record<string, unknown>;
  hooks.beforeSubmitPrompt = [{ command: `node "${hookScript}"` }];
  hooks.afterMCPExecution = [{ command: `node "${hookScript}"` }];

  writeJsonFile(CURSOR_HOOKS, cursorConfig);

  success(`Hooks 已配置到 ${CURSOR_HOOKS}`);
  updateInstallationMeta("cursor", "hooks", "update");
}

function uninstallCursorHooks(): void {
  info("卸载 Cursor Hook...");

  const hookPath = join(TANMI_SCRIPTS, "cursor-hook-entry.cjs");
  if (removeFile(hookPath)) {
    success(`已删除 ${hookPath}`);
  }

  if (existsSync(CURSOR_HOOKS)) {
    const cursorConfig = readJsonFile(CURSOR_HOOKS);
    const hooks = cursorConfig.hooks as Record<string, unknown> | undefined;
    if (hooks) {
      delete hooks.beforeSubmitPrompt;
      delete hooks.afterMCPExecution;
      writeJsonFile(CURSOR_HOOKS, cursorConfig);
      success(`已从 ${CURSOR_HOOKS} 移除 hooks 配置`);
    }
  }

  updateInstallationMeta("cursor", "hooks", "remove");
}

// ============================================================================
// 平台完整安装/卸载（导出供 setup.ts 使用）
// ============================================================================

export function installClaudeAll(): void {
  info("安装 Claude Code 全部插件...");
  console.log("");

  installClaudeHooks();
  configureClaudeHooks();
  installDispatchAgents();
  installSkills();

  console.log("");
  success("Claude Code 插件安装完成！");
  info("请重启 Claude Code 使配置生效。");
}

export function uninstallClaudeAll(): void {
  info("卸载 Claude Code 全部插件...");
  console.log("");

  uninstallClaudeHooks();
  uninstallDispatchAgents();
  uninstallSkills();
  cleanupSharedIfUnused();

  console.log("");
  success("Claude Code 插件已卸载");
}

export function installCursorAll(): void {
  info("安装 Cursor 全部插件...");
  console.log("");

  installCursorHooks();
  configureCursorHooks();

  console.log("");
  success("Cursor 插件安装完成！");
  info("请重启 Cursor 使配置生效。");
}

export function uninstallCursorAll(): void {
  info("卸载 Cursor 全部插件...");
  console.log("");

  uninstallCursorHooks();
  cleanupSharedIfUnused();

  console.log("");
  success("Cursor 插件已卸载");
}

// ============================================================================
// 帮助
// ============================================================================

function showHelp(): void {
  console.log(`
${colors.bold("tanmi-workspace plugins")} - 插件管理

${colors.bold("用法:")}
  tanmi-workspace plugins                    查看插件安装状态
  tanmi-workspace plugins install <平台>     安装插件
  tanmi-workspace plugins uninstall <平台>   卸载插件

${colors.bold("平台:")}
  --claude    Claude Code (Hooks, Agents, Skills)
  --cursor    Cursor (Hooks)

${colors.bold("示例:")}
  tanmi-workspace plugins                    # 查看状态
  tanmi-workspace plugins install --claude   # 安装 Claude 插件
  tanmi-workspace plugins uninstall --cursor # 卸载 Cursor 插件
`);
}

// ============================================================================
// 主函数
// ============================================================================

export default function main(): void {
  const args = process.argv.slice(3); // 跳过 node, script, plugins

  // 无参数：显示状态
  if (args.length === 0) {
    showStatus();
    return;
  }

  const action = args[0];
  const platform = args[1];

  switch (action) {
    case "install":
      if (platform === "--claude") {
        installClaudeAll();
      } else if (platform === "--cursor") {
        installCursorAll();
      } else {
        error("请指定平台: --claude 或 --cursor");
        showHelp();
        process.exit(1);
      }
      break;

    case "uninstall":
      if (platform === "--claude") {
        uninstallClaudeAll();
      } else if (platform === "--cursor") {
        uninstallCursorAll();
      } else {
        error("请指定平台: --claude 或 --cursor");
        showHelp();
        process.exit(1);
      }
      break;

    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;

    default:
      error(`未知操作: ${action}`);
      showHelp();
      process.exit(1);
  }
}
