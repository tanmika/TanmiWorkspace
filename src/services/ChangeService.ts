// src/services/ChangeService.ts

import * as path from "node:path";
import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type {
  ChangeRecord,
  ChangeRecordSummary,
  ChangesIndex,
  ChangeOperation,
  ChangeOperationSummary,
  ChangeClient,
  ChangeClaimParams,
  ChangeClaimResult,
  ChangeTransferParams,
  ChangeTransferResult,
  ChangeListParams,
  ChangeListResult,
  ChangeListSummaryResult,
  ChangeRevertParams,
  ChangeRevertResult,
  ChangeRevertItemResult,
  RecordChangeParams,
  RecordChangeResult,
  ChangeOperationUpdate,
  ChangeOperationAdd,
  ChangeOperationOverwrite,
  WorkspaceChangesOverviewPatch,
  WorkspaceChangesOverviewFile,
  WorkspaceChangesOverviewResult,
} from "../types/change.js";
import type { NodeMeta, NodeGraph } from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { generateId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { seekSequenceMultiLevel, extractContext, FuzzyLevel } from "../utils/patchMatcher.js";
import { devLog } from "../utils/devLog.js";

/**
 * 变更索引版本
 */
const CHANGES_INDEX_VERSION = 1;

/**
 * 上下文行数（提取变更前后的上下文）
 */
const CONTEXT_LINES = 3;

/**
 * 变更追踪服务
 * 负责记录、管理和回滚文件变更
 */
export class ChangeService {
  constructor(
    private json: JsonStorage,
    private fs: FileSystemAdapter
  ) {}

  // ========== 私有方法：路径和索引管理 ==========

  /**
   * 获取工作区信息
   */
  private async resolveWorkspaceInfo(workspaceId: string): Promise<{
    projectRoot: string;
    wsDirName: string;
    isArchived: boolean;
  }> {
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    if (wsEntry.status === "error" && wsEntry.errorInfo) {
      throw new TanmiError("WORKSPACE_ERROR", `工作区 "${workspaceId}" 处于错误状态`);
    }
    return {
      projectRoot: wsEntry.projectRoot,
      wsDirName: wsEntry.dirName || wsEntry.id,
      isArchived: wsEntry.status === "archived",
    };
  }

  /**
   * 获取 changes-index.json 路径
   */
  private getChangesIndexPath(projectRoot: string, wsDirName: string): string {
    return path.join(
      this.fs.getWorkspacePath(projectRoot, wsDirName),
      "changes-index.json"
    );
  }

  /**
   * 获取节点 changes 目录路径
   */
  private getNodeChangesDir(projectRoot: string, wsDirName: string, nodeDirName: string): string {
    return path.join(
      this.fs.getNodePath(projectRoot, wsDirName, nodeDirName),
      "changes"
    );
  }

  /**
   * 获取 ambiguous-changes 目录路径
   */
  private getAmbiguousChangesDir(projectRoot: string, wsDirName: string): string {
    return path.join(
      this.fs.getWorkspacePath(projectRoot, wsDirName),
      "ambiguous-changes"
    );
  }

  /**
   * 读取变更索引
   */
  private async readChangesIndex(projectRoot: string, wsDirName: string): Promise<ChangesIndex> {
    const indexPath = this.getChangesIndexPath(projectRoot, wsDirName);
    if (!(await this.fs.exists(indexPath))) {
      return {
        version: CHANGES_INDEX_VERSION,
        ambiguous: [],
        fileIndex: {},
        sequence: [],
      };
    }
    const content = await this.fs.readFile(indexPath);
    return JSON.parse(content) as ChangesIndex;
  }

  /**
   * 写入变更索引
   */
  private async writeChangesIndex(
    projectRoot: string,
    wsDirName: string,
    index: ChangesIndex
  ): Promise<void> {
    const indexPath = this.getChangesIndexPath(projectRoot, wsDirName);
    await this.fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * 生成变更 ID
   */
  private generateChangeId(): string {
    return `chg-${generateId()}`;
  }

  /**
   * 读取变更记录
   */
  private async readChangeRecord(changePath: string): Promise<ChangeRecord | null> {
    try {
      const content = await this.fs.readFile(changePath);
      return JSON.parse(content) as ChangeRecord;
    } catch {
      return null;
    }
  }

  /**
   * 写入变更记录
   */
  private async writeChangeRecord(changePath: string, record: ChangeRecord): Promise<void> {
    await this.fs.writeFile(changePath, JSON.stringify(record, null, 2));
  }

  /**
   * 获取变更记录路径
   */
  private getChangeRecordPath(
    projectRoot: string,
    wsDirName: string,
    nodeId: string | null,
    changeId: string,
    graph?: NodeGraph
  ): string {
    if (nodeId === null) {
      // ambiguous-changes 目录
      return path.join(
        this.getAmbiguousChangesDir(projectRoot, wsDirName),
        `${changeId}.json`
      );
    }
    // 节点 changes 目录
    const nodeDirName = graph?.nodes[nodeId]?.dirName || nodeId;
    return path.join(
      this.getNodeChangesDir(projectRoot, wsDirName, nodeDirName),
      `${changeId}.json`
    );
  }

  /**
   * 获取活跃的执行节点列表
   */
  private getActiveExecutingNodes(graph: NodeGraph): string[] {
    const activeNodes: string[] = [];
    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      // 只计算执行节点且处于 implementing/validating 状态的
      if (
        node.type === "execution" &&
        (node.status === "implementing" || node.status === "validating")
      ) {
        activeNodes.push(nodeId);
      }
    }
    return activeNodes;
  }

  // ========== 公共方法 ==========

  /**
   * 记录变更
   * 根据活跃节点数自动决定归属或放入 ambiguous
   */
  async recordChange(params: RecordChangeParams): Promise<RecordChangeResult> {
    const { workspaceId, sessionId, client, operation, nodeId: specifiedNodeId } = params;
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    const graph = await this.json.readGraph(projectRoot, wsDirName);
    const changesIndex = await this.readChangesIndex(projectRoot, wsDirName);

    // 确定归属节点
    let targetNodeId: string | null = specifiedNodeId ?? null;
    let isAmbiguous = false;

    if (targetNodeId === undefined || targetNodeId === null) {
      const activeNodes = this.getActiveExecutingNodes(graph);
      if (activeNodes.length === 1) {
        targetNodeId = activeNodes[0];
      } else if (activeNodes.length > 1) {
        // 多个活跃节点，放入 ambiguous
        targetNodeId = null;
        isAmbiguous = true;
      } else {
        // 没有活跃节点，也放入 ambiguous
        targetNodeId = null;
        isAmbiguous = true;
      }
    }

    // 生成变更记录
    const changeId = this.generateChangeId();
    const timestamp = now();

    const record: ChangeRecord = {
      id: changeId,
      nodeId: targetNodeId,
      timestamp,
      sessionId,
      client,
      operation,
    };

    // 确保目录存在并写入记录
    const changePath = this.getChangeRecordPath(projectRoot, wsDirName, targetNodeId, changeId, graph);
    const changeDir = path.dirname(changePath);
    await this.fs.mkdir(changeDir);
    await this.writeChangeRecord(changePath, record);

    // 更新索引
    if (isAmbiguous) {
      changesIndex.ambiguous.push(changeId);
    }

    // 更新文件索引
    const filePath = this.getOperationFilePath(operation);
    if (filePath) {
      if (!changesIndex.fileIndex[filePath]) {
        changesIndex.fileIndex[filePath] = [];
      }
      changesIndex.fileIndex[filePath].push({
        nodeId: targetNodeId || "",
        changeId,
      });
    }

    // 更新序列
    changesIndex.sequence.push({
      nodeId: targetNodeId,
      changeId,
    });

    await this.writeChangesIndex(projectRoot, wsDirName, changesIndex);

    devLog.debug("[ChangeService] 记录变更", {
      changeId,
      nodeId: targetNodeId,
      isAmbiguous,
      operationType: operation.type,
    });

    return {
      changeId,
      nodeId: targetNodeId,
      isAmbiguous,
    };
  }

  /**
   * 从操作中提取文件路径
   */
  private getOperationFilePath(operation: ChangeOperation): string | null {
    switch (operation.type) {
      case "add":
      case "delete":
      case "update":
      case "overwrite":
        return operation.filePath;
      default:
        return null;
    }
  }

  /**
   * 认领 ambiguous 变更到指定节点
   */
  async claimChanges(params: ChangeClaimParams): Promise<ChangeClaimResult> {
    const { workspaceId, nodeId, changeIds } = params;
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    const graph = await this.json.readGraph(projectRoot, wsDirName);
    const changesIndex = await this.readChangesIndex(projectRoot, wsDirName);

    // 验证目标节点存在
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    const nodeDirName = graph.nodes[nodeId].dirName || nodeId;
    const nodeChangesDir = this.getNodeChangesDir(projectRoot, wsDirName, nodeDirName);
    await this.fs.mkdir(nodeChangesDir);

    let claimedCount = 0;
    const failedIds: string[] = [];

    for (const changeId of changeIds) {
      // 检查是否在 ambiguous 中
      const ambiguousIdx = changesIndex.ambiguous.indexOf(changeId);
      if (ambiguousIdx === -1) {
        failedIds.push(changeId);
        continue;
      }

      // 读取变更记录
      const srcPath = this.getChangeRecordPath(projectRoot, wsDirName, null, changeId, graph);
      const record = await this.readChangeRecord(srcPath);
      if (!record) {
        failedIds.push(changeId);
        continue;
      }

      // 更新记录的 nodeId
      record.nodeId = nodeId;

      // 移动到节点目录
      const destPath = this.getChangeRecordPath(projectRoot, wsDirName, nodeId, changeId, graph);
      await this.writeChangeRecord(destPath, record);
      await this.fs.deleteFile(srcPath);

      // 更新索引
      changesIndex.ambiguous.splice(ambiguousIdx, 1);

      // 更新序列中的 nodeId
      const seqEntry = changesIndex.sequence.find(s => s.changeId === changeId);
      if (seqEntry) {
        seqEntry.nodeId = nodeId;
      }

      // 更新文件索引中的 nodeId
      const filePath = this.getOperationFilePath(record.operation);
      if (filePath && changesIndex.fileIndex[filePath]) {
        const fileEntry = changesIndex.fileIndex[filePath].find(e => e.changeId === changeId);
        if (fileEntry) {
          fileEntry.nodeId = nodeId;
        }
      }

      claimedCount++;
    }

    await this.writeChangesIndex(projectRoot, wsDirName, changesIndex);

    return {
      success: failedIds.length === 0,
      claimedCount,
      failedIds: failedIds.length > 0 ? failedIds : undefined,
    };
  }

  /**
   * 转移变更归属
   */
  async transferChange(params: ChangeTransferParams): Promise<ChangeTransferResult> {
    const { workspaceId, changeId, toNodeId } = params;
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    const graph = await this.json.readGraph(projectRoot, wsDirName);
    const changesIndex = await this.readChangesIndex(projectRoot, wsDirName);

    // 验证目标节点存在
    if (!graph.nodes[toNodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${toNodeId}" 不存在`);
    }

    // 查找变更记录当前位置
    let record: ChangeRecord | null = null;
    let srcPath: string | null = null;
    let previousNodeId: string | null = null;

    // 先检查 ambiguous
    if (changesIndex.ambiguous.includes(changeId)) {
      srcPath = this.getChangeRecordPath(projectRoot, wsDirName, null, changeId, graph);
      record = await this.readChangeRecord(srcPath);
      previousNodeId = null;
    } else {
      // 在节点中查找
      const seqEntry = changesIndex.sequence.find(s => s.changeId === changeId);
      if (seqEntry && seqEntry.nodeId) {
        srcPath = this.getChangeRecordPath(projectRoot, wsDirName, seqEntry.nodeId, changeId, graph);
        record = await this.readChangeRecord(srcPath);
        previousNodeId = seqEntry.nodeId;
      }
    }

    if (!record || !srcPath) {
      throw new TanmiError("CHANGE_NOT_FOUND", `变更记录 "${changeId}" 不存在`);
    }

    // 如果已经在目标节点，无需转移
    if (previousNodeId === toNodeId) {
      return {
        success: true,
        previousNodeId,
      };
    }

    // 更新记录
    record.nodeId = toNodeId;

    // 移动文件
    const toDirName = graph.nodes[toNodeId].dirName || toNodeId;
    const toChangesDir = this.getNodeChangesDir(projectRoot, wsDirName, toDirName);
    await this.fs.mkdir(toChangesDir);

    const destPath = this.getChangeRecordPath(projectRoot, wsDirName, toNodeId, changeId, graph);
    await this.writeChangeRecord(destPath, record);
    await this.fs.deleteFile(srcPath);

    // 更新索引
    if (previousNodeId === null) {
      // 从 ambiguous 移出
      const idx = changesIndex.ambiguous.indexOf(changeId);
      if (idx !== -1) {
        changesIndex.ambiguous.splice(idx, 1);
      }
    }

    // 更新序列
    const seqEntry = changesIndex.sequence.find(s => s.changeId === changeId);
    if (seqEntry) {
      seqEntry.nodeId = toNodeId;
    }

    // 更新文件索引
    const filePath = this.getOperationFilePath(record.operation);
    if (filePath && changesIndex.fileIndex[filePath]) {
      const fileEntry = changesIndex.fileIndex[filePath].find(e => e.changeId === changeId);
      if (fileEntry) {
        fileEntry.nodeId = toNodeId;
      }
    }

    await this.writeChangesIndex(projectRoot, wsDirName, changesIndex);

    return {
      success: true,
      previousNodeId,
    };
  }

  /**
   * 列出变更
   */
  async listChanges(params: ChangeListParams): Promise<ChangeListResult | ChangeListSummaryResult> {
    const { workspaceId, nodeId } = params;
    const { projectRoot, wsDirName, isArchived } = await this.resolveWorkspaceInfo(workspaceId);

    const graph = await this.json.readGraph(projectRoot, wsDirName, isArchived);
    const changes: ChangeRecord[] = [];

    if (nodeId === undefined) {
      // 列出 ambiguous 变更
      const changesIndex = await this.readChangesIndex(projectRoot, wsDirName);
      for (const changeId of changesIndex.ambiguous) {
        const changePath = this.getChangeRecordPath(projectRoot, wsDirName, null, changeId, graph);
        const record = await this.readChangeRecord(changePath);
        if (record) {
          changes.push(record);
        }
      }
    } else {
      // 列出指定节点的变更
      if (!graph.nodes[nodeId]) {
        throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
      }

      const nodeDirName = graph.nodes[nodeId].dirName || nodeId;
      const changesDir = this.getNodeChangesDir(projectRoot, wsDirName, nodeDirName);

      if (await this.fs.exists(changesDir)) {
        const files = await this.fs.readdir(changesDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const changePath = path.join(changesDir, file);
            const record = await this.readChangeRecord(changePath);
            if (record) {
              changes.push(record);
            }
          }
        }
      }
    }

    // 按时间排序
    changes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (params.summary) {
      return {
        changes: changes.map(c => ChangeService.summarizeRecord(c)),
        totalCount: changes.length,
      } as ChangeListSummaryResult;
    }

    return {
      changes,
      totalCount: changes.length,
    };
  }

  /**
   * 将完整变更记录转为精简版本
   */
  static summarizeRecord(record: ChangeRecord): ChangeRecordSummary {
    let operation: ChangeOperationSummary;

    switch (record.operation.type) {
      case "add":
        operation = {
          type: "add",
          filePath: record.operation.filePath,
          lineCount: record.operation.content.split("\n").length,
        };
        break;
      case "overwrite":
        operation = {
          type: "overwrite",
          filePath: record.operation.filePath,
          hasOriginal: !!record.operation.originalContent,
        };
        break;
      case "update":
        operation = { ...record.operation };
        break;
      case "delete":
        operation = { ...record.operation };
        break;
    }

    return {
      id: record.id,
      nodeId: record.nodeId,
      timestamp: record.timestamp,
      sessionId: record.sessionId,
      client: record.client,
      operation,
    };
  }

  /**
   * 获取待认领变更数量
   */
  async getAmbiguousCount(workspaceId: string): Promise<number> {
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);
    const changesIndex = await this.readChangesIndex(projectRoot, wsDirName);
    return changesIndex.ambiguous.length;
  }

  /**
   * 获取工作区变更概览 — 按文件分组，每个文件的 patch 列表含节点标题
   */
  async getWorkspaceOverview(workspaceId: string): Promise<WorkspaceChangesOverviewResult> {
    const { projectRoot, wsDirName, isArchived } = await this.resolveWorkspaceInfo(workspaceId);
    const graph = await this.json.readGraph(projectRoot, wsDirName, isArchived);
    const changesIndex = await this.readChangesIndex(projectRoot, wsDirName);

    // 构建 nodeId → title 映射（title 编码在 dirName 中：标题_短ID，root 为 "root"）
    const nodeTitleMap = new Map<string, string>();
    for (const [nodeId, meta] of Object.entries(graph.nodes)) {
      const m = meta as NodeMeta;
      if (m.dirName === "root") {
        nodeTitleMap.set(nodeId, "root");
      } else {
        // dirName 格式: "标题_短ID"，提取 _ 之前的部分作为 title
        const lastUnderscore = m.dirName.lastIndexOf("_");
        nodeTitleMap.set(nodeId, lastUnderscore > 0 ? m.dirName.slice(0, lastUnderscore) : m.dirName);
      }
    }

    // 按 fileIndex 分组，每条 change 读取记录获取详情
    const filesMap = new Map<string, WorkspaceChangesOverviewPatch[]>();

    for (const [filePath, entries] of Object.entries(changesIndex.fileIndex)) {
      const patches: WorkspaceChangesOverviewPatch[] = [];

      for (const entry of entries) {
        const nodeId = entry.nodeId || null;
        const changePath = this.getChangeRecordPath(
          projectRoot, wsDirName, nodeId, entry.changeId, graph
        );
        const record = await this.readChangeRecord(changePath);
        if (!record) continue;

        const patch: WorkspaceChangesOverviewPatch = {
          changeId: record.id,
          nodeId,
          nodeTitle: nodeId ? (nodeTitleMap.get(nodeId) ?? nodeId) : null,
          type: record.operation.type,
          timestamp: record.timestamp,
          client: record.client,
        };

        // 填充变化量
        const op = record.operation;
        if (op.type === "add") {
          patch.addCount = op.content.split("\n").length;
        } else if (op.type === "update") {
          patch.delCount = op.oldLines.length;
          patch.addCount = op.newLines.length;
        } else if (op.type === "overwrite") {
          if (op.originalContent != null) {
            patch.delCount = op.originalContent.split("\n").length;
          }
          if (op.newContent != null) {
            patch.addCount = op.newContent.split("\n").length;
          }
        }

        patches.push(patch);
      }

      if (patches.length > 0) {
        // 按时间排序
        patches.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        filesMap.set(filePath, patches);
      }
    }

    // 转为数组并按第一个 patch 的时间排序
    const files: WorkspaceChangesOverviewFile[] = Array.from(filesMap.entries())
      .map(([filePath, patches]) => ({ filePath, patches }))
      .sort((a, b) => {
        const ta = new Date(a.patches[0].timestamp).getTime();
        const tb = new Date(b.patches[0].timestamp).getTime();
        return ta - tb;
      });

    const totalChanges = files.reduce((sum, f) => sum + f.patches.length, 0);

    return {
      files,
      totalFiles: files.length,
      totalChanges,
    };
  }

  /**
   * 回滚变更
   */
  async revertChanges(params: ChangeRevertParams): Promise<ChangeRevertResult> {
    const { workspaceId, changeIds, dryRun } = params;
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    const graph = await this.json.readGraph(projectRoot, wsDirName);
    const changesIndex = await this.readChangesIndex(projectRoot, wsDirName);
    const results: ChangeRevertItemResult[] = [];

    for (const changeId of changeIds) {
      // 查找变更记录
      const seqEntry = changesIndex.sequence.find(s => s.changeId === changeId);
      if (!seqEntry) {
        results.push({
          changeId,
          success: false,
          reason: "变更记录不存在",
        });
        continue;
      }

      const changePath = this.getChangeRecordPath(
        projectRoot,
        wsDirName,
        seqEntry.nodeId,
        changeId,
        graph
      );
      const record = await this.readChangeRecord(changePath);

      if (!record) {
        results.push({
          changeId,
          success: false,
          reason: "变更记录文件不存在",
          patchFile: changePath,
        });
        continue;
      }

      // 执行回滚（dryRun 时仅检查不写入）
      const revertResult = await this.revertSingleChange(record, !!dryRun);
      results.push({
        changeId,
        ...revertResult,
        patchFile: revertResult.success ? undefined : changePath,
      });

      // 如果回滚成功且非 dryRun，删除变更记录
      if (revertResult.success && !dryRun) {
        await this.fs.deleteFile(changePath);

        // 从索引中移除
        if (seqEntry.nodeId === null) {
          const idx = changesIndex.ambiguous.indexOf(changeId);
          if (idx !== -1) {
            changesIndex.ambiguous.splice(idx, 1);
          }
        }

        // 从序列中移除
        const seqIdx = changesIndex.sequence.findIndex(s => s.changeId === changeId);
        if (seqIdx !== -1) {
          changesIndex.sequence.splice(seqIdx, 1);
        }

        // 从文件索引中移除
        const filePath = this.getOperationFilePath(record.operation);
        if (filePath && changesIndex.fileIndex[filePath]) {
          changesIndex.fileIndex[filePath] = changesIndex.fileIndex[filePath].filter(
            e => e.changeId !== changeId
          );
          if (changesIndex.fileIndex[filePath].length === 0) {
            delete changesIndex.fileIndex[filePath];
          }
        }
      }
    }

    // dryRun 时不写入索引变更
    if (!dryRun) {
      await this.writeChangesIndex(projectRoot, wsDirName, changesIndex);
    }

    const allSuccess = results.every(r => r.success);
    return {
      success: allSuccess,
      results,
    };
  }

  /**
   * 回滚单个变更
   * @param dryRun 仅检查是否可回滚，不实际执行写入操作
   */
  private async revertSingleChange(
    record: ChangeRecord,
    dryRun: boolean = false
  ): Promise<{ success: boolean; reason?: string }> {
    const { operation } = record;

    try {
      switch (operation.type) {
        case "add":
          // 删除新增的文件
          if (await this.fs.exists(operation.filePath)) {
            if (!dryRun) {
              await this.fs.deleteFile(operation.filePath);
            }
            return { success: true };
          }
          return { success: false, reason: "文件不存在，可能已被删除" };

        case "delete":
          // 无法回滚删除操作（没有保存原内容）
          return { success: false, reason: "删除操作无法自动回滚，需要手动恢复" };

        case "update":
          return await this.revertUpdateOperation(operation, dryRun);

        case "overwrite":
          return await this.revertOverwriteOperation(operation, dryRun);

        default:
          return { success: false, reason: "未知的操作类型" };
      }
    } catch (error) {
      return {
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 回滚 update 操作
   * @param dryRun 仅检查匹配，不实际写入文件
   */
  private async revertUpdateOperation(
    operation: ChangeOperationUpdate,
    dryRun: boolean = false
  ): Promise<{ success: boolean; reason?: string }> {
    const { filePath, oldLines, newLines } = operation;

    if (!(await this.fs.exists(filePath))) {
      return { success: false, reason: "文件不存在" };
    }

    const content = await this.fs.readFile(filePath);
    const lines = content.split("\n");

    // 使用模糊匹配查找 newLines
    const result = seekSequenceMultiLevel(lines, newLines, 0, false);

    if (!result) {
      return {
        success: false,
        reason: "无法在文件中找到匹配的内容，文件可能已被修改",
      };
    }

    if (!dryRun) {
      // 替换回 oldLines
      const newContent = [
        ...lines.slice(0, result.position),
        ...oldLines,
        ...lines.slice(result.position + newLines.length),
      ].join("\n");

      await this.fs.writeFile(filePath, newContent);
    }

    if (result.level !== FuzzyLevel.EXACT) {
      devLog.debug("[ChangeService] 使用模糊匹配回滚", {
        filePath,
        level: FuzzyLevel[result.level],
      });
    }

    return { success: true };
  }

  /**
   * 回滚 overwrite 操作
   * @param dryRun 仅检查是否可回滚，不实际写入文件
   */
  private async revertOverwriteOperation(
    operation: ChangeOperationOverwrite,
    dryRun: boolean = false
  ): Promise<{ success: boolean; reason?: string }> {
    const { filePath, originalContent } = operation;

    if (originalContent === undefined || originalContent === null) {
      return {
        success: false,
        reason: "没有保存原始内容，无法自动回滚",
      };
    }

    if (!dryRun) {
      await this.fs.writeFile(filePath, originalContent);
    }
    return { success: true };
  }

  /**
   * 从文件内容中提取带上下文的变更记录
   * 用于 Hook 捕获时生成 ChangeOperationUpdate
   */
  extractUpdateOperation(
    filePath: string,
    fileContent: string,
    oldString: string,
    newString: string
  ): ChangeOperationUpdate | null {
    const lines = fileContent.split("\n");
    const oldLines = oldString.split("\n");
    const newLines = newString.split("\n");

    // 查找 oldString 在文件中的位置
    const result = seekSequenceMultiLevel(lines, oldLines, 0, false);

    if (!result) {
      // 如果找不到 oldString，可能是 Hook 数据不完整
      // 返回不带位置信息的记录
      return {
        type: "update",
        filePath,
        oldLines,
        newLines,
      };
    }

    // 提取上下文
    const context = extractContext(lines, result.position, oldLines.length, CONTEXT_LINES);

    return {
      type: "update",
      filePath,
      oldLines,
      newLines,
      lineNumber: result.position + 1, // 转为 1-based
      contextBefore: context.before,
      contextAfter: context.after,
    };
  }

  /**
   * 从 Write 操作创建 add 或 overwrite 记录
   */
  createWriteOperation(
    filePath: string,
    newContent: string,
    originalContent: string | null
  ): ChangeOperationAdd | ChangeOperationOverwrite {
    if (originalContent === null) {
      // 新建文件
      return {
        type: "add",
        filePath,
        content: newContent,
      };
    } else {
      // 覆盖文件
      return {
        type: "overwrite",
        filePath,
        originalContent,
        newContent,
      };
    }
  }

  /**
   * 删除节点的所有变更记录（节点删除时调用）
   */
  async deleteNodeChanges(workspaceId: string, nodeId: string): Promise<void> {
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    const changesIndex = await this.readChangesIndex(projectRoot, wsDirName);

    const nodeDirName = graph.nodes[nodeId]?.dirName || nodeId;
    const changesDir = this.getNodeChangesDir(projectRoot, wsDirName, nodeDirName);

    // 删除变更目录
    if (await this.fs.exists(changesDir)) {
      await this.fs.rmdir(changesDir);
    }

    // 从索引中移除该节点的所有变更
    changesIndex.sequence = changesIndex.sequence.filter(s => s.nodeId !== nodeId);

    // 从文件索引中移除
    for (const filePath of Object.keys(changesIndex.fileIndex)) {
      changesIndex.fileIndex[filePath] = changesIndex.fileIndex[filePath].filter(
        e => e.nodeId !== nodeId
      );
      if (changesIndex.fileIndex[filePath].length === 0) {
        delete changesIndex.fileIndex[filePath];
      }
    }

    await this.writeChangesIndex(projectRoot, wsDirName, changesIndex);
  }
}
