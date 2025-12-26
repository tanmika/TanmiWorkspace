#!/usr/bin/env node
/**
 * tanmi-workspace rebuild 命令
 * 索引管理：增量同步/完全重建/验证/备份还原
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  copyFileSync,
  rmSync,
  statSync,
} from "fs";
import { homedir } from "os";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// ES module 兼容
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// ============================================================================
// 配置
// ============================================================================

const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
const HOME = homedir();
const FOLDER_NAME = IS_DEV ? ".tanmi-workspace-dev" : ".tanmi-workspace";
const GLOBAL_DIR = join(HOME, FOLDER_NAME);
const INDEX_PATH = join(GLOBAL_DIR, "index.json");
const BACKUPS_DIR = join(GLOBAL_DIR, "backups");

// 系统目录（不是工作区）
const SYSTEM_DIRS = ["scripts", "logs", "tutorial", "node_modules", "backups"];

// 最大保留备份数
const MAX_BACKUPS = 10;

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
// 类型定义
// ============================================================================

interface WorkspaceEntry {
  id: string;
  name: string;
  projectRoot: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  dirName: string;
}

interface IndexFile {
  version: string;
  workspaces: WorkspaceEntry[];
}

interface BackupInfo {
  name: string;
  path: string;
  date: Date;
  size: number;
}

// ============================================================================
// 工具函数
// ============================================================================

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function formatDate(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function formatDateReadable(date: Date): string {
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return join(HOME, p.slice(1));
  }
  return p;
}

// ============================================================================
// 索引读写
// ============================================================================

function readIndex(): IndexFile | null {
  if (!existsSync(INDEX_PATH)) {
    return null;
  }
  try {
    const content = readFileSync(INDEX_PATH, "utf-8");
    return JSON.parse(content) as IndexFile;
  } catch {
    return null;
  }
}

function writeIndex(index: IndexFile): void {
  ensureDir(GLOBAL_DIR);
  const tmpPath = INDEX_PATH + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(index, null, 2), "utf-8");
  renameSync(tmpPath, INDEX_PATH);
}

// ============================================================================
// 备份管理
// ============================================================================

function listBackups(): BackupInfo[] {
  if (!existsSync(BACKUPS_DIR)) {
    return [];
  }

  const files = readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith("index.") && f.endsWith(".json"))
    .map((f) => {
      const fullPath = join(BACKUPS_DIR, f);
      const stat = statSync(fullPath);
      // 从文件名提取日期: index.2024-12-27T00-48-30.json
      const match = f.match(/index\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.json/);
      const dateStr = match ? match[1].replace(/-/g, (m, i) => (i > 9 ? ":" : "-")) : "";
      return {
        name: f,
        path: fullPath,
        date: match ? new Date(dateStr.replace("T", " ").replace(/-/g, (_, i) => (i < 10 ? "-" : ":"))) : stat.mtime,
        size: stat.size,
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return files;
}

function createBackup(): string | null {
  if (!existsSync(INDEX_PATH)) {
    return null;
  }

  ensureDir(BACKUPS_DIR);

  const timestamp = formatDate(new Date());
  const backupName = `index.${timestamp}.json`;
  const backupPath = join(BACKUPS_DIR, backupName);

  copyFileSync(INDEX_PATH, backupPath);

  // 清理旧备份
  const backups = listBackups();
  if (backups.length > MAX_BACKUPS) {
    for (const old of backups.slice(MAX_BACKUPS)) {
      rmSync(old.path);
    }
  }

  return backupName;
}

function restoreBackup(name: string): boolean {
  const backupPath = join(BACKUPS_DIR, name);
  if (!existsSync(backupPath)) {
    return false;
  }

  // 验证备份文件有效
  try {
    const content = readFileSync(backupPath, "utf-8");
    JSON.parse(content);
  } catch {
    return false;
  }

  // 当前索引备份（如果存在）
  if (existsSync(INDEX_PATH)) {
    createBackup();
  }

  copyFileSync(backupPath, INDEX_PATH);
  return true;
}

// ============================================================================
// 扫描和读取工作区
// ============================================================================

/**
 * 从项目的 .tanmi-workspace 目录读取工作区信息
 */
function readWorkspacesFromProject(projectRoot: string): WorkspaceEntry[] {
  const wsDir = join(projectRoot, FOLDER_NAME);
  if (!existsSync(wsDir)) {
    return [];
  }

  const entries: WorkspaceEntry[] = [];

  try {
    const items = readdirSync(wsDir, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory() || SYSTEM_DIRS.includes(item.name)) {
        continue;
      }

      const configPath = join(wsDir, item.name, "config.json");
      if (!existsSync(configPath)) {
        continue;
      }

      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        entries.push({
          id: config.id || item.name,
          name: config.name || item.name,
          projectRoot: projectRoot,
          status: config.status || "active",
          createdAt: config.createdAt || new Date().toISOString(),
          updatedAt: config.updatedAt || new Date().toISOString(),
          dirName: item.name,
        });
      } catch {
        warn(`无法读取工作区配置: ${configPath}`);
      }
    }
  } catch {
    warn(`无法扫描目录: ${wsDir}`);
  }

  return entries;
}

/**
 * 递归扫描目录，查找包含 .tanmi-workspace 的项目
 */
function scanForProjects(rootPath: string, maxDepth: number = 3): string[] {
  const projects: string[] = [];

  function scan(dir: string, depth: number) {
    if (depth > maxDepth) return;

    // 检查当前目录是否有 .tanmi-workspace
    const wsDir = join(dir, FOLDER_NAME);
    if (existsSync(wsDir)) {
      projects.push(dir);
      return; // 找到后不再深入（一个项目只有一个 .tanmi-workspace）
    }

    // 继续扫描子目录
    try {
      const items = readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (!item.isDirectory()) continue;
        // 跳过隐藏目录和常见的不需要扫描的目录
        if (item.name.startsWith(".") ||
            item.name === "node_modules" ||
            item.name === "dist" ||
            item.name === "build" ||
            item.name === "target") {
          continue;
        }
        scan(join(dir, item.name), depth + 1);
      }
    } catch {
      // 忽略无法读取的目录
    }
  }

  scan(rootPath, 0);
  return projects;
}

/**
 * 验证工作区是否有效（目录存在且配置完整）
 */
function verifyWorkspace(entry: WorkspaceEntry): { valid: boolean; reason?: string } {
  const wsPath = join(entry.projectRoot, FOLDER_NAME, entry.dirName);

  if (!existsSync(wsPath)) {
    return { valid: false, reason: "工作区目录不存在" };
  }

  const configPath = join(wsPath, "config.json");
  if (!existsSync(configPath)) {
    return { valid: false, reason: "config.json 不存在" };
  }

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (!config.id || !config.name) {
      return { valid: false, reason: "配置文件缺少必要字段" };
    }
  } catch {
    return { valid: false, reason: "config.json 无法解析" };
  }

  return { valid: true };
}

// ============================================================================
// 核心操作
// ============================================================================

/**
 * 增量同步：只添加新发现的工作区，保留现有的
 */
function incrementalSync(projectRoot: string, backup: boolean = true): { added: number; existing: number } {
  const expandedPath = expandPath(projectRoot);

  if (!existsSync(expandedPath)) {
    error(`路径不存在: ${expandedPath}`);
    return { added: 0, existing: 0 };
  }

  // 备份
  if (backup) {
    const backupName = createBackup();
    if (backupName) {
      info(`已创建备份: ${backupName}`);
    }
  }

  // 读取现有索引
  let index = readIndex();
  if (!index) {
    index = { version: "1.0", workspaces: [] };
  }

  // 从项目读取工作区
  const foundWorkspaces = readWorkspacesFromProject(expandedPath);

  let added = 0;
  let existing = 0;

  for (const ws of foundWorkspaces) {
    const exists = index.workspaces.some(
      (e) => e.id === ws.id || (e.projectRoot === ws.projectRoot && e.dirName === ws.dirName)
    );

    if (exists) {
      existing++;
    } else {
      index.workspaces.push(ws);
      added++;
      success(`添加工作区: ${ws.name} (${ws.id})`);
    }
  }

  if (added > 0) {
    writeIndex(index);
  }

  return { added, existing };
}

/**
 * 完全重建：清空并重新扫描
 */
function fullRebuild(projectRoot: string, backup: boolean = true): { total: number } {
  const expandedPath = expandPath(projectRoot);

  if (!existsSync(expandedPath)) {
    error(`路径不存在: ${expandedPath}`);
    return { total: 0 };
  }

  // 备份
  if (backup) {
    const backupName = createBackup();
    if (backupName) {
      info(`已创建备份: ${backupName}`);
    }
  }

  // 从项目读取工作区
  const foundWorkspaces = readWorkspacesFromProject(expandedPath);

  // 创建新索引
  const index: IndexFile = {
    version: "1.0",
    workspaces: foundWorkspaces,
  };

  writeIndex(index);

  for (const ws of foundWorkspaces) {
    success(`添加工作区: ${ws.name} (${ws.id})`);
  }

  return { total: foundWorkspaces.length };
}

/**
 * 扫描目录并同步（递归查找项目）
 */
function scanAndSync(rootPath: string, backup: boolean = true): { projects: number; workspaces: number } {
  const expandedPath = expandPath(rootPath);

  if (!existsSync(expandedPath)) {
    error(`路径不存在: ${expandedPath}`);
    return { projects: 0, workspaces: 0 };
  }

  info(`扫描目录: ${expandedPath}`);
  const projects = scanForProjects(expandedPath);

  if (projects.length === 0) {
    warn("未找到包含 .tanmi-workspace 的项目");
    return { projects: 0, workspaces: 0 };
  }

  info(`找到 ${projects.length} 个项目`);

  // 备份
  if (backup) {
    const backupName = createBackup();
    if (backupName) {
      info(`已创建备份: ${backupName}`);
    }
  }

  // 读取或创建索引
  let index = readIndex();
  if (!index) {
    index = { version: "1.0", workspaces: [] };
  }

  let totalAdded = 0;

  for (const project of projects) {
    const workspaces = readWorkspacesFromProject(project);
    for (const ws of workspaces) {
      const exists = index.workspaces.some(
        (e) => e.id === ws.id || (e.projectRoot === ws.projectRoot && e.dirName === ws.dirName)
      );

      if (!exists) {
        index.workspaces.push(ws);
        totalAdded++;
        success(`添加: ${ws.name} @ ${project}`);
      }
    }
  }

  if (totalAdded > 0) {
    writeIndex(index);
  }

  return { projects: projects.length, workspaces: totalAdded };
}

/**
 * 验证并清理无效工作区
 */
function verifyAndClean(backup: boolean = true): { valid: number; invalid: number; removed: string[] } {
  const index = readIndex();
  if (!index || index.workspaces.length === 0) {
    info("索引为空，无需验证");
    return { valid: 0, invalid: 0, removed: [] };
  }

  // 备份
  if (backup) {
    const backupName = createBackup();
    if (backupName) {
      info(`已创建备份: ${backupName}`);
    }
  }

  const validWorkspaces: WorkspaceEntry[] = [];
  const removed: string[] = [];

  for (const ws of index.workspaces) {
    const result = verifyWorkspace(ws);
    if (result.valid) {
      validWorkspaces.push(ws);
    } else {
      removed.push(`${ws.name} (${ws.id}): ${result.reason}`);
      warn(`移除无效工作区: ${ws.name} - ${result.reason}`);
    }
  }

  const invalid = index.workspaces.length - validWorkspaces.length;

  if (invalid > 0) {
    index.workspaces = validWorkspaces;
    writeIndex(index);
  }

  return { valid: validWorkspaces.length, invalid, removed };
}

// ============================================================================
// 显示函数
// ============================================================================

function showHelp(): void {
  console.log(`
${colors.bold("TanmiWorkspace 索引管理工具")}

${colors.blue("用法:")}
  tanmi-workspace rebuild                   显示帮助和当前状态
  tanmi-workspace rebuild <path>            增量同步指定项目
  tanmi-workspace rebuild --full <path>     完全重建（清空后重新扫描）
  tanmi-workspace rebuild --scan <path>     递归扫描目录查找项目
  tanmi-workspace rebuild --verify          验证并清理无效工作区
  tanmi-workspace rebuild --list            列出所有备份
  tanmi-workspace rebuild --restore <name>  还原指定备份

${colors.blue("选项:")}
  --no-backup                               不创建备份

${colors.blue("示例:")}
  tanmi-workspace rebuild ~/projects/myapp          同步单个项目
  tanmi-workspace rebuild --scan ~/projects         扫描多个项目
  tanmi-workspace rebuild --full ~/projects/myapp   完全重建
  tanmi-workspace rebuild --verify                  清理无效条目
  tanmi-workspace rebuild --list                    查看备份列表
  tanmi-workspace rebuild --restore index.2024-12-27T10-30-00.json
`);
}

function showStatus(): void {
  console.log(`\n${colors.bold("当前索引状态")}`);
  console.log(colors.gray("─".repeat(50)));

  const index = readIndex();
  if (!index) {
    console.log(`${colors.yellow("索引文件:")} 不存在`);
    console.log(`${colors.gray("路径:")} ${INDEX_PATH}`);
  } else {
    console.log(`${colors.green("索引文件:")} 存在`);
    console.log(`${colors.gray("路径:")} ${INDEX_PATH}`);
    console.log(`${colors.blue("工作区数量:")} ${index.workspaces.length}`);

    if (index.workspaces.length > 0) {
      console.log(`\n${colors.bold("工作区列表:")}`);
      const grouped = new Map<string, WorkspaceEntry[]>();
      for (const ws of index.workspaces) {
        const list = grouped.get(ws.projectRoot) || [];
        list.push(ws);
        grouped.set(ws.projectRoot, list);
      }

      for (const [project, workspaces] of grouped) {
        console.log(`  ${colors.blue(project)}`);
        for (const ws of workspaces) {
          const statusColor = ws.status === "active" ? colors.green : colors.gray;
          console.log(`    - ${ws.name} ${statusColor(`[${ws.status}]`)}`);
        }
      }
    }
  }

  // 备份信息
  const backups = listBackups();
  console.log(`\n${colors.bold("备份信息")}`);
  console.log(colors.gray("─".repeat(50)));
  console.log(`${colors.blue("备份目录:")} ${BACKUPS_DIR}`);
  console.log(`${colors.blue("备份数量:")} ${backups.length}/${MAX_BACKUPS}`);

  if (backups.length > 0) {
    console.log(`${colors.blue("最近备份:")} ${backups[0].name}`);
    console.log(`${colors.gray("时间:")} ${formatDateReadable(backups[0].date)}`);
  }

  console.log();
}

function showBackupList(): void {
  const backups = listBackups();

  console.log(`\n${colors.bold("索引备份列表")}`);
  console.log(colors.gray("─".repeat(60)));

  if (backups.length === 0) {
    console.log(colors.yellow("暂无备份"));
    return;
  }

  for (let i = 0; i < backups.length; i++) {
    const b = backups[i];
    const sizeKb = (b.size / 1024).toFixed(1);
    const marker = i === 0 ? colors.green(" (最新)") : "";
    console.log(`  ${colors.blue(b.name)}${marker}`);
    console.log(`    时间: ${formatDateReadable(b.date)}  大小: ${sizeKb} KB`);
  }

  console.log(`\n${colors.gray("还原命令: tanmi-workspace rebuild --restore <备份名>")}\n`);
}

// ============================================================================
// 主函数
// ============================================================================

export default function main(): void {
  const args = process.argv.slice(3); // 跳过 node, script, "rebuild"

  // 无参数 → 显示帮助和状态
  if (args.length === 0) {
    showHelp();
    showStatus();
    return;
  }

  // 解析参数
  const noBackup = args.includes("--no-backup");
  const filteredArgs = args.filter((a) => a !== "--no-backup");

  const command = filteredArgs[0];
  const param = filteredArgs[1];

  switch (command) {
    case "--help":
    case "-h":
      showHelp();
      break;

    case "--list":
    case "-l":
      showBackupList();
      break;

    case "--restore":
    case "-r":
      if (!param) {
        error("请指定要还原的备份名称");
        console.log(colors.gray("提示: 使用 --list 查看可用备份"));
        process.exit(1);
      }
      if (restoreBackup(param)) {
        success(`已还原备份: ${param}`);
      } else {
        error(`还原失败: 备份不存在或无效`);
        process.exit(1);
      }
      break;

    case "--verify":
    case "-v":
      info("验证索引中的工作区...");
      const verifyResult = verifyAndClean(!noBackup);
      console.log();
      success(`验证完成: ${verifyResult.valid} 有效, ${verifyResult.invalid} 无效`);
      if (verifyResult.removed.length > 0) {
        console.log(colors.yellow("\n已移除的工作区:"));
        for (const r of verifyResult.removed) {
          console.log(`  - ${r}`);
        }
      }
      break;

    case "--scan":
    case "-s":
      if (!param) {
        error("请指定要扫描的目录");
        process.exit(1);
      }
      info(`递归扫描: ${param}`);
      const scanResult = scanAndSync(param, !noBackup);
      console.log();
      success(`扫描完成: ${scanResult.projects} 个项目, ${scanResult.workspaces} 个新工作区`);
      break;

    case "--full":
    case "-f":
      if (!param) {
        error("请指定项目路径");
        process.exit(1);
      }
      info(`完全重建: ${param}`);
      const fullResult = fullRebuild(param, !noBackup);
      console.log();
      success(`重建完成: ${fullResult.total} 个工作区`);
      break;

    default:
      // 默认：增量同步
      const path = command;
      info(`增量同步: ${path}`);
      const syncResult = incrementalSync(path, !noBackup);
      console.log();
      success(`同步完成: ${syncResult.added} 新增, ${syncResult.existing} 已存在`);
      break;
  }
}