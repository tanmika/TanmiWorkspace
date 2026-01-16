// src/cli/update.ts
// 自更新命令 - 更新 tanmi-workspace 到最新版本

import { spawn, spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import * as readline from "readline";
import { parse as parseYaml } from "yaml";
import semver from "semver";
import { getPluginStatus } from "./plugins.js";
import { BackupService } from "../services/BackupService.js";
import { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import { JsonStorage } from "../storage/JsonStorage.js";

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const require = createRequire(import.meta.url);
    const pkg = require(join(__dirname, "..", "..", "package.json"));
    return pkg.version || "0.0.0";
  } catch (err) {
    console.error("[update] 读取版本号失败:", err instanceof Error ? err.message : String(err));
    return "0.0.0";
  }
}

interface VersionNote {
  version: string;
  requirement: string;
  conclusion: string;
  note?: string;
}

interface VersionNotesFile {
  versions: VersionNote[];
}

// 比较版本号，返回 1 (a > b), -1 (a < b), 0 (a == b)
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

// 颜色输出
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
};

interface PluginUpdateResult {
  success: boolean;
  failedPlatforms: string[];
}

// 检测并更新插件（导出用于测试）
export function updatePluginsIfNeeded(): PluginUpdateResult {
  // 获取更新后的插件状态（新进程会读取新版本的 plugin 目录）
  const status = getPluginStatus();

  const platformsToUpdate: string[] = [];

  // 检测 Claude Code 插件
  if (status.claude.hooks || status.claude.agents.length > 0 || status.claude.skills.length > 0) {
    if (status.claude.hooksNeedsUpdate || status.claude.agentsNeedsUpdate || status.claude.skillsNeedsUpdate) {
      platformsToUpdate.push("claude");
    }
  }

  // 检测 Cursor 插件
  if (status.cursor.hooks && status.cursor.hooksNeedsUpdate) {
    platformsToUpdate.push("cursor");
  }

  if (platformsToUpdate.length === 0) {
    return { success: true, failedPlatforms: [] }; // 无需更新
  }

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 更新插件...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  const failedPlatforms: string[] = [];

  for (const platform of platformsToUpdate) {
    const result = spawnSync("tanmi-workspace", ["plugins", "install", `--${platform}`], {
      stdio: "inherit",
      shell: true,
    });

    if (result.status !== 0) {
      failedPlatforms.push(platform);
      console.log("");
      console.log(colors.red(`[ERROR] ${platform} 插件更新失败`));
    }
  }

  if (failedPlatforms.length === 0) {
    console.log("");
    console.log(colors.green("[OK] 插件更新完成"));
  }

  return { success: failedPlatforms.length === 0, failedPlatforms };
}

// 显示更新内容
async function showUpdateNotes(
  fromVersion: string,
  toVersion: string
): Promise<void> {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const notesPath = join(__dirname, "..", "..", "config", "version-notes.yaml");
    const content = readFileSync(notesPath, "utf-8");
    const data = parseYaml(content) as VersionNotesFile;

    if (!data.versions || !Array.isArray(data.versions)) {
      return;
    }

    // 找出从 fromVersion（不含）到 toVersion（含）之间的版本
    const relevantVersions = data.versions.filter((v) => {
      const cmpFrom = compareVersions(v.version, fromVersion);
      const cmpTo = compareVersions(v.version, toVersion);
      return cmpFrom > 0 && cmpTo <= 0;
    });

    if (relevantVersions.length === 0) {
      return;
    }

    // 按版本号降序排列（最新的在前）
    relevantVersions.sort((a, b) => compareVersions(b.version, a.version));

    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 更新内容:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // 最多显示 3 个版本的详细内容
    const maxDisplay = 3;
    const displayVersions = relevantVersions.slice(0, maxDisplay);
    const hiddenCount = relevantVersions.length - maxDisplay;

    for (const v of displayVersions) {
      console.log("");
      console.log(`v${v.version}: ${v.requirement}`);
      if (v.conclusion) {
        const lines = v.conclusion.split("\n");
        for (const line of lines) {
          console.log(`  ${line}`);
        }
      }
    }

    if (hiddenCount > 0) {
      console.log("");
      console.log(`... 还有 ${hiddenCount} 个版本的更新，详见 CHANGELOG.md`);
    }

    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch {
    // 读取失败时静默忽略，不影响更新流程
  }
}

async function checkLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["view", "tanmi-workspace", "version"], {
      shell: true,
      stdio: ["ignore", "pipe", "ignore"],
    });

    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        resolve(null);
      }
    });

    child.on("error", () => resolve(null));
  });
}

/**
 * 获取所有版本列表
 */
async function getAllVersions(): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["view", "tanmi-workspace", "versions", "--json"], {
      shell: true,
      stdio: ["ignore", "pipe", "ignore"],
    });

    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        try {
          const versions = JSON.parse(output.trim()) as string[];
          resolve(Array.isArray(versions) ? versions : []);
        } catch {
          resolve([]);
        }
      } else {
        resolve([]);
      }
    });

    child.on("error", () => resolve([]));
  });
}

/**
 * 获取最新的 beta 版本
 */
async function getLatestBetaVersion(): Promise<string | null> {
  const versions = await getAllVersions();

  // 筛选 beta 版本
  const betaVersions = versions.filter((v) => {
    const prerelease = semver.prerelease(v);
    return prerelease && prerelease[0] === "beta";
  });

  if (betaVersions.length === 0) {
    return null;
  }

  // 按 semver 排序，取最新的
  betaVersions.sort((a, b) => semver.rcompare(a, b));
  return betaVersions[0];
}

/**
 * 判断当前版本是否为 beta
 */
function isBetaVersion(version: string): boolean {
  const prerelease = semver.prerelease(version);
  return prerelease !== null && prerelease[0] === "beta";
}

/**
 * 用户确认提示
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}

/**
 * 创建全局备份
 */
async function createBackupBeforeUpdate(): Promise<{ success: boolean; backupName?: string; error?: string }> {
  try {
    const fsAdapter = new FileSystemAdapter();
    const jsonStorage = new JsonStorage(fsAdapter);
    const backupService = new BackupService(jsonStorage, fsAdapter);

    console.log("\n📦 正在备份当前状态...");
    const backup = await backupService.createGlobalBackup("beta_update");
    console.log(colors.green(`✅ 备份完成: ${backup.name}`));
    return { success: true, backupName: backup.name };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(colors.red(`❌ 备份失败: ${errorMsg}`));
    return { success: false, error: errorMsg };
  }
}

/**
 * 执行 npm install 更新
 */
async function performUpdate(
  currentVersion: string,
  targetVersion: string,
  isBeta: boolean
): Promise<void> {
  console.log(`\n📥 正在安装 tanmi-workspace@${targetVersion}...\n`);

  const child = spawn("npm", ["install", "-g", `tanmi-workspace@${targetVersion}`], {
    shell: true,
    stdio: "inherit",
  });

  child.on("close", async (code) => {
    if (code === 0) {
      console.log(`\n✅ 更新成功! v${currentVersion} -> v${targetVersion}`);

      // Beta 版本提示如何切换到稳定版
      if (isBeta) {
        console.log(colors.gray("提示: 如需切换到稳定版，运行 tanmi-workspace update"));
      }

      // 检测并更新插件
      const pluginResult = updatePluginsIfNeeded();

      // 显示更新内容
      await showUpdateNotes(currentVersion, targetVersion);

      // 显示重启提示
      console.log("请重启相关服务以应用更新:");
      console.log("  - 重启编辑器 (Claude Code / Cursor)");
      console.log("  - 重启 WebUI: tanmi-workspace webui");
      console.log("");

      // 如果插件更新失败，给出手动更新提示（只显示失败的平台）
      if (!pluginResult.success && pluginResult.failedPlatforms.length > 0) {
        console.log(colors.yellow("插件更新失败，请手动重试:"));
        for (const platform of pluginResult.failedPlatforms) {
          console.log(`  tanmi-workspace plugins install --${platform}`);
        }
        console.log("");
      }
    } else {
      console.error("\n❌ 更新失败，请尝试手动更新:");
      console.error(`  npm install -g tanmi-workspace@${targetVersion}`);
    }
    process.exit(code || 0);
  });

  child.on("error", (err) => {
    console.error("\n❌ 更新失败:", err.message);
    console.error("请尝试手动更新:");
    console.error(`  npm install -g tanmi-workspace@${targetVersion}`);
    process.exit(1);
  });
}

/**
 * Beta 更新流程
 */
async function updateBeta(): Promise<void> {
  const currentVersion = getVersion();
  const currentIsBeta = isBetaVersion(currentVersion);

  console.log(`当前版本: v${currentVersion}${currentIsBeta ? " (beta)" : ""}`);
  console.log("正在检查最新 beta 版本...");

  const latestBeta = await getLatestBetaVersion();
  const latestStable = await checkLatestVersion();

  // 没有可用的 beta 版本
  if (!latestBeta) {
    console.log(colors.yellow("\n⚠️  没有可用的 beta 版本"));
    return;
  }

  // 当前 stable 版本高于或等于 beta
  if (latestStable && semver.gte(currentVersion, latestBeta) && !currentIsBeta) {
    console.log(colors.yellow(`\n⚠️  当前稳定版 v${currentVersion} 已高于最新 beta v${latestBeta}`));
    console.log("无需更新到 beta 版本。");
    return;
  }

  // 当前已是最新 beta
  if (currentVersion === latestBeta) {
    console.log(colors.green(`\n✅ 已是最新 beta 版本 v${currentVersion}`));
    return;
  }

  // 当前是 beta，但有更新的 beta
  if (currentIsBeta && semver.gt(latestBeta, currentVersion)) {
    console.log(`\n最新 beta: v${latestBeta}`);
  } else if (!currentIsBeta && semver.gt(latestBeta, currentVersion)) {
    // 当前是 stable，有更新的 beta
    console.log(`\n最新 beta: v${latestBeta}`);
  } else {
    // beta 版本不高于当前版本
    console.log(colors.yellow(`\n⚠️  最新 beta v${latestBeta} 不高于当前版本 v${currentVersion}`));
    return;
  }

  // 显示警告并确认
  console.log("");
  console.log(colors.yellow("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(colors.yellow("⚠️  Beta 版本警告"));
  console.log(colors.yellow("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log("");
  console.log(`当前版本: v${currentVersion}`);
  console.log(`最新 beta: v${latestBeta}`);
  console.log("");
  console.log("Beta 版本可能不稳定，更新前将自动备份。");
  console.log("");

  const confirmed = await confirm("是否继续？");
  if (!confirmed) {
    console.log("\n已取消更新。");
    return;
  }

  // 创建备份
  const backupResult = await createBackupBeforeUpdate();
  if (!backupResult.success) {
    console.log(colors.red("\n❌ 备份失败，中止更新。"));
    console.log("请先解决备份问题后再尝试更新。");
    process.exit(1);
  }

  // 执行更新
  await performUpdate(currentVersion, latestBeta, true);
}

/**
 * 普通更新流程（支持从 beta 回退到 stable）
 */
async function updateStable(): Promise<void> {
  const currentVersion = getVersion();
  const currentIsBeta = isBetaVersion(currentVersion);

  console.log(`当前版本: v${currentVersion}${currentIsBeta ? " (beta)" : ""}`);
  console.log("正在检查最新版本...");

  const latestVersion = await checkLatestVersion();

  if (!latestVersion) {
    console.error("\n无法获取最新版本信息，请检查网络连接");
    process.exit(1);
  }

  // 当前是 beta 版本，提示可以回退到 stable
  if (currentIsBeta) {
    console.log(`\n最新稳定版: v${latestVersion}`);
    console.log("");
    console.log(colors.yellow("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(colors.yellow("📋 版本信息"));
    console.log(colors.yellow("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log("");
    console.log(`当前版本: v${currentVersion} (beta)`);
    console.log(`最新稳定版: v${latestVersion}`);
    console.log("");
    console.log("检测到您正在使用 beta 版本，可回退到稳定版。");
    console.log("");

    const confirmed = await confirm(`是否回退到 v${latestVersion}？`);
    if (!confirmed) {
      console.log("\n已取消回退。");
      return;
    }

    // 创建备份
    const backupResult = await createBackupBeforeUpdate();
    if (!backupResult.success) {
      console.log(colors.red("\n❌ 备份失败，中止回退。"));
      console.log("请先解决备份问题后再尝试。");
      process.exit(1);
    }

    // 执行回退
    await performUpdate(currentVersion, latestVersion, false);
    return;
  }

  // 普通更新流程
  if (latestVersion === currentVersion) {
    console.log(`\n✅ 已是最新版本 v${currentVersion}`);
    return;
  }

  // 检查是否需要更新
  if (!semver.gt(latestVersion, currentVersion)) {
    console.log(`\n✅ 当前版本 v${currentVersion} 已是最新`);
    return;
  }

  console.log(`最新版本: v${latestVersion}`);

  // 执行更新（普通更新不需要备份）
  await performUpdate(currentVersion, latestVersion, false);
}

export default async function update(options?: { beta?: boolean }): Promise<void> {
  if (options?.beta) {
    await updateBeta();
  } else {
    await updateStable();
  }
}
