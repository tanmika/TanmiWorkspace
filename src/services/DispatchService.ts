// src/services/DispatchService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  WorkspaceConfig,
  DispatchConfig,
  ActionRequired,
} from "../types/workspace.js";
import type { NodeMeta, NodeDispatchStatus } from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { now } from "../utils/time.js";
import {
  isGitRepo,
  getCurrentBranch,
  hasUncommittedChanges,
  createBackupBranch,
  createProcessBranch,
  checkoutProcessBranch,
  checkoutBranch,
  getCurrentCommit,
  commitDispatch,
  resetToCommit,
  mergeProcessBranch,
  deleteAllWorkspaceBranches,
  getActiveDispatchWorkspace,
  getProcessBranchName,
  isOnProcessBranch,
} from "../utils/git.js";

/**
 * 派发准备结果
 */
export interface DispatchPrepareResult {
  success: boolean;
  startCommit: string;
  actionRequired: ActionRequired;
}

/**
 * 派发完成结果
 */
export interface DispatchCompleteResult {
  success: boolean;
  endCommit?: string;
  nextAction?: "dispatch_test" | "return_parent";
  testNodeId?: string;
  hint?: string;
}

/**
 * Git 状态信息
 */
export interface GitStatusInfo {
  currentBranch: string;
  hasUncommittedChanges: boolean;
  isDispatchBranch: boolean;
}

/**
 * 派发服务
 * 处理派发功能的核心业务逻辑
 */
export class DispatchService {
  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 启用派发模式
   */
  async enableDispatch(
    workspaceId: string,
    projectRoot: string
  ): Promise<{ success: boolean; config: DispatchConfig }> {
    // 1. 检查是否在 git 仓库中
    if (!(await isGitRepo(projectRoot))) {
      throw new TanmiError(
        "GIT_NOT_FOUND",
        "当前项目不是 git 仓库，无法启用派发模式"
      );
    }

    // 2. 检查是否已有其他工作区在派发
    const activeWorkspace = await getActiveDispatchWorkspace(projectRoot);
    if (activeWorkspace && activeWorkspace !== workspaceId) {
      throw new TanmiError(
        "DISPATCH_CONFLICT",
        `已有工作区 ${activeWorkspace} 正在派发中，请先完成或取消该派发`
      );
    }

    // 3. 记录原分支
    const originalBranch = await getCurrentBranch(projectRoot);
    const backupBranches: string[] = [];

    // 4. 检查是否有未提交内容
    if (await hasUncommittedChanges(projectRoot)) {
      // 创建备份分支
      const backupBranch = await createBackupBranch(workspaceId, projectRoot);
      backupBranches.push(backupBranch);
      // 切回原分支
      await checkoutBranch(originalBranch, projectRoot);
    }

    // 5. 创建派发分支
    const processBranch = await createProcessBranch(workspaceId, projectRoot);

    // 6. 构建派发配置
    const dispatchConfig: DispatchConfig = {
      enabled: true,
      enabledAt: Date.now(),
      originalBranch,
      processBranch,
      backupBranches: backupBranches.length > 0 ? backupBranches : undefined,
      limits: {
        timeoutMs: 300000, // 5 分钟
        maxRetries: 3,
      },
    };

    // 7. 更新 workspace.json
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    config.dispatch = dispatchConfig;
    config.updatedAt = now();
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 8. 记录日志
    await this.md.appendLog(projectRoot, workspaceId, {
      time: now(),
      operator: "system",
      event: `派发模式已启用，派发分支: ${processBranch}`,
    });

    return { success: true, config: dispatchConfig };
  }

  /**
   * 禁用派发模式
   */
  async disableDispatch(
    workspaceId: string,
    projectRoot: string,
    merge: boolean = false
  ): Promise<{ success: boolean }> {
    // 1. 读取配置
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    if (!config.dispatch?.enabled) {
      return { success: true }; // 已经禁用
    }

    const { originalBranch, processBranch } = config.dispatch;

    // 2. 如果需要合并，执行合并
    if (merge && originalBranch && processBranch) {
      await mergeProcessBranch(workspaceId, originalBranch, projectRoot);
    } else if (originalBranch) {
      // 否则直接切回原分支
      await checkoutBranch(originalBranch, projectRoot);
    }

    // 3. 清理分支
    await deleteAllWorkspaceBranches(workspaceId, projectRoot);

    // 4. 更新配置
    config.dispatch = undefined;
    config.updatedAt = now();
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 5. 记录日志
    await this.md.appendLog(projectRoot, workspaceId, {
      time: now(),
      operator: "system",
      event: merge ? "派发模式已禁用，更改已合并到原分支" : "派发模式已禁用",
    });

    return { success: true };
  }

  /**
   * 准备派发节点任务
   */
  async prepareDispatch(
    workspaceId: string,
    projectRoot: string,
    nodeId: string
  ): Promise<DispatchPrepareResult> {
    // 1. 验证派发模式已启用
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    if (!config.dispatch?.enabled) {
      throw new TanmiError("DISPATCH_NOT_ENABLED", "派发模式未启用");
    }

    // 2. 验证节点状态
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const node = graph.nodes[nodeId];
    if (!node) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 ${nodeId} 不存在`);
    }
    if (node.type !== "execution") {
      throw new TanmiError("INVALID_NODE_TYPE", "只有执行节点可以派发");
    }
    if (node.status !== "implementing") {
      throw new TanmiError(
        "INVALID_NODE_STATUS",
        `节点状态必须为 implementing，当前为 ${node.status}`
      );
    }

    // 3. 确保在派发分支上
    if (!(await isOnProcessBranch(workspaceId, projectRoot))) {
      await checkoutProcessBranch(workspaceId, projectRoot);
    }

    // 4. 记录 startCommit
    const startCommit = await getCurrentCommit(projectRoot);

    // 5. 更新节点派发状态
    node.dispatch = {
      startCommit,
      status: "executing",
    };
    node.updatedAt = now();
    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 6. 读取节点信息构建 prompt
    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId);
    const timeout = config.dispatch.limits?.timeoutMs ?? 300000;

    // 7. 构建 actionRequired
    const actionRequired: ActionRequired = {
      type: "dispatch_task",
      message: "请使用 Task tool 派发此节点任务",
      data: {
        workspaceId,
        nodeId,
        testNodeId: node.testNodeId,
        subagentType: "tanmi-executor",
        prompt: this.buildExecutorPrompt(workspaceId, nodeId, nodeInfo.title),
        timeout,
      },
    };

    return {
      success: true,
      startCommit,
      actionRequired,
    };
  }

  /**
   * 处理派发完成
   */
  async completeDispatch(
    workspaceId: string,
    projectRoot: string,
    nodeId: string,
    success: boolean,
    conclusion?: string
  ): Promise<DispatchCompleteResult> {
    // 1. 读取配置和节点
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const node = graph.nodes[nodeId];

    if (!node) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 ${nodeId} 不存在`);
    }

    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId);

    if (success) {
      // 2a. 执行成功：提交更改
      const endCommit = await commitDispatch(nodeId, nodeInfo.title, projectRoot);

      // 更新节点派发状态
      if (node.dispatch) {
        node.dispatch.endCommit = endCommit;
        node.dispatch.status = "testing";
      }
      node.updatedAt = now();
      await this.json.writeGraph(projectRoot, workspaceId, graph);

      // 记录日志
      await this.md.appendLog(projectRoot, workspaceId, {
        time: now(),
        operator: "tanmi-executor",
        event: `节点 ${nodeId} 执行完成，commit: ${endCommit.substring(0, 7)}`,
      }, nodeId);

      // 返回下一步：派发测试节点
      if (node.testNodeId) {
        return {
          success: true,
          endCommit,
          nextAction: "dispatch_test",
          testNodeId: node.testNodeId,
          hint: `执行完成，请派发测试节点 ${node.testNodeId} 进行验证`,
        };
      } else {
        return {
          success: true,
          endCommit,
          nextAction: "return_parent",
          hint: "执行完成，无配对测试节点，返回父节点",
        };
      }
    } else {
      // 2b. 执行失败：更新状态
      if (node.dispatch) {
        node.dispatch.status = "failed";
      }
      node.updatedAt = now();
      await this.json.writeGraph(projectRoot, workspaceId, graph);

      // 记录日志
      await this.md.appendLog(projectRoot, workspaceId, {
        time: now(),
        operator: "tanmi-executor",
        event: `节点 ${nodeId} 执行失败: ${conclusion || "未知原因"}`,
      }, nodeId);

      return {
        success: false,
        nextAction: "return_parent",
        hint: "执行失败，返回父节点决策",
      };
    }
  }

  /**
   * 处理测试结果
   */
  async handleTestResult(
    workspaceId: string,
    projectRoot: string,
    testNodeId: string,
    passed: boolean,
    conclusion?: string
  ): Promise<{ success: boolean; hint?: string }> {
    // 1. 读取测试节点
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const testNode = graph.nodes[testNodeId];

    if (!testNode || !testNode.execNodeId) {
      throw new TanmiError("INVALID_TEST_NODE", "无效的测试节点或未关联执行节点");
    }

    // 2. 获取关联的执行节点
    const execNode = graph.nodes[testNode.execNodeId];
    if (!execNode || !execNode.dispatch) {
      throw new TanmiError("EXEC_NODE_NOT_FOUND", "关联的执行节点不存在或未派发");
    }

    if (passed) {
      // 3a. 测试通过
      execNode.dispatch.status = "passed";
      execNode.updatedAt = now();
      await this.json.writeGraph(projectRoot, workspaceId, graph);

      await this.md.appendLog(projectRoot, workspaceId, {
        time: now(),
        operator: "tanmi-tester",
        event: `测试通过，节点 ${testNode.execNodeId} 验证成功`,
      }, testNodeId);

      return {
        success: true,
        hint: "测试通过，继续下一个执行节点",
      };
    } else {
      // 3b. 测试失败：回滚
      const startCommit = execNode.dispatch.startCommit;
      await resetToCommit(startCommit, projectRoot);

      execNode.dispatch.status = "failed";
      execNode.dispatch.endCommit = undefined;
      execNode.updatedAt = now();
      await this.json.writeGraph(projectRoot, workspaceId, graph);

      await this.md.appendLog(projectRoot, workspaceId, {
        time: now(),
        operator: "tanmi-tester",
        event: `测试失败，已回滚到 ${startCommit.substring(0, 7)}`,
      }, testNodeId);

      return {
        success: false,
        hint: `测试失败，已回滚更改，返回父节点决策`,
      };
    }
  }

  /**
   * 获取 Git 状态信息
   */
  async getGitStatus(
    workspaceId: string,
    projectRoot: string
  ): Promise<GitStatusInfo | null> {
    if (!(await isGitRepo(projectRoot))) {
      return null;
    }

    const currentBranch = await getCurrentBranch(projectRoot);
    const uncommittedChanges = await hasUncommittedChanges(projectRoot);
    const isDispatch = await isOnProcessBranch(workspaceId, projectRoot);

    return {
      currentBranch,
      hasUncommittedChanges: uncommittedChanges,
      isDispatchBranch: isDispatch,
    };
  }

  /**
   * 清理派发分支
   */
  async cleanupBranches(
    workspaceId: string,
    projectRoot: string
  ): Promise<{ success: boolean; deleted: string[] }> {
    const deleted: string[] = [];

    try {
      await deleteAllWorkspaceBranches(workspaceId, projectRoot);
      deleted.push(getProcessBranchName(workspaceId));
    } catch {
      // 忽略清理错误
    }

    return { success: true, deleted };
  }

  /**
   * 构建执行者 prompt
   */
  private buildExecutorPrompt(
    workspaceId: string,
    nodeId: string,
    title: string
  ): string {
    return `Execute task for TanmiWorkspace node.

Workspace: ${workspaceId}
Node: ${nodeId}
Title: ${title}

Instructions:
1. Call context_get(workspaceId="${workspaceId}") to get full execution context
2. Assess task scope and information completeness
3. Execute the task within defined boundaries
4. Report progress via log_append
5. Complete with node_transition(action="complete") and conclusion

If task cannot be completed:
- Call node_transition(action="fail") with reason
- Reasons: "info_insufficient", "scope_too_large", "execution_error"`;
  }
}
