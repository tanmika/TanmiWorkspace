// src/services/NodeService.ts

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
  NodeSplitParams,
  NodeSplitResult,
  NodeUpdateParams,
  NodeUpdateResult,
  NodeMoveParams,
  NodeMoveResult,
  NodeMeta,
  NodeTreeItem,
  NodeInfoData,
} from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { generateNodeId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { validateNodeTitle } from "../utils/validation.js";

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
   * 创建节点
   */
  async create(params: NodeCreateParams): Promise<NodeCreateResult> {
    const { workspaceId, parentId, title, requirement = "", docs = [] } = params;

    // 1. 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    // 2. 验证父节点存在
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    if (!graph.nodes[parentId]) {
      throw new TanmiError("PARENT_NOT_FOUND", `父节点 "${parentId}" 不存在`);
    }

    // 3. 验证标题合法性
    validateNodeTitle(title);

    // 4. 生成节点 ID
    const nodeId = generateNodeId();
    const currentTime = now();

    // 5. 创建节点目录
    const nodePath = this.fs.getNodePath(projectRoot, workspaceId, nodeId);
    await this.fs.mkdir(nodePath);

    // 6. 写入 Info.md
    const nodeInfo: NodeInfoData = {
      id: nodeId,
      title,
      status: "pending",
      createdAt: currentTime,
      updatedAt: currentTime,
      requirement,
      docs,
      notes: "",
      conclusion: "",
    };
    await this.md.writeNodeInfo(projectRoot, workspaceId, nodeId, nodeInfo);

    // 7. 创建空的 Log.md 和 Problem.md
    await this.md.createEmptyLog(projectRoot, workspaceId, nodeId);
    await this.md.createEmptyProblem(projectRoot, workspaceId, nodeId);

    // 8. 更新 graph.json
    const newNode: NodeMeta = {
      id: nodeId,
      parentId,
      children: [],
      status: "pending",
      isolate: false,
      references: [],
      conclusion: null,
      createdAt: currentTime,
      updatedAt: currentTime,
    };
    graph.nodes[nodeId] = newNode;
    graph.nodes[parentId].children.push(nodeId);
    graph.nodes[parentId].updatedAt = currentTime;
    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 9. 更新工作区 updatedAt
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 10. 追加日志
    await this.md.appendLog(projectRoot, workspaceId, {
      time: currentTime,
      operator: "system",
      event: `节点 "${title}" (${nodeId}) 已创建`,
    });

    // 根据是否派发了文档生成不同的提示
    const hasDispatchedDocs = docs.length > 0;
    const hint = hasDispatchedDocs
      ? "💡 节点已创建并派发了文档。下一步：调用 node_transition(action=\"start\") 开始执行，或继续创建更多子节点进行任务分解。"
      : "💡 节点已创建。提醒：如果子任务需要参考文档，请使用 docs 参数派发，或稍后用 node_reference 添加。下一步：调用 node_transition(action=\"start\") 开始执行。";

    return {
      nodeId,
      path: nodePath,
      hint,
    };
  }

  /**
   * 获取节点详情
   */
  async get(params: NodeGetParams): Promise<NodeGetResult> {
    const { workspaceId, nodeId } = params;

    // 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    // 验证节点存在
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    const meta = graph.nodes[nodeId];
    const infoMd = await this.md.readNodeInfoRaw(projectRoot, workspaceId, nodeId);
    const logMd = await this.md.readLogRaw(projectRoot, workspaceId, nodeId);
    const problemMd = await this.md.readProblemRaw(projectRoot, workspaceId, nodeId);

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

    // 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    const graph = await this.json.readGraph(projectRoot, workspaceId);
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);

    // 确定根节点
    const startId = rootId || config.rootNodeId;
    if (!graph.nodes[startId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${startId}" 不存在`);
    }

    // 构建树
    const tree = await this.buildNodeTree(projectRoot, workspaceId, graph, startId, 0, depth);

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
    maxDepth?: number
  ): Promise<NodeTreeItem> {
    const node = graph.nodes[nodeId];
    const nodeInfo = await this.md.readNodeInfo(projectRoot, workspaceId, nodeId);

    const item: NodeTreeItem = {
      id: nodeId,
      title: nodeInfo.title,
      status: node.status,
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
        maxDepth
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

    // 8. 追加日志
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

  // ========== Phase 3: 节点分裂与更新 ==========

  /**
   * 节点分裂
   * 将当前执行中的步骤升级为独立子节点
   */
  async split(params: NodeSplitParams): Promise<NodeSplitResult> {
    const { workspaceId, parentId, title, requirement, inheritContext = true, docs = [] } = params;

    // 1. 获取 projectRoot
    const projectRoot = await this.resolveProjectRoot(workspaceId);

    // 2. 验证父节点存在
    const graph = await this.json.readGraph(projectRoot, workspaceId);
    if (!graph.nodes[parentId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${parentId}" 不存在`);
    }

    // 3. 验证父节点状态为 implementing
    const parentMeta = graph.nodes[parentId];
    if (parentMeta.status !== "implementing") {
      throw new TanmiError(
        "SPLIT_REQUIRES_IMPLEMENTING",
        `只有 implementing 状态的节点才能分裂，当前状态: ${parentMeta.status}`
      );
    }

    // 4. 验证标题合法性
    validateNodeTitle(title);

    // 5. 生成节点 ID
    const nodeId = generateNodeId();
    const currentTime = now();

    // 6. 创建节点目录
    const nodePath = this.fs.getNodePath(projectRoot, workspaceId, nodeId);
    await this.fs.mkdir(nodePath);

    // 7. 写入 Info.md
    const nodeInfo: NodeInfoData = {
      id: nodeId,
      title,
      status: "pending",
      createdAt: currentTime,
      updatedAt: currentTime,
      requirement,
      docs,
      notes: "",
      conclusion: "",
    };
    await this.md.writeNodeInfo(projectRoot, workspaceId, nodeId, nodeInfo);

    // 8. 创建空的 Log.md 和 Problem.md
    await this.md.createEmptyLog(projectRoot, workspaceId, nodeId);
    await this.md.createEmptyProblem(projectRoot, workspaceId, nodeId);

    // 9. 更新 graph.json
    const newNode: NodeMeta = {
      id: nodeId,
      parentId,
      children: [],
      status: "pending",
      isolate: !inheritContext,  // 如果不继承上下文，设置为隔离
      references: [],
      conclusion: null,
      createdAt: currentTime,
      updatedAt: currentTime,
    };
    graph.nodes[nodeId] = newNode;
    graph.nodes[parentId].children.push(nodeId);
    graph.nodes[parentId].updatedAt = currentTime;

    // 10. 自动切换焦点到新节点
    graph.currentFocus = nodeId;

    await this.json.writeGraph(projectRoot, workspaceId, graph);

    // 11. 清空父节点的 Problem.md（问题已转化为子任务）
    await this.md.writeProblem(projectRoot, workspaceId, {
      currentProblem: "（暂无）",
      nextStep: "（暂无）",
    }, parentId);

    // 12. 更新工作区 updatedAt
    const config = await this.json.readWorkspaceConfig(projectRoot, workspaceId);
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, workspaceId, config);

    // 13. 追加日志到父节点
    await this.md.appendLog(projectRoot, workspaceId, {
      time: currentTime,
      operator: "AI",
      event: `分裂子节点: "${title}" (${nodeId})`,
    }, parentId);

    // 14. 追加日志到全局
    await this.md.appendLog(projectRoot, workspaceId, {
      time: currentTime,
      operator: "AI",
      event: `节点 "${parentId}" 分裂出子节点 "${title}" (${nodeId})`,
    });

    // 根据是否派发了文档生成不同的提示
    const hasDispatchedDocs = docs.length > 0;
    const hint = hasDispatchedDocs
      ? "💡 子节点已创建并自动聚焦，已派发文档。请调用 node_transition(action=\"start\") 开始执行，并使用 log_append 记录分析过程。"
      : "💡 子节点已创建并自动聚焦。提醒：如果子任务需要参考文档，请用 node_reference 添加。请调用 node_transition(action=\"start\") 开始执行。";

    return {
      nodeId,
      path: nodePath,
      hint,
    };
  }

  /**
   * 更新节点
   */
  async update(params: NodeUpdateParams): Promise<NodeUpdateResult> {
    const { workspaceId, nodeId, title, requirement, note } = params;

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

    // 8. 更新 graph.json 的 updatedAt
    graph.nodes[nodeId].updatedAt = currentTime;
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
