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
import type { ConfigService } from "./ConfigService.js";
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
  deleteProcessBranch,
  deleteBackupBranch,
  getActiveDispatchWorkspace,
  getProcessBranchName,
  isOnProcessBranch,
  getCommitsBetween,
  getUncommittedChangesSummary,
  squashMergeProcessBranch,
  rebaseMergeProcessBranch,
  cherryPickToWorkingTree,
  getLatestBackupBranch,
} from "../utils/git.js";

/**
 * 合并策略类型
 */
export type MergeStrategy = "sequential" | "squash" | "cherry-pick" | "skip";

/**
 * 派发准备结果
 */
export interface DispatchPrepareResult {
  success: boolean;
  startMarker: string;  // Git 模式=commit hash，无 Git 模式=时间戳
  actionRequired: ActionRequired;
}

/**
 * 派发完成结果
 */
export interface DispatchCompleteResult {
  success: boolean;
  endMarker?: string;  // Git 模式=commit hash，无 Git 模式=时间戳
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
 * 禁用派发询问结果
 */
export interface DisableDispatchQueryResult {
  actionRequired: ActionRequired;
  status: {
    originalBranch?: string;           // Git 模式才有
    processBranch?: string;            // Git 模式才有
    backupBranch?: string | null;
    hasBackupChanges: boolean;
    processCommits?: Array<{ hash: string; message: string }>;  // Git 模式才有
    startMarker?: string;              // 统一字段名
    useGit: boolean;                   // 标识当前模式
  };
}

/**
 * 执行禁用选择的参数
 */
export interface ExecuteDisableParams {
  workspaceId: string;
  mergeStrategy: MergeStrategy;
  keepBackupBranch: boolean;
  keepProcessBranch: boolean;
  commitMessage?: string;  // 用于 squash 时的提交信息
}

/**
 * 派发服务
 * 处理派发功能的核心业务逻辑
 */
export class DispatchService {
  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter,
    private configService?: ConfigService
  ) {}

  /**
   * 启用派发模式
   */
  async enableDispatch(
    workspaceId: string,
    projectRoot: string,
    options?: { useGit?: boolean }
  ): Promise<{ success: boolean; config: DispatchConfig }> {
    // 0. 检查是否已启用（11.1 模式不可变）
    const existingConfig = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    if (existingConfig.dispatch?.enabled) {
      throw new TanmiError(
        "DISPATCH_ALREADY_ENABLED",
        "派发模式已启用。如需切换模式，请先执行 dispatch_disable，再重新 enable"
      );
    }

    // 1. 检测是否 git 仓库
    const isGit = await isGitRepo(projectRoot);

    // 2. 确定 useGit 值
    let useGit: boolean;
    if (options?.useGit !== undefined) {
      // 用户显式指定
      if (options.useGit && !isGit) {
        throw new TanmiError("GIT_NOT_FOUND", "当前项目不是 git 仓库，无法启用 Git 模式");
      }
      useGit = options.useGit;
    } else {
      // 从全局配置读取默认派发模式
      const defaultMode = await this.configService?.getDefaultDispatchMode() ?? "none";
      if (defaultMode === "git") {
        if (!isGit) {
          throw new TanmiError("GIT_NOT_FOUND", "全局配置为 Git 模式，但当前项目不是 git 仓库。请修改全局配置或显式指定 useGit=false");
        }
        useGit = true;
      } else {
        // none 或 no-git 都使用无 Git 模式
        useGit = false;
      }
    }

    // 3. 检查派发并发冲突（允许不同工作区使用不同模式）
    const activeWorkspaceInfo = await this.getActiveDispatchWorkspaceWithMode(projectRoot, workspaceId);
    if (activeWorkspaceInfo) {
      // 只检查并发冲突，不再检查模式冲突
      throw new TanmiError(
        "DISPATCH_CONFLICT",
        `已有工作区 ${activeWorkspaceInfo.workspaceId} 正在派发中，请先完成或取消该派发`
      );
    }

    // 4. Git 模式：创建分支
    let originalBranch: string | undefined;
    let processBranch: string | undefined;
    let backupBranches: string[] | undefined;

    if (useGit) {
      // 4a. 记录原分支
      originalBranch = await getCurrentBranch(projectRoot);
      const backupBranchesList: string[] = [];

      // 4b. 检查是否有未提交内容
      if (await hasUncommittedChanges(projectRoot)) {
        // 创建备份分支（包含未提交修改）
        const backupBranch = await createBackupBranch(workspaceId, projectRoot);
        backupBranchesList.push(backupBranch);
        // 注意：不切回原分支，直接从 backup（包含修改）创建 process 分支
        // 这样 process 分支会包含所有未提交的修改
      }

      // 4c. 从当前 HEAD 创建派发分支（如果有备份，则基于备份；否则基于原分支）
      processBranch = await createProcessBranch(workspaceId, projectRoot);
      backupBranches = backupBranchesList.length > 0 ? backupBranchesList : undefined;
    }

    // 5. 构建派发配置
    const dispatchConfig: DispatchConfig = {
      enabled: true,
      useGit,
      enabledAt: Date.now(),
      originalBranch,
      processBranch,
      backupBranches,
      limits: {
        timeoutMs: 300000, // 5 分钟
        maxRetries: 3,
      },
    };

    // 6. 更新 workspace.json
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    config.dispatch = dispatchConfig;
    config.updatedAt = now();
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 7. 记录日志
    const mode = useGit ? "Git 模式" : "无 Git 模式";
    const detail = useGit ? `，派发分支: ${processBranch}` : "";
    await this.md.appendLog(projectRoot, workspaceId, {
      time: now(),
      operator: "system",
      event: `派发模式已启用（${mode}）${detail}`,
    });

    return { success: true, config: dispatchConfig };
  }

  /**
   * 查询禁用派发状态（返回 actionRequired 让用户选择）
   */
  async queryDisableDispatch(
    workspaceId: string,
    projectRoot: string
  ): Promise<DisableDispatchQueryResult | { success: boolean }> {
    // 1. 读取配置
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    if (!config.dispatch?.enabled) {
      return { success: true }; // 已经禁用
    }

    // 1.1 检查是否有正在执行的派发任务
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const activeDispatchNodes: string[] = [];

    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if (node.dispatch && (node.dispatch.status === "executing" || node.dispatch.status === "testing")) {
        activeDispatchNodes.push(nodeId);
      }
    }

    if (activeDispatchNodes.length > 0) {
      throw new TanmiError(
        "DISPATCH_IN_PROGRESS",
        `无法关闭派发：当前有 ${activeDispatchNodes.length} 个节点正在派发执行中 (${activeDispatchNodes.join(", ")})`
      );
    }

    // 1.1 验证 Git 环境（11.2 环境变化检测）
    // 注意：这里不抛错，而是在返回信息中提示用户
    let gitEnvironmentLost = false;
    if (config.dispatch.useGit) {
      const isGit = await isGitRepo(projectRoot);
      if (!isGit) {
        gitEnvironmentLost = true;
      }
    }

    const useGit = config.dispatch.useGit;

    if (useGit) {
      // Git 模式：返回完整的合并选项
      if (gitEnvironmentLost) {
        // Git 环境丢失，返回简化的 actionRequired
        const actionRequired: ActionRequired = {
          type: "dispatch_complete_choice",
          message: "⚠️ Git 环境已丢失（.git 目录不存在），只能清理配置",
          data: {
            workspaceId,
            useGit: true,
            gitEnvironmentLost: true,
          },
        };
        return {
          actionRequired,
          status: {
            backupBranch: null,
            hasBackupChanges: false,
            useGit: true
          }
        };
      }

      const { originalBranch, processBranch, backupBranches } = config.dispatch;
      const startCommit = config.dispatch.backupBranches?.[0]
        ? await getCurrentCommit(projectRoot) // 会在后面获取正确的 startCommit
        : (await this.getOriginalBranchCommit(originalBranch!, projectRoot));

      // 2. 获取派发分支上的提交列表
      const processCommits = await getCommitsBetween(
        startCommit,
        processBranch!,
        projectRoot
      );

      // 3. 获取备份分支信息
      const backupBranch = backupBranches?.[0] || null;
      const hasBackupChanges = backupBranch !== null;

      // 4. 构建状态摘要
      const status = {
        originalBranch: originalBranch!,
        processBranch: processBranch!,
        backupBranch,
        hasBackupChanges,
        processCommits,
        startMarker: startCommit,
        useGit: true,
      };

      // 5. 构建 actionRequired
      const actionRequired: ActionRequired = {
        type: "dispatch_complete_choice",
        message: "派发任务完成，请选择合并策略和分支保留选项",
        data: {
          workspaceId,
          originalBranch: originalBranch!,
          backupBranch,
          hasBackupChanges,
          processCommits: processCommits.map(c => `${c.hash.substring(0, 7)} ${c.message}`),
          mergeOptions: [
            { value: "sequential", label: "按顺序合并", description: "保留每个任务的独立提交，线性历史" },
            { value: "squash", label: "squash 合并", description: "压缩为一个提交，最干净" },
            { value: "cherry-pick", label: "遴选到本地", description: "应用修改到工作区但不提交，可手动调整" },
            { value: "skip", label: "暂不合并", description: "保留分支，稍后手动处理" },
          ],
          branchOptions: {
            keepBackupBranch: { default: false, description: "保留备份分支（可用于查看历史）" },
            keepProcessBranch: { default: false, description: "保留派发分支（可用于对比）" },
          },
        },
      };

      return { actionRequired, status };
    } else {
      // 无 Git 模式：返回简化的 actionRequired（仅需确认）
      const status = {
        backupBranch: null,
        hasBackupChanges: false,
        useGit: false,
      };

      const actionRequired: ActionRequired = {
        type: "dispatch_complete_choice",
        message: "派发任务完成（无 Git 模式），确认关闭？",
        data: {
          workspaceId,
          useGit: false,
        },
      };

      return { actionRequired, status };
    }
  }

  /**
   * 执行用户选择的禁用操作
   */
  async executeDisableChoice(
    projectRoot: string,
    params: ExecuteDisableParams
  ): Promise<{ success: boolean; message: string }> {
    const { workspaceId, mergeStrategy, keepBackupBranch, keepProcessBranch, commitMessage } = params;

    // 1. 读取配置
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    if (!config.dispatch?.enabled) {
      return { success: true, message: "派发模式已禁用" };
    }

    const useGit = config.dispatch.useGit;
    let resultMessage = "";

    if (useGit) {
      // Git 模式：检测 Git 环境
      const isGit = await isGitRepo(projectRoot);
      if (!isGit) {
        // Git 环境已丢失，只能清理配置
        resultMessage = "⚠️ Git 环境已丢失，已清理派发配置（无法执行 git 操作）";
      } else {
        // Git 环境正常，执行合并策略
        const { originalBranch, processBranch, backupBranches } = config.dispatch;
        const startCommit = await this.getOriginalBranchCommit(originalBranch!, projectRoot);

        // 2. 根据策略执行合并
        switch (mergeStrategy) {
          case "sequential":
            await rebaseMergeProcessBranch(workspaceId, originalBranch!, projectRoot);
            resultMessage = "已按顺序合并所有提交";
            break;

          case "squash":
            const msg = commitMessage || `tanmi: 完成工作区 ${workspaceId} 派发任务`;
            await squashMergeProcessBranch(workspaceId, originalBranch!, msg, projectRoot);
            resultMessage = "已 squash 合并为一个提交";
            break;

          case "cherry-pick":
            await cherryPickToWorkingTree(workspaceId, originalBranch!, startCommit, projectRoot);
            resultMessage = "已将修改应用到工作区（未提交），请手动调整后提交";
            break;

          case "skip":
            await checkoutBranch(originalBranch!, projectRoot);
            resultMessage = "已切回原分支，派发分支保留";
            break;
        }

        // 3. 清理分支（根据用户选择）
        if (!keepProcessBranch && mergeStrategy !== "skip") {
          await deleteProcessBranch(workspaceId, projectRoot);
        }
        if (!keepBackupBranch && backupBranches?.length) {
          await deleteBackupBranch(workspaceId, undefined, projectRoot);
        }
      }
    } else {
      // 无 Git 模式：仅清理配置，跳过 git 操作
      resultMessage = "派发模式已关闭（无 Git 模式）";
    }

    // 4. 更新配置
    config.dispatch = undefined;
    config.updatedAt = now();
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 5. 记录日志
    await this.md.appendLog(projectRoot, workspaceId, {
      time: now(),
      operator: "system",
      event: `派发模式已禁用: ${resultMessage}`,
    });

    return { success: true, message: resultMessage };
  }

  /**
   * 获取原分支的起始 commit（用于确定派发提交范围）
   */
  private async getOriginalBranchCommit(
    originalBranch: string,
    projectRoot: string
  ): Promise<string> {
    // 获取原分支的 HEAD commit
    const { stdout } = await import("child_process").then(cp =>
      import("util").then(util =>
        util.promisify(cp.exec)(`git rev-parse "${originalBranch}"`, { cwd: projectRoot })
      )
    );
    return stdout.trim();
  }

  /**
   * 禁用派发模式（兼容旧接口，直接合并）
   * @deprecated 使用 queryDisableDispatch + executeDisableChoice 代替
   */
  async disableDispatch(
    workspaceId: string,
    projectRoot: string,
    merge: boolean = false
  ): Promise<{ success: boolean }> {
    if (merge) {
      return this.executeDisableChoice(projectRoot, {
        workspaceId,
        mergeStrategy: "squash",
        keepBackupBranch: false,
        keepProcessBranch: false,
      });
    } else {
      return this.executeDisableChoice(projectRoot, {
        workspaceId,
        mergeStrategy: "skip",
        keepBackupBranch: false,
        keepProcessBranch: false,
      });
    }
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

    // 1.1 验证 Git 环境（11.2 环境变化检测）
    await this.validateGitEnvironment(workspaceId, projectRoot, config);

    const useGit = config.dispatch.useGit;

    // 2. 验证节点状态
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const node = graph.nodes[nodeId];
    if (!node) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 ${nodeId} 不存在`);
    }
    if (node.type !== "execution") {
      throw new TanmiError("INVALID_NODE_TYPE", "只有执行节点可以派发");
    }
    // 支持 pending 和 implementing 状态的节点派发
    if (node.status !== "pending" && node.status !== "implementing") {
      throw new TanmiError(
        "INVALID_NODE_STATUS",
        `节点状态必须为 pending 或 implementing，当前为 ${node.status}`
      );
    }

    // 如果是 pending 状态，自动转为 implementing
    const needsTransition = node.status === "pending";
    if (needsTransition) {
      node.status = "implementing";
    }

    // 3. 记录 startMarker
    let startMarker: string;
    if (useGit) {
      // Git 模式：确保在派发分支上，记录 commit hash
      if (!(await isOnProcessBranch(workspaceId, projectRoot))) {
        await checkoutProcessBranch(workspaceId, projectRoot);
      }
      startMarker = await getCurrentCommit(projectRoot);
    } else {
      // 无 Git 模式：使用时间戳
      startMarker = Date.now().toString();
    }

    // 4. 更新节点派发状态
    node.dispatch = {
      startMarker,
      status: "executing",
    };
    node.updatedAt = now();
    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 5. 读取节点信息构建 prompt
    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId);
    const timeout = config.dispatch.limits?.timeoutMs ?? 300000;

    // 6. 构建 actionRequired
    const actionRequired: ActionRequired = {
      type: "dispatch_task",
      message: "请使用 Task tool 派发此节点任务",
      data: {
        workspaceId,
        nodeId,
        subagentType: "tanmi-executor",
        prompt: this.buildExecutorPrompt(workspaceId, nodeId, nodeInfo.title),
        timeout,
      },
    };

    return {
      success: true,
      startMarker,
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

    // 1.1 验证 Git 环境（11.2 环境变化检测）
    await this.validateGitEnvironment(workspaceId, projectRoot, config);

    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const node = graph.nodes[nodeId];

    if (!node) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 ${nodeId} 不存在`);
    }

    const useGit = config.dispatch?.useGit ?? false;
    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId);

    if (success) {
      // 2a. 执行成功：记录 endMarker
      let endMarker: string;
      if (useGit) {
        // Git 模式：提交更改，记录 commit hash
        endMarker = await commitDispatch(nodeId, nodeInfo.title, projectRoot);
      } else {
        // 无 Git 模式：记录时间戳
        endMarker = Date.now().toString();
      }

      // 更新节点派发状态
      if (node.dispatch) {
        node.dispatch.endMarker = endMarker;
        node.dispatch.status = "testing";
      }
      node.updatedAt = now();
      await this.json.writeGraph(projectRoot, workspaceId, graph);

      // 记录日志
      const markerInfo = useGit ? `commit: ${endMarker.substring(0, 7)}` : `timestamp: ${endMarker}`;
      await this.md.appendLog(projectRoot, workspaceId, {
        time: now(),
        operator: "tanmi-executor",
        event: `节点 ${nodeId} 执行完成，${markerInfo}`,
      }, nodeId);

      // 返回下一步：返回父节点（测试节点现在作为兄弟节点存在，由父节点管理）
      return {
        success: true,
        endMarker,
        nextAction: "return_parent",
        hint: "执行完成，返回父节点继续处理（如有测试节点，父节点会安排执行）",
      };
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
   * 注：在新的附属化设计中，测试节点和执行节点是兄弟关系，由父管理节点统一管理。
   * 此方法简化为记录测试结果，不再操作关联的执行节点。
   */
  async handleTestResult(
    workspaceId: string,
    projectRoot: string,
    testNodeId: string,
    passed: boolean,
    _conclusion?: string
  ): Promise<{ success: boolean; hint?: string }> {
    // 1. 读取配置和测试节点
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);

    // 1.1 验证 Git 环境（11.2 环境变化检测）
    await this.validateGitEnvironment(workspaceId, projectRoot, config);

    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const testNode = graph.nodes[testNodeId];

    if (!testNode) {
      throw new TanmiError("INVALID_TEST_NODE", "无效的测试节点");
    }

    if (passed) {
      // 测试通过：记录日志
      await this.md.appendLog(projectRoot, workspaceId, {
        time: now(),
        operator: "tanmi-tester",
        event: `测试节点 ${testNodeId} 验证通过`,
      }, testNodeId);

      return {
        success: true,
        hint: "测试通过，返回父节点继续处理",
      };
    } else {
      // 测试失败：记录日志
      await this.md.appendLog(projectRoot, workspaceId, {
        time: now(),
        operator: "tanmi-tester",
        event: `测试节点 ${testNodeId} 验证失败`,
      }, testNodeId);

      return {
        success: false,
        hint: "测试失败，返回父节点决策",
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
    // 读取配置，检查是否使用 Git 模式
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    const useGit = config.dispatch?.useGit ?? false;

    if (!useGit) {
      // 无 Git 模式：返回 null
      return null;
    }

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
    // 读取配置，检查是否使用 Git 模式
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    const useGit = config.dispatch?.useGit ?? false;

    if (!useGit) {
      // 无 Git 模式：直接返回成功
      return { success: true, deleted: [] };
    }

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
   * 检测 Git 环境是否仍然可用（11.2 环境变化检测）
   * 如果配置要求 Git 模式但 .git 目录消失，抛出警告
   */
  private async validateGitEnvironment(
    workspaceId: string,
    projectRoot: string,
    config: WorkspaceConfig
  ): Promise<void> {
    if (config.dispatch?.enabled && config.dispatch.useGit) {
      const isGit = await isGitRepo(projectRoot);
      if (!isGit) {
        throw new TanmiError(
          "GIT_ENVIRONMENT_LOST",
          `⚠️ 派发使用 Git 模式，但 .git 目录已消失。建议执行 dispatch_disable 清理派发状态。`
        );
      }
    }
  }

  /**
   * 检测活跃的派发工作区及其模式（用于混合模式检测）
   * 返回工作区 ID 和 useGit 模式
   */
  private async getActiveDispatchWorkspaceWithMode(
    projectRoot: string,
    excludeWorkspaceId?: string
  ): Promise<{ workspaceId: string; useGit: boolean } | null> {
    try {
      const { readdir } = await import("node:fs/promises");

      // 获取所有工作区配置文件
      const workspacesDir = this.fs.getWorkspaceRootPath(projectRoot);
      const entries = await readdir(workspacesDir, { withFileTypes: true });

      // 遍历所有工作区配置
      for (const entry of entries) {
        if (!entry.name.startsWith("ws-") || !entry.isDirectory()) {
          continue;
        }

        const workspaceId = entry.name;
        if (workspaceId === excludeWorkspaceId) {
          continue;
        }

        try {
          const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
          if (config.dispatch?.enabled) {
            return {
              workspaceId,
              useGit: config.dispatch.useGit ?? false,
            };
          }
        } catch {
          // 忽略读取失败的工作区
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 通过配置文件检测活跃的派发工作区（用于无 Git 模式）
   */
  private async getActiveDispatchWorkspaceByConfig(
    projectRoot: string,
    excludeWorkspaceId?: string
  ): Promise<string | null> {
    try {
      const { readdir } = await import("node:fs/promises");

      // 获取所有工作区配置文件
      const workspacesDir = this.fs.getWorkspaceRootPath(projectRoot);
      const entries = await readdir(workspacesDir, { withFileTypes: true });

      // 遍历所有工作区配置
      for (const entry of entries) {
        if (!entry.name.startsWith("ws-") || !entry.isDirectory()) {
          continue;
        }

        const workspaceId = entry.name;
        if (workspaceId === excludeWorkspaceId) {
          continue;
        }

        try {
          const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
          if (config.dispatch?.enabled) {
            return workspaceId;
          }
        } catch {
          // 忽略读取失败的工作区
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
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
5. On success: Call node_dispatch_complete(workspaceId="${workspaceId}", nodeId="${nodeId}", success=true, conclusion="...")
6. On failure: Call node_dispatch_complete(workspaceId="${workspaceId}", nodeId="${nodeId}", success=false, conclusion="...")

IMPORTANT: You MUST call node_dispatch_complete to finalize the dispatch. Do NOT use node_transition directly.`;
  }

  // ========== HTTP API 包装方法 ==========

  /**
   * 启用派发模式 (HTTP API 包装)
   */
  async enable(params: {
    workspaceId: string;
    useGit?: boolean;
  }): Promise<{ success: boolean; config: DispatchConfig; hint?: string }> {
    const projectRoot = await this.getProjectRoot(params.workspaceId);
    const result = await this.enableDispatch(params.workspaceId, projectRoot, {
      useGit: params.useGit,
    });

    const hint = result.config.useGit
      ? "⚠️ Git 模式（实验功能）已启用"
      : "派发模式已启用（无 Git）";

    return { ...result, hint };
  }

  /**
   * 查询禁用派发选项 (HTTP API 包装)
   */
  async queryDisable(params: {
    workspaceId: string;
  }): Promise<{ success: boolean; status?: any; hint?: string }> {
    const projectRoot = await this.getProjectRoot(params.workspaceId);
    const result = await this.queryDisableDispatch(params.workspaceId, projectRoot);

    if ("actionRequired" in result) {
      // 返回状态信息供前端显示
      return {
        success: true,
        status: result.status,
        hint: result.actionRequired.message,
      };
    }

    return result;
  }

  /**
   * 执行禁用派发 (HTTP API 包装)
   */
  async executeDisable(params: {
    workspaceId: string;
    mergeStrategy: "sequential" | "squash" | "cherry-pick" | "skip";
    keepBackupBranch?: boolean;
    keepProcessBranch?: boolean;
    commitMessage?: string;
  }): Promise<{ success: boolean; hint?: string }> {
    const projectRoot = await this.getProjectRoot(params.workspaceId);
    const result = await this.executeDisableChoice(projectRoot, {
      workspaceId: params.workspaceId,
      mergeStrategy: params.mergeStrategy,
      keepBackupBranch: params.keepBackupBranch ?? false,
      keepProcessBranch: params.keepProcessBranch ?? false,
      commitMessage: params.commitMessage,
    });

    return {
      success: result.success,
      hint: result.message,
    };
  }

  /**
   * 切换派发模式 (HTTP API 包装)
   * 仅支持在已启用派发模式时切换 useGit 值
   */
  async switchMode(params: {
    workspaceId: string;
    useGit: boolean;
  }): Promise<{ success: boolean; hint?: string }> {
    const projectRoot = await this.getProjectRoot(params.workspaceId);

    // 1. 读取当前配置
    const config = await this.json.readWorkspaceConfig(projectRoot, params.workspaceId);

    if (!config.dispatch?.enabled) {
      throw new TanmiError("DISPATCH_NOT_ENABLED", "派发模式未启用，无法切换模式");
    }

    // 2. 检查是否有正在执行的派发任务
    const graph = await this.json.readGraph(projectRoot, params.workspaceId);
    const activeDispatchNodes: string[] = [];

    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if (node.dispatch && (node.dispatch.status === "executing" || node.dispatch.status === "testing")) {
        activeDispatchNodes.push(nodeId);
      }
    }

    if (activeDispatchNodes.length > 0) {
      throw new TanmiError(
        "DISPATCH_IN_PROGRESS",
        `无法切换模式：当前有 ${activeDispatchNodes.length} 个节点正在派发执行中 (${activeDispatchNodes.join(", ")})`
      );
    }

    // 3. 如果要切换到 Git 模式，检查 Git 环境
    if (params.useGit && !(await isGitRepo(projectRoot))) {
      throw new TanmiError("GIT_NOT_FOUND", "当前项目不是 git 仓库，无法切换到 Git 模式");
    }

    // 4. 更新配置
    const oldMode = config.dispatch.useGit;
    config.dispatch.useGit = params.useGit;
    config.updatedAt = now();
    await this.json.writeWorkspaceConfig(projectRoot, params.workspaceId, config);

    // 5. 记录日志
    const fromMode = oldMode ? "Git 模式" : "无 Git 模式";
    const toMode = params.useGit ? "Git 模式" : "无 Git 模式";
    await this.md.appendLog(projectRoot, params.workspaceId, {
      time: now(),
      operator: "system",
      event: `派发模式已切换: ${fromMode} → ${toMode}`,
    });

    return {
      success: true,
      hint: `派发模式已从 ${fromMode} 切换到 ${toMode}`,
    };
  }

  /**
   * 获取工作区的项目根目录
   */
  private async getProjectRoot(workspaceId: string): Promise<string> {
    const index = await this.json.readIndex();
    const workspace = index.workspaces.find((w) => w.id === workspaceId);
    if (!workspace) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区不存在: ${workspaceId}`);
    }
    return workspace.projectRoot;
  }
}
