// src/services/HealthService.ts

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { WorkspaceEntry } from "../types/workspace.js";
import type { HealthReport, HealthIssue, WorkspaceHealthResult } from "../types/health.js";
import type { WorkspaceService } from "./WorkspaceService.js";

/**
 * 健康检测服务
 * 提供工作区健康状态检测功能
 */
export class HealthService {
  private static readonly DIAGNOSTIC_TOKEN = "HEALTH_CHECK_2025";
  private currentCodeVersion: string | null = null;
  private workspaceService?: WorkspaceService;

  constructor(
    private json: JsonStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 设置 WorkspaceService 依赖（用于警告标记管理）
   */
  setWorkspaceService(workspaceService: WorkspaceService): void {
    this.workspaceService = workspaceService;
  }

  /**
   * 获取当前代码版本
   */
  private getCurrentCodeVersion(): string {
    if (this.currentCodeVersion) return this.currentCodeVersion;
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const require = createRequire(import.meta.url);
      const pkg = require(join(__dirname, "..", "..", "package.json")) as { version: string };
      this.currentCodeVersion = pkg.version;
      return this.currentCodeVersion;
    } catch {
      return "0.0.0";
    }
  }

  /**
   * 获取诊断指南路径
   */
  getGuidePath(): string {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return join(__dirname, "..", "..", "plugin", "docs", "diagnostic-guide.md");
  }

  /**
   * 验证诊断令牌
   */
  validateToken(token: string): boolean {
    return token === HealthService.DIAGNOSTIC_TOKEN;
  }

  /**
   * 执行健康检测
   * @param workspaceId 可选，指定则只检测该工作区
   * @returns 健康报告
   */
  async checkHealth(workspaceId?: string): Promise<HealthReport> {
    const index = await this.json.readIndex();
    const issues: HealthIssue[] = [];
    const workspaceResults: WorkspaceHealthResult[] = [];

    // 确定检测范围
    const workspaces = workspaceId
      ? index.workspaces.filter(ws => ws.id === workspaceId)
      : index.workspaces.filter(ws => ws.status !== "error");

    // 并行检测所有工作区
    const results = await Promise.all(
      workspaces.map(ws => this.checkWorkspace(ws))
    );

    for (const result of results) {
      workspaceResults.push(result);
      issues.push(...result.issues);

      // 更新警告标记
      if (this.workspaceService) {
        if (result.status === "healthy") {
          // 检测通过，清除警告标记
          await this.workspaceService.clearWarningFlag(result.workspaceId);
        } else if (result.issues.length > 0) {
          // 检测到问题，设置警告标记
          await this.workspaceService.setWarningFlag(result.workspaceId, result.issues);
        }
      }
    }

    // 统计
    const healthyCount = workspaceResults.filter(r => r.status === "healthy").length;
    const warningCount = workspaceResults.filter(r => r.status === "warning").length;
    const errorCount = workspaceResults.filter(r => r.status === "error").length;

    // 确定整体状态
    let status: HealthReport["status"] = "healthy";
    if (errorCount > 0) {
      status = "error";
    } else if (warningCount > 0) {
      status = "warning";
    }

    return {
      status,
      checkedAt: new Date().toISOString(),
      codeVersion: this.getCurrentCodeVersion(),
      issues,
      summary: {
        totalWorkspaces: workspaceResults.length,
        healthyWorkspaces: healthyCount,
        warningWorkspaces: warningCount,
        errorWorkspaces: errorCount,
      },
    };
  }

  /**
   * 检测单个工作区
   */
  private async checkWorkspace(entry: WorkspaceEntry): Promise<WorkspaceHealthResult> {
    const issues: HealthIssue[] = [];
    const { id, name, dirName, projectRoot, status } = entry;
    const wsDirName = dirName || id;

    // 跳过 error 状态的工作区
    if (status === "error") {
      return {
        workspaceId: id,
        workspaceName: name,
        status: "error",
        issues: [{
          type: "dir_missing",
          severity: "error",
          target: id,
          message: entry.errorInfo?.message || "工作区已标记为错误状态",
          suggestion: "检查错误详情并尝试修复或删除",
        }],
      };
    }

    const isArchived = status === "archived";

    // 1. 目录存在检测
    const workspacePath = isArchived
      ? this.fs.getArchivePath(projectRoot, wsDirName)
      : this.fs.getWorkspacePath(projectRoot, wsDirName);

    if (!(await this.fs.exists(workspacePath))) {
      issues.push({
        type: "dir_missing",
        severity: "error",
        target: id,
        message: `工作区目录不存在: ${workspacePath}`,
        suggestion: "从备份恢复或删除该工作区",
      });
      return {
        workspaceId: id,
        workspaceName: name,
        status: "error",
        issues,
      };
    }

    // 2. 配置文件检测
    const configPath = isArchived
      ? `${this.fs.getArchivePath(projectRoot, wsDirName)}/workspace.json`
      : this.fs.getWorkspaceConfigPath(projectRoot, wsDirName);

    if (!(await this.fs.exists(configPath))) {
      issues.push({
        type: "config_corrupt",
        severity: "error",
        target: id,
        message: "配置文件不存在: workspace.json",
        suggestion: "从备份恢复配置文件",
      });
    } else {
      try {
        const content = await this.fs.readFile(configPath);
        JSON.parse(content);
      } catch {
        issues.push({
          type: "config_corrupt",
          severity: "error",
          target: id,
          message: "配置文件 JSON 格式无效",
          suggestion: "从备份恢复或手动修复配置文件",
        });
      }
    }

    // 3. 图文件检测
    const graphPath = isArchived
      ? this.fs.getGraphPathWithArchive(projectRoot, wsDirName, true)
      : this.fs.getGraphPath(projectRoot, wsDirName);

    if (!(await this.fs.exists(graphPath))) {
      issues.push({
        type: "graph_corrupt",
        severity: "error",
        target: id,
        message: "图文件不存在: graph.json",
        suggestion: "从备份恢复图文件",
      });
    } else {
      try {
        const content = await this.fs.readFile(graphPath);
        const graph = JSON.parse(content);

        // 4. 版本检测
        if (graph.lastWriteCodeVersion) {
          const currentVersion = this.getCurrentCodeVersion();
          const dataVersion = graph.lastWriteCodeVersion;
          const [dataMajor, dataMinor] = dataVersion.split(".").map(Number);
          const [curMajor, curMinor] = currentVersion.split(".").map(Number);

          if (dataMajor > curMajor || (dataMajor === curMajor && dataMinor > curMinor)) {
            issues.push({
              type: "version_mismatch",
              severity: "warning",
              target: id,
              message: `数据版本 ${dataVersion} 高于当前代码版本 ${currentVersion}`,
              suggestion: "升级 tanmi-workspace 或使用兼容版本",
            });
          }
        }

        // 5. 节点完整性检测
        const nodesDir = isArchived
          ? `${this.fs.getArchivePath(projectRoot, wsDirName)}/nodes`
          : this.fs.getNodesDir(projectRoot, wsDirName);

        if (graph.nodes) {
          for (const [nodeId, node] of Object.entries(graph.nodes)) {
            const nodeMeta = node as { dirName?: string };
            const nodeDirName = nodeMeta.dirName || nodeId;
            const nodePath = `${nodesDir}/${nodeDirName}`;

            if (!(await this.fs.exists(nodePath))) {
              issues.push({
                type: "node_corrupt",
                severity: "error",
                target: nodeId,
                message: `节点目录不存在: ${nodeDirName}`,
                suggestion: "从备份恢复或删除该节点",
              });
            } else {
              const infoPath = `${nodePath}/Info.md`;
              if (!(await this.fs.exists(infoPath))) {
                issues.push({
                  type: "node_corrupt",
                  severity: "warning",
                  target: nodeId,
                  message: `节点 Info.md 缺失: ${nodeDirName}`,
                  suggestion: "可尝试重建节点信息文件",
                });
              }
            }
          }
        }
      } catch {
        issues.push({
          type: "graph_corrupt",
          severity: "error",
          target: id,
          message: "图文件 JSON 格式无效",
          suggestion: "从备份恢复或手动修复图文件",
        });
      }
    }

    // 确定状态
    const hasError = issues.some(i => i.severity === "error");
    const hasWarning = issues.some(i => i.severity === "warning");
    let wsStatus: WorkspaceHealthResult["status"] = "healthy";
    if (hasError) {
      wsStatus = "error";
    } else if (hasWarning) {
      wsStatus = "warning";
    }

    return {
      workspaceId: id,
      workspaceName: name,
      status: wsStatus,
      issues,
    };
  }
}
