// src/cli/update.ts
// 自更新命令 - 更新 tanmi-workspace 到最新版本

import { spawn, spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { getPluginStatus } from "./plugins.js";

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const require = createRequire(import.meta.url);
    const pkg = require(join(__dirname, "..", "..", "package.json"));
    return pkg.version || "0.0.0";
  } catch {
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

export default async function update() {
  const currentVersion = getVersion();
  console.log(`当前版本: v${currentVersion}`);
  console.log("正在检查最新版本...");

  const latestVersion = await checkLatestVersion();

  if (!latestVersion) {
    console.error("\n无法获取最新版本信息，请检查网络连接");
    process.exit(1);
  }

  if (latestVersion === currentVersion) {
    console.log(`\n已是最新版本 v${currentVersion}`);
    return;
  }

  console.log(`最新版本: v${latestVersion}`);
  console.log("\n正在更新...\n");

  const child = spawn("npm", ["install", "-g", "tanmi-workspace@latest"], {
    shell: true,
    stdio: "inherit",
  });

  child.on("close", async (code) => {
    if (code === 0) {
      console.log(`\n更新成功! v${currentVersion} -> v${latestVersion}`);

      // 检测并更新插件
      const pluginResult = updatePluginsIfNeeded();

      // 显示更新内容
      await showUpdateNotes(currentVersion, latestVersion);

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
      console.error("\n更新失败，请尝试手动更新:");
      console.error("  npm install -g tanmi-workspace");
    }
    process.exit(code || 0);
  });

  child.on("error", (err) => {
    console.error("\n更新失败:", err.message);
    console.error("请尝试手动更新:");
    console.error("  npm install -g tanmi-workspace");
    process.exit(1);
  });
}
