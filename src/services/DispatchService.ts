// src/services/DispatchService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  WorkspaceConfig,
  DispatchConfig,
  ActionRequired,
} from "../types/workspace.js";
import type { NodeMeta, NodeDispatchStatus, AcceptanceCriteria, NodeInfoData } from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { now } from "../utils/time.js";
import { generateNodeId, generateNodeDirName } from "../utils/id.js";
import type { ConfigService } from "./ConfigService.js";
import { eventService } from "./EventService.js";
import {
  isGitRepo,
  ensureGitExclude,
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
 * 节点完整性检查结果
 */
export interface NodeReadinessCheck {
  ready: boolean;                     // 是否可以派发
  errors: string[];                   // 阻止派发的错误
  warnings: string[];                 // 警告（不阻止派发）
}

/**
 * 派发准备结果
 * @deprecated 使用 DispatchUpgradeResult 代替
 */
export interface DispatchPrepareResult {
  success: boolean;
  startMarker: string;  // Git 模式=commit hash，无 Git 模式=时间戳
  actionRequired: ActionRequired;
  readinessWarnings?: string[];       // 完整性检查警告
}

/**
 * 派发升级结果
 */
export interface DispatchUpgradeResult {
  success: boolean;
  upgraded: boolean;      // 是否升级成功
  skipReason?: string;    // 如果未升级，原因
  actionRequired?: ActionRequired;
}

/**
 * 派发完成结果
 * 简化版：不再返回 nextAction/testNodeId，由母节点通过 context_get 读取子节点状态决定下一步
 */
export interface DispatchCompleteResult {
  success: boolean;
  endMarker?: string;  // Git 模式=commit hash，无 Git 模式=时间戳
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
 * 派发子节点创建结果
 */
export interface DispatchCreateResult {
  execId: string;
  specId: string;
  qualityId?: string;
  actionRequired: ActionRequired;  // 派发 exec 的指令
}

// 前置声明 NodeService 类型（避免循环导入）
import type { NodeService } from "./NodeService.js";

/**
 * 派发服务
 * 处理派发功能的核心业务逻辑
 */
export class DispatchService {
  private nodeService?: NodeService;

  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter,
    private configService?: ConfigService
  ) {}

  /**
   * 设置 NodeService 依赖（用于自动创建 Review 节点）
   */
  setNodeService(nodeService: NodeService): void {
    this.nodeService = nodeService;
  }

  /**
   * 启用派发模式
   */
  async enableDispatch(
    workspaceId: string,
    projectRoot: string,
    options?: { useGit?: boolean }
  ): Promise<{ success: boolean; config: DispatchConfig }> {
    // 获取工作区目录名
    const location = await this.json.getWorkspaceLocation(workspaceId);
    const dirName = location?.dirName || workspaceId;

    // 0. 检查是否已启用（11.1 模式不可变）
    const existingConfig = await this.json.readWorkspaceConfig(projectRoot, dirName);
    if (existingConfig.dispatch?.enabled) {
      throw new TanmiError(
        "DISPATCH_ALREADY_ENABLED",
        "派发模式已启用。如需切换模式，请先执行 dispatch_disable，再重新 enable"
      );
    }

    // 1. 检测是否 git 仓库
    const isGit = await isGitRepo(projectRoot);

    // 1.1 确保工作区目录被 git 排除（无论是否使用 Git 模式）
    if (isGit) {
      await ensureGitExclude(projectRoot);
    }

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

    // 3. 检查派发并发冲突
    // - 无 Git 模式：不涉及分支切换，多个工作区互不影响，不限制
    // - 有 Git 模式：会切换分支，同一 git 仓库内只允许一个派发
    if (useGit) {
      const activeWorkspaceInfo = await this.getActiveDispatchWorkspaceWithMode(projectRoot, workspaceId);
      // 只有当已有工作区也是 Git 模式时才冲突
      if (activeWorkspaceInfo?.useGit) {
        throw new TanmiError(
          "DISPATCH_CONFLICT",
          `已有工作区 ${activeWorkspaceInfo.workspaceId} 正在使用 Git 模式派发，请先完成或取消该派发`
        );
      }
    }
    // 无 Git 模式不检查冲突，直接允许

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
    const config = await this.json.readWorkspaceConfig(projectRoot, dirName);
    config.dispatch = dispatchConfig;
    config.updatedAt = now();
    await this.json.writeWorkspaceConfig(projectRoot, dirName, config);

    // 7. 记录日志
    const mode = useGit ? "Git 模式" : "无 Git 模式";
    const detail = useGit ? `，派发分支: ${processBranch}` : "";
    await this.md.appendLog(projectRoot, dirName, {
      time: now(),
      operator: "system",
      event: `派发模式已启用（${mode}）${detail}`,
    });

    // 8. 发送事件通知
    eventService.emitDispatchUpdate(workspaceId, "");

    return { success: true, config: dispatchConfig };
  }

  /**
   * 查询禁用派发状态（返回 actionRequired 让用户选择）
   */
  async queryDisableDispatch(
    workspaceId: string,
    projectRoot: string
  ): Promise<DisableDispatchQueryResult | { success: boolean }> {
    // 获取工作区目录名
    const location = await this.json.getWorkspaceLocation(workspaceId);
    const dirName = location?.dirName || workspaceId;

    // 1. 读取配置
    const config = await this.json.readWorkspaceConfig(projectRoot, dirName);
    if (!config.dispatch?.enabled) {
      return { success: true }; // 已经禁用
    }

    // 1.1 检查是否有正在执行的派发任务
    // 只检查 executing 状态，passed/failed 表示已完成（保留 dispatch 对象供 WebUI 显示历史）
    const graph = await this.json.readGraph(projectRoot, dirName);
    const activeDispatchNodes: string[] = [];

    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if (node.dispatch && node.dispatch.status === "executing") {
        activeDispatchNodes.push(nodeId);
      }
    }

    if (activeDispatchNodes.length > 0) {
      throw new TanmiError(
        "DISPATCH_IN_PROGRESS",
        `无法关闭派发：当前有 ${activeDispatchNodes.length} 个节点正在派发执行中 (${activeDispatchNodes.join(", ")})`
      );
    }

    // 1.2 检查是否有可完成的 planning 节点（所有子节点都已完成）
    const completablePlanningNodes: string[] = [];
    const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if (node.type === "planning" && node.status === "monitoring") {
        // 检查所有子节点是否都已完成
        const allChildrenCompleted = node.children.every(childId => {
          const child = graph.nodes[childId];
          return child && terminalStatuses.has(child.status);
        });
        if (allChildrenCompleted && node.children.length > 0) {
          completablePlanningNodes.push(nodeId);
        }
      }
    }

    // 1.3 验证 Git 环境（11.2 环境变化检测）
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

      // 添加可完成 planning 节点的提醒
      if (completablePlanningNodes.length > 0) {
        actionRequired.message += `\n\n💡 **提醒**：以下 planning 节点的所有子任务已完成，请填写结论并完成：${completablePlanningNodes.join(", ")}`;
      }

      return { actionRequired, status };
    } else {
      // 无 Git 模式：返回简化的 actionRequired（仅需确认）
      const status = {
        backupBranch: null,
        hasBackupChanges: false,
        useGit: false,
      };

      let message = "派发任务完成（无 Git 模式），确认关闭？";

      // 添加可完成 planning 节点的提醒
      if (completablePlanningNodes.length > 0) {
        message += `\n\n💡 **提醒**：以下 planning 节点的所有子任务已完成，请填写结论并完成：${completablePlanningNodes.join(", ")}`;
      }

      const actionRequired: ActionRequired = {
        type: "dispatch_complete_choice",
        message,
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

    // 获取工作区目录名
    const location = await this.json.getWorkspaceLocation(workspaceId);
    const dirName = location?.dirName || workspaceId;

    // 1. 读取配置
    const config = await this.json.readWorkspaceConfig(projectRoot, dirName);
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
    await this.json.writeWorkspaceConfig(projectRoot, dirName, config);

    // 5. 记录日志
    await this.md.appendLog(projectRoot, dirName, {
      time: now(),
      operator: "system",
      event: `派发模式已禁用: ${resultMessage}`,
    });

    // 6. 发送事件通知
    eventService.emitDispatchUpdate(workspaceId, "");

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
   * 检查节点是否准备好派发
   * @param nodeInfo 节点信息
   * @param nodeMeta 节点元数据
   * @returns 完整性检查结果
   */
  checkNodeReadiness(
    nodeInfo: { title: string; requirement: string; acceptanceCriteria?: Array<{ when: string; then: string }> },
    nodeMeta: NodeMeta
  ): NodeReadinessCheck {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 必须检查：需求描述
    if (!nodeInfo.requirement || nodeInfo.requirement.trim() === "") {
      errors.push("节点缺少需求描述（requirement），无法派发");
    }

    // 建议检查：验收标准
    const criteria = nodeInfo.acceptanceCriteria || nodeMeta.acceptanceCriteria;
    if (!criteria || criteria.length === 0) {
      warnings.push("节点缺少验收标准（acceptanceCriteria），可能影响执行质量");
    }

    // 建议检查：重试场景下的失败历史
    if (nodeMeta.dispatch?.attempts && nodeMeta.dispatch.attempts.length > 0) {
      const lastAttempt = nodeMeta.dispatch.attempts[nodeMeta.dispatch.attempts.length - 1];
      if (lastAttempt.status === "failed" && !lastAttempt.failureReason) {
        warnings.push("上次执行失败但未记录失败原因，可能影响重试效果");
      }
    }

    return {
      ready: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 准备派发节点任务
   * @deprecated 使用 upgradeToDispatchParent 代替
   */
  async prepareDispatch(
    workspaceId: string,
    projectRoot: string,
    nodeId: string
  ): Promise<DispatchPrepareResult> {
    // 向后兼容：调用新方法
    const result = await this.upgradeToDispatchParent(workspaceId, projectRoot, nodeId);

    // 转换返回格式以保持向后兼容
    if (!result.upgraded) {
      throw new TanmiError("DISPATCH_SKIP", result.skipReason || "节点无需派发");
    }

    return {
      success: true,
      startMarker: "", // 新逻辑不再记录 startMarker
      actionRequired: result.actionRequired!,
    };
  }

  /**
   * 升级执行节点为派发母节点
   * 将 execution 节点升级为 planning 节点，并设置为派发母节点
   */
  async upgradeToDispatchParent(
    workspaceId: string,
    projectRoot: string,
    nodeId: string
  ): Promise<DispatchUpgradeResult> {
    // 获取工作区目录名
    const location = await this.json.getWorkspaceLocation(workspaceId);
    const wsDirName = location?.dirName || workspaceId;

    // 1. 验证派发模式已启用
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);
    if (!config.dispatch?.enabled) {
      throw new TanmiError("DISPATCH_NOT_ENABLED", "派发模式未启用");
    }

    // 1.1 验证 Git 环境（11.2 环境变化检测）
    await this.validateGitEnvironment(workspaceId, projectRoot, config);

    // 2. 验证节点类型
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    const node = graph.nodes[nodeId];
    if (!node) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 ${nodeId} 不存在`);
    }
    if (node.type !== "execution") {
      throw new TanmiError("INVALID_NODE_TYPE", "只有执行节点可以升级为派发母节点");
    }

    // 2.1 验证节点不是派发子节点
    const dispatchChildRoles = ["dispatch_exec", "dispatch_spec", "dispatch_quality"];
    if (node.role && dispatchChildRoles.includes(node.role)) {
      throw new TanmiError("INVALID_NODE_ROLE", `派发子节点（${node.role}）不能再升级为派发母节点`);
    }

    // 3. 检查上级节点角色
    if (node.parentId && node.parentId !== "root") {
      const parent = graph.nodes[node.parentId];
      if (parent?.role === "info_collection" || parent?.role === "info_summary") {
        return {
          success: true,
          upgraded: false,
          skipReason: "上级是信息节点，可直接执行，无需派发",
        };
      }
    }

    // 4. 升级节点类型为 planning
    node.type = "planning";

    // 5. 初始化派发母节点标识（children 由 dispatch_create 填充）
    // 注意：不设置 node.dispatch，母节点使用 dispatchParent 字段

    // 6. 状态改为 monitoring
    node.status = "monitoring";
    node.updatedAt = now();

    // 保存更新
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 7. 记录日志
    await this.md.appendLog(projectRoot, wsDirName, {
      time: now(),
      operator: "system",
      event: `节点 ${nodeId} 已升级为派发母节点`,
    }, nodeId);

    // 8. 发送事件通知
    eventService.emitDispatchUpdate(workspaceId, nodeId);

    // 9. 返回 actionRequired
    const actionRequired: ActionRequired = {
      type: "invoke_skill",
      message: `## ⚠️ MUST: 调用 Skill(dispatching-parent)

**你 MUST 立即调用 Skill(dispatching-parent)**，否则派发流程会失败。

\`\`\`
Skill(skill: "dispatching-parent")
\`\`\`

**如果 Skill 不可用**，使用 plugin_path 获取路径后 Read：
\`\`\`
plugin_path(type: "skill", name: "dispatching-parent") → 获取路径
Read(file_path: <返回的路径>/SKILL.md)
\`\`\`

### 为什么必须调用？

1. Skill 包含完整的派发流程（exec → spec → quality → 完成）
2. 跳过 Skill 会导致：
   - 忘记派发 spec 审查节点
   - 聚焦点不正确
   - 日志不完整
   - 节点状态不一致

### NEVER 直接调用 dispatch_create

**错误做法**：直接调用 dispatch_create
**正确做法**：先调用 Skill(dispatching-parent) 获取完整流程指导

你现在是**协调者**，NEVER 直接执行任务。`,
      data: {
        skill: "dispatching-parent",
        workspaceId,
        nodeId,
      },
    };

    return {
      success: true,
      upgraded: true,
      actionRequired,
    };
  }

  /**
   * 处理派发完成
   * 简化版：不再自动创建 Review 节点，由 dispatch_create 统一创建子节点
   */
  async completeDispatch(
    workspaceId: string,
    projectRoot: string,
    nodeId: string,
    success: boolean,
    conclusion?: string
  ): Promise<DispatchCompleteResult> {
    // 获取工作区目录名
    const location = await this.json.getWorkspaceLocation(workspaceId);
    const wsDirName = location?.dirName || workspaceId;

    // 1. 读取配置和节点
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);

    // 1.1 验证 Git 环境（11.2 环境变化检测）
    await this.validateGitEnvironment(workspaceId, projectRoot, config);

    const graph = await this.json.readGraph(projectRoot, wsDirName);
    const node = graph.nodes[nodeId];

    if (!node) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 ${nodeId} 不存在`);
    }

    // 验证节点有派发信息
    if (!node.dispatch) {
      throw new TanmiError("INVALID_NODE_STATUS", "节点没有派发信息，无法完成派发");
    }

    // 验证节点已经开始执行（必须先调用 node_transition(action="start")）
    if (node.dispatch.status !== "executing") {
      throw new TanmiError(
        "INVALID_DISPATCH_STATUS",
        `节点派发状态为 ${node.dispatch.status}，必须先调用 node_transition(action="start") 开始执行后才能完成。`
      );
    }

    // 验证节点状态正确
    if (node.status !== "implementing") {
      throw new TanmiError(
        "INVALID_NODE_STATUS",
        `节点状态为 ${node.status}，预期为 implementing。请确保已正确调用 node_transition(action="start")。`
      );
    }

    const useGit = config.dispatch?.useGit ?? false;

    // 获取节点目录名（用于读取和更新 Markdown 文件）
    const nodeDirName = node.dirName || nodeId;
    const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName);

    // 2. 记录 endMarker
    let endMarker: string;
    if (useGit && success) {
      // Git 模式且成功：提交更改，记录 commit hash
      endMarker = await commitDispatch(nodeId, nodeInfo.title, projectRoot);
    } else {
      // 无 Git 模式或失败：记录时间戳（失败时由母节点决定是否 reset）
      endMarker = Date.now().toString();
    }

    // 3. 更新节点状态
    node.dispatch.endMarker = endMarker;
    node.dispatch.status = success ? "passed" : "failed";
    node.status = success ? "completed" : "failed";
    if (conclusion) {
      node.conclusion = conclusion.replace(/\\n/g, "\n");
    }
    node.updatedAt = now();

    // 4. 保存更改
    await this.json.writeGraph(projectRoot, wsDirName, graph);
    await this.md.updateNodeStatus(projectRoot, wsDirName, nodeDirName, success ? "completed" : "failed");
    if (conclusion) {
      await this.md.updateConclusion(projectRoot, wsDirName, nodeDirName, conclusion);
    }

    // 5. 记录日志
    const markerInfo = useGit && success ? `commit: ${endMarker.substring(0, 7)}` : `timestamp: ${endMarker}`;
    const statusText = success ? "完成" : "失败";
    await this.md.appendLog(projectRoot, wsDirName, {
      time: now(),
      operator: "tanmi-executor",
      event: `节点 ${nodeId} 派发执行${statusText}，${markerInfo}${conclusion ? `: ${conclusion.substring(0, 50)}...` : ""}`,
    }, nodeId);

    // 6. 发送事件通知
    eventService.emitDispatchUpdate(workspaceId, nodeId);

    // 7. 返回简单结果
    return {
      success,
      endMarker,
      hint: success ? "执行完成" : "执行失败",
    };
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
    // 获取工作区目录名
    const location = await this.json.getWorkspaceLocation(workspaceId);
    const wsDirName = location?.dirName || workspaceId;

    // 1. 读取配置和测试节点
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);

    // 1.1 验证 Git 环境（11.2 环境变化检测）
    await this.validateGitEnvironment(workspaceId, projectRoot, config);

    const graph = await this.json.readGraph(projectRoot, wsDirName);
    const testNode = graph.nodes[testNodeId];

    if (!testNode) {
      throw new TanmiError("INVALID_TEST_NODE", "无效的测试节点");
    }

    if (passed) {
      // 测试通过：记录日志
      await this.md.appendLog(projectRoot, wsDirName, {
        time: now(),
        operator: "tanmi-reviewer",
        event: `测试节点 ${testNodeId} 验证通过`,
      }, testNodeId);

      return {
        success: true,
        hint: "测试通过，返回父节点继续处理",
      };
    } else {
      // 测试失败：记录日志
      await this.md.appendLog(projectRoot, wsDirName, {
        time: now(),
        operator: "tanmi-reviewer",
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
    // 获取工作区目录名
    const location = await this.json.getWorkspaceLocation(workspaceId);
    const wsDirName = location?.dirName || workspaceId;

    // 读取配置，检查是否使用 Git 模式
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);
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
    // 获取工作区目录名
    const location = await this.json.getWorkspaceLocation(workspaceId);
    const wsDirName = location?.dirName || workspaceId;

    // 读取配置，检查是否使用 Git 模式
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);
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
      // 通过 index.json 获取所有工作区（支持新的可读目录名格式）
      const index = await this.json.readIndex();
      const workspacesInProject = index.workspaces.filter(ws =>
        ws.projectRoot === projectRoot && ws.status !== "archived"
      );

      // 遍历所有工作区配置
      for (const wsEntry of workspacesInProject) {
        if (wsEntry.id === excludeWorkspaceId) {
          continue;
        }

        try {
          const wsDirName = wsEntry.dirName || wsEntry.id;  // 向后兼容
          const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);
          if (config.dispatch?.enabled) {
            return {
              workspaceId: wsEntry.id,
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
      // 通过 index.json 获取所有工作区（支持新的可读目录名格式）
      const index = await this.json.readIndex();
      const workspacesInProject = index.workspaces.filter(ws =>
        ws.projectRoot === projectRoot && ws.status !== "archived"
      );

      // 遍历所有工作区配置
      for (const wsEntry of workspacesInProject) {
        if (wsEntry.id === excludeWorkspaceId) {
          continue;
        }

        try {
          const wsDirName = wsEntry.dirName || wsEntry.id;  // 向后兼容
          const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);
          if (config.dispatch?.enabled) {
            return wsEntry.id;
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
   * 构建执行者 prompt（增强版：包含完整任务上下文）
   */
  private buildExecutorPrompt(
    workspaceId: string,
    nodeId: string,
    nodeInfo: { title: string; requirement: string; acceptanceCriteria?: Array<{ when: string; then: string }> },
    nodeMeta: NodeMeta
  ): string {
    const sections: string[] = [];

    // 基础信息
    sections.push(`# Task Execution Context

**Workspace**: ${workspaceId}
**Node ID**: ${nodeId}
**Title**: ${nodeInfo.title}`);

    // 需求描述
    sections.push(`## Requirement

${nodeInfo.requirement}`);

    // 验收标准
    const criteria = nodeInfo.acceptanceCriteria || nodeMeta.acceptanceCriteria;
    if (criteria && criteria.length > 0) {
      const criteriaList = criteria
        .map((c, i) => `${i + 1}. **WHEN** ${c.when} **THEN** ${c.then}`)
        .join("\n");
      sections.push(`## Acceptance Criteria

${criteriaList}`);
    }

    // 重试上下文（如果有失败历史）
    if (nodeMeta.dispatch?.attempts && nodeMeta.dispatch.attempts.length > 0) {
      const failedAttempts = nodeMeta.dispatch.attempts.filter(a => a.status === "failed");
      if (failedAttempts.length > 0) {
        const lastFailed = failedAttempts[failedAttempts.length - 1];
        sections.push(`## Previous Failure Context

⚠️ This is retry attempt #${nodeMeta.dispatch.attempts.length + 1}

**Last failure reason**: ${lastFailed.failureReason || "Not specified"}
**Last conclusion**: ${lastFailed.conclusion || "Not available"}

Please address the issues from previous attempts.`);
      }
    }

    // 执行指令
    sections.push(`## Execution Instructions

### Step 0: Invoke Skill (REQUIRED FIRST)
\`\`\`
Skill(skill: "executing-task")
\`\`\`
This provides detailed SOP for task execution. If unavailable, use plugin_path to read SKILL.md.

### Step 1: Start the node
\`\`\`
node_transition(workspaceId="${workspaceId}", nodeId="${nodeId}", action="start")
\`\`\`

### Steps 2-5: Execute
1. **Assess** task scope and verify information completeness
2. **Execute** the task within defined boundaries (no scope expansion)
3. **Log** progress via log_append at key milestones
4. **Complete** with dispatch_complete when done

### On Success:
\`\`\`
dispatch_complete(workspaceId="${workspaceId}", nodeId="${nodeId}", success=true, conclusion="<summary of what was done>")
\`\`\`

### On Failure:
\`\`\`
dispatch_complete(workspaceId="${workspaceId}", nodeId="${nodeId}", success=false, conclusion="<reason for failure and suggestions>")
\`\`\`

**CRITICAL**:
- You MUST invoke Skill(executing-task) FIRST for detailed SOP
- You MUST call node_transition(start) to begin the task
- You MUST call dispatch_complete to finalize
**SCOPE CONTROL**: Execute only what is specified. If task is unclear or too large, FAIL with clear reason.`);

    return sections.join("\n\n");
  }

  /**
   * 构建 Reviewer prompt（用于 spec 和 quality 节点）
   */
  private buildReviewerPrompt(
    workspaceId: string,
    nodeId: string,
    targetNodeId: string,
    role: "dispatch_spec" | "dispatch_quality",
    nodeInfo: { title: string; requirement?: string; acceptanceCriteria?: Array<{ when: string; then: string }> }
  ): string {
    const sections: string[] = [];
    const isSpec = role === "dispatch_spec";
    const skillName = isSpec ? "reviewing-spec" : "reviewing-quality";
    const taskType = isSpec ? "Spec Review" : "Quality Review";

    // 基础信息
    sections.push(`# ${taskType} Task

**Workspace**: ${workspaceId}
**Node ID**: ${nodeId}
**Target Node**: ${targetNodeId}
**Role**: ${role}
**Title**: ${nodeInfo.title}`);

    // 验收标准（仅 spec review）
    if (isSpec && nodeInfo.acceptanceCriteria && nodeInfo.acceptanceCriteria.length > 0) {
      const criteriaList = nodeInfo.acceptanceCriteria
        .map((c, i) => `${i + 1}. **WHEN** ${c.when} **THEN** ${c.then}`)
        .join("\n");
      sections.push(`## Acceptance Criteria to Verify

${criteriaList}`);
    }

    // 审查指令
    sections.push(`## Review Instructions

### Step 0: Invoke Skill (REQUIRED FIRST)
\`\`\`
Skill(skill: "${skillName}")
\`\`\`
This provides detailed SOP for ${taskType.toLowerCase()}. If unavailable, use plugin_path to read SKILL.md.

### Step 1: Start the node
\`\`\`
node_transition(workspaceId="${workspaceId}", nodeId="${nodeId}", action="start")
\`\`\`

### Steps 2-4: Review
1. **Verify** ${isSpec ? "each acceptance criterion independently" : "code quality, maintainability, and best practices"}
2. **Log** each verification via log_append
3. **Complete** with dispatch_complete when done

### On Pass:
\`\`\`
dispatch_complete(workspaceId="${workspaceId}", nodeId="${nodeId}", success=true, conclusion="<审查通过：具体验证结果>")
\`\`\`

### On Fail:
\`\`\`
dispatch_complete(workspaceId="${workspaceId}", nodeId="${nodeId}", success=false, conclusion="<审查失败：具体问题列表>")
\`\`\`

**CRITICAL**:
- You MUST invoke Skill(${skillName}) FIRST for detailed SOP
- You MUST verify INDEPENDENTLY - do NOT trust executor's conclusion
- You MUST call dispatch_complete to finalize
${isSpec ? "- ANY criterion fails → entire review FAILS" : "- Report specific issues with evidence"}`);

    return sections.join("\n\n");
  }

  /**
   * 创建派发子节点（exec + spec + quality）
   * 在派发母节点下一次性创建所有派发子节点
   */
  async createDispatchChildren(
    workspaceId: string,
    projectRoot: string,
    parentId: string,
    exec: { requirement: string; acceptanceCriteria: AcceptanceCriteria[] },
    includeQuality: boolean = true
  ): Promise<DispatchCreateResult> {
    // 获取工作区目录名
    const location = await this.json.getWorkspaceLocation(workspaceId);
    const wsDirName = location?.dirName || workspaceId;

    // 1. 验证派发模式已启用
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);
    if (!config.dispatch?.enabled) {
      throw new TanmiError("DISPATCH_NOT_ENABLED", "派发模式未启用");
    }

    // 1.1 验证 Git 环境
    await this.validateGitEnvironment(workspaceId, projectRoot, config);

    // 2. 验证 parentId 是派发母节点
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    const parent = graph.nodes[parentId];
    if (!parent) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 ${parentId} 不存在`);
    }
    // 2.1 检查是否是派发母节点（通过 dispatch_node 升级后 status 为 monitoring）
    if (parent.status !== "monitoring" || parent.type !== "planning") {
      throw new TanmiError("INVALID_DISPATCH_PARENT", "parentId 必须是派发母节点（需先调用 dispatch_node 升级）");
    }

    // 2.2 检查是否已有子节点
    if (parent.dispatchParent?.children) {
      throw new TanmiError("DISPATCH_CHILDREN_EXIST", "派发子节点已存在，无法重复创建");
    }

    const useGit = config.dispatch.useGit ?? false;
    const currentTime = now();

    // 3. 生成简短的父节点标题（去掉可能的前缀）
    const parentNodeDirName = parent.dirName || parentId;
    const parentInfo = await this.md.readNodeInfo(projectRoot, wsDirName, parentNodeDirName);
    const shortTitle = parentInfo.title.replace(/^\[.*?\]\s*/, "").substring(0, 30);

    // 4. 准备节点数据（内存中）
    const execNodeId = generateNodeId();
    const execNodeDirName = generateNodeDirName(`[Exec] ${shortTitle}`, execNodeId);
    const execNode: NodeMeta = {
      id: execNodeId,
      dirName: execNodeDirName,
      type: "execution",
      parentId: parentId,
      children: [],
      status: "pending",
      isolate: false,
      references: [],
      conclusion: null,
      role: "dispatch_exec",
      acceptanceCriteria: exec.acceptanceCriteria,
      createdAt: currentTime,
      updatedAt: currentTime,
    };

    // 5. 自动生成 spec 节点
    const specNodeId = generateNodeId();
    const specNodeDirName = generateNodeDirName(`[Spec] ${shortTitle}`, specNodeId);
    const specAcceptanceCriteria = exec.acceptanceCriteria.map(c => ({
      when: `检查: ${c.when}`,
      then: `验证: ${c.then}`,
    }));
    const specNode: NodeMeta = {
      id: specNodeId,
      dirName: specNodeDirName,
      type: "execution",
      parentId: parentId,
      children: [],
      status: "pending",
      isolate: false,
      references: [],
      conclusion: null,
      role: "dispatch_spec",
      acceptanceCriteria: specAcceptanceCriteria,
      createdAt: currentTime,
      updatedAt: currentTime,
    };

    // 6. 可选创建 quality 节点
    let qualityNode: NodeMeta | null = null;
    let qualityNodeId: string | undefined;
    let qualityNodeDirName: string | undefined;
    if (includeQuality) {
      qualityNodeId = generateNodeId();
      qualityNodeDirName = generateNodeDirName(`[Quality] ${shortTitle}`, qualityNodeId);
      qualityNode = {
        id: qualityNodeId,
        dirName: qualityNodeDirName,
        type: "execution",
        parentId: parentId,
        children: [],
        status: "pending",
        isolate: false,
        references: [],
        conclusion: null,
        role: "dispatch_quality",
        createdAt: currentTime,
        updatedAt: currentTime,
      };
    }

    // 7. 事务性写入
    const createdDirs: string[] = [];
    try {
      // 7.1 创建节点目录和文件
      // Exec 节点
      const execNodePath = this.fs.getNodePath(projectRoot, wsDirName, execNodeDirName);
      await this.fs.mkdir(execNodePath);
      createdDirs.push(execNodePath);

      const execNodeInfo: NodeInfoData = {
        id: execNodeId,
        type: "execution",
        title: `[Exec] ${shortTitle}`,
        status: "pending",
        createdAt: currentTime,
        updatedAt: currentTime,
        requirement: exec.requirement.replace(/\\n/g, "\n"),
        docs: [],
        notes: "",
        conclusion: "",
        acceptanceCriteria: exec.acceptanceCriteria,
      };
      await this.md.writeNodeInfo(projectRoot, wsDirName, execNodeDirName, execNodeInfo);
      await this.md.createEmptyLog(projectRoot, wsDirName, execNodeDirName);
      await this.md.createEmptyProblem(projectRoot, wsDirName, execNodeDirName);

      // Spec 节点
      const specNodePath = this.fs.getNodePath(projectRoot, wsDirName, specNodeDirName);
      await this.fs.mkdir(specNodePath);
      createdDirs.push(specNodePath);

      const specNodeInfo: NodeInfoData = {
        id: specNodeId,
        type: "execution",
        title: `[Spec] ${shortTitle}`,
        status: "pending",
        createdAt: currentTime,
        updatedAt: currentTime,
        requirement: `验证执行节点实现是否符合需求规格。\n\n**被验证节点**: ${execNodeId}`,
        docs: [],
        notes: "",
        conclusion: "",
        acceptanceCriteria: specAcceptanceCriteria,
      };
      await this.md.writeNodeInfo(projectRoot, wsDirName, specNodeDirName, specNodeInfo);
      await this.md.createEmptyLog(projectRoot, wsDirName, specNodeDirName);
      await this.md.createEmptyProblem(projectRoot, wsDirName, specNodeDirName);

      // Quality 节点（可选）
      if (qualityNode && qualityNodeDirName) {
        const qualityNodePath = this.fs.getNodePath(projectRoot, wsDirName, qualityNodeDirName);
        await this.fs.mkdir(qualityNodePath);
        createdDirs.push(qualityNodePath);

        const qualityNodeInfo: NodeInfoData = {
          id: qualityNodeId!,
          type: "execution",
          title: `[Quality] ${shortTitle}`,
          status: "pending",
          createdAt: currentTime,
          updatedAt: currentTime,
          requirement: `检查执行节点的代码质量。\n\n**被检查节点**: ${execNodeId}\n\n**审查要点**:\n1. 代码可读性和可维护性\n2. 错误处理是否完善\n3. 是否遵循项目编码规范\n4. 是否存在潜在的性能问题\n5. 是否存在安全漏洞`,
          docs: [],
          notes: "",
          conclusion: "",
        };
        await this.md.writeNodeInfo(projectRoot, wsDirName, qualityNodeDirName, qualityNodeInfo);
        await this.md.createEmptyLog(projectRoot, wsDirName, qualityNodeDirName);
        await this.md.createEmptyProblem(projectRoot, wsDirName, qualityNodeDirName);
      }

      // 7.2 更新 graph.json（一次性写入所有节点）
      graph.nodes[execNodeId] = execNode;
      graph.nodes[specNodeId] = specNode;
      if (qualityNode) {
        graph.nodes[qualityNodeId!] = qualityNode;
      }
      parent.children.push(execNodeId, specNodeId);
      if (qualityNodeId) {
        parent.children.push(qualityNodeId);
      }
      parent.dispatchParent = {
        children: {
          execId: execNodeId,
          specId: specNodeId,
          qualityId: qualityNodeId,
        },
      };
      parent.updatedAt = currentTime;

      // 8. 设置派发信息（所有子节点初始为 pending，executor 调用 start 时变为 executing）
      execNode.dispatch = {
        status: "pending",
      };

      specNode.dispatch = {
        status: "pending",
      };

      if (qualityNode) {
        qualityNode.dispatch = {
          status: "pending",
        };
      }

      // 9. 自动聚焦到 exec 节点（下一个要执行的节点）
      graph.currentFocus = execNodeId;

      await this.json.writeGraph(projectRoot, wsDirName, graph);

    } catch (error) {
      // 回滚：删除已创建的目录
      for (const dir of createdDirs) {
        try {
          await this.fs.rmdir(dir);
        } catch {
          // 忽略删除错误
        }
      }
      throw error;
    }

    // 9. 记录日志
    const nodeList = includeQuality
      ? `exec=${execNodeId}, spec=${specNodeId}, quality=${qualityNodeId}`
      : `exec=${execNodeId}, spec=${specNodeId}`;
    await this.md.appendLog(projectRoot, wsDirName, {
      time: now(),
      operator: "system",
      event: `派发子节点已创建: ${nodeList}`,
    }, parentId);

    // 10. 发送事件通知
    eventService.emitDispatchUpdate(workspaceId, parentId);

    // 11. 构建所有节点的 prompt
    const execNodeMeta = graph.nodes[execNodeId];
    const execPrompt = this.buildExecutorPrompt(
      workspaceId,
      execNodeId,
      {
        title: `[Exec] ${shortTitle}`,
        requirement: exec.requirement,
        acceptanceCriteria: exec.acceptanceCriteria,
      },
      execNodeMeta
    );

    const specPrompt = this.buildReviewerPrompt(
      workspaceId,
      specNodeId,
      execNodeId,
      "dispatch_spec",
      {
        title: `[Spec] ${shortTitle}`,
        acceptanceCriteria: exec.acceptanceCriteria,
      }
    );

    const qualityPrompt = qualityNodeId
      ? this.buildReviewerPrompt(
          workspaceId,
          qualityNodeId,
          execNodeId,
          "dispatch_quality",
          { title: `[Quality] ${shortTitle}` }
        )
      : undefined;

    // 12. 返回结果
    return {
      execId: execNodeId,
      specId: specNodeId,
      qualityId: qualityNodeId,
      actionRequired: {
        type: "dispatch_task",
        message: `## ⚠️ MUST: 完成完整派发流程

### 你 MUST 按顺序完成以下步骤，NEVER 在中途停止

---

## 第1步：派发 exec 节点（立即执行）

\`\`\`
Task(
  subagent_type: "tanmi-executor",
  description: "执行派发任务",
  prompt: <下方 data.execPrompt 中的完整内容>
)
\`\`\`

---

## 第2步：exec 完成后，MUST 派发 spec 节点

**⚠️ NEVER 在 exec 完成后停止！**

\`\`\`
Task(
  subagent_type: "tanmi-reviewer",
  description: "规格审查",
  prompt: <下方 data.specPrompt 中的完整内容>
)
\`\`\`

spec 节点 ID: **${specNodeId}**

---

## 第3步：spec 通过后，派发 quality 节点（如有）

${qualityNodeId ? `\`\`\`
Task(
  subagent_type: "tanmi-reviewer",
  description: "质量审查",
  prompt: <下方 data.qualityPrompt 中的完整内容>
)
\`\`\`

quality 节点 ID: **${qualityNodeId}**` : "未创建 quality 节点，跳过此步"}

---

## 第4步：所有子节点完成后，完成母节点

\`\`\`
node_transition(workspaceId, nodeId="${parentId}", action="complete", conclusion="...")
\`\`\`

---

### Red Flags - 如果你在想这些，立即停止

- "exec 完成了，任务结束了" → NEVER，MUST 继续派发 spec
- "spec 应该会自动运行" → NEVER，你 MUST 手动派发
- "我直接完成母节点" → NEVER，MUST 等所有子节点完成`,
        data: {
          workspaceId,
          parentId,
          execId: execNodeId,
          specId: specNodeId,
          qualityId: qualityNodeId,
          execPrompt,
          specPrompt,
          qualityPrompt,
          timeout: config.dispatch.limits?.timeoutMs || 300000,
        },
      },
    };
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
    // 获取工作区位置信息
    const location = await this.json.getWorkspaceLocation(params.workspaceId);
    if (!location) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区不存在: ${params.workspaceId}`);
    }
    const { projectRoot, dirName: wsDirName } = location;

    // 1. 读取当前配置
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);

    if (!config.dispatch?.enabled) {
      throw new TanmiError("DISPATCH_NOT_ENABLED", "派发模式未启用，无法切换模式");
    }

    // 2. 检查是否有正在执行的派发任务
    // 只检查 executing 状态，passed/failed 表示已完成
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    const activeDispatchNodes: string[] = [];

    for (const [nodeId, node] of Object.entries(graph.nodes)) {
      if (node.dispatch && node.dispatch.status === "executing") {
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
    await this.json.writeWorkspaceConfig(projectRoot, wsDirName, config);

    // 5. 记录日志
    const fromMode = oldMode ? "Git 模式" : "无 Git 模式";
    const toMode = params.useGit ? "Git 模式" : "无 Git 模式";
    await this.md.appendLog(projectRoot, wsDirName, {
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
