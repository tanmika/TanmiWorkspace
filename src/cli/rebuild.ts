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

// 导出常量供测试使用
export { FOLDER_NAME, SYSTEM_DIRS };

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

interface WorkspaceBackupMeta {
  name: string;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
  trigger: "manual" | "auto" | "pre_operation";
  codeVersion: string;
  size: number;
  verified: boolean;
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
// 工作区备份管理
// ============================================================================

/**
 * 获取工作区备份目录路径
 */
function getWorkspaceBackupDir(projectRoot: string, wsDirName: string): string {
  return join(projectRoot, FOLDER_NAME, wsDirName, ".backups");
}

/**
 * 读取工作区备份元信息
 */
function readWorkspaceBackupMeta(projectRoot: string, wsDirName: string): WorkspaceBackupMeta[] {
  const backupDir = getWorkspaceBackupDir(projectRoot, wsDirName);
  const metaPath = join(backupDir, "backup-meta.json");

  if (!existsSync(metaPath)) {
    return [];
  }

  try {
    const content = readFileSync(metaPath, "utf-8");
    return JSON.parse(content) as WorkspaceBackupMeta[];
  } catch {
    return [];
  }
}

/**
 * 写入工作区备份元信息
 */
function writeWorkspaceBackupMeta(projectRoot: string, wsDirName: string, metas: WorkspaceBackupMeta[]): void {
  const backupDir = getWorkspaceBackupDir(projectRoot, wsDirName);
  const metaPath = join(backupDir, "backup-meta.json");
  ensureDir(backupDir);
  writeFileSync(metaPath, JSON.stringify(metas, null, 2), "utf-8");
}

/**
 * 根据 workspaceId 查找工作区位置
 */
function findWorkspaceLocation(workspaceId: string): { projectRoot: string; dirName: string; name: string } | null {
  const index = readIndex();
  if (!index) return null;

  const entry = index.workspaces.find(ws => ws.id === workspaceId);
  if (!entry) return null;

  return {
    projectRoot: entry.projectRoot,
    dirName: entry.dirName || entry.id,
    name: entry.name,
  };
}

/**
 * 列出工作区备份
 */
function listWorkspaceBackups(workspaceId: string): void {
  const location = findWorkspaceLocation(workspaceId);
  if (!location) {
    error(`工作区不存在: ${workspaceId}`);
    process.exit(1);
  }

  const { projectRoot, dirName, name } = location;
  const metas = readWorkspaceBackupMeta(projectRoot, dirName);

  console.log(`\n${colors.bold(`工作区备份列表: ${name}`)}`);
  console.log(colors.gray("─".repeat(50)));

  if (metas.length === 0) {
    console.log(colors.yellow("暂无备份"));
    return;
  }

  // 按时间倒序
  metas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  for (const meta of metas) {
    const verified = meta.verified ? colors.green("✓") : colors.yellow("?");
    const sizeKb = (meta.size / 1024).toFixed(1);
    const date = new Date(meta.createdAt);
    const triggerMap: Record<string, string> = {
      manual: "手动",
      auto: "自动",
      pre_operation: "操作前",
    };

    console.log(`  ${colors.blue(meta.name)} ${verified}`);
    console.log(`    时间: ${formatDateReadable(date)}  大小: ${sizeKb} KB  触发: ${triggerMap[meta.trigger] || meta.trigger}`);
  }

  console.log(`\n${colors.gray("还原命令: tanmi-workspace rebuild --restore-workspace " + workspaceId + " <备份名>")}\n`);
}

/**
 * 恢复工作区备份
 */
function restoreWorkspaceBackup(workspaceId: string, backupName: string): void {
  const location = findWorkspaceLocation(workspaceId);
  if (!location) {
    error(`工作区不存在: ${workspaceId}`);
    process.exit(1);
  }

  const { projectRoot, dirName, name } = location;
  const backupDir = getWorkspaceBackupDir(projectRoot, dirName);
  const backupPath = join(backupDir, backupName);
  const workspacePath = join(projectRoot, FOLDER_NAME, dirName);

  // 1. 验证备份文件存在
  if (!existsSync(backupPath)) {
    error(`备份文件不存在: ${backupName}`);
    console.log(colors.gray("提示: 使用 --list-ws-backups 查看可用备份"));
    process.exit(1);
  }

  // 2. 验证备份完整性
  info("验证备份完整性...");
  try {
    const { execSync } = require("child_process");
    execSync(`tar -tzf "${backupPath}" > /dev/null`, { stdio: "pipe" });
  } catch {
    error("备份文件损坏，无法恢复");
    process.exit(1);
  }

  // 3. 创建恢复前备份
  info("创建恢复前备份...");
  const timestamp = formatDate(new Date());
  const preRestoreBackupName = `backup_${timestamp}.tar.gz`;
  const preRestoreBackupPath = join(backupDir, preRestoreBackupName);

  try {
    const { execSync } = require("child_process");
    execSync(`tar -czf "${preRestoreBackupPath}" --exclude='.backups' -C "${workspacePath}" .`, { stdio: "pipe" });

    // 更新元信息
    const metas = readWorkspaceBackupMeta(projectRoot, dirName);
    const stat = statSync(preRestoreBackupPath);
    metas.push({
      name: preRestoreBackupName,
      workspaceId,
      workspaceName: name,
      createdAt: new Date().toISOString(),
      trigger: "pre_operation",
      codeVersion: "cli",
      size: stat.size,
      verified: true,
    });

    // 保留最多10个备份
    if (metas.length > 10) {
      const toDelete = metas.slice(0, metas.length - 10);
      for (const old of toDelete) {
        const oldPath = join(backupDir, old.name);
        if (existsSync(oldPath)) {
          rmSync(oldPath);
        }
      }
      metas.splice(0, metas.length - 10);
    }

    writeWorkspaceBackupMeta(projectRoot, dirName, metas);
    success(`已创建恢复前备份: ${preRestoreBackupName}`);
  } catch (e) {
    warn(`创建恢复前备份失败: ${e instanceof Error ? e.message : e}`);
  }

  // 4. 清空工作区目录（保留 .backups）
  info("清理工作区...");
  try {
    const entries = readdirSync(workspacePath);
    for (const entry of entries) {
      if (entry === ".backups") continue;
      const entryPath = join(workspacePath, entry);
      rmSync(entryPath, { recursive: true, force: true });
    }
  } catch (e) {
    error(`清理失败: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  // 5. 解压恢复
  info("恢复备份...");
  try {
    const { execSync } = require("child_process");
    execSync(`tar -xzf "${backupPath}" -C "${workspacePath}"`, { stdio: "pipe" });
    success(`工作区 "${name}" 已成功恢复`);
  } catch (e) {
    error(`恢复失败: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

// ============================================================================
// 扫描和读取工作区
// ============================================================================

/**
 * 从项目的 .tanmi-workspace 目录读取工作区信息
 * 同时扫描 archive/ 子目录中的归档工作区
 */
function readWorkspacesFromProject(projectRoot: string): WorkspaceEntry[] {
  const wsDir = join(projectRoot, FOLDER_NAME);
  if (!existsSync(wsDir)) {
    return [];
  }

  const entries: WorkspaceEntry[] = [];

  // 辅助函数：从目录读取工作区
  const readWorkspaceFromDir = (dir: string, dirName: string, forceArchived: boolean): WorkspaceEntry | null => {
    // 支持两种格式：config.json (项目工作区) 和 workspace.json (导出的工作区)
    const configPath = join(dir, "config.json");
    const workspacePath = join(dir, "workspace.json");
    const actualPath = existsSync(configPath) ? configPath : existsSync(workspacePath) ? workspacePath : null;

    if (!actualPath) {
      return null;
    }

    try {
      const config = JSON.parse(readFileSync(actualPath, "utf-8"));
      return {
        id: config.id || dirName,
        name: config.name || dirName,
        projectRoot: projectRoot,
        // 如果在 archive/ 目录中，强制设为 archived 状态
        status: forceArchived ? "archived" : (config.status || "active"),
        createdAt: config.createdAt || new Date().toISOString(),
        updatedAt: config.updatedAt || new Date().toISOString(),
        dirName: dirName,
      };
    } catch {
      warn(`无法读取工作区配置: ${actualPath}`);
      return null;
    }
  };

  try {
    // 1. 扫描普通工作区（直接子目录）
    const items = readdirSync(wsDir, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory() || SYSTEM_DIRS.includes(item.name)) {
        continue;
      }

      // 跳过 archive 目录，稍后单独处理
      if (item.name === "archive") {
        continue;
      }

      const entry = readWorkspaceFromDir(join(wsDir, item.name), item.name, false);
      if (entry) {
        entries.push(entry);
      }
    }

    // 2. 扫描归档工作区（archive/ 子目录）
    const archiveDir = join(wsDir, "archive");
    if (existsSync(archiveDir)) {
      try {
        const archivedItems = readdirSync(archiveDir, { withFileTypes: true });
        for (const item of archivedItems) {
          if (!item.isDirectory()) {
            continue;
          }

          // 归档工作区强制设为 archived 状态
          const entry = readWorkspaceFromDir(join(archiveDir, item.name), item.name, true);
          if (entry) {
            entries.push(entry);
          }
        }
      } catch {
        warn(`无法扫描归档目录: ${archiveDir}`);
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
      // 继续扫描子目录，因为可能有嵌套的独立项目
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
 * @exported 供测试和外部模块使用
 */
export function verifyWorkspace(entry: WorkspaceEntry): { valid: boolean; reason?: string; upgradedDirName?: string } {
  // 检查必要字段
  if (!entry.id) {
    return { valid: false, reason: "索引条目缺少 id 字段" };
  }
  if (!entry.projectRoot) {
    return { valid: false, reason: "索引条目缺少 projectRoot 字段" };
  }

  // 辅助函数：读取并验证配置文件
  const readAndValidateConfig = (wsPath: string): { valid: boolean; config?: any; reason?: string } => {
    const configPath = join(wsPath, "config.json");
    const workspacePath = join(wsPath, "workspace.json");
    const actualPath = existsSync(configPath) ? configPath : existsSync(workspacePath) ? workspacePath : null;

    if (!actualPath) {
      return { valid: false, reason: "config.json/workspace.json 不存在" };
    }

    try {
      const config = JSON.parse(readFileSync(actualPath, "utf-8"));
      if (!config.id || !config.name) {
        return { valid: false, reason: "配置文件缺少必要字段" };
      }
      return { valid: true, config };
    } catch {
      return { valid: false, reason: "配置文件无法解析" };
    }
  };

  // 辅助函数：扫描项目目录查找匹配的工作区
  const findMatchingWorkspace = (excludeDirName?: string): string | null => {
    const wsDir = join(entry.projectRoot, FOLDER_NAME);
    if (!existsSync(wsDir)) return null;

    try {
      const items = readdirSync(wsDir, { withFileTypes: true });
      for (const item of items) {
        if (!item.isDirectory() || SYSTEM_DIRS.includes(item.name)) continue;
        if (excludeDirName && item.name === excludeDirName) continue;

        const itemPath = join(wsDir, item.name);
        const result = readAndValidateConfig(itemPath);
        if (result.valid && result.config.id === entry.id) {
          return item.name;
        }
      }
    } catch { /* ignore */ }
    return null;
  };

  const originalDirName = entry.dirName;
  const isArchived = entry.status === "archived";

  // 如果 dirName 存在，先尝试直接验证
  if (originalDirName) {
    // 根据归档状态决定正确的路径
    const normalPath = join(entry.projectRoot, FOLDER_NAME, originalDirName);
    const archivePath = join(entry.projectRoot, FOLDER_NAME, "archive", originalDirName);
    const expectedPath = isArchived ? archivePath : normalPath;
    const wrongPath = isArchived ? normalPath : archivePath;

    // 检查工作区是否在错误的位置
    if (existsSync(wrongPath)) {
      const wrongResult = readAndValidateConfig(wrongPath);
      if (wrongResult.valid && wrongResult.config.id === entry.id) {
        // 工作区存在但在错误的位置
        return {
          valid: false,
          reason: isArchived
            ? `归档工作区 ${originalDirName} 仍在普通路径，应迁移到 archive/ 目录`
            : `活跃工作区 ${originalDirName} 在 archive/ 目录，应迁移到普通路径`
        };
      }
    }

    // 检查工作区是否在正确的位置
    if (existsSync(expectedPath)) {
      const result = readAndValidateConfig(expectedPath);
      if (result.valid && result.config.id === entry.id) {
        // 验证通过
        return { valid: true };
      }
      // ID 不匹配或配置无效，继续尝试补全逻辑
    }
    // 目录不存在或验证失败，继续尝试补全逻辑
  }

  // dirName 缺失或验证失败，尝试从项目目录中查找匹配的工作区（排除已验证过的目录）
  const foundDirName = findMatchingWorkspace(originalDirName);
  if (foundDirName) {
    return { valid: true, upgradedDirName: foundDirName };
  }

  return { valid: false, reason: originalDirName
    ? `目录 ${originalDirName} 无效且无法自动修复`
    : "索引条目缺少 dirName 字段且无法自动补全"
  };
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
 * 诊断索引问题（不修改数据）
 */
interface DiagnoseIssue {
  workspaceId: string;
  workspaceName: string;
  field: string;
  issue: string;
  severity: "error" | "warning";
}

function diagnoseIndex(): { total: number; issues: DiagnoseIssue[] } {
  const index = readIndex();
  if (!index) {
    warn("索引文件不存在");
    return { total: 0, issues: [] };
  }

  const issues: DiagnoseIssue[] = [];
  const seenIds = new Set<string>();
  const requiredFields = ["id", "name", "projectRoot", "dirName", "status"];

  for (const ws of index.workspaces) {
    const wsId = ws.id || "(无ID)";
    const wsName = ws.name || "(无名称)";

    // 检查必要字段
    for (const field of requiredFields) {
      const value = (ws as unknown as Record<string, unknown>)[field];
      if (value === undefined || value === null) {
        issues.push({
          workspaceId: wsId,
          workspaceName: wsName,
          field,
          issue: `字段缺失`,
          severity: "error",
        });
      } else if (typeof value !== "string") {
        issues.push({
          workspaceId: wsId,
          workspaceName: wsName,
          field,
          issue: `类型错误 (期望 string, 实际 ${typeof value})`,
          severity: "error",
        });
      } else if (value === "") {
        issues.push({
          workspaceId: wsId,
          workspaceName: wsName,
          field,
          issue: `字段为空`,
          severity: field === "projectRoot" ? "error" : "warning",
        });
      }
    }

    // 检查 ID 重复
    if (ws.id) {
      if (seenIds.has(ws.id)) {
        issues.push({
          workspaceId: wsId,
          workspaceName: wsName,
          field: "id",
          issue: `ID 重复`,
          severity: "error",
        });
      }
      seenIds.add(ws.id);
    }

    // 检查状态值
    if (ws.status && !["active", "archived", "error"].includes(ws.status)) {
      issues.push({
        workspaceId: wsId,
        workspaceName: wsName,
        field: "status",
        issue: `无效状态值: ${ws.status}`,
        severity: "warning",
      });
    }

    // 检查日期格式
    for (const dateField of ["createdAt", "updatedAt"]) {
      const value = (ws as unknown as Record<string, unknown>)[dateField];
      if (value && typeof value === "string") {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          issues.push({
            workspaceId: wsId,
            workspaceName: wsName,
            field: dateField,
            issue: `日期格式无效: ${value}`,
            severity: "warning",
          });
        }
      }
    }
  }

  return { total: index.workspaces.length, issues };
}

/**
 * 验证并清理无效工作区
 */
function verifyAndClean(backup: boolean = true): { valid: number; invalid: number; upgraded: number; removed: string[] } {
  const index = readIndex();
  if (!index || index.workspaces.length === 0) {
    info("索引为空，无需验证");
    return { valid: 0, invalid: 0, upgraded: 0, removed: [] };
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
  let upgraded = 0;

  for (const ws of index.workspaces) {
    const result = verifyWorkspace(ws);
    if (result.valid) {
      // 如果有升级的 dirName，更新条目
      if (result.upgradedDirName) {
        ws.dirName = result.upgradedDirName;
        upgraded++;
        success(`升级工作区索引: ${ws.name} (补全 dirName: ${result.upgradedDirName})`);
      }
      validWorkspaces.push(ws);
    } else {
      removed.push(`${ws.name} (${ws.id}): ${result.reason}`);
      warn(`移除无效工作区: ${ws.name} - ${result.reason}`);
    }
  }

  const invalid = index.workspaces.length - validWorkspaces.length;

  // 有变更时写入索引
  if (invalid > 0 || upgraded > 0) {
    index.workspaces = validWorkspaces;
    writeIndex(index);
  }

  return { valid: validWorkspaces.length, invalid, upgraded, removed };
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
  tanmi-workspace rebuild --diagnose        诊断索引问题（不修改数据）
  tanmi-workspace rebuild --list            列出所有索引备份
  tanmi-workspace rebuild --restore <name>  还原索引备份
  tanmi-workspace rebuild --list-ws-backups <id>        列出工作区备份
  tanmi-workspace rebuild --restore-workspace <id> <backup>  恢复工作区备份

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

// ============================================================================
// 导出供 HTTP API 使用的函数
// ============================================================================

export {
  incrementalSync,
  scanAndSync,
  verifyAndClean,
  readWorkspacesFromProject,
  readIndex,
  writeIndex,
  scanForProjects,
};

export type { WorkspaceEntry, IndexFile };

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
      let summaryParts = [`${verifyResult.valid} 有效`, `${verifyResult.invalid} 无效`];
      if (verifyResult.upgraded > 0) {
        summaryParts.push(`${verifyResult.upgraded} 已升级`);
      }
      success(`验证完成: ${summaryParts.join(", ")}`);
      if (verifyResult.removed.length > 0) {
        console.log(colors.yellow("\n已移除的工作区:"));
        for (const r of verifyResult.removed) {
          console.log(`  - ${r}`);
        }
      }
      break;

    case "--diagnose":
    case "-d":
      info("诊断索引问题...\n");
      const diagnoseResult = diagnoseIndex();

      if (diagnoseResult.total === 0) {
        warn("索引为空");
        break;
      }

      console.log(`${colors.blue("工作区总数:")} ${diagnoseResult.total}`);

      if (diagnoseResult.issues.length === 0) {
        console.log();
        success("未发现问题，索引数据完整");
      } else {
        const errors = diagnoseResult.issues.filter((i) => i.severity === "error");
        const warnings = diagnoseResult.issues.filter((i) => i.severity === "warning");

        console.log(`${colors.red("错误:")} ${errors.length}  ${colors.yellow("警告:")} ${warnings.length}\n`);

        if (errors.length > 0) {
          console.log(colors.red("=== 错误 ==="));
          for (const issue of errors) {
            console.log(`  ${colors.red("✗")} [${issue.workspaceName}] ${issue.field}: ${issue.issue}`);
          }
          console.log();
        }

        if (warnings.length > 0) {
          console.log(colors.yellow("=== 警告 ==="));
          for (const issue of warnings) {
            console.log(`  ${colors.yellow("!")} [${issue.workspaceName}] ${issue.field}: ${issue.issue}`);
          }
          console.log();
        }

        if (errors.length > 0) {
          console.log(colors.gray("提示: 使用 --verify 清理无效条目，或手动修复索引文件"));
          console.log(colors.gray(`索引路径: ${INDEX_PATH}`));
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

    case "--list-ws-backups":
    case "-lwb":
      if (!param) {
        error("请指定工作区 ID");
        process.exit(1);
      }
      listWorkspaceBackups(param);
      break;

    case "--restore-workspace":
    case "-rw": {
      if (!param) {
        error("请指定工作区 ID");
        process.exit(1);
      }
      const backupName = filteredArgs[2];
      if (!backupName) {
        error("请指定备份文件名");
        console.log(colors.gray(`提示: 使用 --list-ws-backups ${param} 查看可用备份`));
        process.exit(1);
      }
      restoreWorkspaceBackup(param, backupName);
      break;
    }

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