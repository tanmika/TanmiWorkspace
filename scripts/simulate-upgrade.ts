/**
 * 模拟版本升级测试
 *
 * 运行: npx tsx scripts/simulate-upgrade.ts [场景]
 *
 * 场景:
 *   A - 删除 V1.9 后从 v1.9.1 → v1.9.2（创建完整 V1.9 节点，包含 1.9.0/1.9.1/1.9.2）
 *   B - v1.9.1 → v1.9.2（复用已有 V1.9 节点，只添加 1.9.2）
 *   C - v1.9.x → v1.10.0（创建新 V1.10 节点）
 *   reset - 恢复备份
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import YAML from "yaml";

const DEV_DATA_DIR = path.join(os.homedir(), ".tanmi-workspace-dev");
const TUTORIAL_DIR = path.join(DEV_DATA_DIR, "tutorial");
const CONFIG_FILE = path.join(DEV_DATA_DIR, "config.json");
const VERSION_NOTES_PATH = path.join(process.cwd(), "config/version-notes.yaml");
const PACKAGE_JSON_PATH = path.join(process.cwd(), "package.json");

let originalPackageJson: string;
let originalVersionNotes: string;

async function backupCurrentState() {
  const backupPath = path.join(DEV_DATA_DIR, "tutorial_test_backup");

  try {
    await fs.rm(backupPath, { recursive: true, force: true });
  } catch {}

  await fs.cp(TUTORIAL_DIR, backupPath, { recursive: true });

  // 备份 package.json 和 version-notes.yaml
  originalPackageJson = await fs.readFile(PACKAGE_JSON_PATH, "utf-8");
  originalVersionNotes = await fs.readFile(VERSION_NOTES_PATH, "utf-8");

  console.log("✓ 已备份当前状态到 tutorial_test_backup");
}

async function setPackageVersion(version: string) {
  const pkg = JSON.parse(await fs.readFile(PACKAGE_JSON_PATH, "utf-8"));
  pkg.version = version;
  await fs.writeFile(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`  ✓ 已设置 package.json version = ${version}`);
}

async function restorePackageJson() {
  if (originalPackageJson) {
    await fs.writeFile(PACKAGE_JSON_PATH, originalPackageJson);
    console.log("  ✓ 已恢复 package.json");
  }
}

async function restoreVersionNotes() {
  if (originalVersionNotes) {
    await fs.writeFile(VERSION_NOTES_PATH, originalVersionNotes);
    console.log("  ✓ 已恢复 version-notes.yaml");
  }
}

async function restoreBackup() {
  const backupPath = path.join(DEV_DATA_DIR, "tutorial_test_backup");

  try {
    await fs.rm(TUTORIAL_DIR, { recursive: true, force: true });
    await fs.cp(backupPath, TUTORIAL_DIR, { recursive: true });
    console.log("✓ 已从 tutorial_test_backup 恢复 tutorial 目录");
  } catch (e) {
    console.error("恢复失败:", e);
  }
}

async function addVersionToNotes(version: string, requirement: string) {
  const content = await fs.readFile(VERSION_NOTES_PATH, "utf-8");
  const notes = YAML.parse(content);

  // 检查是否已存在
  if (notes.versions.some((v: any) => v.version === version)) {
    console.log(`  版本 ${version} 已存在于 version-notes.yaml`);
    return;
  }

  notes.versions.unshift({
    version,
    requirement,
    conclusion: `- 测试: ${requirement}`,
    note: ""
  });

  await fs.writeFile(VERSION_NOTES_PATH, YAML.stringify(notes));
  console.log(`  ✓ 已添加 v${version} 到 version-notes.yaml`);
}

async function setTutorialVersion(version: string) {
  let config: any = {};
  try {
    config = JSON.parse(await fs.readFile(CONFIG_FILE, "utf-8"));
  } catch {}

  config.tutorialVersion = version;
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`  ✓ 已设置 tutorialVersion = ${version}`);
}

/**
 * 删除版本更新工作区中的指定 major.minor 节点
 */
async function deleteVersionNode(majorMinor: string) {
  const wsListDir = path.join(TUTORIAL_DIR, ".tanmi-workspace-dev");
  const dirs = await fs.readdir(wsListDir);
  const versionWsDir = dirs.find(d => d.startsWith("TanmiWorkspace 版本更新"));

  if (!versionWsDir) {
    console.log("  ⚠️ 版本更新工作区不存在");
    return;
  }

  const graphPath = path.join(wsListDir, versionWsDir, "graph.json");
  const graph = JSON.parse(await fs.readFile(graphPath, "utf-8"));

  // 找到 V{majorMinor} 节点
  let targetNodeId: string | null = null;
  for (const [nodeId, node] of Object.entries(graph.nodes) as [string, any][]) {
    if (node.parentId === "root" && node.dirName?.includes(`V${majorMinor}`)) {
      targetNodeId = nodeId;
      break;
    }
  }

  if (!targetNodeId) {
    console.log(`  ⚠️ 未找到 V${majorMinor} 节点`);
    return;
  }

  // 递归删除节点及其子节点
  function deleteNodeRecursive(nodeId: string) {
    const node = graph.nodes[nodeId];
    if (node?.children) {
      for (const childId of node.children) {
        deleteNodeRecursive(childId);
      }
    }
    delete graph.nodes[nodeId];
  }

  // 先获取节点目录名（在删除前）
  const targetNode = graph.nodes[targetNodeId];
  const targetDirName = targetNode?.dirName;

  // 从 root 的 children 中移除
  const rootNode = graph.nodes.root;
  rootNode.children = rootNode.children.filter((id: string) => id !== targetNodeId);

  // 删除节点
  deleteNodeRecursive(targetNodeId);

  // 删除节点目录
  if (targetDirName) {
    const nodeDir = path.join(wsListDir, versionWsDir, targetDirName);
    try {
      await fs.rm(nodeDir, { recursive: true, force: true });
    } catch {}
  }

  await fs.writeFile(graphPath, JSON.stringify(graph, null, 2));
  console.log(`  ✓ 已删除 V${majorMinor} 节点`);
}

/**
 * 在子进程中运行 ensureTutorial
 */
function runEnsureTutorial() {
  execSync("npx tsx scripts/run-ensure-tutorial.ts", {
    stdio: "inherit",
    env: { ...process.env, TANMI_DEV: "true" },
  });
}

/**
 * 运行验证脚本
 */
function runValidation() {
  execSync("npx tsx scripts/test-version-update.ts", { stdio: "inherit" });
}

/**
 * 场景 A: 删除 V1.9 后从 v1.9.1 → v1.9.2
 * 预期：创建新的 V1.9 节点，包含完整的 1.9.x 系列（1.9.0, 1.9.1, 1.9.2）
 */
async function runScenarioA() {
  console.log("\n🧪 场景 A: 删除 V1.9 后从 v1.9.1 → v1.9.2\n");
  console.log("预期: 创建新 V1.9 节点，包含完整 1.9.x 系列 (1.9.0, 1.9.1, 1.9.2)\n");

  await backupCurrentState();

  console.log("\n1. 准备测试数据:");
  await addVersionToNotes("1.9.2", "测试完整 minor 系列创建");
  await deleteVersionNode("1.9");  // 删除现有 V1.9 节点
  await setTutorialVersion("1.9.1");
  await setPackageVersion("1.9.2");

  console.log("\n2. 调用 ensureTutorial():");
  runEnsureTutorial();
  await restorePackageJson();

  console.log("\n3. 验证结果:");
  runValidation();

  console.log("\n📋 场景 A 预期检查:");
  console.log("  - V1.9 应该包含 3 个子节点: [1.9.2, 1.9.1, 1.9.0]");
  console.log("  - V1.9 的 requirement 应该来自 v1.9.0 的 version-notes");
}

/**
 * 场景 B: v1.9.1 → v1.9.2（复用已有 V1.9 节点）
 * 预期：复用已有 V1.9 节点，只添加 1.9.2
 */
async function runScenarioB() {
  console.log("\n🧪 场景 B: v1.9.1 → v1.9.2（复用已有 V1.9 节点）\n");
  console.log("预期: 复用已有 V1.9 节点，只添加新的 1.9.2 子节点\n");

  await backupCurrentState();

  console.log("\n1. 准备测试数据:");
  await addVersionToNotes("1.9.2", "测试 patch 升级复用逻辑");
  await setTutorialVersion("1.9.1");
  await setPackageVersion("1.9.2");

  console.log("\n2. 调用 ensureTutorial():");
  runEnsureTutorial();
  await restorePackageJson();

  console.log("\n3. 验证结果:");
  runValidation();

  console.log("\n📋 场景 B 预期检查:");
  console.log("  - V1.9 应该新增 1.9.2 子节点");
  console.log("  - 无重复的 V1.9 节点");
}

/**
 * 场景 C: v1.9.x → v1.10.0（创建新 V1.10 节点）
 * 预期：创建新的 V1.10 节点
 */
async function runScenarioC() {
  console.log("\n🧪 场景 C: v1.9.x → v1.10.0（创建新 V1.10 节点）\n");
  console.log("预期: 创建新 V1.10 节点，使用 v1.10.0 的 requirement\n");

  await backupCurrentState();

  console.log("\n1. 准备测试数据:");
  await addVersionToNotes("1.10.0", "测试 minor 升级创建新节点");
  await setTutorialVersion("1.9.1");
  await setPackageVersion("1.10.0");

  console.log("\n2. 调用 ensureTutorial():");
  runEnsureTutorial();
  await restorePackageJson();

  console.log("\n3. 验证结果:");
  runValidation();

  console.log("\n📋 场景 C 预期检查:");
  console.log("  - 应该创建新的 V1.10 节点");
  console.log("  - V1.10 包含 1.10.0 子节点");
}

async function cleanup() {
  console.log("\n🧹 清理测试数据\n");

  await restoreBackup();
  await restoreVersionNotes();

  // 恢复 config
  await setTutorialVersion("1.9.1");

  console.log("\n✓ 清理完成");
}

async function main() {
  const scenario = process.argv[2]?.toUpperCase() || "HELP";

  switch (scenario) {
    case "A":
      await runScenarioA();
      break;
    case "B":
      await runScenarioB();
      break;
    case "C":
      await runScenarioC();
      break;
    case "RESET":
    case "CLEANUP":
      await cleanup();
      break;
    default:
      console.log("用法: npx tsx scripts/simulate-upgrade.ts [A|B|C|reset]");
      console.log("");
      console.log("  A     - 删除 V1.9 后 v1.9.1 → v1.9.2（创建完整 V1.9）");
      console.log("  B     - v1.9.1 → v1.9.2（复用已有 V1.9）");
      console.log("  C     - v1.9.x → v1.10.0（创建新 V1.10）");
      console.log("  reset - 清理测试数据，恢复备份");
  }
}

main().catch(console.error);
