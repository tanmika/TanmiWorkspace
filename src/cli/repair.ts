#!/usr/bin/env node
/**
 * tanmi-workspace repair 命令
 * 单个工作区修复工具：诊断问题、自动修复、交互式修复
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import { homedir } from "os";
import { join, dirname, basename, resolve } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

// ES module 兼容
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// 配置
// ============================================================================

const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
const HOME = homedir();
const FOLDER_NAME = IS_DEV ? ".tanmi-workspace-dev" : ".tanmi-workspace";
const GLOBAL_DIR = join(HOME, FOLDER_NAME);
const INDEX_PATH = join(GLOBAL_DIR, "index.json");

// 当前存储版本
const STORAGE_VERSION = "5.0";

// ============================================================================
// 颜色输出
// ============================================================================

const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function info(msg: string) {
  console.log(`${colors.blue("ℹ")} ${msg}`);
}

function success(msg: string) {
  console.log(`${colors.green("✓")} ${msg}`);
}

function warn(msg: string) {
  console.log(`${colors.yellow("⚠")} ${msg}`);
}

function error(msg: string) {
  console.log(`${colors.red("✗")} ${msg}`);
}

function hint(msg: string) {
  console.log(`  ${colors.gray(msg)}`);
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
  dirName?: string;
}

interface IndexFile {
  version: string;
  workspaces: WorkspaceEntry[];
}

interface WorkspaceConfig {
  id: string;
  name: string;
  dirName?: string;
  status: string;
  rootNodeId: string;
}

interface NodeGraph {
  version: string;
  currentFocus?: string;
  nodes: Record<string, NodeMeta>;
}

interface NodeMeta {
  id: string;
  dirName?: string;
  status: string;
  children?: string[];
  parentId?: string | null;
}

// 问题严重程度
type IssueSeverity = "error" | "warning" | "info";

// 问题定义
interface Issue {
  id: string;
  severity: IssueSeverity;
  message: string;
  detail?: string;
  autoFix?: () => Promise<boolean>;           // 自动修复函数
  interactiveFix?: (rl: Interface) => Promise<boolean>;  // 交互式修复函数
}

// readline 接口类型
type Interface = ReturnType<typeof createInterface>;

// ============================================================================
// 工具函数
// ============================================================================

function readIndex(): IndexFile | null {
  if (!existsSync(INDEX_PATH)) return null;
  try {
    return JSON.parse(readFileSync(INDEX_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function writeIndex(index: IndexFile): void {
  mkdirSync(dirname(INDEX_PATH), { recursive: true });
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function extractShortId(id: string): string {
  const match = id.match(/^(?:ws-|node-|memo-)?([a-z0-9]+)-([a-z0-9]+)$/);
  return match ? match[1] : id.slice(-8);
}

// 创建备份
function createBackup(filePath: string): string | null {
  if (!existsSync(filePath)) return null;

  const dir = dirname(filePath);
  const name = basename(filePath, ".json");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupName = `${name}.backup.${timestamp}.json`;
  const backupPath = join(dir, backupName);

  try {
    const content = readFileSync(filePath, "utf-8");
    writeFileSync(backupPath, content);
    return backupName;
  } catch {
    return null;
  }
}

// 交互式输入
async function prompt(rl: Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// 交互式确认
async function confirm(rl: Interface, question: string): Promise<boolean> {
  const answer = await prompt(rl, `${question} (y/N): `);
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

// ============================================================================
// 工作区定位
// ============================================================================

interface WorkspaceLocation {
  projectRoot: string;
  wsDir: string;           // .tanmi-workspace 目录
  wsDirName: string;       // 工作区目录名
  wsPath: string;          // 完整工作区路径
  indexEntry?: WorkspaceEntry;  // index.json 中的条目（如果存在）
}

/**
 * 解析工作区路径，支持多种输入格式：
 * 1. 完整工作区路径: /project/.tanmi-workspace/工作区名_xxx/
 * 2. 项目目录 + 工作区目录名: /project 工作区名_xxx
 * 3. 工作区 ID: ws-xxx-yyy
 */
function resolveWorkspacePath(input: string): WorkspaceLocation | null {
  const resolvedPath = resolve(input);

  // 情况 1: 直接是工作区目录
  if (existsSync(resolvedPath)) {
    const stat = statSync(resolvedPath);
    if (stat.isDirectory()) {
      // 检查是否包含 workspace.json
      const configPath = join(resolvedPath, "workspace.json");
      if (existsSync(configPath)) {
        const wsPath = resolvedPath;
        const wsDirName = basename(wsPath);
        const wsDir = dirname(wsPath);
        const projectRoot = dirname(wsDir);

        // 尝试从 index 中找对应条目
        const index = readIndex();
        // 先尝试通过 dirName 或目录名匹配
        let indexEntry = index?.workspaces.find(w =>
          w.dirName === wsDirName || w.id === wsDirName
        );
        // 如果没找到，读取 workspace.json 中的 id 再尝试匹配
        if (!indexEntry) {
          const config = readJson<WorkspaceConfig>(configPath);
          if (config?.id) {
            indexEntry = index?.workspaces.find(w => w.id === config.id);
          }
        }

        return { projectRoot, wsDir, wsDirName, wsPath, indexEntry };
      }

      // 检查是否是项目目录（包含 .tanmi-workspace）
      const twDir = join(resolvedPath, FOLDER_NAME);
      if (existsSync(twDir)) {
        // 需要用户指定具体工作区
        error(`请指定具体的工作区目录`);
        hint(`示例: tanmi-workspace repair "${twDir}/工作区名_xxx"`);

        // 列出可用工作区
        try {
          const entries = readdirSync(twDir, { withFileTypes: true });
          const workspaces = entries.filter(e =>
            e.isDirectory() && existsSync(join(twDir, e.name, "workspace.json"))
          );
          if (workspaces.length > 0) {
            console.log(`\n可用工作区:`);
            workspaces.forEach(w => {
              console.log(`  - ${w.name}`);
            });
          }
        } catch { /* ignore */ }

        return null;
      }
    }
  }

  // 情况 2: 通过工作区 ID 查找
  if (input.startsWith("ws-")) {
    const index = readIndex();
    if (index) {
      const entry = index.workspaces.find(w => w.id === input);
      if (entry && entry.dirName) {
        const wsDir = join(entry.projectRoot, FOLDER_NAME);
        const wsPath = join(wsDir, entry.dirName);
        return {
          projectRoot: entry.projectRoot,
          wsDir,
          wsDirName: entry.dirName,
          wsPath,
          indexEntry: entry,
        };
      }
    }
  }

  error(`无法定位工作区: ${input}`);
  hint(`请提供工作区目录的完整路径`);
  return null;
}

// ============================================================================
// 问题诊断
// ============================================================================

async function diagnoseWorkspace(location: WorkspaceLocation): Promise<Issue[]> {
  const issues: Issue[] = [];
  const { projectRoot, wsDir, wsDirName, wsPath, indexEntry } = location;

  // ========== 1. Index 相关问题 ==========

  const index = readIndex();

  // 1.1 工作区未在 index 中注册
  if (!indexEntry) {
    const config = readJson<WorkspaceConfig>(join(wsPath, "workspace.json"));
    if (config) {
      issues.push({
        id: "not-in-index",
        severity: "warning",
        message: "工作区未在全局索引中注册",
        detail: "工作区可能是手动创建或从其他地方复制的",
        autoFix: async () => {
          if (!index) return false;
          const newEntry: WorkspaceEntry = {
            id: config.id,
            name: config.name,
            dirName: wsDirName,
            projectRoot,
            status: config.status || "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          index.workspaces.push(newEntry);
          writeIndex(index);
          return true;
        },
      });
    }
  } else {
    // 1.2 index 中 dirName 缺失
    if (!indexEntry.dirName) {
      issues.push({
        id: "index-missing-dirname",
        severity: "error",
        message: "索引条目缺少 dirName 字段",
        autoFix: async () => {
          if (!index) return false;
          const entry = index.workspaces.find(w => w.id === indexEntry.id);
          if (entry) {
            entry.dirName = wsDirName;
            writeIndex(index);
            return true;
          }
          return false;
        },
      });
    }

    // 1.3 index 中 dirName 与实际不匹配
    if (indexEntry.dirName && indexEntry.dirName !== wsDirName) {
      issues.push({
        id: "index-dirname-mismatch",
        severity: "error",
        message: `索引中的 dirName 与实际目录名不匹配`,
        detail: `索引: ${indexEntry.dirName}, 实际: ${wsDirName}`,
        autoFix: async () => {
          if (!index) return false;
          const entry = index.workspaces.find(w => w.id === indexEntry.id);
          if (entry) {
            entry.dirName = wsDirName;
            writeIndex(index);
            return true;
          }
          return false;
        },
      });
    }

    // 1.4 index 中 projectRoot 与实际不匹配
    if (indexEntry.projectRoot !== projectRoot) {
      issues.push({
        id: "index-projectroot-mismatch",
        severity: "error",
        message: `索引中的 projectRoot 与实际路径不匹配`,
        detail: `索引: ${indexEntry.projectRoot}, 实际: ${projectRoot}`,
        autoFix: async () => {
          if (!index) return false;
          const entry = index.workspaces.find(w => w.id === indexEntry.id);
          if (entry) {
            entry.projectRoot = projectRoot;
            writeIndex(index);
            return true;
          }
          return false;
        },
      });
    }
  }

  // ========== 2. workspace.json 问题 ==========

  const configPath = join(wsPath, "workspace.json");

  if (!existsSync(configPath)) {
    issues.push({
      id: "missing-workspace-json",
      severity: "error",
      message: "workspace.json 文件缺失",
      interactiveFix: async (rl) => {
        console.log(`\n需要创建 workspace.json，请提供以下信息:`);
        const id = indexEntry?.id || await prompt(rl, "工作区 ID (如 ws-xxx-yyy): ");
        const name = indexEntry?.name || await prompt(rl, "工作区名称: ");

        if (!id || !name) {
          error("ID 和名称不能为空");
          return false;
        }

        const config: WorkspaceConfig = {
          id,
          name,
          dirName: wsDirName,
          status: "active",
          rootNodeId: "root",
        };
        writeJson(configPath, config);
        return true;
      },
    });
  } else {
    const config = readJson<WorkspaceConfig>(configPath);

    if (!config) {
      issues.push({
        id: "invalid-workspace-json",
        severity: "error",
        message: "workspace.json 格式无效 (JSON 解析失败)",
        detail: `文件路径: ${configPath}`,
        interactiveFix: async (rl) => {
          console.log(`\nworkspace.json 文件损坏，无法解析 JSON。`);
          console.log(`\n可选操作:`);
          console.log(`  1. 查看文件内容（前 10 行）`);
          console.log(`  2. 备份并重建 workspace.json`);
          console.log(`  3. 跳过`);

          const choice = await prompt(rl, "请选择 (1/2/3): ");

          if (choice === "1") {
            try {
              const content = readFileSync(configPath, "utf-8");
              const lines = content.split("\n").slice(0, 10);
              console.log(`\n--- 文件内容 (前 10 行) ---`);
              lines.forEach((line, i) => console.log(`${i + 1}: ${line}`));
              console.log(`--- 结束 ---\n`);
              console.log(`请手动编辑文件修复 JSON 格式错误后重新运行 repair`);
            } catch (e) {
              error(`读取文件失败: ${e instanceof Error ? e.message : e}`);
            }
            return false;
          }

          if (choice === "2") {
            // 备份损坏的文件
            const backupName = createBackup(configPath);
            if (backupName) {
              info(`已备份损坏文件: ${backupName}`);
            }

            // 从 index 获取信息
            const id = indexEntry?.id || await prompt(rl, "工作区 ID (如 ws-xxx-yyy): ");
            const name = indexEntry?.name || await prompt(rl, "工作区名称: ");

            if (!id || !name) {
              error("ID 和名称不能为空");
              return false;
            }

            const newConfig: WorkspaceConfig = {
              id,
              name,
              dirName: wsDirName,
              status: "active",
              rootNodeId: "root",
            };
            writeJson(configPath, newConfig);
            success(`已重建 workspace.json`);
            return true;
          }

          return false;
        },
      });
    } else {
      // 2.1 缺少 dirName
      if (!config.dirName) {
        issues.push({
          id: "config-missing-dirname",
          severity: "warning",
          message: "workspace.json 缺少 dirName 字段",
          autoFix: async () => {
            config.dirName = wsDirName;
            writeJson(configPath, config);
            return true;
          },
        });
      }

      // 2.2 dirName 不匹配
      if (config.dirName && config.dirName !== wsDirName) {
        issues.push({
          id: "config-dirname-mismatch",
          severity: "warning",
          message: "workspace.json 中的 dirName 与实际目录名不匹配",
          detail: `配置: ${config.dirName}, 实际: ${wsDirName}`,
          autoFix: async () => {
            config.dirName = wsDirName;
            writeJson(configPath, config);
            return true;
          },
        });
      }

      // 2.3 缺少必要字段
      if (!config.id) {
        issues.push({
          id: "config-missing-id",
          severity: "error",
          message: "workspace.json 缺少 id 字段",
          interactiveFix: async (rl) => {
            const id = await prompt(rl, "请输入工作区 ID (如 ws-xxx-yyy): ");
            if (!id) return false;
            config.id = id;
            writeJson(configPath, config);
            return true;
          },
        });
      }

      if (!config.name) {
        issues.push({
          id: "config-missing-name",
          severity: "error",
          message: "workspace.json 缺少 name 字段",
          interactiveFix: async (rl) => {
            const name = await prompt(rl, "请输入工作区名称: ");
            if (!name) return false;
            config.name = name;
            writeJson(configPath, config);
            return true;
          },
        });
      }
    }
  }

  // ========== 3. graph.json 问题 ==========

  const graphPath = join(wsPath, "graph.json");

  if (!existsSync(graphPath)) {
    issues.push({
      id: "missing-graph-json",
      severity: "error",
      message: "graph.json 文件缺失",
      autoFix: async () => {
        // 创建基本的 graph.json
        const graph: NodeGraph = {
          version: STORAGE_VERSION,
          currentFocus: "root",
          nodes: {
            root: {
              id: "root",
              dirName: "root",
              status: "planning",
              parentId: null,
              children: [],
            },
          },
        };
        writeJson(graphPath, graph);

        // 创建 root 节点目录
        const rootDir = join(wsPath, "nodes", "root");
        mkdirSync(rootDir, { recursive: true });
        writeFileSync(join(rootDir, "Info.md"), `---
id: root
type: planning
title: 根节点
status: planning
---

## 需求

（待填写）
`);
        return true;
      },
    });
  } else {
    const graph = readJson<NodeGraph>(graphPath);

    if (!graph) {
      issues.push({
        id: "invalid-graph-json",
        severity: "error",
        message: "graph.json 格式无效 (JSON 解析失败)",
        detail: `文件路径: ${graphPath}`,
        interactiveFix: async (rl) => {
          console.log(`\ngraph.json 文件损坏，无法解析 JSON。`);
          console.log(colors.yellow(`\n⚠️  警告：重建 graph.json 会丢失节点关系数据！`));
          console.log(`\n可选操作:`);
          console.log(`  1. 查看文件内容（前 10 行）`);
          console.log(`  2. 备份并重建 graph.json（节点目录仍保留）`);
          console.log(`  3. 跳过`);

          const choice = await prompt(rl, "请选择 (1/2/3): ");

          if (choice === "1") {
            try {
              const content = readFileSync(graphPath, "utf-8");
              const lines = content.split("\n").slice(0, 10);
              console.log(`\n--- 文件内容 (前 10 行) ---`);
              lines.forEach((line, i) => console.log(`${i + 1}: ${line}`));
              console.log(`--- 结束 ---\n`);
              console.log(`请手动编辑文件修复 JSON 格式错误后重新运行 repair`);
            } catch (e) {
              error(`读取文件失败: ${e instanceof Error ? e.message : e}`);
            }
            return false;
          }

          if (choice === "2") {
            const confirmed = await confirm(rl, "确认重建 graph.json？节点关系数据将丢失，但节点目录文件会保留");
            if (!confirmed) return false;

            // 备份损坏的文件
            const backupName = createBackup(graphPath);
            if (backupName) {
              info(`已备份损坏文件: ${backupName}`);
            }

            // 尝试从节点目录重建
            const nodesDir = join(wsPath, "nodes");
            const newGraph: NodeGraph = {
              version: STORAGE_VERSION,
              currentFocus: "root",
              nodes: {
                root: {
                  id: "root",
                  dirName: "root",
                  status: "planning",
                  parentId: null,
                  children: [],
                },
              },
            };

            // 扫描节点目录，添加为 root 的子节点
            if (existsSync(nodesDir)) {
              try {
                const entries = readdirSync(nodesDir, { withFileTypes: true });
                for (const entry of entries) {
                  if (!entry.isDirectory() || entry.name === "root") continue;
                  const nodeId = `node-recovered-${entry.name}`;
                  newGraph.nodes[nodeId] = {
                    id: nodeId,
                    dirName: entry.name,
                    status: "planning",
                    parentId: "root",
                    children: [],
                  };
                  newGraph.nodes.root.children!.push(nodeId);
                }
              } catch { /* ignore */ }
            }

            writeJson(graphPath, newGraph);
            success(`已重建 graph.json，恢复了 ${Object.keys(newGraph.nodes).length - 1} 个节点目录`);
            return true;
          }

          return false;
        },
      });
    } else {
      // 3.1 版本检查
      if (graph.version && compareVersion(graph.version, STORAGE_VERSION) > 0) {
        issues.push({
          id: "graph-version-too-high",
          severity: "error",
          message: `graph.json 版本过高`,
          detail: `文件版本: ${graph.version}, 当前支持: ${STORAGE_VERSION}`,
          interactiveFix: async (rl) => {
            console.log(`\ngraph.json 版本 (${graph.version}) 高于当前支持的版本 (${STORAGE_VERSION})。`);
            console.log(`\n这通常意味着此工作区是用更新版本的 TanmiWorkspace 创建的。`);
            console.log(`\n${colors.yellow("建议")}: 升级 TanmiWorkspace 到最新版本`);
            console.log(`  npm install -g tanmi-workspace@latest`);
            console.log(`\n可选操作:`);
            console.log(`  1. 强制降级版本号（可能丢失新版本功能）`);
            console.log(`  2. 跳过`);

            const choice = await prompt(rl, "请选择 (1/2): ");

            if (choice === "1") {
              const confirmed = await confirm(rl, `确认将版本从 ${graph.version} 降级到 ${STORAGE_VERSION}？`);
              if (!confirmed) return false;

              // 备份
              const backupName = createBackup(graphPath);
              if (backupName) {
                info(`已备份: ${backupName}`);
              }

              graph.version = STORAGE_VERSION;
              writeJson(graphPath, graph);
              success(`已将版本降级到 ${STORAGE_VERSION}`);
              return true;
            }

            return false;
          },
        });
      }

      // 3.2 检查节点目录
      const nodesDir = join(wsPath, "nodes");
      if (existsSync(nodesDir) && graph.nodes) {
        for (const [nodeId, nodeMeta] of Object.entries(graph.nodes)) {
          const nodeDirName = nodeMeta.dirName || nodeId;
          const nodePath = join(nodesDir, nodeDirName);

          if (!existsSync(nodePath)) {
            // 尝试通过 shortId 查找
            const foundDir = findDirByShortId(nodesDir, nodeId);

            if (foundDir) {
              const capturedNodeId = nodeId;
              const capturedFoundDir = foundDir;
              issues.push({
                id: `node-dirname-mismatch-${nodeId}`,
                severity: "warning",
                message: `节点 ${nodeId} 的目录名不匹配`,
                detail: `配置: ${nodeDirName}, 找到: ${foundDir}`,
                autoFix: async () => {
                  const g = readJson<NodeGraph>(graphPath);
                  if (g && g.nodes[capturedNodeId]) {
                    g.nodes[capturedNodeId].dirName = capturedFoundDir;
                    writeJson(graphPath, g);
                    return true;
                  }
                  return false;
                },
              });
            } else {
              issues.push({
                id: `node-dir-missing-${nodeId}`,
                severity: "warning",
                message: `节点 ${nodeId} 的目录不存在`,
                detail: `期望目录: ${nodeDirName}`,
                interactiveFix: async (rl) => {
                  console.log(`\n节点目录不存在: ${nodeDirName}`);
                  console.log(`可选操作:`);
                  console.log(`  1. 输入正确的目录名`);
                  console.log(`  2. 跳过`);

                  const choice = await prompt(rl, "请选择 (1/2): ");

                  if (choice === "1") {
                    // 列出可用目录
                    try {
                      const entries = readdirSync(nodesDir, { withFileTypes: true });
                      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
                      if (dirs.length > 0) {
                        console.log(`\n可用目录:`);
                        dirs.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
                      }
                    } catch { /* ignore */ }

                    const newDir = await prompt(rl, "请输入正确的目录名: ");
                    if (newDir && existsSync(join(nodesDir, newDir))) {
                      const g = readJson<NodeGraph>(graphPath);
                      if (g && g.nodes[nodeId]) {
                        g.nodes[nodeId].dirName = newDir;
                        writeJson(graphPath, g);
                        return true;
                      }
                    } else {
                      error("目录不存在");
                    }
                  }
                  return false;
                },
              });
            }
          }
        }
      }
    }
  }

  return issues;
}

// 通过 shortId 查找目录
function findDirByShortId(parentDir: string, id: string): string | null {
  const shortId = extractShortId(id);

  try {
    const items = readdirSync(parentDir, { withFileTypes: true });

    // 优先匹配 _shortId 后缀
    for (const item of items) {
      if (!item.isDirectory()) continue;
      if (item.name.endsWith(`_${shortId}`)) {
        return item.name;
      }
    }

    // 兜底：包含 shortId
    for (const item of items) {
      if (!item.isDirectory()) continue;
      if (item.name.includes(shortId)) {
        return item.name;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

// 版本比较
function compareVersion(a: string, b: string): number {
  const [aMajor, aMinor = 0] = a.split(".").map(Number);
  const [bMajor, bMinor = 0] = b.split(".").map(Number);
  if (aMajor !== bMajor) return aMajor - bMajor;
  return aMinor - bMinor;
}

// ============================================================================
// 修复执行
// ============================================================================

async function runRepair(
  issues: Issue[],
  interactive: boolean,
  dryRun: boolean
): Promise<{ fixed: number; skipped: number; failed: number }> {
  const result = { fixed: 0, skipped: 0, failed: 0 };

  // 分类问题
  const autoFixable = issues.filter(i => i.autoFix);
  const interactiveFixable = issues.filter(i => !i.autoFix && i.interactiveFix);
  const unfixable = issues.filter(i => !i.autoFix && !i.interactiveFix);

  // 创建 readline 接口（如果需要交互）
  let rl: Interface | null = null;
  if (interactive && interactiveFixable.length > 0) {
    rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  try {
    // 1. 自动修复
    if (autoFixable.length > 0) {
      console.log(`\n${colors.bold("自动修复")} (${autoFixable.length} 个问题)\n`);

      for (const issue of autoFixable) {
        console.log(`${colors.yellow("→")} ${issue.message}`);
        if (issue.detail) hint(issue.detail);

        if (dryRun) {
          info("(dry-run) 跳过");
          result.skipped++;
          continue;
        }

        try {
          const ok = await issue.autoFix!();
          if (ok) {
            success("已修复");
            result.fixed++;
          } else {
            error("修复失败");
            result.failed++;
          }
        } catch (e) {
          error(`修复出错: ${e instanceof Error ? e.message : e}`);
          result.failed++;
        }
      }
    }

    // 2. 交互式修复
    if (interactiveFixable.length > 0) {
      if (interactive && rl) {
        console.log(`\n${colors.bold("交互式修复")} (${interactiveFixable.length} 个问题)\n`);

        for (const issue of interactiveFixable) {
          console.log(`\n${colors.yellow("?")} ${issue.message}`);
          if (issue.detail) hint(issue.detail);

          if (dryRun) {
            info("(dry-run) 跳过");
            result.skipped++;
            continue;
          }

          try {
            const ok = await issue.interactiveFix!(rl);
            if (ok) {
              success("已修复");
              result.fixed++;
            } else {
              warn("已跳过");
              result.skipped++;
            }
          } catch (e) {
            error(`修复出错: ${e instanceof Error ? e.message : e}`);
            result.failed++;
          }
        }
      } else {
        console.log(`\n${colors.bold("需交互式修复")} (${interactiveFixable.length} 个问题)\n`);
        for (const issue of interactiveFixable) {
          console.log(`${colors.yellow("?")} ${issue.message}`);
          if (issue.detail) hint(issue.detail);
          result.skipped++;
        }
        hint("\n使用 -i 参数进入交互模式修复这些问题");
      }
    }

    // 3. 无法自动修复的问题
    if (unfixable.length > 0) {
      console.log(`\n${colors.bold("需手动修复")} (${unfixable.length} 个问题)\n`);
      for (const issue of unfixable) {
        console.log(`${colors.red("!")} ${issue.message}`);
        if (issue.detail) hint(issue.detail);
      }
    }
  } finally {
    if (rl) {
      rl.close();
    }
  }

  return result;
}

// ============================================================================
// 主函数
// ============================================================================

function showHelp(): void {
  console.log(`
${colors.bold("TanmiWorkspace 工作区修复工具")}

${colors.blue("用法:")}
  tanmi-workspace repair <工作区路径>           诊断指定工作区
  tanmi-workspace repair --fix <工作区路径>     修复指定工作区
  tanmi-workspace repair --fix -i <工作区路径>  交互式修复

${colors.blue("参数:")}
  <工作区路径>  工作区目录的完整路径
                例如: /project/.tanmi-workspace/工作区名_xxx/
                或者: ws-xxx-yyy (通过 ID 查找)

${colors.blue("选项:")}
  --fix, -f         执行修复（默认只诊断）
  --interactive, -i 交互模式，逐个处理需要用户输入的问题
  --dry-run         模拟运行，不实际修改文件
  --no-backup       不创建备份
  --help, -h        显示帮助

${colors.blue("示例:")}
  tanmi-workspace repair /project/.tanmi-workspace/MyWork_abc123/
  tanmi-workspace repair --fix /project/.tanmi-workspace/MyWork_abc123/
  tanmi-workspace repair --fix -i ws-abc123-xyz789
`);
}

export default async function main(): Promise<void> {
  const args = process.argv.slice(3); // 跳过 node, script, "repair"

  // 解析参数
  const showHelpFlag = args.includes("--help") || args.includes("-h");
  const doFix = args.includes("--fix") || args.includes("-f");
  const interactive = args.includes("--interactive") || args.includes("-i");
  const dryRun = args.includes("--dry-run");
  const noBackup = args.includes("--no-backup");

  // 过滤掉选项，获取路径参数
  const pathArg = args.find(a => !a.startsWith("-"));

  if (showHelpFlag || !pathArg) {
    showHelp();
    return;
  }

  console.log(`\n${colors.bold("TanmiWorkspace 工作区修复工具")}\n`);

  // 定位工作区
  const location = resolveWorkspacePath(pathArg);
  if (!location) {
    process.exit(1);
  }

  info(`工作区路径: ${location.wsPath}`);

  // 检查工作区目录是否存在
  if (!existsSync(location.wsPath)) {
    error(`工作区目录不存在: ${location.wsPath}`);
    hint("请确认路径是否正确");
    process.exit(1);
  }

  // 诊断
  info("正在诊断问题...\n");
  const issues = await diagnoseWorkspace(location);

  if (issues.length === 0) {
    success("未发现任何问题！工作区状态正常。");
    return;
  }

  // 显示问题统计
  const errorCount = issues.filter(i => i.severity === "error").length;
  const warnCount = issues.filter(i => i.severity === "warning").length;
  const infoCount = issues.filter(i => i.severity === "info").length;

  console.log(`发现 ${colors.bold(String(issues.length))} 个问题:`);
  if (errorCount > 0) console.log(`  ${colors.red(`${errorCount} 个错误`)}`);
  if (warnCount > 0) console.log(`  ${colors.yellow(`${warnCount} 个警告`)}`);
  if (infoCount > 0) console.log(`  ${colors.gray(`${infoCount} 个提示`)}`);

  const autoCount = issues.filter(i => i.autoFix).length;
  const interactiveCount = issues.filter(i => !i.autoFix && i.interactiveFix).length;
  const manualCount = issues.filter(i => !i.autoFix && !i.interactiveFix).length;

  console.log(`\n修复方式:`);
  if (autoCount > 0) console.log(`  ${colors.green(`${autoCount} 个可自动修复`)}`);
  if (interactiveCount > 0) console.log(`  ${colors.yellow(`${interactiveCount} 个需交互修复`)}`);
  if (manualCount > 0) console.log(`  ${colors.red(`${manualCount} 个需手动修复`)}`);

  if (!doFix) {
    console.log(`\n${colors.gray("提示: 使用 --fix 参数执行修复")}`);
    return;
  }

  // 创建备份
  if (!noBackup && !dryRun) {
    const configPath = join(location.wsPath, "workspace.json");
    const graphPath = join(location.wsPath, "graph.json");

    if (existsSync(configPath)) {
      const backup = createBackup(configPath);
      if (backup) info(`已备份 workspace.json: ${backup}`);
    }
    if (existsSync(graphPath)) {
      const backup = createBackup(graphPath);
      if (backup) info(`已备份 graph.json: ${backup}`);
    }
  }

  // 执行修复
  const result = await runRepair(issues, interactive, dryRun);

  // 显示结果
  console.log(`\n${colors.bold("修复结果:")}`);
  if (result.fixed > 0) console.log(`  ${colors.green(`${result.fixed} 个已修复`)}`);
  if (result.skipped > 0) console.log(`  ${colors.gray(`${result.skipped} 个已跳过`)}`);
  if (result.failed > 0) console.log(`  ${colors.red(`${result.failed} 个失败`)}`);

  if (result.fixed > 0) {
    console.log(`\n${colors.green("提示:")} 修复完成，请重新启动 TanmiWorkspace 服务验证`);
  }
}
