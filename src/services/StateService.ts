// src/services/StateService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  NodeStatus,
  TransitionAction,
  NodeTransitionParams,
  NodeTransitionResult,
  NodeType,
  ExecutionStatus,
  PlanningStatus,
  ExecutionAction,
  PlanningAction,
  NodeMeta,
  NodeRole,
} from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { now, formatShort } from "../utils/time.js";
import type { DocRef } from "../types/workspace.js";

/**
 * 执行节点状态转换规则表
 */
const EXECUTION_TRANSITION_TABLE: Record<ExecutionStatus, Partial<Record<ExecutionAction, ExecutionStatus>>> = {
  pending: { start: "implementing" },
  implementing: { submit: "validating", complete: "completed", fail: "failed" },
  validating: { complete: "completed", fail: "failed" },
  failed: { retry: "implementing" },
  completed: { reopen: "implementing" },
};

/**
 * 规划节点状态转换规则表
 */
const PLANNING_TRANSITION_TABLE: Record<PlanningStatus, Partial<Record<PlanningAction, PlanningStatus>>> = {
  pending: { start: "planning" },
  planning: { complete: "completed", cancel: "cancelled" },
  monitoring: { complete: "completed", cancel: "cancelled" },
  completed: { reopen: "planning" },
  cancelled: { reopen: "planning" },
};

/**
 * 需要 conclusion 的动作
 */
const CONCLUSION_REQUIRED_ACTIONS: TransitionAction[] = ["complete", "fail", "cancel"];

/**
 * 状态服务
 * 处理节点状态转换
 */
export class StateService {
  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 根据 workspaceId 获取 projectRoot
   */
  private async resolveProjectRoot(workspaceId: string): Promise<string> {
    const projectRoot = await this.json.getProjectRoot(workspaceId);
    if (!projectRoot) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    return projectRoot;
  }

  /**
   * 执行状态转换
   */
  async transition(params: NodeTransitionParams): Promise<NodeTransitionResult> {
    const { workspaceId, nodeId, action, reason, conclusion } = params;

    // 1. 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    // 2. 验证节点存在并获取当前状态
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    const nodeMeta = graph.nodes[nodeId];
    const nodeType = nodeMeta.type;
    const currentStatus = nodeMeta.status;

    // 3. 根据节点类型验证转换合法性
    const newStatus = this.validateTransition(nodeType, currentStatus, action);
    if (!newStatus) {
      const suggestion = this.getTransitionSuggestion(nodeType, currentStatus, action);
      throw new TanmiError(
        "INVALID_TRANSITION",
        `非法状态转换: ${currentStatus} --[${action}]--> ? (不允许)。${suggestion}`
      );
    }

    // 4. 验证 conclusion 要求
    if (CONCLUSION_REQUIRED_ACTIONS.includes(action) && !conclusion) {
      throw new TanmiError(
        "CONCLUSION_REQUIRED",
        `${action} 动作必须提供 conclusion 参数`
      );
    }

    // 4.1 根节点 start 时检查信息收集节点状态（不阻止，但记录用于后续提醒）
    let infoCollectionWarning: string | null = null;
    if (nodeId === "root" && action === "start") {
      const infoCollectionCheck = this.checkInfoCollectionNode(graph.nodes, nodeMeta.children);
      if (!infoCollectionCheck.passed) {
        infoCollectionWarning = infoCollectionCheck.message;
      }
    }

    // 4.2 规划节点 complete 时验证子节点状态（所有子节点必须处于终态）
    if (nodeType === "planning" && action === "complete") {
      const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
      const childStatuses = nodeMeta.children.map(cid => graph.nodes[cid]?.status);
      const hasIncompleteChildren = childStatuses.some(
        s => s && !terminalStatuses.has(s)
      );
      if (hasIncompleteChildren) {
        throw new TanmiError(
          "INCOMPLETE_CHILDREN",
          "规划节点有未完成的子节点，无法直接完成。请先完成所有子节点（completed/failed/cancelled）。"
        );
      }
    }

    // 4.3 执行节点 start 时检查同级节点并发（一次只能有一个执行中的节点）
    if (nodeType === "execution" && action === "start" && nodeMeta.parentId) {
      const parentNode = graph.nodes[nodeMeta.parentId];
      if (parentNode) {
        const activeStatuses = new Set(["implementing", "validating"]);
        const activeSiblings = parentNode.children
          .filter(sibId => sibId !== nodeId)
          .map(sibId => graph.nodes[sibId])
          .filter(sib => sib && sib.type === "execution" && activeStatuses.has(sib.status));

        if (activeSiblings.length > 0) {
          const activeIds = activeSiblings.map(s => `${s.id}(${s.status})`).join(", ");
          throw new TanmiError(
            "CONCURRENT_EXECUTION",
            `同级节点 ${activeIds} 正在执行中。请先完成或暂停当前任务，再开始新任务。遵循"一次一个节点"原则。`
          );
        }
      }
    }

    const currentTime = now();
    const timestamp = formatShort(currentTime);

    // 5. 更新 graph.json 中的节点状态和 conclusion
    nodeMeta.status = newStatus;
    nodeMeta.updatedAt = currentTime;
    if (conclusion) {
      // 将字面量 \\n 转换为真正的换行符（MCP 工具调用时可能传入转义字符串）
      nodeMeta.conclusion = conclusion.replace(/\\n/g, "\n");
    }

    // 5.1 父节点状态级联（仅执行节点 start/reopen 时）
    const cascadeMessages: string[] = [];
    if (nodeType === "execution" && (action === "start" || action === "reopen")) {
      // 当执行节点开始时，确保父规划节点处于 monitoring 状态
      let parentId = nodeMeta.parentId;
      while (parentId && graph.nodes[parentId]) {
        const parent = graph.nodes[parentId];
        if (parent.type === "planning") {
          if (parent.status === "pending" || parent.status === "planning") {
            parent.status = "monitoring";
            parent.updatedAt = currentTime;
            cascadeMessages.push(`父节点 ${parentId}: ${parent.status} → monitoring`);
            await this.md.updateNodeStatus(projectRoot, workspaceId, parentId, "monitoring");
          } else if (parent.status === "completed" && action === "reopen") {
            parent.status = "monitoring";
            parent.updatedAt = currentTime;
            cascadeMessages.push(`父节点 ${parentId}: completed → monitoring (级联重开)`);
            await this.md.updateNodeStatus(projectRoot, workspaceId, parentId, "monitoring");
          } else if (parent.status === "cancelled" && action === "reopen") {
            parent.status = "monitoring";
            parent.updatedAt = currentTime;
            cascadeMessages.push(`父节点 ${parentId}: cancelled → monitoring (级联重开)`);
            await this.md.updateNodeStatus(projectRoot, workspaceId, parentId, "monitoring");
          }
        }
        parentId = parent.parentId;
      }
    }

    // 5.2 自动切换焦点到当前节点（start/reopen 时）
    if (action === "start" || action === "reopen") {
      graph.currentFocus = nodeId;
    }

    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 6. 更新 Info.md 的 frontmatter 和结论部分
    await this.md.updateNodeStatus(projectRoot, workspaceId, nodeId, newStatus);
    if (conclusion) {
      await this.md.updateConclusion(projectRoot, workspaceId, nodeId, conclusion);
    }

    // 7. 追加日志记录
    const logEvent = this.buildLogEvent(nodeType, action, currentStatus, newStatus, reason);
    await this.md.appendTypedLogEntry(projectRoot, workspaceId, {
      timestamp,
      operator: "AI",
      event: logEvent,
    }, nodeId);

    // 8. 如果是 complete/cancel，清空 Problem.md
    if (action === "complete" || action === "cancel") {
      await this.md.writeProblem(projectRoot, workspaceId, {
        currentProblem: "（暂无）",
        nextStep: "（暂无）",
      }, nodeId);
    }

    // 8.1 信息收集节点 complete 时自动归档规则和文档
    let archiveResult: { rules: string[]; docs: DocRef[] } | null = null;
    if (nodeMeta.role === "info_collection" && action === "complete" && conclusion) {
      archiveResult = await this.archiveInfoCollection(projectRoot, workspaceId, conclusion);
    }

    // 8.2 complete 时获取节点的文档引用（用于提醒更新）
    let nodeDocRefs: DocRef[] = [];
    if (action === "complete") {
      const nodeInfo = await this.md.readNodeInfoWithStatus(projectRoot, workspaceId, nodeId);
      nodeDocRefs = nodeInfo.docsWithStatus
        .filter(d => d.status === "active")
        .map(d => ({ path: d.path, description: d.description }));
    }

    // 9. 更新工作区配置的 updatedAt
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 10. 返回结果
    const result: NodeTransitionResult = {
      success: true,
      previousStatus: currentStatus,
      currentStatus: newStatus,
      conclusion: conclusion ?? null,
    };

    // 如果有级联更新，加入返回结果
    if (cascadeMessages.length > 0) {
      result.cascadeUpdates = cascadeMessages;
    }

    // 11. 添加工作流提示（根据节点类型）
    result.hint = this.generateHint(nodeType, action, nodeMeta, graph, archiveResult, infoCollectionWarning, nodeDocRefs);

    return result;
  }

  /**
   * 生成工作流提示
   */
  private generateHint(
    nodeType: NodeType,
    action: TransitionAction,
    nodeMeta: { parentId: string | null; children: string[]; conclusion?: string | null; role?: NodeRole; id?: string },
    graph: { nodes: Record<string, { status: NodeStatus; type: NodeType }> },
    archiveResult?: { rules: string[]; docs: DocRef[] } | null,
    infoCollectionWarning?: string | null,
    nodeDocRefs?: DocRef[]
  ): string {
    // 根节点 start 时如果缺少信息收集节点，优先显示强提醒
    if (infoCollectionWarning) {
      return `⚠️ **重要提醒**\n\n${infoCollectionWarning}\n\n` +
        "这是开始任务前的必要步骤，信息收集的结果会自动归档到工作区规则和文档中，帮助后续任务更好地执行。";
    }
    // 信息收集节点完成时，显示归档结果
    if (nodeMeta.role === "info_collection" && action === "complete" && archiveResult) {
      const parts: string[] = ["💡 信息收集已完成，已自动归档到工作区："];
      if (archiveResult.rules.length > 0) {
        parts.push(`- 新增 ${archiveResult.rules.length} 条规则`);
      }
      if (archiveResult.docs.length > 0) {
        parts.push(`- 新增 ${archiveResult.docs.length} 个文档引用`);
      }
      if (archiveResult.rules.length === 0 && archiveResult.docs.length === 0) {
        parts[0] = "💡 信息收集已完成。未在 conclusion 中发现需要归档的规则或文档。";
      }
      parts.push("建议返回根节点继续规划执行任务。");
      return parts.join("\n");
    }

    if (nodeType === "execution") {
      // 执行节点提示
      if (action === "start" || action === "retry") {
        return "💡 执行任务已开始。请使用 log_append 记录执行过程，完成后调用 complete，如遇问题调用 fail。";
      } else if (action === "reopen") {
        const oldConclusion = nodeMeta.conclusion;
        if (oldConclusion) {
          return `💡 执行任务已重开。旧结论：「${oldConclusion}」\n完成时请将新工作与旧结论合并。`;
        }
        return "💡 执行任务已开始。请使用 log_append 记录执行过程，完成后调用 complete，如遇问题调用 fail。";
      } else if (action === "complete") {
        const parentId = nodeMeta.parentId;
        let hint = "💡 执行任务已完成。";
        if (parentId && graph.nodes[parentId]) {
          hint = `💡 执行任务已完成。建议切换到父规划节点 ${parentId} 检查是否还有其他任务。`;
        }
        // 如果有文档引用，追加更新提醒
        if (nodeDocRefs && nodeDocRefs.length > 0) {
          hint += `\n\n📄 您在此任务中引用了 ${nodeDocRefs.length} 个文档，请确认是否需要同步更新：`;
          for (const doc of nodeDocRefs) {
            hint += `\n- ${doc.path}${doc.description ? ` (${doc.description})` : ""}`;
          }
        }
        return hint;
      } else if (action === "fail") {
        return "💡 执行任务已标记失败。请切换到父规划节点，根据失败原因决定：重新派发、修改需求后重试、或取消任务。";
      }
    } else {
      // 规划节点提示
      if (action === "start") {
        return "💡 进入规划状态。请分析需求，使用 node_create 创建执行节点或子规划节点。";
      } else if (action === "reopen") {
        const oldConclusion = nodeMeta.conclusion;
        if (oldConclusion) {
          return `💡 规划节点已重开。旧结论：「${oldConclusion}」\n完成时请将新工作与旧结论合并，确保结论完整反映所有已完成的工作。`;
        }
        return "💡 进入规划状态。请分析需求，使用 node_create 创建执行节点或子规划节点。";
      } else if (action === "complete") {
        const parentId = nodeMeta.parentId;
        let hint = "💡 规划节点已完成。工作区任务完成！";
        if (parentId && graph.nodes[parentId]) {
          hint = `💡 规划节点已完成汇总。建议切换到父节点 ${parentId} 继续。`;
        }
        // 如果有文档引用，追加更新提醒
        if (nodeDocRefs && nodeDocRefs.length > 0) {
          hint += `\n\n📄 您在此任务中引用了 ${nodeDocRefs.length} 个文档，请确认是否需要同步更新：`;
          for (const doc of nodeDocRefs) {
            hint += `\n- ${doc.path}${doc.description ? ` (${doc.description})` : ""}`;
          }
        }
        return hint;
      } else if (action === "cancel") {
        return "💡 规划节点已取消。如需重新规划请使用 reopen。";
      }
    }
    return "";
  }

  /**
   * 验证状态转换合法性
   */
  private validateTransition(
    nodeType: NodeType,
    currentStatus: NodeStatus,
    action: TransitionAction
  ): NodeStatus | null {
    if (nodeType === "execution") {
      return EXECUTION_TRANSITION_TABLE[currentStatus as ExecutionStatus]?.[action as ExecutionAction] ?? null;
    } else {
      return PLANNING_TRANSITION_TABLE[currentStatus as PlanningStatus]?.[action as PlanningAction] ?? null;
    }
  }

  /**
   * 生成状态转换错误的修复建议
   */
  private getTransitionSuggestion(
    nodeType: NodeType,
    currentStatus: NodeStatus,
    attemptedAction: TransitionAction
  ): string {
    if (nodeType === "execution") {
      // 执行节点错误建议
      if (currentStatus === "pending" && attemptedAction === "complete") {
        return "请先调用 node_transition(action=\"start\") 开始执行，再进行 complete";
      }
      if (currentStatus === "pending" && attemptedAction === "submit") {
        return "请先调用 node_transition(action=\"start\") 开始执行";
      }
      if (currentStatus === "completed" && attemptedAction === "complete") {
        return "节点已完成，无需重复完成";
      }
      if (currentStatus === "completed" && attemptedAction === "start") {
        return "节点已完成，如需重新执行请使用 node_transition(action=\"reopen\")";
      }
      if (currentStatus === "failed" && attemptedAction === "complete") {
        return "失败的节点无法直接完成，请先 retry 后重新执行";
      }
      if (currentStatus === "implementing" && attemptedAction === "start") {
        return "节点已在执行中，无需重复 start";
      }
      if (attemptedAction === "cancel") {
        return "执行节点不支持 cancel 动作，如需放弃请使用 fail";
      }

      const availableActions = Object.keys(EXECUTION_TRANSITION_TABLE[currentStatus as ExecutionStatus] || {});
      if (availableActions.length > 0) {
        return `执行节点当前状态 ${currentStatus} 可用的动作: ${availableActions.join(", ")}`;
      }
    } else {
      // 规划节点错误建议
      if (currentStatus === "pending" && attemptedAction === "complete") {
        return "请先调用 node_transition(action=\"start\") 进入规划状态";
      }
      if (currentStatus === "monitoring" && attemptedAction === "start") {
        return "节点已在监控子节点执行，如需重新规划请先 cancel 后 reopen";
      }
      if (currentStatus === "completed" && attemptedAction === "start") {
        return "节点已完成，如需重新规划请使用 node_transition(action=\"reopen\")";
      }
      if (currentStatus === "planning" && attemptedAction === "start") {
        return "节点已在规划中，无需重复 start";
      }
      if (attemptedAction === "fail") {
        return "规划节点不支持 fail 动作，如需放弃请使用 cancel";
      }
      if (attemptedAction === "submit") {
        return "规划节点不支持 submit 动作";
      }
      if (attemptedAction === "retry") {
        return "规划节点不支持 retry 动作，如需重新开始请使用 reopen";
      }

      const availableActions = Object.keys(PLANNING_TRANSITION_TABLE[currentStatus as PlanningStatus] || {});
      if (availableActions.length > 0) {
        return `规划节点当前状态 ${currentStatus} 可用的动作: ${availableActions.join(", ")}`;
      }
    }
    return `当前状态 ${currentStatus} 无可用转换`;
  }

  /**
   * 构建日志事件描述
   */
  private buildLogEvent(
    nodeType: NodeType,
    action: TransitionAction,
    from: NodeStatus,
    to: NodeStatus,
    reason?: string
  ): string {
    const executionDescriptions: Record<string, string> = {
      start: "开始执行",
      submit: "提交验证",
      complete: "完成执行",
      fail: "执行失败",
      retry: "重新执行",
      reopen: "重新激活",
    };

    const planningDescriptions: Record<string, string> = {
      start: "开始规划",
      complete: "完成汇总",
      cancel: "取消规划",
      reopen: "重新规划",
    };

    const descriptions = nodeType === "execution" ? executionDescriptions : planningDescriptions;
    let event = `${descriptions[action] || action}: ${from} → ${to}`;
    if (reason) {
      event += ` (${reason})`;
    }
    return event;
  }

  /**
   * 检查根节点是否有已完成的信息收集节点
   */
  private checkInfoCollectionNode(
    nodes: Record<string, NodeMeta>,
    childIds: string[]
  ): { passed: boolean; message: string } {
    // 查找信息收集节点
    const infoCollectionNodes = childIds
      .map(id => nodes[id])
      .filter(node => node?.role === "info_collection");

    if (infoCollectionNodes.length === 0) {
      return {
        passed: false,
        message: "根节点 start 前必须先创建信息收集节点（role: 'info_collection'）。\n" +
          "请先使用 node_create 创建一个 planning 类型、role 为 'info_collection' 的节点，" +
          "用于收集项目信息、环境配置、相关文档等，收集完成后信息会自动归档到工作区规则和文档中。",
      };
    }

    // 检查是否有已完成的信息收集节点
    const completedInfoCollection = infoCollectionNodes.find(
      node => node.status === "completed"
    );

    if (!completedInfoCollection) {
      const infoNode = infoCollectionNodes[0];
      return {
        passed: false,
        message: `信息收集节点 "${infoNode.id}" 尚未完成（当前状态: ${infoNode.status}）。\n` +
          "请先完成信息收集，系统会自动将收集的规则和文档归档到工作区，然后再开始根节点规划。",
      };
    }

    return { passed: true, message: "" };
  }

  /**
   * 归档信息收集节点的 conclusion 到工作区
   * 解析 ## 规则 和 ## 文档 部分
   */
  private async archiveInfoCollection(
    projectRoot: string,
    workspaceId: string,
    conclusion: string
  ): Promise<{ rules: string[]; docs: DocRef[] }> {
    const result: { rules: string[]; docs: DocRef[] } = { rules: [], docs: [] };

    // 解析 ## 规则 部分
    const rulesMatch = conclusion.match(/##\s*规则\s*\n([\s\S]*?)(?=\n##|\n*$)/i);
    if (rulesMatch) {
      const rulesSection = rulesMatch[1];
      // 解析列表项（支持 - 或 * 开头）
      const ruleLines = rulesSection.split("\n")
        .map(line => line.trim())
        .filter(line => line.match(/^[-*]\s+/))
        .map(line => line.replace(/^[-*]\s+/, "").trim())
        .filter(line => line.length > 0);
      result.rules = ruleLines;
    }

    // 解析 ## 文档 部分
    const docsMatch = conclusion.match(/##\s*文档\s*\n([\s\S]*?)(?=\n##|\n*$)/i);
    if (docsMatch) {
      const docsSection = docsMatch[1];
      // 解析列表项，格式：- path: description 或 - path（description 可选）
      const docLines = docsSection.split("\n")
        .map(line => line.trim())
        .filter(line => line.match(/^[-*]\s+/))
        .map(line => line.replace(/^[-*]\s+/, "").trim())
        .filter(line => line.length > 0);

      for (const line of docLines) {
        // 尝试匹配 "path: description" 格式
        const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
        if (colonMatch) {
          result.docs.push({
            path: colonMatch[1].trim(),
            description: colonMatch[2].trim(),
          });
        } else {
          // 没有描述，只有路径
          result.docs.push({
            path: line,
            description: "",
          });
        }
      }
    }

    // 如果有解析到内容，追加到工作区
    if (result.rules.length > 0 || result.docs.length > 0) {
      const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, workspaceId);

      // 追加规则（去重）
      const existingRules = new Set(workspaceMdData.rules);
      for (const rule of result.rules) {
        if (!existingRules.has(rule)) {
          workspaceMdData.rules.push(rule);
          existingRules.add(rule);
        }
      }

      // 追加文档（去重，按路径判断）
      const existingDocPaths = new Set(workspaceMdData.docs.map(d => d.path));
      for (const doc of result.docs) {
        if (!existingDocPaths.has(doc.path)) {
          workspaceMdData.docs.push(doc);
          existingDocPaths.add(doc.path);
        }
      }

      // 写回工作区
      await this.md.writeWorkspaceMd(projectRoot, workspaceId, workspaceMdData);
    }

    return result;
  }
}
