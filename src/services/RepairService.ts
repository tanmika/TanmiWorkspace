// src/services/RepairService.ts
// 工作区修复服务 - 诊断和自动修复工作区问题

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type {
  RepairIssue,
  DiagnoseResult,
  RepairResult,
  DiagnoseParams,
  RepairParams,
  FixType,
} from "../types/repair.js";
import { TanmiError } from "../types/errors.js";
import { extractShortId } from "../utils/id.js";

// 当前存储版本
const STORAGE_VERSION = "5.0";

// 内部问题定义（包含修复函数）
interface InternalIssue extends RepairIssue {
  autoFix?: () => Promise<boolean>;
}

/**
 * 工作区修复服务
 */
export class RepairService {
  constructor(
    private json: JsonStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 诊断工作区问题
   */
  async diagnose(params: DiagnoseParams): Promise<DiagnoseResult> {
    const { workspaceId } = params;

    // 1. 获取工作区在 index 中的信息
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);

    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不在索引中`);
    }

    const projectRoot = wsEntry.projectRoot;
    const wsDirName = wsEntry.dirName || wsEntry.id;
    const wsPath = this.fs.getWorkspacePath(projectRoot, wsDirName);

    // 2. 诊断问题
    const issues = await this.diagnoseWorkspace(workspaceId, projectRoot, wsDirName, wsPath, wsEntry);

    // 3. 统计
    const summary = {
      total: issues.length,
      errors: issues.filter(i => i.severity === "error").length,
      warnings: issues.filter(i => i.severity === "warning").length,
      autoFixable: issues.filter(i => i.fixType === "auto").length,
      interactiveFixable: issues.filter(i => i.fixType === "interactive").length,
      manualFixable: issues.filter(i => i.fixType === "manual").length,
    };

    return {
      workspaceId,
      workspacePath: wsPath,
      issues: issues.map(i => ({
        id: i.id,
        severity: i.severity,
        message: i.message,
        detail: i.detail,
        fixType: i.fixType,
      })),
      summary,
    };
  }

  /**
   * 修复工作区问题（仅自动修复）
   */
  async repair(params: RepairParams): Promise<RepairResult> {
    const { workspaceId, issueIds } = params;

    // 1. 先诊断获取问题列表
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);

    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不在索引中`);
    }

    const projectRoot = wsEntry.projectRoot;
    const wsDirName = wsEntry.dirName || wsEntry.id;
    const wsPath = this.fs.getWorkspacePath(projectRoot, wsDirName);

    // 2. 获取带修复函数的问题列表
    const issues = await this.diagnoseWorkspace(workspaceId, projectRoot, wsDirName, wsPath, wsEntry);

    // 3. 筛选要修复的问题
    let toFix = issues.filter(i => i.fixType === "auto" && i.autoFix);
    if (issueIds && issueIds.length > 0) {
      toFix = toFix.filter(i => issueIds.includes(i.id));
    }

    // 4. 执行修复
    const details: RepairResult["details"] = [];
    let fixed = 0;
    let failed = 0;

    for (const issue of toFix) {
      try {
        const success = await issue.autoFix!();
        if (success) {
          fixed++;
          details.push({ issueId: issue.id, success: true });
        } else {
          failed++;
          details.push({ issueId: issue.id, success: false, message: "修复返回失败" });
        }
      } catch (e) {
        failed++;
        details.push({
          issueId: issue.id,
          success: false,
          message: e instanceof Error ? e.message : "未知错误",
        });
      }
    }

    // 5. 统计跳过的（非自动修复的）
    const skipped = issues.length - toFix.length;

    return {
      workspaceId,
      fixed,
      failed,
      skipped,
      details,
    };
  }

  /**
   * 诊断工作区（内部方法，返回带修复函数的问题）
   */
  private async diagnoseWorkspace(
    workspaceId: string,
    projectRoot: string,
    wsDirName: string,
    wsPath: string,
    indexEntry: { id: string; dirName?: string; projectRoot: string; status: string }
  ): Promise<InternalIssue[]> {
    const issues: InternalIssue[] = [];

    // ========== 1. 工作区目录检查（考虑归档状态）==========
    const isArchived = indexEntry.status === "archived";
    const normalPath = this.fs.getWorkspacePath(projectRoot, wsDirName);
    const archivePath = this.fs.getArchivePath(projectRoot, wsDirName);
    const expectedPath = isArchived ? archivePath : normalPath;
    const wrongPath = isArchived ? normalPath : archivePath;

    const expectedExists = await this.fs.exists(expectedPath);
    const wrongExists = await this.fs.exists(wrongPath);

    // 1.1 检查归档位置一致性
    if (wrongExists && !expectedExists) {
      // 工作区存在但在错误的位置
      issues.push({
        id: "archive-location-mismatch",
        severity: "error",
        message: isArchived
          ? "归档工作区仍在普通路径，需迁移到 archive/ 目录"
          : "活跃工作区在 archive/ 目录，需迁移到普通路径",
        detail: `当前位置: ${wrongPath}\n期望位置: ${expectedPath}`,
        fixType: "auto",
        autoFix: async () => {
          try {
            // 确保目标目录的父目录存在
            const targetDir = isArchived
              ? this.fs.getArchivePath(projectRoot, "").replace(/[/\\]$/, "")
              : this.fs.getWorkspacePath(projectRoot, "").replace(/[/\\]$/, "");
            await this.fs.ensureDir(targetDir);

            // 移动工作区目录
            await this.fs.moveDir(wrongPath, expectedPath);
            return true;
          } catch (err) {
            console.error(`[RepairService] 迁移工作区失败:`, err);
            return false;
          }
        },
      });
      // 虽然位置错误，但工作区存在，继续诊断（使用实际存在的路径）
      // 后续诊断使用 wrongPath 因为那是实际存在的位置
    } else if (!expectedExists && !wrongExists) {
      issues.push({
        id: "ws-dir-missing",
        severity: "error",
        message: "工作区目录不存在",
        detail: `期望路径: ${expectedPath}`,
        fixType: "manual",
      });
      // 目录不存在，无法继续诊断
      return issues;
    }

    // 使用实际存在的路径进行后续诊断
    const actualWsPath = expectedExists ? expectedPath : wrongPath;

    // ========== 2. Index 相关问题 ==========

    // 2.1 index 中 dirName 缺失
    if (!indexEntry.dirName) {
      issues.push({
        id: "index-missing-dirname",
        severity: "error",
        message: "索引条目缺少 dirName 字段",
        fixType: "auto",
        autoFix: async () => {
          const idx = await this.json.readIndex();
          const entry = idx.workspaces.find(w => w.id === workspaceId);
          if (entry) {
            entry.dirName = wsDirName;
            await this.json.writeIndex(idx);
            return true;
          }
          return false;
        },
      });
    }

    // 2.2 index 中 dirName 与实际不匹配（尝试修复）
    if (indexEntry.dirName && indexEntry.dirName !== wsDirName) {
      // 检查实际目录是否存在
      const actualPath = this.fs.getWorkspacePath(projectRoot, indexEntry.dirName);
      const actualExists = await this.fs.exists(actualPath);

      if (!actualExists) {
        // 实际目录不存在，可能是 dirName 错误，尝试查找
        issues.push({
          id: "index-dirname-mismatch",
          severity: "error",
          message: "索引中的 dirName 与实际目录名不匹配",
          detail: `索引: ${indexEntry.dirName}, 实际: ${wsDirName}`,
          fixType: "auto",
          autoFix: async () => {
            const idx = await this.json.readIndex();
            const entry = idx.workspaces.find(w => w.id === workspaceId);
            if (entry) {
              entry.dirName = wsDirName;
              await this.json.writeIndex(idx);
              return true;
            }
            return false;
          },
        });
      }
    }

    // ========== 3. workspace.json 问题 ==========

    const configPath = this.fs.getWorkspaceConfigPath(projectRoot, wsDirName);
    const configExists = await this.fs.exists(configPath);

    if (!configExists) {
      issues.push({
        id: "missing-workspace-json",
        severity: "error",
        message: "workspace.json 文件缺失",
        fixType: "interactive", // 需要用户输入工作区名称
      });
    } else {
      try {
        const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);

        // 3.1 缺少 dirName
        if (!config.dirName) {
          issues.push({
            id: "config-missing-dirname",
            severity: "warning",
            message: "workspace.json 缺少 dirName 字段",
            fixType: "auto",
            autoFix: async () => {
              const cfg = await this.json.readWorkspaceConfig(projectRoot, wsDirName);
              cfg.dirName = wsDirName;
              await this.json.writeWorkspaceConfig(projectRoot, wsDirName, cfg);
              return true;
            },
          });
        }

        // 3.2 dirName 不匹配
        if (config.dirName && config.dirName !== wsDirName) {
          issues.push({
            id: "config-dirname-mismatch",
            severity: "warning",
            message: "workspace.json 中的 dirName 与实际目录名不匹配",
            detail: `配置: ${config.dirName}, 实际: ${wsDirName}`,
            fixType: "auto",
            autoFix: async () => {
              const cfg = await this.json.readWorkspaceConfig(projectRoot, wsDirName);
              cfg.dirName = wsDirName;
              await this.json.writeWorkspaceConfig(projectRoot, wsDirName, cfg);
              return true;
            },
          });
        }
      } catch {
        issues.push({
          id: "invalid-workspace-json",
          severity: "error",
          message: "workspace.json 格式无效 (JSON 解析失败)",
          fixType: "interactive", // 需要用户确认重建
        });
      }
    }

    // ========== 4. graph.json 问题 ==========

    const graphPath = this.fs.getGraphPath(projectRoot, wsDirName);
    const graphExists = await this.fs.exists(graphPath);

    if (!graphExists) {
      issues.push({
        id: "missing-graph-json",
        severity: "error",
        message: "graph.json 文件缺失",
        fixType: "auto",
        autoFix: async () => {
          // 创建基本的 graph.json
          const graph = {
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
          await this.fs.writeFile(graphPath, JSON.stringify(graph, null, 2));

          // 创建 root 节点目录
          const rootDir = this.fs.getNodePath(projectRoot, wsDirName, "root");
          await this.fs.ensureDir(rootDir);
          const infoPath = this.fs.getNodeInfoPath(projectRoot, wsDirName, "root");
          const infoContent = `---
id: root
type: planning
title: 根节点
status: planning
---

## 需求

（待填写）
`;
          await this.fs.writeFile(infoPath, infoContent);
          return true;
        },
      });
    } else {
      try {
        const graph = await this.json.readGraph(projectRoot, wsDirName);

        // 4.1 检查悬空的子节点引用
        if (graph.nodes) {
          for (const [nodeId, nodeMeta] of Object.entries(graph.nodes)) {
            const meta = nodeMeta as { children?: string[] };
            if (meta.children && Array.isArray(meta.children)) {
              for (const childId of meta.children) {
                if (!graph.nodes[childId]) {
                  const capturedNodeId = nodeId;
                  const capturedChildId = childId;
                  issues.push({
                    id: `dangling-child-${nodeId}-${childId}`,
                    severity: "warning",
                    message: `节点 ${nodeId} 引用了不存在的子节点 ${childId}`,
                    detail: `子节点 "${childId}" 不在 graph.nodes 中`,
                    fixType: "auto",
                    autoFix: async () => {
                      const g = await this.json.readGraph(projectRoot, wsDirName);
                      const node = g.nodes?.[capturedNodeId] as { children?: string[] } | undefined;
                      if (node?.children) {
                        node.children = node.children.filter(c => c !== capturedChildId);
                        await this.json.writeGraph(projectRoot, wsDirName, g);
                        return true;
                      }
                      return false;
                    },
                  });
                }
              }
            }
          }
        }

        // 4.2 检查孤立的父节点引用
        if (graph.nodes) {
          for (const [nodeId, nodeMeta] of Object.entries(graph.nodes)) {
            const meta = nodeMeta as { parentId?: string | null };
            if (meta.parentId && !graph.nodes[meta.parentId]) {
              issues.push({
                id: `orphan-parent-${nodeId}`,
                severity: "warning",
                message: `节点 ${nodeId} 的父节点 ${meta.parentId} 不存在`,
                detail: `父节点 "${meta.parentId}" 不在 graph.nodes 中`,
                fixType: "interactive", // 需要用户决定如何处理
              });
            }
          }
        }

        // 4.3 版本检查
        if (graph.version && this.compareVersion(graph.version, STORAGE_VERSION) > 0) {
          issues.push({
            id: "graph-version-too-high",
            severity: "error",
            message: `graph.json 版本过高`,
            detail: `文件版本: ${graph.version}, 当前支持: ${STORAGE_VERSION}`,
            fixType: "interactive", // 需要用户确认降级
          });
        }

        // 4.4 检查节点目录是否存在
        const nodesDir = this.fs.getNodesDir(projectRoot, wsDirName);
        if (await this.fs.exists(nodesDir) && graph.nodes) {
          for (const [nodeId, nodeMeta] of Object.entries(graph.nodes)) {
            const nodeDirName = (nodeMeta as { dirName?: string }).dirName || nodeId;
            const nodePath = this.fs.getNodePath(projectRoot, wsDirName, nodeDirName);

            if (!(await this.fs.exists(nodePath))) {
              // 尝试通过 shortId 查找
              const foundDir = await this.findDirByShortId(nodesDir, nodeId);

              if (foundDir) {
                const capturedNodeId = nodeId;
                const capturedFoundDir = foundDir;
                issues.push({
                  id: `node-dirname-mismatch-${nodeId}`,
                  severity: "warning",
                  message: `节点 ${nodeId} 的目录名不匹配`,
                  detail: `配置: ${nodeDirName}, 找到: ${foundDir}`,
                  fixType: "auto",
                  autoFix: async () => {
                    const g = await this.json.readGraph(projectRoot, wsDirName);
                    if (g.nodes && g.nodes[capturedNodeId]) {
                      (g.nodes[capturedNodeId] as { dirName?: string }).dirName = capturedFoundDir;
                      await this.json.writeGraph(projectRoot, wsDirName, g);
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
                  fixType: "interactive", // 需要用户指定正确目录
                });
              }
            }
          }
        }
      } catch {
        issues.push({
          id: "invalid-graph-json",
          severity: "error",
          message: "graph.json 格式无效 (JSON 解析失败)",
          fixType: "interactive", // 需要用户确认重建
        });
      }
    }

    return issues;
  }

  /**
   * 通过 shortId 查找目录
   * 只匹配标准格式 `名称_shortId`，避免误匹配
   */
  private async findDirByShortId(parentDir: string, id: string): Promise<string | null> {
    const shortId = extractShortId(id);

    try {
      const items = await this.fs.readdir(parentDir);

      // 匹配 _shortId 后缀（标准命名格式）
      for (const item of items) {
        if (item.endsWith(`_${shortId}`)) {
          return item;
        }
      }
      // 不再使用宽松的 includes 匹配，避免误匹配
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * 版本比较
   */
  private compareVersion(a: string, b: string): number {
    const [aMajor, aMinor = 0] = a.split(".").map(Number);
    const [bMajor, bMinor = 0] = b.split(".").map(Number);
    if (aMajor !== bMajor) return aMajor - bMajor;
    return aMinor - bMinor;
  }
}
