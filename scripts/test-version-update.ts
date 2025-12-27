/**
 * 版本更新逻辑手动测试脚本
 *
 * 运行: npx tsx scripts/test-version-update.ts
 *
 * 测试矩阵:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ 场景                        │ oldVersion │ 新增版本    │ 期望行为    │
 * ├─────────────────────────────┼────────────┼─────────────┼─────────────┤
 * │ A1: patch 升级              │ 1.9.1      │ 1.9.2       │ 复用 V1.9   │
 * │ A2: 连续 patch              │ 1.9.2      │ 1.9.3       │ 复用 V1.9   │
 * │ A3: 跳跃 patch (1.9.0→1.9.2)│ 1.9.0      │ 1.9.1,1.9.2 │ 复用 V1.9   │
 * │ B1: minor 升级              │ 1.9.x      │ 1.10.0      │ 新建 V1.10  │
 * │ B2: major 升级              │ 1.9.x      │ 2.0.0       │ 新建 V2.0   │
 * │ C1: 首次创建                │ undefined  │ 全部        │ 新建全部    │
 * │ D1: 重复调用                │ 1.9.1      │ 1.9.2       │ 不重复创建  │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import YAML from "yaml";

const DEV_DATA_DIR = path.join(os.homedir(), ".tanmi-workspace-dev");
const TUTORIAL_DIR = path.join(DEV_DATA_DIR, "tutorial");
const CONFIG_FILE = path.join(DEV_DATA_DIR, "config.json");
const VERSION_NOTES_PATH = path.join(process.cwd(), "config/version-notes.yaml");

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

async function readGraph(wsDirName: string) {
  const graphPath = path.join(TUTORIAL_DIR, ".tanmi-workspace-dev", wsDirName, "graph.json");
  return JSON.parse(await fs.readFile(graphPath, "utf-8"));
}

async function findVersionWorkspace(): Promise<string | null> {
  const wsListDir = path.join(TUTORIAL_DIR, ".tanmi-workspace-dev");
  try {
    const dirs = await fs.readdir(wsListDir);
    return dirs.find(d => d.startsWith("TanmiWorkspace 版本更新")) || null;
  } catch {
    return null;
  }
}

async function countMajorMinorNodes(graph: any): Promise<Map<string, { nodeId: string; childCount: number }>> {
  const result = new Map<string, { nodeId: string; childCount: number }>();

  for (const [nodeId, node] of Object.entries(graph.nodes) as [string, any][]) {
    if (node.parentId === "root" && node.dirName) {
      const match = node.dirName.match(/V(\d+\.\d+)/);
      if (match) {
        const mm = match[1];
        if (result.has(mm)) {
          // 发现重复节点
          console.error(`❌ 发现重复的 V${mm} 节点: ${nodeId} 和 ${result.get(mm)!.nodeId}`);
        }
        result.set(mm, { nodeId, childCount: node.children?.length || 0 });
      }
    }
  }

  return result;
}

async function getChildVersions(graph: any, parentId: string): Promise<string[]> {
  const parent = graph.nodes[parentId];
  if (!parent?.children) return [];

  const versions: string[] = [];
  for (const childId of parent.children) {
    const child = graph.nodes[childId];
    if (child?.dirName) {
      const match = child.dirName.match(/V(\d+\.\d+\.\d+)/);
      if (match) versions.push(match[1]);
    }
  }
  return versions;
}

async function runTests() {
  console.log("🧪 版本更新逻辑测试\n");
  console.log("=" .repeat(60));

  const results: TestResult[] = [];

  // 检查版本更新工作区是否存在
  const wsDir = await findVersionWorkspace();
  if (!wsDir) {
    console.error("❌ 版本更新工作区不存在，请先运行一次 ensureTutorial");
    return;
  }

  console.log(`✓ 找到版本更新工作区: ${wsDir}\n`);

  // 读取当前状态
  const graph = await readGraph(wsDir);
  const majorMinorNodes = await countMajorMinorNodes(graph);

  console.log("当前 major.minor 节点:");
  for (const [mm, info] of Array.from(majorMinorNodes.entries()).sort((a, b) => b[0].localeCompare(a[0]))) {
    const childVersions = await getChildVersions(graph, info.nodeId);
    console.log(`  V${mm}: ${info.childCount} 个子节点 [${childVersions.join(", ")}]`);
  }

  console.log("\n" + "=" .repeat(60));

  // 测试 1: 检查是否有重复的 major.minor 节点
  console.log("\n📋 测试 1: 检查重复节点");
  const duplicates = new Map<string, string[]>();
  for (const [nodeId, node] of Object.entries(graph.nodes) as [string, any][]) {
    if (node.parentId === "root" && node.dirName) {
      const match = node.dirName.match(/V(\d+\.\d+)/);
      if (match) {
        const mm = match[1];
        if (!duplicates.has(mm)) duplicates.set(mm, []);
        duplicates.get(mm)!.push(nodeId);
      }
    }
  }

  let hasDuplicates = false;
  for (const [mm, nodes] of duplicates) {
    if (nodes.length > 1) {
      console.log(`  ❌ V${mm} 有 ${nodes.length} 个重复节点: ${nodes.join(", ")}`);
      hasDuplicates = true;
    }
  }

  if (!hasDuplicates) {
    console.log("  ✓ 无重复节点");
    results.push({ name: "无重复节点", passed: true, details: "" });
  } else {
    results.push({ name: "无重复节点", passed: false, details: "存在重复节点" });
  }

  // 测试 2: 检查子节点排序（新版本应在前）
  console.log("\n📋 测试 2: 检查子节点排序");
  let sortingCorrect = true;

  for (const [mm, info] of majorMinorNodes) {
    const childVersions = await getChildVersions(graph, info.nodeId);
    if (childVersions.length < 2) continue;

    // 验证降序排列
    for (let i = 0; i < childVersions.length - 1; i++) {
      const [aMajor, aMinor, aPatch] = childVersions[i].split(".").map(Number);
      const [bMajor, bMinor, bPatch] = childVersions[i + 1].split(".").map(Number);

      const aVal = aMajor * 10000 + aMinor * 100 + aPatch;
      const bVal = bMajor * 10000 + bMinor * 100 + bPatch;

      if (aVal < bVal) {
        console.log(`  ❌ V${mm} 子节点排序错误: ${childVersions[i]} 应在 ${childVersions[i + 1]} 前面`);
        sortingCorrect = false;
      }
    }
  }

  if (sortingCorrect) {
    console.log("  ✓ 子节点排序正确（新版本在前）");
    results.push({ name: "子节点排序", passed: true, details: "" });
  } else {
    results.push({ name: "子节点排序", passed: false, details: "排序错误" });
  }

  // 测试 3: 检查 root 子节点排序（major.minor 降序）
  console.log("\n📋 测试 3: 检查 root 子节点排序");
  const rootChildren = graph.nodes.root?.children || [];
  const rootVersions: string[] = [];

  for (const childId of rootChildren) {
    const child = graph.nodes[childId];
    if (child?.dirName) {
      const match = child.dirName.match(/V(\d+\.\d+)/);
      if (match) rootVersions.push(match[1]);
    }
  }

  let rootSortingCorrect = true;
  for (let i = 0; i < rootVersions.length - 1; i++) {
    const [aMajor, aMinor] = rootVersions[i].split(".").map(Number);
    const [bMajor, bMinor] = rootVersions[i + 1].split(".").map(Number);

    const aVal = aMajor * 100 + aMinor;
    const bVal = bMajor * 100 + bMinor;

    if (aVal < bVal) {
      console.log(`  ❌ root 子节点排序错误: V${rootVersions[i]} 应在 V${rootVersions[i + 1]} 前面`);
      rootSortingCorrect = false;
    }
  }

  if (rootSortingCorrect) {
    console.log("  ✓ root 子节点排序正确");
    results.push({ name: "root 排序", passed: true, details: "" });
  } else {
    results.push({ name: "root 排序", passed: false, details: "排序错误" });
  }

  // 测试 4: 验证 V1.9 节点状态
  console.log("\n📋 测试 4: 验证 V1.9 节点");
  const v19Info = majorMinorNodes.get("1.9");
  if (v19Info) {
    const v19Node = graph.nodes[v19Info.nodeId];
    const childVersions = await getChildVersions(graph, v19Info.nodeId);

    console.log(`  节点 ID: ${v19Info.nodeId}`);
    console.log(`  状态: ${v19Node.status}`);
    console.log(`  子节点: ${childVersions.join(" > ")}`);

    // 检查是否包含 v1.9.0, v1.9.1
    const hasV190 = childVersions.includes("1.9.0");
    const hasV191 = childVersions.includes("1.9.1");

    if (hasV190 && hasV191) {
      console.log("  ✓ 包含 v1.9.0 和 v1.9.1");
      results.push({ name: "V1.9 子节点", passed: true, details: childVersions.join(", ") });
    } else {
      console.log(`  ⚠️ 缺少版本: ${!hasV190 ? "v1.9.0" : ""} ${!hasV191 ? "v1.9.1" : ""}`);
      results.push({ name: "V1.9 子节点", passed: false, details: `缺少版本` });
    }
  } else {
    console.log("  ❌ V1.9 节点不存在");
    results.push({ name: "V1.9 节点", passed: false, details: "不存在" });
  }

  // 汇总结果
  console.log("\n" + "=" .repeat(60));
  console.log("📊 测试结果汇总:\n");

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const r of results) {
    console.log(`  ${r.passed ? "✓" : "❌"} ${r.name}${r.details ? `: ${r.details}` : ""}`);
  }

  console.log(`\n总计: ${passed} 通过, ${failed} 失败`);

  if (failed === 0) {
    console.log("\n🎉 所有测试通过！");
  } else {
    console.log("\n⚠️ 存在失败的测试，请检查");
  }
}

runTests().catch(console.error);
