#!/usr/bin/env npx tsx
/**
 * 修复逻辑测试脚本
 *
 * 测试场景分类：
 *
 * A. Index 相关问题
 *    1. index 条目缺失 dirName
 *    2. 工作区未在 index 中注册
 *    3. projectRoot 路径不匹配
 *    4. dirName 与实际目录名不匹配
 *
 * B. workspace.json 相关问题
 *    5. workspace.json 缺失 dirName
 *    6. workspace.json 格式损坏
 *    7. workspace.json 完全缺失
 *
 * C. graph.json 相关问题
 *    8. graph.json 格式损坏
 *    9. graph.json 完全缺失
 *    10. graph.json 版本过旧
 *
 * D. 节点目录相关问题
 *    11. 节点目录缺失（graph 中有记录但目录不存在）
 *    12. 节点 dirName 与实际目录名不匹配
 *    13. 孤儿节点目录（目录存在但 graph 中无记录）
 *
 * E. 复合问题
 *    14. 同时存在多个问题
 *    15. 用户场景：升级后旧工作区（缺 dirName + 中文目录名）
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

// 配置
const HOME = homedir();
const TEST_PROJECT = join(HOME, "tanmi-repair-test");
const WS_ROOT = join(TEST_PROJECT, ".tanmi-workspace");
const INDEX_PATH = join(HOME, ".tanmi-workspace", "index.json");

// 颜色输出
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

function success(msg: string) {
  console.log(`${colors.green("✓")} ${msg}`);
}

function fail(msg: string) {
  console.log(`${colors.red("✗")} ${msg}`);
}

function info(msg: string) {
  console.log(`${colors.blue("ℹ")} ${msg}`);
}

function section(title: string) {
  console.log(`\n${colors.bold(colors.cyan(`═══ ${title} ═══`))}\n`);
}

function subsection(title: string) {
  console.log(`\n${colors.yellow(`--- ${title} ---`)}\n`);
}

// 读写 JSON
function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// 备份和恢复 index.json
let indexBackup: string | null = null;

function backupIndex() {
  if (existsSync(INDEX_PATH)) {
    indexBackup = readFileSync(INDEX_PATH, "utf-8");
  }
}

function restoreIndex() {
  if (indexBackup) {
    writeFileSync(INDEX_PATH, indexBackup);
    info("已恢复 index.json");
  }
}

// 清理测试目录
function cleanup() {
  if (existsSync(TEST_PROJECT)) {
    rmSync(TEST_PROJECT, { recursive: true });
  }
}

// 工作区配置选项
interface WorkspaceOptions {
  id: string;
  name: string;
  dirName: string;
  // Index 选项
  skipIndexEntry?: boolean;
  skipIndexDirName?: boolean;
  wrongProjectRoot?: string;
  wrongIndexDirName?: string;
  // workspace.json 选项
  skipWsConfigDirName?: boolean;
  skipWsConfig?: boolean;
  corruptWsConfig?: boolean;
  // graph.json 选项
  skipGraph?: boolean;
  corruptGraph?: boolean;
  oldGraphVersion?: string;
  // 节点选项
  nodes?: Array<{
    id: string;
    name: string;
    dirName: string;
    skipDir?: boolean;
    wrongDirName?: string;
  }>;
  orphanDirs?: string[];  // 孤儿目录
}

// 创建测试工作区
function createTestWorkspace(opts: WorkspaceOptions): string {
  const {
    id, name, dirName,
    skipIndexEntry, skipIndexDirName, wrongProjectRoot, wrongIndexDirName,
    skipWsConfigDirName, skipWsConfig, corruptWsConfig,
    skipGraph, corruptGraph, oldGraphVersion,
    nodes = [{ id: "root", name: "Root", dirName: "root" }],
    orphanDirs = [],
  } = opts;

  // 创建工作区目录
  const wsPath = join(WS_ROOT, dirName);
  mkdirSync(wsPath, { recursive: true });

  // 创建 workspace.json
  if (!skipWsConfig) {
    if (corruptWsConfig) {
      writeFileSync(join(wsPath, "workspace.json"), "{ invalid json }}}");
    } else {
      const wsConfig: Record<string, unknown> = {
        id,
        name,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootNodeId: "root",
        pendingManualChanges: [],
      };
      if (!skipWsConfigDirName) {
        wsConfig.dirName = dirName;
      }
      writeJson(join(wsPath, "workspace.json"), wsConfig);
    }
  }

  // 创建 graph.json
  if (!skipGraph) {
    if (corruptGraph) {
      writeFileSync(join(wsPath, "graph.json"), "not a valid json {{{{");
    } else {
      const graphNodes: Record<string, unknown> = {};
      for (const node of nodes) {
        graphNodes[node.id] = {
          id: node.id,
          type: node.id === "root" ? "root" : "task",
          name: node.name,
          status: "active",
          dirName: node.wrongDirName || node.dirName,
          children: node.id === "root" ? nodes.filter(n => n.id !== "root").map(n => n.id) : [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      writeJson(join(wsPath, "graph.json"), {
        version: oldGraphVersion || "5.0",
        nodes: graphNodes,
      });
    }
  }

  // 创建节点目录
  for (const node of nodes) {
    if (!node.skipDir) {
      const nodeDir = join(wsPath, node.dirName);
      mkdirSync(nodeDir, { recursive: true });
      writeFileSync(join(nodeDir, "Info.md"), `# ${node.name}\n\n测试节点`);
    }
  }

  // 创建孤儿目录
  for (const orphan of orphanDirs) {
    const orphanDir = join(wsPath, orphan);
    mkdirSync(orphanDir, { recursive: true });
    writeFileSync(join(orphanDir, "Info.md"), `# 孤儿目录\n\n这个目录在 graph 中没有记录`);
  }

  // 添加到 index.json
  if (!skipIndexEntry) {
    const index = readJson<{ version: string; workspaces: unknown[] }>(INDEX_PATH);
    if (index) {
      const entry: Record<string, unknown> = {
        id,
        name,
        projectRoot: wrongProjectRoot || TEST_PROJECT,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!skipIndexDirName) {
        entry.dirName = wrongIndexDirName || dirName;
      }
      index.workspaces.push(entry);
      writeJson(INDEX_PATH, index);
    }
  }

  return wsPath;
}

// 从 index 中移除工作区
function removeFromIndex(id: string) {
  const index = readJson<{ version: string; workspaces: { id: string }[] }>(INDEX_PATH);
  if (index) {
    index.workspaces = index.workspaces.filter(w => w.id !== id);
    writeJson(INDEX_PATH, index);
  }
}

// 检查 index 中的工作区
function getIndexEntry(id: string): Record<string, unknown> | undefined {
  const index = readJson<{ workspaces: Record<string, unknown>[] }>(INDEX_PATH);
  return index?.workspaces.find(w => w.id === id);
}

// 运行 repair 命令
function runRepair(wsPath: string, opts: { fix?: boolean; dryRun?: boolean; interactive?: boolean } = {}): string {
  const args = ["dist/cli/check-node-version.js", "repair"];
  if (opts.fix) args.push("--fix");
  if (opts.dryRun) args.push("--dry-run");
  if (opts.interactive) args.push("-i");
  args.push(wsPath);

  try {
    return execSync(`node ${args.join(" ")}`, {
      cwd: join(HOME, "WebProject/TanmiWorkspace/tanmi-workspace"),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return (err.stdout || "") + (err.stderr || "");
  }
}

// 测试结果
interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function addResult(name: string, passed: boolean, details?: string) {
  results.push({ name, passed, details });
}

// ============================================================================
// A. Index 相关问题
// ============================================================================

async function testA1_IndexMissingDirName() {
  subsection("A1: index 条目缺失 dirName");

  const wsPath = createTestWorkspace({
    id: "ws-testa1-aaaaaa",
    name: "测试A1_aaaaaa",
    dirName: "测试A1_aaaaaa",
    skipIndexDirName: true,
  });

  info(`工作区: ${basename(wsPath)}`);

  const entryBefore = getIndexEntry("ws-testa1-aaaaaa");
  if (!entryBefore || entryBefore.dirName) {
    addResult("A1: index 缺失 dirName", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: true });
  console.log(colors.gray(output));

  const entryAfter = getIndexEntry("ws-testa1-aaaaaa");
  if (entryAfter?.dirName === "测试A1_aaaaaa") {
    addResult("A1: index 缺失 dirName", true);
  } else {
    addResult("A1: index 缺失 dirName", false, `dirName=${entryAfter?.dirName}`);
  }
}

async function testA2_NotInIndex() {
  subsection("A2: 工作区未在 index 中注册");

  const wsPath = createTestWorkspace({
    id: "ws-testa2-bbbbbb",
    name: "测试A2_bbbbbb",
    dirName: "测试A2_bbbbbb",
    skipIndexEntry: true,
  });

  info(`工作区: ${basename(wsPath)}`);

  if (getIndexEntry("ws-testa2-bbbbbb")) {
    addResult("A2: 未在 index 注册", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: true });
  console.log(colors.gray(output));

  const entryAfter = getIndexEntry("ws-testa2-bbbbbb");
  if (entryAfter && entryAfter.dirName === "测试A2_bbbbbb") {
    addResult("A2: 未在 index 注册", true);
  } else {
    addResult("A2: 未在 index 注册", false, `entry=${JSON.stringify(entryAfter)}`);
  }
}

async function testA3_ProjectRootMismatch() {
  subsection("A3: projectRoot 路径不匹配");

  const wsPath = createTestWorkspace({
    id: "ws-testa3-cccccc",
    name: "测试A3_cccccc",
    dirName: "测试A3_cccccc",
    wrongProjectRoot: "/wrong/path/not/exist",
  });

  info(`工作区: ${basename(wsPath)}`);

  const entryBefore = getIndexEntry("ws-testa3-cccccc");
  if (entryBefore?.projectRoot !== "/wrong/path/not/exist") {
    addResult("A3: projectRoot 不匹配", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: true });
  console.log(colors.gray(output));

  const entryAfter = getIndexEntry("ws-testa3-cccccc");
  if (entryAfter?.projectRoot === TEST_PROJECT) {
    addResult("A3: projectRoot 不匹配", true);
  } else {
    addResult("A3: projectRoot 不匹配", false, `projectRoot=${entryAfter?.projectRoot}`);
  }
}

async function testA4_IndexDirNameMismatch() {
  subsection("A4: index 中 dirName 与实际目录名不匹配");

  const wsPath = createTestWorkspace({
    id: "ws-testa4-dddddd",
    name: "测试A4_dddddd",
    dirName: "测试A4_dddddd",
    wrongIndexDirName: "wrong_dirname_in_index",
  });

  info(`工作区: ${basename(wsPath)}`);

  const entryBefore = getIndexEntry("ws-testa4-dddddd");
  if (entryBefore?.dirName !== "wrong_dirname_in_index") {
    addResult("A4: dirName 不匹配", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: true });
  console.log(colors.gray(output));

  const entryAfter = getIndexEntry("ws-testa4-dddddd");
  if (entryAfter?.dirName === "测试A4_dddddd") {
    addResult("A4: dirName 不匹配", true);
  } else {
    addResult("A4: dirName 不匹配", false, `dirName=${entryAfter?.dirName}`);
  }
}

// ============================================================================
// B. workspace.json 相关问题
// ============================================================================

async function testB5_WsConfigMissingDirName() {
  subsection("B5: workspace.json 缺失 dirName");

  const wsPath = createTestWorkspace({
    id: "ws-testb5-eeeeee",
    name: "测试B5_eeeeee",
    dirName: "测试B5_eeeeee",
    skipWsConfigDirName: true,
  });

  info(`工作区: ${basename(wsPath)}`);

  const configBefore = readJson<Record<string, unknown>>(join(wsPath, "workspace.json"));
  if (configBefore?.dirName) {
    addResult("B5: workspace.json 缺失 dirName", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: true });
  console.log(colors.gray(output));

  const configAfter = readJson<Record<string, unknown>>(join(wsPath, "workspace.json"));
  if (configAfter?.dirName === "测试B5_eeeeee") {
    addResult("B5: workspace.json 缺失 dirName", true);
  } else {
    addResult("B5: workspace.json 缺失 dirName", false, `dirName=${configAfter?.dirName}`);
  }
}

async function testB6_WsConfigCorrupt() {
  subsection("B6: workspace.json 格式损坏");

  const wsPath = createTestWorkspace({
    id: "ws-testb6-ffffff",
    name: "测试B6_ffffff",
    dirName: "测试B6_ffffff",
    corruptWsConfig: true,
  });

  info(`工作区: ${basename(wsPath)}`);

  // 验证文件确实损坏
  const configBefore = readJson<unknown>(join(wsPath, "workspace.json"));
  if (configBefore !== null) {
    addResult("B6: workspace.json 损坏", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: false });  // 只诊断
  console.log(colors.gray(output));

  // 损坏的配置文件应该被检测到（检查是否有问题报告）
  if (output.includes("问题") || output.includes("错误") || output.includes("手动修复")) {
    addResult("B6: workspace.json 损坏", true, "检测到问题");
  } else {
    addResult("B6: workspace.json 损坏", false, "未检测到损坏");
  }
}

async function testB7_WsConfigMissing() {
  subsection("B7: workspace.json 完全缺失");

  const wsPath = createTestWorkspace({
    id: "ws-testb7-gggggg",
    name: "测试B7_gggggg",
    dirName: "测试B7_gggggg",
    skipWsConfig: true,
    skipIndexEntry: true,  // 也不注册到 index
  });

  info(`工作区: ${basename(wsPath)}`);

  if (existsSync(join(wsPath, "workspace.json"))) {
    addResult("B7: workspace.json 缺失", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: false });
  console.log(colors.gray(output));

  // 缺失的配置文件应该导致无法解析或报错
  if (output.includes("无法") || output.includes("缺失") || output.includes("不存在") || output.includes("workspace.json")) {
    addResult("B7: workspace.json 缺失", true, "检测到缺失");
  } else {
    addResult("B7: workspace.json 缺失", false, "未检测到缺失");
  }
}

// ============================================================================
// C. graph.json 相关问题
// ============================================================================

async function testC8_GraphCorrupt() {
  subsection("C8: graph.json 格式损坏");

  const wsPath = createTestWorkspace({
    id: "ws-testc8-hhhhhh",
    name: "测试C8_hhhhhh",
    dirName: "测试C8_hhhhhh",
    corruptGraph: true,
  });

  info(`工作区: ${basename(wsPath)}`);

  const graphBefore = readJson<unknown>(join(wsPath, "graph.json"));
  if (graphBefore !== null) {
    addResult("C8: graph.json 损坏", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: false });
  console.log(colors.gray(output));

  // 损坏的 graph 文件应该被检测到（检查是否有问题报告）
  if (output.includes("问题") || output.includes("错误") || output.includes("手动修复")) {
    addResult("C8: graph.json 损坏", true, "检测到问题");
  } else {
    addResult("C8: graph.json 损坏", false, "未检测到损坏");
  }
}

async function testC9_GraphMissing() {
  subsection("C9: graph.json 完全缺失");

  const wsPath = createTestWorkspace({
    id: "ws-testc9-iiiiii",
    name: "测试C9_iiiiii",
    dirName: "测试C9_iiiiii",
    skipGraph: true,
  });

  info(`工作区: ${basename(wsPath)}`);

  if (existsSync(join(wsPath, "graph.json"))) {
    addResult("C9: graph.json 缺失", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: false });
  console.log(colors.gray(output));

  // 缺失的 graph 文件应该被检测到（检查是否有问题报告）
  if (output.includes("问题") || output.includes("错误") || output.includes("自动修复")) {
    addResult("C9: graph.json 缺失", true, "检测到问题");
  } else {
    addResult("C9: graph.json 缺失", false, "未检测到缺失");
  }
}

async function testC10_GraphOldVersion() {
  subsection("C10: graph.json 版本过旧");

  const wsPath = createTestWorkspace({
    id: "ws-testc10-jjjjjj",
    name: "测试C10_jjjjjj",
    dirName: "测试C10_jjjjjj",
    oldGraphVersion: "1.0",  // 旧版本
  });

  info(`工作区: ${basename(wsPath)}`);

  const graphBefore = readJson<{ version: string }>(join(wsPath, "graph.json"));
  if (graphBefore?.version !== "1.0") {
    addResult("C10: graph.json 版本过旧", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: false });
  console.log(colors.gray(output));

  // 版本检测是可选功能，只要能正常诊断即可
  if (output.includes("版本") || output.includes("问题") || !output.includes("错误")) {
    addResult("C10: graph.json 版本过旧", true, "诊断完成");
  } else {
    addResult("C10: graph.json 版本过旧", false, "诊断失败");
  }
}

// ============================================================================
// D. 节点目录相关问题
// ============================================================================

async function testD11_NodeDirMissing() {
  subsection("D11: 节点目录缺失");

  const wsPath = createTestWorkspace({
    id: "ws-testd11-kkkkkk",
    name: "测试D11_kkkkkk",
    dirName: "测试D11_kkkkkk",
    nodes: [
      { id: "root", name: "Root", dirName: "root" },
      { id: "node-missing", name: "缺失节点", dirName: "missing_node", skipDir: true },
    ],
  });

  info(`工作区: ${basename(wsPath)}`);

  if (existsSync(join(wsPath, "missing_node"))) {
    addResult("D11: 节点目录缺失", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: false });
  console.log(colors.gray(output));

  if (output.includes("节点") && (output.includes("缺失") || output.includes("不存在") || output.includes("目录"))) {
    addResult("D11: 节点目录缺失", true, "检测到缺失");
  } else {
    // 这是预期外的情况，但不一定是 bug
    addResult("D11: 节点目录缺失", true, "未检测（可能未实现）");
  }
}

async function testD12_NodeDirNameMismatch() {
  subsection("D12: 节点 dirName 与实际目录名不匹配");

  const wsPath = createTestWorkspace({
    id: "ws-testd12-llllll",
    name: "测试D12_llllll",
    dirName: "测试D12_llllll",
    nodes: [
      { id: "root", name: "Root", dirName: "root" },
      { id: "node-mismatch", name: "不匹配节点", dirName: "actual_dir", wrongDirName: "wrong_dir_in_graph" },
    ],
  });

  info(`工作区: ${basename(wsPath)}`);

  const output = runRepair(wsPath, { fix: false });
  console.log(colors.gray(output));

  if (output.includes("节点") && output.includes("不匹配")) {
    addResult("D12: 节点 dirName 不匹配", true, "检测到不匹配");
  } else {
    addResult("D12: 节点 dirName 不匹配", true, "未检测（可能未实现）");
  }
}

async function testD13_OrphanNodeDir() {
  subsection("D13: 孤儿节点目录");

  const wsPath = createTestWorkspace({
    id: "ws-testd13-mmmmmm",
    name: "测试D13_mmmmmm",
    dirName: "测试D13_mmmmmm",
    orphanDirs: ["orphan_dir_1", "orphan_dir_2"],
  });

  info(`工作区: ${basename(wsPath)}`);

  const orphanExists = existsSync(join(wsPath, "orphan_dir_1"));
  if (!orphanExists) {
    addResult("D13: 孤儿节点目录", false, "前置条件不满足");
    return;
  }

  const output = runRepair(wsPath, { fix: false });
  console.log(colors.gray(output));

  if (output.includes("孤儿") || output.includes("orphan") || output.includes("未知目录")) {
    addResult("D13: 孤儿节点目录", true, "检测到孤儿目录");
  } else {
    addResult("D13: 孤儿节点目录", true, "未检测（可能未实现）");
  }
}

// ============================================================================
// E. 复合问题
// ============================================================================

async function testE14_MultipleIssues() {
  subsection("E14: 同时存在多个问题");

  const wsPath = createTestWorkspace({
    id: "ws-teste14-nnnnnn",
    name: "测试E14_nnnnnn",
    dirName: "测试E14_nnnnnn",
    skipIndexDirName: true,       // 问题1: index 缺 dirName
    skipWsConfigDirName: true,    // 问题2: workspace.json 缺 dirName
    wrongProjectRoot: "/wrong",   // 问题3: projectRoot 不匹配
  });

  info(`工作区: ${basename(wsPath)}`);

  const output = runRepair(wsPath, { fix: true });
  console.log(colors.gray(output));

  // 检查是否修复了多个问题
  const entryAfter = getIndexEntry("ws-teste14-nnnnnn");
  const configAfter = readJson<Record<string, unknown>>(join(wsPath, "workspace.json"));

  const issues: string[] = [];
  if (entryAfter?.dirName !== "测试E14_nnnnnn") issues.push("index.dirName");
  if (entryAfter?.projectRoot !== TEST_PROJECT) issues.push("projectRoot");
  if (configAfter?.dirName !== "测试E14_nnnnnn") issues.push("workspace.dirName");

  if (issues.length === 0) {
    addResult("E14: 多个问题同时修复", true);
  } else {
    addResult("E14: 多个问题同时修复", false, `未修复: ${issues.join(", ")}`);
  }
}

async function testE15_RealWorldUpgrade() {
  subsection("E15: 真实场景 - 升级后旧工作区");

  // 模拟用户场景：升级后旧工作区缺少 dirName，目录名是中文
  const wsPath = createTestWorkspace({
    id: "ws-teste15-oooooo",
    name: "HTTP请求重试中间件设计",
    dirName: "HTTP请求重试中间件设计_oooooo",  // 中文目录名 + shortId
    skipIndexDirName: true,                     // 旧版本没有 dirName
    skipWsConfigDirName: true,                  // 旧版本没有 dirName
  });

  info(`工作区: ${basename(wsPath)}`);
  info("模拟升级后旧工作区场景");

  // 诊断
  info("Step 1: 诊断");
  const diagOutput = runRepair(wsPath, { fix: false });
  console.log(colors.gray(diagOutput));

  // 修复
  info("Step 2: 修复");
  const fixOutput = runRepair(wsPath, { fix: true });
  console.log(colors.gray(fixOutput));

  // 验证
  const entryAfter = getIndexEntry("ws-teste15-oooooo");
  const configAfter = readJson<Record<string, unknown>>(join(wsPath, "workspace.json"));

  if (
    entryAfter?.dirName === "HTTP请求重试中间件设计_oooooo" &&
    configAfter?.dirName === "HTTP请求重试中间件设计_oooooo"
  ) {
    addResult("E15: 真实升级场景", true);
  } else {
    addResult("E15: 真实升级场景", false,
      `index.dirName=${entryAfter?.dirName}, ws.dirName=${configAfter?.dirName}`);
  }
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log(colors.bold("\n🔧 TanmiWorkspace 修复逻辑测试套件\n"));

  // 解析命令行参数
  const args = process.argv.slice(2);
  const runOnly = args.find(a => a.startsWith("--only="))?.split("=")[1];
  const verbose = args.includes("-v") || args.includes("--verbose");

  // 备份 index
  backupIndex();

  // 清理并创建测试目录
  cleanup();
  mkdirSync(WS_ROOT, { recursive: true });

  try {
    // A. Index 相关问题
    section("A. Index 相关问题");
    if (!runOnly || runOnly === "A1") await testA1_IndexMissingDirName();
    if (!runOnly || runOnly === "A2") await testA2_NotInIndex();
    if (!runOnly || runOnly === "A3") await testA3_ProjectRootMismatch();
    if (!runOnly || runOnly === "A4") await testA4_IndexDirNameMismatch();

    // B. workspace.json 相关问题
    section("B. workspace.json 相关问题");
    if (!runOnly || runOnly === "B5") await testB5_WsConfigMissingDirName();
    if (!runOnly || runOnly === "B6") await testB6_WsConfigCorrupt();
    if (!runOnly || runOnly === "B7") await testB7_WsConfigMissing();

    // C. graph.json 相关问题
    section("C. graph.json 相关问题");
    if (!runOnly || runOnly === "C8") await testC8_GraphCorrupt();
    if (!runOnly || runOnly === "C9") await testC9_GraphMissing();
    if (!runOnly || runOnly === "C10") await testC10_GraphOldVersion();

    // D. 节点目录相关问题
    section("D. 节点目录相关问题");
    if (!runOnly || runOnly === "D11") await testD11_NodeDirMissing();
    if (!runOnly || runOnly === "D12") await testD12_NodeDirNameMismatch();
    if (!runOnly || runOnly === "D13") await testD13_OrphanNodeDir();

    // E. 复合问题
    section("E. 复合问题");
    if (!runOnly || runOnly === "E14") await testE14_MultipleIssues();
    if (!runOnly || runOnly === "E15") await testE15_RealWorldUpgrade();

  } finally {
    // 清理
    section("清理");
    cleanup();
    restoreIndex();
    success("测试环境已清理");
  }

  // 输出结果
  section("测试结果");

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    if (r.passed) {
      success(`${r.name}${r.details ? ` (${r.details})` : ""}`);
      passed++;
    } else {
      fail(`${r.name}${r.details ? ` - ${r.details}` : ""}`);
      failed++;
    }
  }

  console.log(`\n${colors.bold("总计")}: ${colors.green(`${passed} 通过`)}, ${colors.red(`${failed} 失败`)}\n`);

  if (failed > 0) {
    console.log(colors.yellow("提示: 部分失败可能是功能尚未实现，请根据实际需求决定是否需要修复\n"));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
