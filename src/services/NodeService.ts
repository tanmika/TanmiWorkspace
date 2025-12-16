// src/services/NodeService.ts

import * as crypto from "node:crypto";
import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  NodeCreateParams,
  NodeCreateResult,
  NodeGetParams,
  NodeGetResult,
  NodeListParams,
  NodeListResult,
  NodeDeleteParams,
  NodeDeleteResult,
  NodeUpdateParams,
  NodeUpdateResult,
  NodeMoveParams,
  NodeMoveResult,
  NodeMeta,
  NodeTreeItem,
  NodeInfoData,
  NodeType,
} from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { generateNodeId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { validateNodeTitle } from "../utils/validation.js";
import { devLog } from "../utils/devLog.js";

/**
 * 节点服务
 * 处理节点相关的业务逻辑
 */
export class NodeService {
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
   * 根据 workspaceId 获取工作区信息（包括归档状态）
   */
  private async resolveWorkspaceInfo(workspaceId: string): Promise<{ projectRoot: string; isArchived: boolean }> {
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      devLog.workspaceLookup(workspaceId, false);
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    const isArchived = wsEntry.status === "archived";
    devLog.workspaceLookup(workspaceId, true, wsEntry.status);
    if (isArchived) {
      devLog.archivePath(workspaceId, isArchived, this.fs.getWorkspaceBasePath(wsEntry.projectRoot, workspaceId, true));
    }
    return {
      projectRoot: wsEntry.projectRoot,
      isArchived,
    };
  }

  /**
   * 创建节点
   */
  async create(params: NodeCreateParams): Promise<NodeCreateResult> {
    const { workspaceId, parentId, type, title, requirement = "", docs = [], role } = params;

    // 1. 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    // 2. 验证父节点存在
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const parentMeta = graph.nodes[parentId];
    if (!parentMeta) {
      throw new TanmiError("PARENT_NOT_FOUND", `父节点 "${parentId}" 不存在`);
    }

    // 3. 验证父节点是规划节点（只有规划节点可以有子节点）
    if (parentMeta.type === "execution") {
      throw new TanmiError(
        "EXECUTION_CANNOT_HAVE_CHILDREN",
        "执行节点不能创建子节点，如需分解任务请 fail 后回到父规划节点处理"
      );
    }

    // 4. 如果父节点是 completed 状态，自动 reopen 到 planning
    let autoReopened = false;
    if (parentMeta.status === "completed") {
      parentMeta.status = "planning";
      parentMeta.updatedAt = now();
      // 清空结论（reopen 语义）
      const oldConclusion = parentMeta.conclusion;
      parentMeta.conclusion = null;
      autoReopened = true;
      // 同步更新 Info.md 中的状态
      await this.md.updateNodeStatus(projectRoot, workspaceId, parentId, "planning");
    }

    // 5. 验证父节点状态允许创建子节点（pending/planning/monitoring 状态）
    const allowedStatuses = new Set(["pending", "planning", "monitoring"]);
    if (!allowedStatuses.has(parentMeta.status)) {
      throw new TanmiError(
        "INVALID_PARENT_STATUS",
        `父节点状态 "${parentMeta.status}" 不允许创建子节点，需要处于 pending、planning 或 monitoring 状态`
      );
    }

    // 5.1 验证规则哈希（如果工作区有规则）
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, workspaceId);
    if (workspaceMdData.rules.length > 0) {
      const expectedHash = crypto.createHash("md5").update(workspaceMdData.rules.join("\n")).digest("hex").substring(0, 8);
      if (params.rulesHash !== expectedHash) {
        throw new TanmiError(
          "RULES_HASH_MISMATCH",
          `工作区有 ${workspaceMdData.rules.length} 条规则，请先通过 workspace_get 或 context_get 获取 rulesHash，并在创建节点时传入。\n规则内容：\n${workspaceMdData.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
        );
      }
    }

    // 6. 验证节点类型
    if (!type || (type !== "planning" && type !== "execution")) {
      throw new TanmiError(
        "INVALID_NODE_TYPE",
        `节点类型 "${type}" 无效，必须是 "planning" 或 "execution"`
      );
    }

    // 6. 验证标题合法性
    validateNodeTitle(title);

    // 7. 生成节点 ID
    const nodeId = generateNodeId();
    const currentTime = now();

    // 8. 创建节点目录
    const nodePath = this.fs.getNodePath(projectRoot, workspaceId, nodeId);
    await this.fs.mkdir(nodePath);

    // 9. 写入 Info.md
    // 将字面量 \\n 转换为真正的换行符（MCP 工具调用时可能传入转义字符串）
    const normalizedRequirement = requirement.replace(/\\n/g, "\n");
    const nodeInfo: NodeInfoData = {
      id: nodeId,
      type,
      title,
      status: "pending",
      createdAt: currentTime,
      updatedAt: currentTime,
      requirement: normalizedRequirement,
      docs,
      notes: "",
      conclusion: "",
    };
    await this.md.writeNodeInfo(projectRoot, workspaceId, nodeId, nodeInfo);

    // 10. 创建空的 Log.md 和 Problem.md
    await this.md.createEmptyLog(projectRoot, workspaceId, nodeId);
    await this.md.createEmptyProblem(projectRoot, workspaceId, nodeId);

    // 11. 更新 graph.json
    const newNode: NodeMeta = {
      id: nodeId,
      type,
      parentId,
      children: [],
      status: "pending",
      isolate: false,
      references: [],
      conclusion: null,
      role,  // 节点角色（可选）
      createdAt: currentTime,
      updatedAt: currentTime,
    };
    graph.nodes[nodeId] = newNode;
    graph.nodes[parentId].children.push(nodeId);
    graph.nodes[parentId].updatedAt = currentTime;

    // 12. 自动状态转换：如果父节点是 pending/planning，创建第一个子节点时转为 monitoring
    const isFirstChild = graph.nodes[parentId].children.length === 1;
    if (isFirstChild && (parentMeta.status === "pending" || parentMeta.status === "planning")) {
      graph.nodes[parentId].status = "monitoring";
      // 同步更新 Info.md 中的状态
      await this.md.updateNodeStatus(projectRoot, workspaceId, parentId, "monitoring");
    }

    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 12. 更新工作区 updatedAt
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 13. 同步更新索引中的 updatedAt
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (wsEntry) {
      wsEntry.updatedAt = currentTime;
      await this.json.writeIndex(index);
    }

    // 14. 追加日志
    const typeLabel = type === "planning" ? "规划" : "执行";
    await this.md.appendLog(projectRoot, workspaceId, {
      time: currentTime,
      operator: "system",
      event: `${typeLabel}节点 "${title}" (${nodeId}) 已创建`,
    });

    // 14. 生成提示
    const hasDispatchedDocs = docs.length > 0;
    let hint: string;
    if (type === "execution") {
      hint = hasDispatchedDocs
        ? "💡 执行节点已创建并派发了文档。下一步：调用 node_transition(action=\"start\") 开始执行。"
        : "💡 执行节点已创建。提醒：如需参考文档请用 node_reference 添加。下一步：调用 node_transition(action=\"start\") 开始执行。";
    } else {
      hint = hasDispatchedDocs
        ? "💡 规划节点已创建并派发了文档。下一步：调用 node_transition(action=\"start\") 进入规划状态，分析需求并创建子节点。"
        : "💡 规划节点已创建。下一步：调用 node_transition(action=\"start\") 进入规划状态。";
    }

    // 如果自动 reopen 了父节点，追加提示
    if (autoReopened) {
      hint = `⚠️ 父节点 ${parentId} 已自动从 completed 重开为 planning。` + hint;
    }

    // 14.1 如果工作区有规则，在 hint 末尾追加规则提醒
    if (workspaceMdData.rules.length > 0) {
      const rulesReminder = workspaceMdData.rules
        .map((r, i) => `  ${i + 1}. ${r}`)
        .join("\n");
      hint += `\n\n📋 工作区规则提醒：\n${rulesReminder}`;
    }

    // 14.2 如果在根节点下创建非信息收集的子节点，提示需要用户确认计划
    if (parentId === "root" && role !== "info_collection") {
      hint += `\n\n⚠️ **重要**：完成所有计划节点创建后，请向用户展示完整计划并等待确认，再开始执行第一个任务。`;
    }

    // 构建返回结果
    const result: NodeCreateResult = {
      nodeId,
      path: nodePath,
      autoReopened: autoReopened ? parentId : undefined,
      hint,
    };

    // 如果在根节点下创建非信息收集的子节点，添加 show_plan actionRequired
    if (parentId === "root" && role !== "info_collection") {
      result.actionRequired = {
        type: "show_plan",
        message: "已创建计划节点，请向用户展示当前计划并等待确认后再开始执行。",
        data: {
          nodeId,
          title,
          type,
        },
      };
    }

    return result;
  }

  /**
   * 获取节点详情
   */
  async get(params: NodeGetParams): Promise<NodeGetResult> {
    const { workspaceId, nodeId } = params;

    // 获取工作区信息（包括归档状态）
    const { projectRoot, isArchived } = await this.resolveWorkspaceInfo(workspaceId);

    // 验证节点存在
    const graph = await this.json.readGraph(projectRoot, workspaceId, isArchived);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    const meta = graph.nodes[nodeId];
    const infoMd = await this.md.readNodeInfoRaw(projectRoot, workspaceId, nodeId, isArchived);
    const logMd = await this.md.readLogRaw(projectRoot, workspaceId, nodeId, isArchived);
    const problemMd = await this.md.readProblemRaw(projectRoot, workspaceId, nodeId, isArchived);

    return {
      meta,
      infoMd,
      logMd,
      problemMd,
    };
  }

  /**
   * 获取节点树
   */
  async list(params: NodeListParams): Promise<NodeListResult> {
    const { workspaceId, rootId, depth } = params;

    // 获取工作区信息（包括归档状态）
    const { projectRoot, isArchived } = await this.resolveWorkspaceInfo(workspaceId);

    const graph = await this.json.readGraph(projectRoot, workspaceId, isArchived);
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId, isArchived);

    // 确定根节点
    const startId = rootId || config.rootNodeId;
    if (!graph.nodes[startId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${startId}" 不存在`);
    }

    // 构建树
    const tree = await this.buildNodeTree(projectRoot, workspaceId, graph, startId, 0, depth, isArchived);

    return { tree };
  }

  /**
   * 递归构建节点树
   */
  private async buildNodeTree(
    projectRoot: string,
    workspaceId: string,
    graph: { nodes: Record<string, NodeMeta> },
    nodeId: string,
    currentDepth: number,
    maxDepth?: number,
    isArchived: boolean = false
  ): Promise<NodeTreeItem> {
    const node = graph.nodes[nodeId];
    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId, isArchived);

    const item: NodeTreeItem = {
      id: nodeId,
      type: node.type,
      title: nodeInfo.title,
      status: node.status,
      role: node.role,
      children: [],
    };

    // 检查深度限制
    if (maxDepth !== undefined && currentDepth >= maxDepth) {
      return item;
    }

    // 递归处理子节点
    for (const childId of node.children) {
      const childTree = await this.buildNodeTree(
        projectRoot,
        workspaceId,
        graph,
        childId,
        currentDepth + 1,
        maxDepth,
        isArchived
      );
      item.children.push(childTree);
    }

    return item;
  }

  /**
   * 删除节点及子树
   */
  async delete(params: NodeDeleteParams): Promise<NodeDeleteResult> {
    const { workspaceId, nodeId } = params;

    // 1. 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);

    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    // 3. 检查是否为根节点
    if (nodeId === config.rootNodeId) {
      throw new TanmiError("CANNOT_DELETE_ROOT", "无法删除根节点");
    }

    // 4. 递归收集所有子节点 ID
    const deletedNodes = this.collectAllChildren(graph, nodeId);

    // 5. 删除所有节点目录
    for (const id of deletedNodes) {
      const nodePath = this.fs.getNodePath(projectRoot, workspaceId, id);
      await this.fs.rmdir(nodePath);
    }

    // 6. 更新 graph.json
    const currentTime = now();
    const parentId = graph.nodes[nodeId].parentId;

    // 从父节点的 children 中移除
    if (parentId && graph.nodes[parentId]) {
      graph.nodes[parentId].children = graph.nodes[parentId].children.filter(
        id => id !== nodeId
      );
      graph.nodes[parentId].updatedAt = currentTime;
    }

    // 移除所有被删除的节点
    for (const id of deletedNodes) {
      delete graph.nodes[id];
    }

    // 清理其他节点中对被删除节点的引用
    const deletedSet = new Set(deletedNodes);
    for (const otherNodeId of Object.keys(graph.nodes)) {
      const otherNode = graph.nodes[otherNodeId];
      if (otherNode.references.length > 0) {
        const originalLength = otherNode.references.length;
        otherNode.references = otherNode.references.filter(
          refId => !deletedSet.has(refId)
        );
        if (otherNode.references.length < originalLength) {
          otherNode.updatedAt = currentTime;
        }
      }
    }

    // 如果当前聚焦的节点被删除，重置聚焦
    if (graph.currentFocus && deletedNodes.includes(graph.currentFocus)) {
      graph.currentFocus = config.rootNodeId;
    }

    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 7. 更新工作区 updatedAt
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 8. 同步更新索引中的 updatedAt
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (wsEntry) {
      wsEntry.updatedAt = currentTime;
      await this.json.writeIndex(index);
    }

    // 9. 追加日志
    await this.md.appendLog(projectRoot, workspaceId, {
      time: currentTime,
      operator: "system",
      event: `节点 "${nodeId}" 及其 ${deletedNodes.length - 1} 个子节点已删除`,
    });

    return {
      success: true,
      deletedNodes,
    };
  }

  /**
   * 递归收集所有子节点 ID（包括自身）
   */
  private collectAllChildren(
    graph: { nodes: Record<string, NodeMeta> },
    nodeId: string
  ): string[] {
    const result: string[] = [nodeId];
    const node = graph.nodes[nodeId];

    if (node && node.children) {
      for (const childId of node.children) {
        result.push(...this.collectAllChildren(graph, childId));
      }
    }

    return result;
  }

  // ========== Phase 3: 节点更新 ==========

  /**
   * 更新节点
   */
  async update(params: NodeUpdateParams): Promise<NodeUpdateResult> {
    const { workspaceId, nodeId, title, requirement, note, conclusion } = params;

    // 1. 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    // 3. 如果提供了新标题，验证合法性
    if (title !== undefined) {
      validateNodeTitle(title);
    }

    const currentTime = now();

    // 4. 读取现有 Info.md
    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId);

    // 5. 更新指定字段
    const updates: string[] = [];
    if (title !== undefined && title !== nodeInfo.title) {
      nodeInfo.title = title;
      updates.push(`标题: "${title}"`);
    }
    if (requirement !== undefined && requirement !== nodeInfo.requirement) {
      nodeInfo.requirement = requirement;
      updates.push("需求描述");
    }
    if (note !== undefined && note !== nodeInfo.notes) {
      nodeInfo.notes = note;
      updates.push("备注");
    }
    if (conclusion !== undefined && conclusion !== nodeInfo.conclusion) {
      nodeInfo.conclusion = conclusion;
      updates.push("结论");
    }

    // 如果没有任何更新，直接返回
    if (updates.length === 0) {
      return {
        success: true,
        updatedAt: nodeInfo.updatedAt,
      };
    }

    // 6. 更新时间戳
    nodeInfo.updatedAt = currentTime;

    // 7. 写入 Info.md
    await this.md.writeNodeInfo(projectRoot, workspaceId, nodeId, nodeInfo);

    // 8. 更新 graph.json 的 updatedAt 和 conclusion
    graph.nodes[nodeId].updatedAt = currentTime;
    if (conclusion !== undefined) {
      graph.nodes[nodeId].conclusion = conclusion || null;
    }
    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 9. 追加日志
    await this.md.appendLog(projectRoot, workspaceId, {
      time: currentTime,
      operator: "AI",
      event: `更新节点: ${updates.join(", ")}`,
    }, nodeId);

    return {
      success: true,
      updatedAt: currentTime,
    };
  }

  /**
   * 移动节点到新的父节点
   */
  async move(params: NodeMoveParams): Promise<NodeMoveResult> {
    const { workspaceId, nodeId, newParentId } = params;

    // 1. 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    // 2. 读取图结构
    const graph = await this.json.readGraph(projectRoot, workspaceId);

    // 3. 验证节点存在
    const nodeMeta = graph.nodes[nodeId];
    if (!nodeMeta) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    // 4. 不能移动根节点
    if (nodeId === "root") {
      throw new TanmiError("INVALID_TRANSITION", "根节点无法移动");
    }

    // 5. 验证新父节点存在
    const newParentMeta = graph.nodes[newParentId];
    if (!newParentMeta) {
      throw new TanmiError("PARENT_NOT_FOUND", `目标父节点 "${newParentId}" 不存在`);
    }

    // 5.1 验证新父节点是规划节点（执行节点不能有子节点）
    if (newParentMeta.type === "execution") {
      throw new TanmiError(
        "EXECUTION_CANNOT_HAVE_CHILDREN",
        "执行节点不能有子节点，无法将节点移动到执行节点下"
      );
    }

    // 6. 防止循环依赖：不能把节点移到自己的子节点下
    const isDescendant = (ancestorId: string, descendantId: string): boolean => {
      const ancestor = graph.nodes[ancestorId];
      if (!ancestor) return false;
      for (const childId of ancestor.children) {
        if (childId === descendantId) return true;
        if (isDescendant(childId, descendantId)) return true;
      }
      return false;
    };

    if (isDescendant(nodeId, newParentId)) {
      throw new TanmiError("INVALID_TRANSITION", "不能将节点移动到其子节点下");
    }

    // 7. 如果已经在目标父节点下，无需移动
    const previousParentId = nodeMeta.parentId;
    if (previousParentId === newParentId) {
      return {
        success: true,
        previousParentId,
        newParentId,
      };
    }

    const currentTime = now();

    // 8. 从旧父节点的 children 中移除
    if (previousParentId && graph.nodes[previousParentId]) {
      graph.nodes[previousParentId].children = graph.nodes[previousParentId].children.filter(
        (id) => id !== nodeId
      );
      graph.nodes[previousParentId].updatedAt = currentTime;
    }

    // 9. 添加到新父节点的 children
    newParentMeta.children.push(nodeId);
    newParentMeta.updatedAt = currentTime;

    // 10. 更新节点的 parentId
    nodeMeta.parentId = newParentId;
    nodeMeta.updatedAt = currentTime;

    // 11. 保存图结构
    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 12. 读取节点 Info.md 获取标题用于日志
    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId);

    // 13. 记录日志
    await this.md.appendLog(projectRoot, workspaceId, {
      time: currentTime,
      operator: "AI",
      event: `移动节点 "${nodeInfo.title}" 到 ${newParentId === "root" ? "根节点" : newParentId}`,
    }, nodeId);

    return {
      success: true,
      previousParentId,
      newParentId,
    };
  }
}
