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
  appendFileSync,
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
import { DEPRECATED_SKILLS } from "../constants/skills.js";

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
const CURSOR_AGENTS = join(CURSOR_HOME, "agents");
const CURSOR_SKILLS = join(CURSOR_HOME, "skills");

// OpenCode 配置
const OPENCODE_HOME = join(HOME, ".config", "opencode");
const OPENCODE_CONFIG = join(OPENCODE_HOME, "opencode.json");
const OPENCODE_AGENTS = join(OPENCODE_HOME, "agents");
const OPENCODE_SKILLS = join(OPENCODE_HOME, "skills");
const OPENCODE_PLUGINS = join(OPENCODE_HOME, "plugins");

// 安装元信息
const INSTALLATION_META_PATH = join(TANMI_HOME, "installation-meta.json");

// 插件源目录
const PLUGIN_ROOT = join(PROJECT_ROOT, "plugin");
const PLUGIN_SCRIPTS = join(PLUGIN_ROOT, "scripts");
const PLUGIN_HOOKS_GENERATED = join(PLUGIN_ROOT, "hooks", "generated");
const PLUGIN_AGENTS = join(PLUGIN_ROOT, "agents");
const PLUGIN_SKILLS = join(PLUGIN_ROOT, "skills");

// 安装目标目录（hooks/generated）
const TANMI_HOOKS = join(TANMI_HOME, "hooks");

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

// 插件日志文件路径
const PLUGIN_LOG_PATH = join(TANMI_HOME, "plugin-install.log");

/**
 * 持久化日志记录
 * @param action 操作类型
 * @param details 详细信息
 */
function logToFile(action: string, details: string): void {
  try {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${action}] ${details}\n`;
    appendFileSync(PLUGIN_LOG_PATH, logLine);
  } catch {
    // 静默失败
  }
}

// ============================================================================
// 工具函数
// ============================================================================

function getPackageVersion(): string {
  try {
    // 直接读取文件，避免 require 缓存导致 npm install 后仍返回旧版本
    const pkgPath = join(PROJECT_ROOT, "package.json");
    const pkgContent = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent);
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
      meta.global.platforms[platform].enabled = true; // 有组件安装则启用平台
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
  currentVersion: string; // 当前 package 版本
  claude: {
    hooks: boolean;
    hooksVersion?: string; // 安装时的版本
    hooksNeedsUpdate?: boolean; // 是否需要更新
    agents: string[]; // 已安装的 agent 文件名
    agentsVersion?: string;
    agentsNeedsUpdate?: boolean;
    skills: string[]; // 已安装的 skill 目录名
    skillsVersion?: string;
    skillsNeedsUpdate?: boolean;
  };
  cursor: {
    hooks: boolean;
    hooksVersion?: string;
    hooksNeedsUpdate?: boolean;
    agents: string[]; // 已安装的 agent 文件名
    agentsVersion?: string;
    agentsNeedsUpdate?: boolean;
    skills: string[]; // 已安装的 skill 目录名
    skillsVersion?: string;
    skillsNeedsUpdate?: boolean;
  };
  opencode: {
    plugins: boolean; // OpenCode 使用 plugins 而非 hooks
    pluginsVersion?: string;
    pluginsNeedsUpdate?: boolean;
    agents: string[];
    agentsVersion?: string;
    agentsNeedsUpdate?: boolean;
    skills: string[];
    skillsVersion?: string;
    skillsNeedsUpdate?: boolean;
  };
}

// 比较版本，完整比较 major.minor.patch
function needsVersionUpdate(installedVersion: string | undefined, currentVersion: string): boolean {
  if (!installedVersion) return false; // 没有记录版本信息，无法判断
  return installedVersion !== currentVersion;
}

function getPluginStatus(): PluginStatus {
  const currentVersion = getPackageVersion();
  const meta = readInstallationMeta();
  const claudePlatform = meta.global.platforms["claudeCode"];
  const cursorPlatform = meta.global.platforms["cursor"];
  const opencodePlatform = meta.global.platforms["opencode"];

  // Claude hooks
  const claudeHooksInstalled = existsSync(join(TANMI_SCRIPTS, "hook-entry.cjs"));
  const claudeHooksVersion = claudePlatform?.components?.hooks?.version;

  // Claude agents - 动态检测已安装的 agent
  const agentsDir = join(CLAUDE_HOME, "agents");
  const installedAgents: string[] = [];
  if (existsSync(agentsDir) && existsSync(PLUGIN_AGENTS)) {
    // 从源目录获取期望的 agent 列表
    const sourceAgents = readdirSync(PLUGIN_AGENTS).filter((name) => name.endsWith(".md") && name !== "CLAUDE.md");
    for (const agent of sourceAgents) {
      if (existsSync(join(agentsDir, agent))) {
        installedAgents.push(agent);
      }
    }
  }
  const claudeAgentsVersion = claudePlatform?.components?.agents?.version;

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
  const claudeSkillsVersion = claudePlatform?.components?.skills?.version;

  // Cursor hooks
  const cursorHooksInstalled = existsSync(join(TANMI_SCRIPTS, "cursor-hook-entry.cjs"));
  const cursorHooksVersion = cursorPlatform?.components?.hooks?.version;

  // Cursor agents - 动态检测已安装的 agent
  const cursorAgentsDir = CURSOR_AGENTS;
  const installedCursorAgents: string[] = [];
  if (existsSync(cursorAgentsDir) && existsSync(PLUGIN_AGENTS)) {
    const sourceAgents = readdirSync(PLUGIN_AGENTS).filter((name) => name.endsWith(".md") && name !== "CLAUDE.md");
    for (const agent of sourceAgents) {
      if (existsSync(join(cursorAgentsDir, agent))) {
        installedCursorAgents.push(agent);
      }
    }
  }
  const cursorAgentsVersion = cursorPlatform?.components?.agents?.version;

  // Cursor skills - 动态检测已安装的 skill
  const cursorSkillsDir = CURSOR_SKILLS;
  const installedCursorSkills: string[] = [];
  if (existsSync(PLUGIN_SKILLS) && existsSync(cursorSkillsDir)) {
    const sourceSkills = readdirSync(PLUGIN_SKILLS).filter((name) => {
      const fullPath = join(PLUGIN_SKILLS, name);
      return statSync(fullPath).isDirectory() && existsSync(join(fullPath, "SKILL.md"));
    });
    for (const skill of sourceSkills) {
      if (existsSync(join(cursorSkillsDir, skill, "SKILL.md"))) {
        installedCursorSkills.push(skill);
      }
    }
  }
  const cursorSkillsVersion = cursorPlatform?.components?.skills?.version;

  // OpenCode plugins - 检测 tanmi-workspace.ts 是否已安装
  const opencodePluginsInstalled = existsSync(join(OPENCODE_PLUGINS, "tanmi-workspace.ts"));
  const opencodePluginsVersion = opencodePlatform?.components?.plugins?.version;

  // OpenCode agents - 动态检测已安装的 agent
  const installedOpencodeAgents: string[] = [];
  if (existsSync(OPENCODE_AGENTS) && existsSync(PLUGIN_AGENTS)) {
    const sourceAgents = readdirSync(PLUGIN_AGENTS).filter((name) => name.endsWith(".md") && name !== "CLAUDE.md");
    for (const agent of sourceAgents) {
      // OpenCode agent 文件名保持一致
      if (existsSync(join(OPENCODE_AGENTS, agent))) {
        installedOpencodeAgents.push(agent);
      }
    }
  }
  const opencodeAgentsVersion = opencodePlatform?.components?.agents?.version;

  // OpenCode skills - 动态检测已安装的 skill
  const installedOpencodeSkills: string[] = [];
  if (existsSync(PLUGIN_SKILLS) && existsSync(OPENCODE_SKILLS)) {
    const sourceSkills = readdirSync(PLUGIN_SKILLS).filter((name) => {
      const fullPath = join(PLUGIN_SKILLS, name);
      return statSync(fullPath).isDirectory() && existsSync(join(fullPath, "SKILL.md"));
    });
    for (const skill of sourceSkills) {
      if (existsSync(join(OPENCODE_SKILLS, skill, "SKILL.md"))) {
        installedOpencodeSkills.push(skill);
      }
    }
  }
  const opencodeSkillsVersion = opencodePlatform?.components?.skills?.version;

  return {
    currentVersion,
    claude: {
      hooks: claudeHooksInstalled,
      hooksVersion: claudeHooksVersion,
      hooksNeedsUpdate: claudeHooksInstalled && needsVersionUpdate(claudeHooksVersion, currentVersion),
      agents: installedAgents,
      agentsVersion: claudeAgentsVersion,
      agentsNeedsUpdate: installedAgents.length > 0 && needsVersionUpdate(claudeAgentsVersion, currentVersion),
      skills: installedSkills,
      skillsVersion: claudeSkillsVersion,
      skillsNeedsUpdate: installedSkills.length > 0 && needsVersionUpdate(claudeSkillsVersion, currentVersion),
    },
    cursor: {
      hooks: cursorHooksInstalled,
      hooksVersion: cursorHooksVersion,
      hooksNeedsUpdate: cursorHooksInstalled && needsVersionUpdate(cursorHooksVersion, currentVersion),
      agents: installedCursorAgents,
      agentsVersion: cursorAgentsVersion,
      agentsNeedsUpdate: installedCursorAgents.length > 0 && needsVersionUpdate(cursorAgentsVersion, currentVersion),
      skills: installedCursorSkills,
      skillsVersion: cursorSkillsVersion,
      skillsNeedsUpdate: installedCursorSkills.length > 0 && needsVersionUpdate(cursorSkillsVersion, currentVersion),
    },
    opencode: {
      plugins: opencodePluginsInstalled,
      pluginsVersion: opencodePluginsVersion,
      pluginsNeedsUpdate: opencodePluginsInstalled && needsVersionUpdate(opencodePluginsVersion, currentVersion),
      agents: installedOpencodeAgents,
      agentsVersion: opencodeAgentsVersion,
      agentsNeedsUpdate: installedOpencodeAgents.length > 0 && needsVersionUpdate(opencodeAgentsVersion, currentVersion),
      skills: installedOpencodeSkills,
      skillsVersion: opencodeSkillsVersion,
      skillsNeedsUpdate: installedOpencodeSkills.length > 0 && needsVersionUpdate(opencodeSkillsVersion, currentVersion),
    },
  };
}

// 格式化组件状态显示
function formatComponentStatus(
  installed: boolean,
  count: number | null, // null 表示不显示数量
  needsUpdate: boolean | undefined,
  installedVersion: string | undefined
): string {
  if (!installed && count !== null && count === 0) {
    return colors.gray("未安装");
  }
  if (!installed) {
    return colors.gray("未安装");
  }

  const countStr = count !== null ? ` (${count})` : "";

  if (needsUpdate) {
    const versionStr = installedVersion ? ` v${installedVersion}` : "";
    return colors.yellow(`需更新${countStr}${versionStr}`);
  }

  return colors.green(`已安装${countStr}`);
}

function showStatus(): void {
  const status = getPluginStatus();

  console.log("");
  console.log(colors.bold(`TanmiWorkspace 插件状态 (v${status.currentVersion})`));
  console.log("");

  // Claude Code
  console.log(colors.bold("Claude Code:"));
  console.log(`  Hooks:  ${formatComponentStatus(status.claude.hooks, null, status.claude.hooksNeedsUpdate, status.claude.hooksVersion)}`);
  console.log(`  Agents: ${formatComponentStatus(status.claude.agents.length > 0, status.claude.agents.length, status.claude.agentsNeedsUpdate, status.claude.agentsVersion)}`);
  if (status.claude.agents.length > 0) {
    for (const agent of status.claude.agents) {
      console.log(`          ${colors.gray("-")} ${agent}`);
    }
  }
  console.log(`  Skills: ${formatComponentStatus(status.claude.skills.length > 0, status.claude.skills.length, status.claude.skillsNeedsUpdate, status.claude.skillsVersion)}`);
  if (status.claude.skills.length > 0) {
    for (const skill of status.claude.skills) {
      console.log(`          ${colors.gray("-")} ${skill}`);
    }
  }
  console.log("");

  // Cursor
  console.log(colors.bold("Cursor:"));
  console.log(`  Hooks:  ${formatComponentStatus(status.cursor.hooks, null, status.cursor.hooksNeedsUpdate, status.cursor.hooksVersion)}`);
  console.log(`  Agents: ${formatComponentStatus(status.cursor.agents.length > 0, status.cursor.agents.length, status.cursor.agentsNeedsUpdate, status.cursor.agentsVersion)}`);
  if (status.cursor.agents.length > 0) {
    for (const agent of status.cursor.agents) {
      console.log(`          ${colors.gray("-")} ${agent}`);
    }
  }
  console.log(`  Skills: ${formatComponentStatus(status.cursor.skills.length > 0, status.cursor.skills.length, status.cursor.skillsNeedsUpdate, status.cursor.skillsVersion)}`);
  if (status.cursor.skills.length > 0) {
    for (const skill of status.cursor.skills) {
      console.log(`          ${colors.gray("-")} ${skill}`);
    }
  }
  console.log("");

  // OpenCode
  console.log(colors.bold("OpenCode:"));
  console.log(`  Plugin: ${formatComponentStatus(status.opencode.plugins, null, status.opencode.pluginsNeedsUpdate, status.opencode.pluginsVersion)}`);
  console.log(`  Agents: ${formatComponentStatus(status.opencode.agents.length > 0, status.opencode.agents.length, status.opencode.agentsNeedsUpdate, status.opencode.agentsVersion)}`);
  if (status.opencode.agents.length > 0) {
    for (const agent of status.opencode.agents) {
      console.log(`          ${colors.gray("-")} ${agent}`);
    }
  }
  console.log(`  Skills: ${formatComponentStatus(status.opencode.skills.length > 0, status.opencode.skills.length, status.opencode.skillsNeedsUpdate, status.opencode.skillsVersion)}`);
  if (status.opencode.skills.length > 0) {
    for (const skill of status.opencode.skills) {
      console.log(`          ${colors.gray("-")} ${skill}`);
    }
  }
  console.log("");

  // 安装路径
  console.log(colors.gray("安装路径:"));
  console.log(colors.gray(`  Scripts: ${TANMI_SCRIPTS}`));
  console.log(colors.gray(`  Claude Agents:  ${join(CLAUDE_HOME, "agents")}`));
  console.log(colors.gray(`  Claude Skills:  ${join(CLAUDE_HOME, "skills")}`));
  console.log(colors.gray(`  Cursor Agents:  ${CURSOR_AGENTS}`));
  console.log(colors.gray(`  Cursor Skills:  ${CURSOR_SKILLS}`));
  console.log(colors.gray(`  OpenCode Plugins: ${OPENCODE_PLUGINS}`));
  console.log(colors.gray(`  OpenCode Agents:  ${OPENCODE_AGENTS}`));
  console.log(colors.gray(`  OpenCode Skills:  ${OPENCODE_SKILLS}`));
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
  installHooksGenerated();

  const hookSrc = join(PLUGIN_SCRIPTS, "hook-entry.cjs");
  const hookDest = join(TANMI_SCRIPTS, "hook-entry.cjs");

  if (!existsSync(hookSrc)) {
    error(`Hook 脚本不存在: ${hookSrc}`);
    return;
  }

  copyFile(hookSrc, hookDest);
  success(`Hook 脚本已安装到 ${hookDest}`);
}

/**
 * 安装 hooks/generated 目录（包含 write-tools.cjs 等配置）
 */
function installHooksGenerated(): void {
  const generatedDest = join(TANMI_HOOKS, "generated");
  ensureDir(generatedDest);

  if (!existsSync(PLUGIN_HOOKS_GENERATED)) {
    warn(`hooks/generated 目录不存在: ${PLUGIN_HOOKS_GENERATED}`);
    return;
  }

  const files = readdirSync(PLUGIN_HOOKS_GENERATED);
  for (const file of files) {
    // 跳过 CLAUDE.md 等非脚本文件
    if (!file.endsWith(".cjs") && !file.endsWith(".js")) continue;
    const src = join(PLUGIN_HOOKS_GENERATED, file);
    const dest = join(generatedDest, file);
    copyFile(src, dest);
  }
  success(`Hook 配置已安装到 ${generatedDest}/`);
}

/**
 * TanmiWorkspace Hook 脚本路径标记，用于识别我们管理的 Hook
 * 支持正式模式和开发模式两种路径
 */
export const TANMI_HOOK_MARKERS = [
  ".tanmi-workspace/scripts/hook-entry.cjs",     // 正式模式
  ".tanmi-workspace-dev/scripts/hook-entry.cjs", // 开发模式
];

/**
 * Cursor 版本的 TanmiWorkspace Hook 脚本路径标记
 */
export const TANMI_CURSOR_HOOK_MARKERS = [
  ".tanmi-workspace/scripts/cursor-hook-entry.cjs",     // 正式模式
  ".tanmi-workspace-dev/scripts/cursor-hook-entry.cjs", // 开发模式
];

/** Claude Code Hook 条目类型 */
export interface ClaudeHookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
}

/** Cursor Hook 条目类型 */
export interface CursorHookEntry {
  command?: string;
}

/**
 * 检查 Hook 条目是否由 TanmiWorkspace 管理（Claude Code 版本）
 * 通过检测 command 路径中是否包含 TanmiWorkspace 脚本标记来识别
 *
 * 匹配策略：command 必须包含完整的标记路径之一
 *
 * @param hookEntry Hook 配置条目
 * @returns true 如果任意 hook 的 command 包含 TanmiWorkspace 标记
 */
export function isTanmiHook(hookEntry: ClaudeHookEntry): boolean {
  return hookEntry.hooks?.some((h) =>
    h.command && TANMI_HOOK_MARKERS.some((marker) => h.command!.includes(marker))
  ) ?? false;
}

/**
 * 检查 Cursor Hook 条目是否由 TanmiWorkspace 管理
 * Cursor 的 hook 结构是 { command: string }，没有嵌套的 hooks 数组
 *
 * @param hookEntry Cursor Hook 配置条目
 * @returns true 如果 command 包含 TanmiWorkspace Cursor 脚本标记
 */
export function isTanmiCursorHook(hookEntry: CursorHookEntry): boolean {
  return hookEntry.command
    ? TANMI_CURSOR_HOOK_MARKERS.some((marker) => hookEntry.command!.includes(marker))
    : false;
}

/**
 * 合并 Claude Code hooks 配置
 * 保留用户自定义的 hook，添加/更新 TanmiWorkspace 的 hook
 *
 * @param existingHooks 现有的 hooks 配置
 * @param tanmiHooksConfig TanmiWorkspace 的 hooks 配置
 * @returns 合并后的 hooks 配置
 */
export function mergeClaudeHooks(
  existingHooks: Record<string, ClaudeHookEntry[]>,
  tanmiHooksConfig: Record<string, ClaudeHookEntry[]>
): Record<string, ClaudeHookEntry[]> {
  const mergedHooks: Record<string, ClaudeHookEntry[]> = {};

  // 1. 保留用户的 Hook（非 TanmiWorkspace 管理的）
  for (const [eventName, matchers] of Object.entries(existingHooks)) {
    const userMatchers = matchers.filter((m) => !isTanmiHook(m));
    if (userMatchers.length > 0) {
      mergedHooks[eventName] = userMatchers;
    }
  }

  // 2. 添加/更新 TanmiWorkspace 的 Hook
  for (const [eventName, matchers] of Object.entries(tanmiHooksConfig)) {
    mergedHooks[eventName] = [...(mergedHooks[eventName] || []), ...matchers];
  }

  return mergedHooks;
}

/**
 * 从 Claude Code hooks 配置中移除 TanmiWorkspace 的 hook
 * 保留用户自定义的 hook
 *
 * @param existingHooks 现有的 hooks 配置
 * @returns 过滤后的 hooks 配置（只保留用户自定义的）
 */
export function filterOutTanmiClaudeHooks(
  existingHooks: Record<string, ClaudeHookEntry[]>
): Record<string, ClaudeHookEntry[]> {
  const filteredHooks: Record<string, ClaudeHookEntry[]> = {};

  for (const [eventName, matchers] of Object.entries(existingHooks)) {
    const userMatchers = matchers.filter((m) => !isTanmiHook(m));
    if (userMatchers.length > 0) {
      filteredHooks[eventName] = userMatchers;
    }
  }

  return filteredHooks;
}

/**
 * 合并 Cursor hooks 配置
 * 保留用户自定义的 hook，添加 TanmiWorkspace 的 hook
 *
 * @param existingHooks 现有的 hooks 配置
 * @param tanmiHookEntry TanmiWorkspace 的 hook 条目
 * @param eventNames 需要配置的事件名称列表
 * @returns 合并后的 hooks 配置
 */
export function mergeCursorHooks(
  existingHooks: Record<string, CursorHookEntry[]>,
  tanmiHookEntry: CursorHookEntry,
  eventNames: string[]
): Record<string, CursorHookEntry[]> {
  const mergedHooks: Record<string, CursorHookEntry[]> = { ...existingHooks };

  for (const eventName of eventNames) {
    const existing = mergedHooks[eventName] || [];
    // 过滤掉已有的 TanmiWorkspace hook，保留用户自定义的
    const userHooks = existing.filter((h) => !isTanmiCursorHook(h));
    // 添加 TanmiWorkspace hook
    mergedHooks[eventName] = [...userHooks, tanmiHookEntry];
  }

  return mergedHooks;
}

/**
 * 从 Cursor hooks 配置中移除 TanmiWorkspace 的 hook
 * 保留用户自定义的 hook
 *
 * @param existingHooks 现有的 hooks 配置
 * @param eventNames 需要处理的事件名称列表
 * @returns 过滤后的 hooks 配置（只保留用户自定义的）
 */
export function filterOutTanmiCursorHooks(
  existingHooks: Record<string, CursorHookEntry[]>,
  eventNames: string[]
): Record<string, CursorHookEntry[]> {
  const filteredHooks: Record<string, CursorHookEntry[]> = { ...existingHooks };

  for (const eventName of eventNames) {
    const existing = filteredHooks[eventName] || [];
    const userHooks = existing.filter((h) => !isTanmiCursorHook(h));

    if (userHooks.length > 0) {
      filteredHooks[eventName] = userHooks;
    } else {
      delete filteredHooks[eventName];
    }
  }

  return filteredHooks;
}

function configureClaudeHooks(): void {
  info("配置 Claude Code Hooks...");

  ensureDir(CLAUDE_HOME);

  const settings = readJsonFile(CLAUDE_SETTINGS);
  const hookScript = join(TANMI_SCRIPTS, "hook-entry.cjs");

  // TanmiWorkspace 的 Hook 配置
  const tanmiHooksConfig: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout: number }> }>> = {
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
    PreToolUse: [
      {
        // 匹配所有工具，用于流程强制机制
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" PreToolUse`,
            timeout: 3000,
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
      {
        matcher: "Edit",
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" PostToolUse`,
            timeout: 3000,
          },
        ],
      },
      {
        matcher: "Write",
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" PostToolUse`,
            timeout: 3000,
          },
        ],
      },
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" PostToolUse`,
            timeout: 3000,
          },
        ],
      },
      {
        matcher: "TodoWrite",
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

  // 深度合并：保留用户自定义 Hook，只替换 TanmiWorkspace 的 Hook
  const existingHooks = (settings.hooks || {}) as Record<string, ClaudeHookEntry[]>;
  settings.hooks = mergeClaudeHooks(existingHooks, tanmiHooksConfig);
  writeJsonFile(CLAUDE_SETTINGS, settings);

  success(`Hooks 已配置到 ${CLAUDE_SETTINGS}`);
  updateInstallationMeta("claudeCode", "hooks", "update");
}

function installDispatchAgents(): void {
  info("安装派发 Agent 模板...");

  if (!existsSync(PLUGIN_AGENTS)) {
    error(`Agent 模板目录不存在: ${PLUGIN_AGENTS}`);
    return;
  }

  // 动态读取所有 .md 文件（排除 CLAUDE.md）
  const agentFiles = readdirSync(PLUGIN_AGENTS).filter((name) => name.endsWith(".md") && name !== "CLAUDE.md");

  if (agentFiles.length === 0) {
    warn("没有找到 Agent 模板文件");
    return;
  }

  const agentsDir = join(CLAUDE_HOME, "agents");
  ensureDir(agentsDir);

  for (const agentFile of agentFiles) {
    const src = join(PLUGIN_AGENTS, agentFile);
    const dest = join(agentsDir, agentFile);
    copyFile(src, dest);
  }

  success(`派发 Agent 已安装到 ${agentsDir}/`);
  for (const agentFile of agentFiles) {
    info(`  - ${agentFile}`);
  }

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

  // 获取当前版本（复用 getPackageVersion）
  const currentVersion = getPackageVersion();

  // 1. 清理废弃的 Skill（黑名单，解决旧版用户残留）
  for (const deprecated of DEPRECATED_SKILLS) {
    const deprecatedPath = join(skillsDestDir, deprecated);
    if (existsSync(deprecatedPath)) {
      removeDir(deprecatedPath);
      info(`  - 已删除废弃 Skill: ${deprecated}`);
      logToFile("SKILL_CLEANUP", `删除废弃 Skill (黑名单): ${deprecated}`);
    }
  }

  // 2. 清理有标记但源不存在的 Skill（自动检测废弃）
  if (existsSync(skillsDestDir)) {
    const installedSkills = readdirSync(skillsDestDir).filter((name) => {
      const fullPath = join(skillsDestDir, name);
      return statSync(fullPath).isDirectory();
    });
    for (const skill of installedSkills) {
      const skillPath = join(skillsDestDir, skill);
      const markerPath = join(skillPath, ".tanmi-managed");
      const existsInSource = existsSync(join(PLUGIN_SKILLS, skill));

      if (existsSync(markerPath) && !existsInSource) {
        removeDir(skillPath);
        info(`  - 已删除废弃 Skill: ${skill}`);
        logToFile("SKILL_CLEANUP", `删除废弃 Skill (源不存在): ${skill}`);
      }
    }
  }

  // 3. 安装 Skill 并添加标记文件
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

      // 写入标记文件
      try {
        const markerContent = JSON.stringify(
          {
            installedAt: new Date().toISOString(),
            installedVersion: currentVersion,
            source: "tanmi-workspace",
          },
          null,
          2
        );
        writeFileSync(join(skillDestDir, ".tanmi-managed"), markerContent);
      } catch (err) {
        warn(`无法写入标记文件: ${err instanceof Error ? err.message : String(err)}`);
      }

      info(`  - ${skillName}/`);
      count++;
    }
  }

  if (count === 0) {
    warn("未找到有效的 Skill 目录（需包含 SKILL.md）");
    return;
  }

  success(`已安装 ${count} 个 Skill 模板到 ${skillsDestDir}/`);
  logToFile("SKILL_INSTALL", `安装 ${count} 个 Skill (v${currentVersion})`);
  updateInstallationMeta("claudeCode", "skills", "update");
}

function uninstallClaudeHooks(): void {
  info("卸载 Claude Code Hook...");

  const hookPath = join(TANMI_SCRIPTS, "hook-entry.cjs");
  if (removeFile(hookPath)) {
    success(`已删除 ${hookPath}`);
  }

  // 清理 hooks/generated 目录
  const generatedDir = join(TANMI_HOOKS, "generated");
  if (removeDir(generatedDir)) {
    success(`已删除 ${generatedDir}`);
  }

  if (existsSync(CLAUDE_SETTINGS)) {
    const settings = readJsonFile(CLAUDE_SETTINGS);
    const existingHooks = (settings.hooks || {}) as Record<string, ClaudeHookEntry[]>;

    // 只删除 TanmiWorkspace 的 Hook，保留用户自定义的
    const filteredHooks = filterOutTanmiClaudeHooks(existingHooks);

    if (Object.keys(filteredHooks).length > 0) {
      settings.hooks = filteredHooks;
      writeJsonFile(CLAUDE_SETTINGS, settings);
      success(`已从 ${CLAUDE_SETTINGS} 移除 TanmiWorkspace hooks（保留用户自定义 hooks）`);
    } else {
      delete settings.hooks;
      writeJsonFile(CLAUDE_SETTINGS, settings);
      success(`已从 ${CLAUDE_SETTINGS} 移除 hooks 配置`);
    }
  }

  updateInstallationMeta("claudeCode", "hooks", "remove");
}

function uninstallDispatchAgents(): void {
  info("卸载派发 Agent...");

  const agentsDir = join(CLAUDE_HOME, "agents");

  // 动态获取要卸载的 agent 列表（排除 CLAUDE.md）
  let agentFiles: string[] = [];
  if (existsSync(PLUGIN_AGENTS)) {
    agentFiles = readdirSync(PLUGIN_AGENTS).filter((name) => name.endsWith(".md") && name !== "CLAUDE.md");
  }

  if (agentFiles.length === 0) {
    warn("没有找到 Agent 模板文件");
    return;
  }

  for (const file of agentFiles) {
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

/** Cursor TanmiWorkspace 需要配置的 hook 事件 */
const CURSOR_TANMI_HOOK_EVENTS = [
  "sessionStart",
  "beforeSubmitPrompt",
  "beforeMCPExecution",
  "afterMCPExecution",
  "afterShellExecution",
  "afterFileEdit",
  "preToolUse",
  "stop",
  "preCompact",
];

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

  const existingHooks = cursorConfig.hooks as Record<string, CursorHookEntry[]>;
  const tanmiHookEntry: CursorHookEntry = { command: `node "${hookScript}"` };

  cursorConfig.hooks = mergeCursorHooks(existingHooks, tanmiHookEntry, CURSOR_TANMI_HOOK_EVENTS);
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
    const hooks = cursorConfig.hooks as Record<string, CursorHookEntry[]> | undefined;

    if (hooks) {
      const filteredHooks = filterOutTanmiCursorHooks(hooks, CURSOR_TANMI_HOOK_EVENTS);
      const hasUserHooks = CURSOR_TANMI_HOOK_EVENTS.some((e) => filteredHooks[e]?.length > 0);

      cursorConfig.hooks = filteredHooks;
      writeJsonFile(CURSOR_HOOKS, cursorConfig);

      if (hasUserHooks) {
        success(`已从 ${CURSOR_HOOKS} 移除 TanmiWorkspace hooks（保留用户自定义 hooks）`);
      } else {
        success(`已从 ${CURSOR_HOOKS} 移除 hooks 配置`);
      }
    }
  }

  updateInstallationMeta("cursor", "hooks", "remove");
}

function installCursorAgents(): void {
  info("安装 Cursor Agent 模板...");

  if (!existsSync(PLUGIN_AGENTS)) {
    error(`Agent 模板目录不存在: ${PLUGIN_AGENTS}`);
    return;
  }

  // 动态读取所有 .md 文件（排除 CLAUDE.md）
  const agentFiles = readdirSync(PLUGIN_AGENTS).filter((name) => name.endsWith(".md") && name !== "CLAUDE.md");

  if (agentFiles.length === 0) {
    warn("没有找到 Agent 模板文件");
    return;
  }

  ensureDir(CURSOR_AGENTS);

  const currentVersion = getPackageVersion();

  // 1. 清理有标记但源不存在的 Agent（自动检测废弃）
  if (existsSync(CURSOR_AGENTS)) {
    const installedFiles = readdirSync(CURSOR_AGENTS).filter((name) => name.endsWith(".md"));
    for (const file of installedFiles) {
      const markerPath = join(CURSOR_AGENTS, `${file}.tanmi-managed`);
      const existsInSource = existsSync(join(PLUGIN_AGENTS, file));

      if (existsSync(markerPath) && !existsInSource) {
        removeFile(join(CURSOR_AGENTS, file));
        removeFile(markerPath);
        info(`  - 已删除废弃 Agent: ${file}`);
        logToFile("CURSOR_AGENT_CLEANUP", `删除废弃 Agent (源不存在): ${file}`);
      }
    }
  }

  // 2. 安装 Agent 并添加 sidecar 标记文件
  for (const agentFile of agentFiles) {
    const src = join(PLUGIN_AGENTS, agentFile);
    const dest = join(CURSOR_AGENTS, agentFile);
    const markerPath = join(CURSOR_AGENTS, `${agentFile}.tanmi-managed`);

    copyFile(src, dest);

    // 写入 sidecar 标记文件
    try {
      const markerContent = JSON.stringify(
        {
          installedAt: new Date().toISOString(),
          installedVersion: currentVersion,
          source: "tanmi-workspace",
        },
        null,
        2
      );
      writeFileSync(markerPath, markerContent);
    } catch (err) {
      warn(`无法写入标记文件: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  success(`Cursor Agent 已安装到 ${CURSOR_AGENTS}/`);
  for (const agentFile of agentFiles) {
    info(`  - ${agentFile}`);
  }

  logToFile("CURSOR_AGENT_INSTALL", `安装 ${agentFiles.length} 个 Agent (v${currentVersion})`);
  updateInstallationMeta("cursor", "agents", "update");
}

function installCursorSkills(): void {
  info("安装 Cursor Skills 模板...");

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

  ensureDir(CURSOR_SKILLS);

  // 获取当前版本（复用 getPackageVersion）
  const currentVersion = getPackageVersion();

  // 1. 清理废弃的 Skill（黑名单）
  for (const deprecated of DEPRECATED_SKILLS) {
    const deprecatedPath = join(CURSOR_SKILLS, deprecated);
    if (existsSync(deprecatedPath)) {
      removeDir(deprecatedPath);
      info(`  - 已删除废弃 Skill: ${deprecated}`);
      logToFile("CURSOR_SKILL_CLEANUP", `删除废弃 Skill (黑名单): ${deprecated}`);
    }
  }

  // 2. 清理有标记但源不存在的 Skill（自动检测废弃）
  if (existsSync(CURSOR_SKILLS)) {
    const installedSkills = readdirSync(CURSOR_SKILLS).filter((name) => {
      const fullPath = join(CURSOR_SKILLS, name);
      return statSync(fullPath).isDirectory();
    });
    for (const skill of installedSkills) {
      const skillPath = join(CURSOR_SKILLS, skill);
      const markerPath = join(skillPath, ".tanmi-managed");
      const existsInSource = existsSync(join(PLUGIN_SKILLS, skill));

      if (existsSync(markerPath) && !existsInSource) {
        removeDir(skillPath);
        info(`  - 已删除废弃 Skill: ${skill}`);
        logToFile("CURSOR_SKILL_CLEANUP", `删除废弃 Skill (源不存在): ${skill}`);
      }
    }
  }

  // 3. 安装 Skill 并添加标记文件
  let count = 0;
  for (const skillName of skillDirs) {
    const skillSrcDir = join(PLUGIN_SKILLS, skillName);
    const skillMdPath = join(skillSrcDir, "SKILL.md");

    if (existsSync(skillMdPath)) {
      const skillDestDir = join(CURSOR_SKILLS, skillName);

      if (existsSync(skillDestDir)) {
        removeDir(skillDestDir);
      }

      copyDir(skillSrcDir, skillDestDir);

      // 写入标记文件
      try {
        const markerContent = JSON.stringify(
          {
            installedAt: new Date().toISOString(),
            installedVersion: currentVersion,
            source: "tanmi-workspace",
          },
          null,
          2
        );
        writeFileSync(join(skillDestDir, ".tanmi-managed"), markerContent);
      } catch (err) {
        warn(`无法写入标记文件: ${err instanceof Error ? err.message : String(err)}`);
      }

      info(`  - ${skillName}/`);
      count++;
    }
  }

  if (count === 0) {
    warn("未找到有效的 Skill 目录（需包含 SKILL.md）");
    return;
  }

  success(`已安装 ${count} 个 Cursor Skill 模板到 ${CURSOR_SKILLS}/`);
  logToFile("CURSOR_SKILL_INSTALL", `安装 ${count} 个 Skill (v${currentVersion})`);
  updateInstallationMeta("cursor", "skills", "update");
}

function uninstallCursorAgents(): void {
  info("卸载 Cursor Agent...");

  if (!existsSync(CURSOR_AGENTS)) {
    return;
  }

  // 基于标记文件卸载：只删除有 .tanmi-managed 标记的 Agent
  const allFiles = readdirSync(CURSOR_AGENTS);
  const markerFiles = allFiles.filter((name) => name.endsWith(".tanmi-managed"));

  if (markerFiles.length === 0) {
    info("没有找到 tanmi 管理的 Agent");
    return;
  }

  for (const markerFile of markerFiles) {
    // markerFile 格式: agent-name.md.tanmi-managed
    const agentFile = markerFile.replace(".tanmi-managed", "");
    const agentPath = join(CURSOR_AGENTS, agentFile);
    const markerPath = join(CURSOR_AGENTS, markerFile);

    if (removeFile(agentPath)) {
      success(`已删除 ${agentPath}`);
    }
    removeFile(markerPath);
  }

  if (isDirEmpty(CURSOR_AGENTS)) {
    removeDir(CURSOR_AGENTS);
  }

  updateInstallationMeta("cursor", "agents", "remove");
}

function uninstallCursorSkills(): void {
  info("卸载 Cursor Skills...");

  if (!existsSync(CURSOR_SKILLS)) {
    return;
  }

  // 基于标记文件卸载：只删除有 .tanmi-managed 标记的 Skill
  const installedSkills = readdirSync(CURSOR_SKILLS).filter((name) => {
    const fullPath = join(CURSOR_SKILLS, name);
    try {
      return statSync(fullPath).isDirectory();
    } catch {
      return false;
    }
  });

  let deletedCount = 0;
  for (const skillName of installedSkills) {
    const skillPath = join(CURSOR_SKILLS, skillName);
    const markerPath = join(skillPath, ".tanmi-managed");

    // 只删除有 tanmi 标记的 Skill
    if (existsSync(markerPath)) {
      if (removeDir(skillPath)) {
        success(`已删除 ${skillPath}/`);
        deletedCount++;
      }
    }
  }

  if (deletedCount === 0) {
    info("没有找到 tanmi 管理的 Skill");
  }

  if (isDirEmpty(CURSOR_SKILLS)) {
    removeDir(CURSOR_SKILLS);
  }

  updateInstallationMeta("cursor", "skills", "remove");
}

// ============================================================================
// 单独安装函数（导出供 setup.ts 使用）
// ============================================================================

export function installClaudeHooksExport(): void {
  installClaudeHooks();
  configureClaudeHooks();
}

export function installClaudeAgentsExport(): void {
  installDispatchAgents();
}

export function installClaudeSkillsExport(): void {
  installSkills();
}

export function installCursorAgentsExport(): void {
  installCursorAgents();
}

export function installCursorSkillsExport(): void {
  installCursorSkills();
}

export { getPluginStatus };

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
  installCursorAgents();
  installCursorSkills();

  console.log("");
  success("Cursor 插件安装完成！");
  info("请重启 Cursor 使配置生效。");
}

export function uninstallCursorAll(): void {
  info("卸载 Cursor 全部插件...");
  console.log("");

  uninstallCursorHooks();
  uninstallCursorAgents();
  uninstallCursorSkills();
  cleanupSharedIfUnused();

  console.log("");
  success("Cursor 插件已卸载");
}

// ============================================================================
// OpenCode 插件
// ============================================================================

// OpenCode Plugin 源文件
const OPENCODE_PLUGIN_SOURCE = join(PLUGIN_ROOT, "opencode", "index.ts");

/**
 * 转换 Claude Agent 格式到 OpenCode Agent 格式
 * Claude: tools: "Read, Write, Edit, Bash, ..." (逗号分隔字符串)
 * OpenCode: tools: {read: true, write: true, edit: true, bash: true, ...} (布尔对象)
 */
function convertAgentToOpenCodeFormat(content: string): string {
  // 解析 YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return content; // 无 frontmatter，直接返回
  }

  const frontmatter = frontmatterMatch[1];
  const body = content.slice(frontmatterMatch[0].length);

  // 解析 frontmatter 字段
  const lines = frontmatter.split("\n");
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      fields[key] = value;
    }
  }

  // 转换 tools: "Read, Write, ..." → tools 布尔对象
  let toolsYaml = "";
  if (fields.tools) {
    const toolList = fields.tools.split(",").map((t) => t.trim().toLowerCase());
    const toolLines: string[] = [];
    for (const tool of toolList) {
      if (tool.includes("*")) {
        // 通配符如 tanmi-workspace/* 保持原样
        toolLines.push(`  "${tool}": true`);
      } else {
        toolLines.push(`  ${tool}: true`);
      }
    }
    toolsYaml = `tools:\n${toolLines.join("\n")}`;
  }

  // 不转换 model 字段 - OpenCode 用户可能使用不同的 provider，应使用用户默认配置

  // 构建 OpenCode 格式的 frontmatter
  const newFrontmatter = [
    `name: ${fields.name || "unnamed"}`,
    `description: ${fields.description || "No description"}`,
    toolsYaml,
    "mode: all", // OpenCode 需要 mode 字段
  ]
    .filter(Boolean)
    .join("\n");

  return `---\n${newFrontmatter}\n---${body}`;
}

function installOpenCodePlugins(): void {
  info("安装 OpenCode Plugin...");

  // 确保共享脚本已安装（OpenCode 插件依赖这些模块）
  ensureDir(TANMI_SCRIPTS);
  installSharedScripts();
  installHooksGenerated();

  ensureDir(OPENCODE_PLUGINS);

  if (!existsSync(OPENCODE_PLUGIN_SOURCE)) {
    warn(`OpenCode Plugin 源文件不存在: ${OPENCODE_PLUGIN_SOURCE}`);
    return;
  }

  const destPath = join(OPENCODE_PLUGINS, "tanmi-workspace.ts");
  copyFile(OPENCODE_PLUGIN_SOURCE, destPath);
  success(`Plugin 已安装到 ${destPath}`);
  updateInstallationMeta("opencode", "plugins", "update");
  logToFile("INSTALL", `OpenCode Plugin: ${destPath}`);
}

function uninstallOpenCodePlugins(): void {
  info("卸载 OpenCode Plugin...");

  const pluginPath = join(OPENCODE_PLUGINS, "tanmi-workspace.ts");
  if (removeFile(pluginPath)) {
    success("Plugin 已卸载");
    updateInstallationMeta("opencode", "plugins", "remove");
    logToFile("UNINSTALL", `OpenCode Plugin: ${pluginPath}`);
  } else {
    info("Plugin 未安装，跳过");
  }
}

function installOpenCodeAgents(): void {
  info("安装 OpenCode Agents...");

  ensureDir(OPENCODE_AGENTS);

  if (!existsSync(PLUGIN_AGENTS)) {
    warn(`Agent 源目录不存在: ${PLUGIN_AGENTS}`);
    return;
  }

  const agents = readdirSync(PLUGIN_AGENTS).filter((name) => name.endsWith(".md") && name !== "CLAUDE.md");

  for (const agent of agents) {
    const srcPath = join(PLUGIN_AGENTS, agent);
    const destPath = join(OPENCODE_AGENTS, agent);

    // 读取并转换格式
    const content = readFileSync(srcPath, "utf-8");
    const convertedContent = convertAgentToOpenCodeFormat(content);
    writeFileSync(destPath, convertedContent, "utf-8");
    info(`  已安装: ${agent}`);
  }

  success(`${agents.length} 个 Agent 已安装到 ${OPENCODE_AGENTS}/`);
  updateInstallationMeta("opencode", "agents", "update");
  logToFile("INSTALL", `OpenCode Agents: ${agents.join(", ")}`);
}

function uninstallOpenCodeAgents(): void {
  info("卸载 OpenCode Agents...");

  if (!existsSync(OPENCODE_AGENTS)) {
    info("Agents 目录不存在，跳过");
    return;
  }

  if (!existsSync(PLUGIN_AGENTS)) {
    warn("无法确定要卸载的 Agent（源目录不存在）");
    return;
  }

  const sourceAgents = readdirSync(PLUGIN_AGENTS).filter((name) => name.endsWith(".md") && name !== "CLAUDE.md");
  let removed = 0;

  for (const agent of sourceAgents) {
    const agentPath = join(OPENCODE_AGENTS, agent);
    if (removeFile(agentPath)) {
      info(`  已卸载: ${agent}`);
      removed++;
    }
  }

  if (removed > 0) {
    success(`${removed} 个 Agent 已卸载`);
    updateInstallationMeta("opencode", "agents", "remove");
    logToFile("UNINSTALL", `OpenCode Agents: ${removed} removed`);
  } else {
    info("没有 Agent 需要卸载");
  }
}

function installOpenCodeSkills(): void {
  info("安装 OpenCode Skills...");

  ensureDir(OPENCODE_SKILLS);

  if (!existsSync(PLUGIN_SKILLS)) {
    warn(`Skill 源目录不存在: ${PLUGIN_SKILLS}`);
    return;
  }

  const skills = readdirSync(PLUGIN_SKILLS).filter((name) => {
    const fullPath = join(PLUGIN_SKILLS, name);
    return statSync(fullPath).isDirectory() && existsSync(join(fullPath, "SKILL.md"));
  });

  for (const skill of skills) {
    const srcPath = join(PLUGIN_SKILLS, skill);
    const destPath = join(OPENCODE_SKILLS, skill);
    // 直接复制，OpenCode 兼容 Claude 的 skill 格式
    copyDir(srcPath, destPath);
    info(`  已安装: ${skill}`);
  }

  success(`${skills.length} 个 Skill 已安装到 ${OPENCODE_SKILLS}/`);
  updateInstallationMeta("opencode", "skills", "update");
  logToFile("INSTALL", `OpenCode Skills: ${skills.join(", ")}`);
}

function uninstallOpenCodeSkills(): void {
  info("卸载 OpenCode Skills...");

  if (!existsSync(OPENCODE_SKILLS)) {
    info("Skills 目录不存在，跳过");
    return;
  }

  if (!existsSync(PLUGIN_SKILLS)) {
    warn("无法确定要卸载的 Skill（源目录不存在）");
    return;
  }

  const sourceSkills = readdirSync(PLUGIN_SKILLS).filter((name) => {
    const fullPath = join(PLUGIN_SKILLS, name);
    return statSync(fullPath).isDirectory() && existsSync(join(fullPath, "SKILL.md"));
  });

  let removed = 0;

  for (const skill of sourceSkills) {
    const skillPath = join(OPENCODE_SKILLS, skill);
    if (removeDir(skillPath)) {
      info(`  已卸载: ${skill}`);
      removed++;
    }
  }

  if (removed > 0) {
    success(`${removed} 个 Skill 已卸载`);
    updateInstallationMeta("opencode", "skills", "remove");
    logToFile("UNINSTALL", `OpenCode Skills: ${removed} removed`);
  } else {
    info("没有 Skill 需要卸载");
  }
}

export function installOpenCodeAll(): void {
  info("安装 OpenCode 全部插件...");
  console.log("");

  installOpenCodePlugins();
  installOpenCodeAgents();
  installOpenCodeSkills();

  console.log("");
  success("OpenCode 插件安装完成！");
  info("请重启 OpenCode 使配置生效。");
}

export function uninstallOpenCodeAll(): void {
  info("卸载 OpenCode 全部插件...");
  console.log("");

  uninstallOpenCodePlugins();
  uninstallOpenCodeAgents();
  uninstallOpenCodeSkills();

  console.log("");
  success("OpenCode 插件已卸载");
}

// ============================================================================
// API 专用安装函数（返回结构化结果）
// ============================================================================

/** 安装步骤结果 */
export interface InstallStepResult {
  name: string;
  success: boolean;
  message?: string;
}

/** 平台安装结果 */
export interface PlatformInstallResult {
  platform: string;
  steps: InstallStepResult[];
}

/**
 * 执行单个安装步骤并捕获结果
 * @param name 步骤名称
 * @param fn 安装函数
 * @returns 步骤执行结果
 */
function executeStep(name: string, fn: () => void): InstallStepResult {
  try {
    fn();
    return { name, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name, success: false, message };
  }
}

/**
 * Claude Code 平台安装（API 版本）
 * 返回每个步骤的执行结果
 */
export function installClaudeAllForApi(): PlatformInstallResult {
  const steps: InstallStepResult[] = [];

  steps.push(executeStep("安装 Hook 脚本", () => {
    ensureDir(TANMI_SCRIPTS);
    installSharedScripts();
    installHooksGenerated();

    const hookSrc = join(PLUGIN_SCRIPTS, "hook-entry.cjs");
    const hookDest = join(TANMI_SCRIPTS, "hook-entry.cjs");

    if (!existsSync(hookSrc)) {
      throw new Error(`Hook 脚本不存在: ${hookSrc}`);
    }

    copyFile(hookSrc, hookDest);
  }));

  steps.push(executeStep("配置 Hooks", () => {
    ensureDir(CLAUDE_HOME);

    const settings = readJsonFile(CLAUDE_SETTINGS);
    const hookScript = join(TANMI_SCRIPTS, "hook-entry.cjs");

    const tanmiHooksConfig: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout: number }> }>> = {
      SessionStart: [{
        matcher: "startup|clear|compact",
        hooks: [{ type: "command", command: `node "${hookScript}" SessionStart`, timeout: 10000 }],
      }],
      PreToolUse: [{
        hooks: [{ type: "command", command: `node "${hookScript}" PreToolUse`, timeout: 3000 }],
      }],
      UserPromptSubmit: [{
        hooks: [{ type: "command", command: `node "${hookScript}" UserPromptSubmit`, timeout: 5000 }],
      }],
      PostToolUse: [
        { matcher: "mcp__tanmi-workspace__.*", hooks: [{ type: "command", command: `node "${hookScript}" PostToolUse`, timeout: 3000 }] },
        { matcher: "Edit", hooks: [{ type: "command", command: `node "${hookScript}" PostToolUse`, timeout: 3000 }] },
        { matcher: "Write", hooks: [{ type: "command", command: `node "${hookScript}" PostToolUse`, timeout: 3000 }] },
        { matcher: "Bash", hooks: [{ type: "command", command: `node "${hookScript}" PostToolUse`, timeout: 3000 }] },
        { matcher: "TodoWrite", hooks: [{ type: "command", command: `node "${hookScript}" PostToolUse`, timeout: 3000 }] },
      ],
    };

    const existingHooks = (settings.hooks || {}) as Record<string, ClaudeHookEntry[]>;
    settings.hooks = mergeClaudeHooks(existingHooks, tanmiHooksConfig);
    writeJsonFile(CLAUDE_SETTINGS, settings);
    updateInstallationMeta("claudeCode", "hooks", "update");
  }));

  steps.push(executeStep("安装 Agents", () => {
    if (!existsSync(PLUGIN_AGENTS)) {
      throw new Error(`Agent 模板目录不存在: ${PLUGIN_AGENTS}`);
    }

    const agentFiles = readdirSync(PLUGIN_AGENTS).filter((name) => name.endsWith(".md") && name !== "CLAUDE.md");
    if (agentFiles.length === 0) {
      throw new Error("没有找到 Agent 模板文件");
    }

    const agentsDir = join(CLAUDE_HOME, "agents");
    ensureDir(agentsDir);

    for (const agentFile of agentFiles) {
      copyFile(join(PLUGIN_AGENTS, agentFile), join(agentsDir, agentFile));
    }

    updateInstallationMeta("claudeCode", "agents", "update");
  }));

  steps.push(executeStep("安装 Skills", () => {
    if (!existsSync(PLUGIN_SKILLS)) {
      throw new Error(`Skills 模板目录不存在: ${PLUGIN_SKILLS}`);
    }

    const skillDirs = readdirSync(PLUGIN_SKILLS).filter((name) => {
      const fullPath = join(PLUGIN_SKILLS, name);
      return statSync(fullPath).isDirectory();
    });

    if (skillDirs.length === 0) {
      throw new Error("Skills 模板目录为空");
    }

    const skillsDestDir = join(CLAUDE_HOME, "skills");
    ensureDir(skillsDestDir);

    const currentVersion = getPackageVersion();

    // 清理废弃的 Skill
    for (const deprecated of DEPRECATED_SKILLS) {
      const deprecatedPath = join(skillsDestDir, deprecated);
      if (existsSync(deprecatedPath)) {
        removeDir(deprecatedPath);
      }
    }

    // 安装 Skill
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

        const markerContent = JSON.stringify({
          installedAt: new Date().toISOString(),
          installedVersion: currentVersion,
          source: "tanmi-workspace",
        }, null, 2);
        writeFileSync(join(skillDestDir, ".tanmi-managed"), markerContent);
        count++;
      }
    }

    if (count === 0) {
      throw new Error("未找到有效的 Skill 目录（需包含 SKILL.md）");
    }

    updateInstallationMeta("claudeCode", "skills", "update");
  }));

  return { platform: "claude", steps };
}

/**
 * Cursor 平台安装（API 版本）
 */
export function installCursorAllForApi(): PlatformInstallResult {
  const steps: InstallStepResult[] = [];

  steps.push(executeStep("安装 Hook 脚本", () => {
    ensureDir(TANMI_SCRIPTS);
    installSharedScripts();

    const hookSrc = join(PLUGIN_SCRIPTS, "cursor-hook-entry.cjs");
    const hookDest = join(TANMI_SCRIPTS, "cursor-hook-entry.cjs");

    if (!existsSync(hookSrc)) {
      throw new Error(`Hook 脚本不存在: ${hookSrc}`);
    }

    copyFile(hookSrc, hookDest);
  }));

  steps.push(executeStep("配置 Hooks", () => {
    ensureDir(CURSOR_HOME);

    const hookScript = join(TANMI_SCRIPTS, "cursor-hook-entry.cjs");
    let cursorConfig = readJsonFile(CURSOR_HOOKS);

    if (Object.keys(cursorConfig).length === 0) {
      cursorConfig = { version: 1, hooks: {} };
    }
    if (!cursorConfig.hooks) {
      cursorConfig.hooks = {};
    }

    const existingHooks = cursorConfig.hooks as Record<string, CursorHookEntry[]>;
    const tanmiHookEntry: CursorHookEntry = { command: `node "${hookScript}"` };

    cursorConfig.hooks = mergeCursorHooks(existingHooks, tanmiHookEntry, CURSOR_TANMI_HOOK_EVENTS);
    writeJsonFile(CURSOR_HOOKS, cursorConfig);
    updateInstallationMeta("cursor", "hooks", "update");
  }));

  steps.push(executeStep("安装 Agents", () => {
    if (!existsSync(PLUGIN_AGENTS)) {
      throw new Error(`Agent 模板目录不存在: ${PLUGIN_AGENTS}`);
    }

    const agentFiles = readdirSync(PLUGIN_AGENTS).filter((name) => name.endsWith(".md") && name !== "CLAUDE.md");
    if (agentFiles.length === 0) {
      throw new Error("没有找到 Agent 模板文件");
    }

    ensureDir(CURSOR_AGENTS);
    const currentVersion = getPackageVersion();

    for (const agentFile of agentFiles) {
      const dest = join(CURSOR_AGENTS, agentFile);
      const markerPath = join(CURSOR_AGENTS, `${agentFile}.tanmi-managed`);

      copyFile(join(PLUGIN_AGENTS, agentFile), dest);

      const markerContent = JSON.stringify({
        installedAt: new Date().toISOString(),
        installedVersion: currentVersion,
        source: "tanmi-workspace",
      }, null, 2);
      writeFileSync(markerPath, markerContent);
    }

    updateInstallationMeta("cursor", "agents", "update");
  }));

  steps.push(executeStep("安装 Skills", () => {
    if (!existsSync(PLUGIN_SKILLS)) {
      throw new Error(`Skills 模板目录不存在: ${PLUGIN_SKILLS}`);
    }

    const skillDirs = readdirSync(PLUGIN_SKILLS).filter((name) => {
      const fullPath = join(PLUGIN_SKILLS, name);
      return statSync(fullPath).isDirectory();
    });

    if (skillDirs.length === 0) {
      throw new Error("Skills 模板目录为空");
    }

    ensureDir(CURSOR_SKILLS);
    const currentVersion = getPackageVersion();

    // 清理废弃的 Skill
    for (const deprecated of DEPRECATED_SKILLS) {
      const deprecatedPath = join(CURSOR_SKILLS, deprecated);
      if (existsSync(deprecatedPath)) {
        removeDir(deprecatedPath);
      }
    }

    let count = 0;
    for (const skillName of skillDirs) {
      const skillSrcDir = join(PLUGIN_SKILLS, skillName);
      const skillMdPath = join(skillSrcDir, "SKILL.md");

      if (existsSync(skillMdPath)) {
        const skillDestDir = join(CURSOR_SKILLS, skillName);
        if (existsSync(skillDestDir)) {
          removeDir(skillDestDir);
        }
        copyDir(skillSrcDir, skillDestDir);

        const markerContent = JSON.stringify({
          installedAt: new Date().toISOString(),
          installedVersion: currentVersion,
          source: "tanmi-workspace",
        }, null, 2);
        writeFileSync(join(skillDestDir, ".tanmi-managed"), markerContent);
        count++;
      }
    }

    if (count === 0) {
      throw new Error("未找到有效的 Skill 目录（需包含 SKILL.md）");
    }

    updateInstallationMeta("cursor", "skills", "update");
  }));

  return { platform: "cursor", steps };
}

/**
 * OpenCode 平台安装（API 版本）
 */
export function installOpenCodeAllForApi(): PlatformInstallResult {
  const steps: InstallStepResult[] = [];

  steps.push(executeStep("安装共享脚本", () => {
    // 确保共享脚本已安装（OpenCode 插件依赖这些模块）
    ensureDir(TANMI_SCRIPTS);
    installSharedScripts();
    installHooksGenerated();
  }));

  steps.push(executeStep("安装 Plugin", () => {
    ensureDir(OPENCODE_PLUGINS);

    if (!existsSync(OPENCODE_PLUGIN_SOURCE)) {
      throw new Error(`OpenCode Plugin 源文件不存在: ${OPENCODE_PLUGIN_SOURCE}`);
    }

    const destPath = join(OPENCODE_PLUGINS, "tanmi-workspace.ts");
    copyFile(OPENCODE_PLUGIN_SOURCE, destPath);
    updateInstallationMeta("opencode", "plugins", "update");
  }));

  steps.push(executeStep("安装 Agents", () => {
    ensureDir(OPENCODE_AGENTS);

    if (!existsSync(PLUGIN_AGENTS)) {
      throw new Error(`Agent 源目录不存在: ${PLUGIN_AGENTS}`);
    }

    const agents = readdirSync(PLUGIN_AGENTS).filter((name) => name.endsWith(".md") && name !== "CLAUDE.md");

    for (const agent of agents) {
      const srcPath = join(PLUGIN_AGENTS, agent);
      const destPath = join(OPENCODE_AGENTS, agent);

      const content = readFileSync(srcPath, "utf-8");
      const convertedContent = convertAgentToOpenCodeFormat(content);
      writeFileSync(destPath, convertedContent, "utf-8");
    }

    updateInstallationMeta("opencode", "agents", "update");
  }));

  steps.push(executeStep("安装 Skills", () => {
    ensureDir(OPENCODE_SKILLS);

    if (!existsSync(PLUGIN_SKILLS)) {
      throw new Error(`Skill 源目录不存在: ${PLUGIN_SKILLS}`);
    }

    const skills = readdirSync(PLUGIN_SKILLS).filter((name) => {
      const fullPath = join(PLUGIN_SKILLS, name);
      return statSync(fullPath).isDirectory() && existsSync(join(fullPath, "SKILL.md"));
    });

    for (const skill of skills) {
      const srcPath = join(PLUGIN_SKILLS, skill);
      const destPath = join(OPENCODE_SKILLS, skill);
      copyDir(srcPath, destPath);
    }

    updateInstallationMeta("opencode", "skills", "update");
  }));

  return { platform: "opencode", steps };
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
  --cursor    Cursor (Hooks, Agents, Skills)
  --opencode  OpenCode (Plugin, Agents, Skills)

${colors.bold("示例:")}
  tanmi-workspace plugins                    # 查看状态
  tanmi-workspace plugins install --claude   # 安装 Claude 插件
  tanmi-workspace plugins install --opencode # 安装 OpenCode 插件
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
      } else if (platform === "--opencode") {
        installOpenCodeAll();
      } else {
        error("请指定平台: --claude, --cursor 或 --opencode");
        showHelp();
        process.exit(1);
      }
      break;

    case "uninstall":
      if (platform === "--claude") {
        uninstallClaudeAll();
      } else if (platform === "--cursor") {
        uninstallCursorAll();
      } else if (platform === "--opencode") {
        uninstallOpenCodeAll();
      } else {
        error("请指定平台: --claude, --cursor 或 --opencode");
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
