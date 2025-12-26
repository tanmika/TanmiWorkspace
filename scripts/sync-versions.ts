#!/usr/bin/env npx ts-node
/**
 * 版本同步脚本
 *
 * 功能：
 * 1. 从 CHANGELOG.md 提取版本信息
 * 2. 同步到 config/version-notes.yaml（只增不改）
 * 3. 检查未填写的 requirement
 *
 * 使用：
 *   npx ts-node scripts/sync-versions.ts          # 同步新版本
 *   npx ts-node scripts/sync-versions.ts --check  # 仅检查
 */

import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";

interface VersionNote {
  version: string;
  requirement: string;
  conclusion: string;
  note: string;
}

interface VersionNotesFile {
  versions: VersionNote[];
}

const CHANGELOG_PATH = path.join(process.cwd(), "CHANGELOG.md");
const VERSION_NOTES_PATH = path.join(process.cwd(), "config/version-notes.yaml");

/**
 * 从 CHANGELOG.md 提取版本信息
 */
function parseChangelog(): Map<string, string> {
  const content = fs.readFileSync(CHANGELOG_PATH, "utf-8");
  const versions = new Map<string, string>();

  const lines = content.split("\n");
  let currentVersion: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const versionMatch = line.match(/^## \[(\d+\.\d+\.\d+)\]/);
    if (versionMatch) {
      // 保存上一个版本
      if (currentVersion) {
        versions.set(currentVersion, formatConclusion(currentContent));
      }
      currentVersion = versionMatch[1];
      currentContent = [];
    } else if (currentVersion) {
      currentContent.push(line);
    }
  }

  // 保存最后一个版本
  if (currentVersion) {
    versions.set(currentVersion, formatConclusion(currentContent));
  }

  return versions;
}

/**
 * 格式化 conclusion 内容
 */
function formatConclusion(lines: string[]): string {
  const result: string[] = [];

  for (const line of lines) {
    // 跳过空行和日期行
    if (!line.trim() || line.match(/^## \[/)) continue;

    // 转换 ### 标题为分类标记
    if (line.startsWith("### ")) {
      // 跳过，下面的内容会包含分类信息
      continue;
    }

    // 保留列表项，简化格式
    if (line.startsWith("- ")) {
      // 移除 **xxx**: 格式，保留内容
      const simplified = line.replace(/^- \*\*(.+?)\*\*:/, "- $1:");
      result.push(simplified);
    }
  }

  return result.join("\n");
}

/**
 * 读取现有的 version-notes.yaml
 */
function readVersionNotes(): VersionNotesFile {
  if (!fs.existsSync(VERSION_NOTES_PATH)) {
    return { versions: [] };
  }

  const content = fs.readFileSync(VERSION_NOTES_PATH, "utf-8");
  return YAML.parse(content) as VersionNotesFile;
}

/**
 * 写入 version-notes.yaml
 */
function writeVersionNotes(data: VersionNotesFile): void {
  const header = `# TanmiWorkspace 版本更新说明
#
# 此文件由 scripts/sync-versions.ts 同步维护
# - conclusion: 自动从 CHANGELOG.md 提取
# - requirement/note: 人工填写
#
# 使用方式：
#   npm run sync-versions  # 从 CHANGELOG 同步新版本
#   npm run check-versions # 检查未填写的 requirement

`;

  const yaml = YAML.stringify(data, {
    lineWidth: 0,  // 不折行
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
  });

  fs.writeFileSync(VERSION_NOTES_PATH, header + yaml, "utf-8");
}

/**
 * 比较版本号
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return -1;  // 降序
    if (pa[i] < pb[i]) return 1;
  }
  return 0;
}

/**
 * 获取版本的 major.minor
 */
function getMajorMinor(version: string): string {
  const [major, minor] = version.split(".");
  return `${major}.${minor}`;
}

/**
 * 同步版本
 */
function syncVersions(): void {
  const changelog = parseChangelog();
  const notes = readVersionNotes();

  const existingVersions = new Set(notes.versions.map(v => v.version));
  const newVersions: VersionNote[] = [];

  for (const [version, conclusion] of changelog) {
    if (!existingVersions.has(version)) {
      newVersions.push({
        version,
        requirement: "",
        conclusion,
        note: "",
      });
      console.log(`✓ 新增版本: ${version}`);
    }
  }

  if (newVersions.length === 0) {
    console.log("✓ 没有新版本需要同步");
    return;
  }

  // 合并并按版本号排序
  const allVersions = [...notes.versions, ...newVersions];
  allVersions.sort((a, b) => compareVersions(a.version, b.version));

  // 按 major.minor 分组添加注释
  let lastMajorMinor = "";
  const groupedVersions: VersionNote[] = [];

  for (const v of allVersions) {
    const mm = getMajorMinor(v.version);
    if (mm !== lastMajorMinor) {
      lastMajorMinor = mm;
    }
    groupedVersions.push(v);
  }

  writeVersionNotes({ versions: groupedVersions });
  console.log(`\n✓ 已同步 ${newVersions.length} 个新版本到 ${VERSION_NOTES_PATH}`);
}

/**
 * 检查未填写的 requirement
 */
function checkVersions(): void {
  const notes = readVersionNotes();
  const missing: string[] = [];

  for (const v of notes.versions) {
    if (!v.requirement.trim()) {
      missing.push(v.version);
    }
  }

  if (missing.length === 0) {
    console.log("✓ 所有版本的 requirement 已填写");
  } else {
    console.log(`⚠ 以下版本缺少 requirement:\n`);
    for (const v of missing) {
      console.log(`  - ${v}`);
    }
    console.log(`\n请编辑 ${VERSION_NOTES_PATH} 填写缺失的 requirement`);
  }
}

// 主入口
const args = process.argv.slice(2);

if (args.includes("--check")) {
  checkVersions();
} else {
  syncVersions();
  console.log("");
  checkVersions();
}
