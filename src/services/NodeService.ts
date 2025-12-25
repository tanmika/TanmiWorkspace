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
import { generateNodeId, generateNodeDirName } from "../utils/id.js";
import { now } from "../utils/time.js";
import { validateNodeTitle } from "../utils/validation.js";
import { devLog } from "../utils/devLog.js";
import { GuidanceService } from "./GuidanceService.js";
import type { GuidanceContext } from "../types/guidance.js";
import { eventService } from "./EventService.js";

/**
 * 节点服务
 * 处理节点相关的业务逻辑
 */
export class NodeService {
  private stateService?: import("./StateService.js").StateService;
  private guidanceService: GuidanceService;

  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {
    this.guidanceService = new GuidanceService();
  }

  /**
   * 设置 StateService 依赖（用于 token 生成）
   */
  setStateService(stateService: import("./StateService.js").StateService): void {
    this.stateService = stateService;
  }

  /**
   * 根据 workspaceId 获取 projectRoot 和 wsDirName
   */
  private async resolveProjectRoot(workspaceId: string): Promise<{ projectRoot: string; wsDirName: string }> {
    const entry = await this.json.findWorkspaceEntry(workspaceId);
    if (!entry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    return {
      projectRoot: entry.projectRoot,
      wsDirName: entry.dirName || entry.id  // 向后兼容
    };
  }

  /**
   * 根据 workspaceId 获取工作区信息（包括归档状态和目录名）
   */
  private async resolveWorkspaceInfo(workspaceId: string): Promise<{ projectRoot: string; wsDirName: string; isArchived: boolean }> {
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      devLog.workspaceLookup(workspaceId, false);
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    const isArchived = wsEntry.status === "archived";
    const wsDirName = wsEntry.dirName || wsEntry.id;  // 向后兼容：旧数据没有 dirName
    devLog.workspaceLookup(workspaceId, true, wsEntry.status);
    if (isArchived) {
      devLog.archivePath(workspaceId, isArchived, this.fs.getWorkspaceBasePath(wsEntry.projectRoot, wsDirName, true));
    }
    return {
      projectRoot: wsEntry.projectRoot,
      wsDirName,
      isArchived,
    };
  }

  /**
   * 创建节点
   */
  async create(params: NodeCreateParams): Promise<NodeCreateResult> {
    const { workspaceId, parentId, type, title, requirement = "", docs = [], role, isNeedTest, testRequirement } = params;

    // 1. 获取 projectRoot 和 wsDirName
    const { projectRoot, wsDirName } = await this.resolveProjectRoot(workspaceId);

    // 2. 验证父节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName);
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
    let archivedConclusion: string | null = null;
    if (parentMeta.status === "completed") {
      parentMeta.status = "planning";
      parentMeta.updatedAt = now();
      // 保留原有结论作为历史引用（不清空）
      const oldConclusion = parentMeta.conclusion;
      if (oldConclusion) {
        // 将原有结论转换为引用格式，标注为历史结论
        const timestamp = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const quotedConclusion = oldConclusion.split("\n").map(line => `> ${line}`).join("\n");
        archivedConclusion = `**[历史结论 - ${timestamp}]**\n${quotedConclusion}\n\n---\n\n`;
        parentMeta.conclusion = archivedConclusion;
      }
      autoReopened = true;
      // 同步更新 Info.md 中的状态和结论（使用父节点的 dirName）
      const parentDirName = parentMeta.dirName || parentId;  // 向后兼容
      await this.md.updateNodeStatus(projectRoot, wsDirName, parentDirName, "planning");
      if (archivedConclusion) {
        await this.md.updateConclusion(projectRoot, wsDirName, parentDirName, archivedConclusion);
      }
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
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, wsDirName);
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

    // 7. 生成节点 ID 和目录名
    const nodeId = generateNodeId();
    const nodeDirName = generateNodeDirName(title, nodeId);
    const currentTime = now();

    // 8. 创建节点目录（使用可读目录名）
    const nodePath = this.fs.getNodePath(projectRoot, wsDirName, nodeDirName);
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
    await this.md.writeNodeInfo(projectRoot, wsDirName, nodeDirName, nodeInfo);

    // 10. 创建空的 Log.md 和 Problem.md
    await this.md.createEmptyLog(projectRoot, wsDirName, nodeDirName);
    await this.md.createEmptyProblem(projectRoot, wsDirName, nodeDirName);

    // 11. 更新 graph.json
    const newNode: NodeMeta = {
      id: nodeId,
      dirName: nodeDirName,
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

    // 11.1 处理测试节点附属化（isNeedTest=true）
    let upgradedToPlanning = false;
    let createdExecNodeId: string | undefined;
    let createdTestNodeId: string | undefined;

    if (isNeedTest && type === "execution") {
      // 执行节点 + isNeedTest=true：升级为 planning 管理节点
      upgradedToPlanning = true;
      newNode.type = "planning";

      // 更新 Info.md 中的类型
      const updatedNodeInfo: NodeInfoData = {
        id: nodeId,
        type: "planning",  // 升级为 planning
        title: `[管理] ${title}`,
        status: "pending",
        createdAt: currentTime,
        updatedAt: currentTime,
        requirement: normalizedRequirement,
        docs,
        notes: "",
        conclusion: "",
      };
      await this.md.writeNodeInfo(projectRoot, wsDirName, nodeDirName, updatedNodeInfo);

      // 创建执行子节点
      const execNodeId = generateNodeId();
      const execNodeDirName = generateNodeDirName(`[执行] ${title}`, execNodeId);
      const execNodePath = this.fs.getNodePath(projectRoot, wsDirName, execNodeDirName);
      await this.fs.mkdir(execNodePath);

      const execNodeInfo: NodeInfoData = {
        id: execNodeId,
        type: "execution",
        title: `[执行] ${title}`,
        status: "pending",
        createdAt: currentTime,
        updatedAt: currentTime,
        requirement: normalizedRequirement,
        docs,
        notes: "",
        conclusion: "",
      };
      await this.md.writeNodeInfo(projectRoot, wsDirName, execNodeDirName, execNodeInfo);
      await this.md.createEmptyLog(projectRoot, wsDirName, execNodeDirName);
      await this.md.createEmptyProblem(projectRoot, wsDirName, execNodeDirName);
      const execNodeMeta: NodeMeta = {
        id: execNodeId,
        dirName: execNodeDirName,
        type: "execution",
        parentId: nodeId,  // 父节点是管理节点
        children: [],
        status: "pending",
        isolate: false,
        references: [],
        conclusion: null,
        createdAt: currentTime,
        updatedAt: currentTime,
      };
      graph.nodes[execNodeId] = execNodeMeta;
      newNode.children.push(execNodeId);
      createdExecNodeId = execNodeId;

      // 创建测试子节点
      const testNodeId = generateNodeId();
      const testNodeDirName = generateNodeDirName(`[测试] ${title}`, testNodeId);
      const testNodePath = this.fs.getNodePath(projectRoot, wsDirName, testNodeDirName);
      await this.fs.mkdir(testNodePath);

      const testNodeInfo: NodeInfoData = {
        id: testNodeId,
        type: "execution",
        title: `[测试] ${title}`,
        status: "pending",
        createdAt: currentTime,
        updatedAt: currentTime,
        requirement: testRequirement || "（需要补充验收标准）",
        docs: [],
        notes: "",
        conclusion: "",
      };
      await this.md.writeNodeInfo(projectRoot, wsDirName, testNodeDirName, testNodeInfo);
      await this.md.createEmptyLog(projectRoot, wsDirName, testNodeDirName);
      await this.md.createEmptyProblem(projectRoot, wsDirName, testNodeDirName);
      const testNodeMeta: NodeMeta = {
        id: testNodeId,
        dirName: testNodeDirName,
        type: "execution",
        parentId: nodeId,  // 父节点是管理节点
        children: [],
        status: "pending",
        isolate: false,
        references: [],
        conclusion: null,
        createdAt: currentTime,
        updatedAt: currentTime,
      };
      graph.nodes[testNodeId] = testNodeMeta;
      newNode.children.push(testNodeId);
      createdTestNodeId = testNodeId;
    } else if (isNeedTest && type === "planning") {
      // 规划节点 + isNeedTest=true：创建测试子节点（集成测试）
      const testNodeId = generateNodeId();
      const integrationTestDirName = generateNodeDirName(`[集成测试] ${title}`, testNodeId);
      const testNodePath = this.fs.getNodePath(projectRoot, wsDirName, integrationTestDirName);
      await this.fs.mkdir(testNodePath);

      const testNodeInfo: NodeInfoData = {
        id: testNodeId,
        type: "execution",
        title: `[集成测试] ${title}`,
        status: "pending",
        createdAt: currentTime,
        updatedAt: currentTime,
        requirement: testRequirement || "（需要补充集成测试验收标准）",
        docs: [],
        notes: "",
        conclusion: "",
      };
      await this.md.writeNodeInfo(projectRoot, wsDirName, integrationTestDirName, testNodeInfo);
      await this.md.createEmptyLog(projectRoot, wsDirName, integrationTestDirName);
      await this.md.createEmptyProblem(projectRoot, wsDirName, integrationTestDirName);
      const testNodeMeta: NodeMeta = {
        id: testNodeId,
        dirName: integrationTestDirName,
        type: "execution",
        parentId: nodeId,  // 父节点是当前规划节点
        children: [],
        status: "pending",
        isolate: false,
        references: [],
        conclusion: null,
        createdAt: currentTime,
        updatedAt: currentTime,
      };
      graph.nodes[testNodeId] = testNodeMeta;
      newNode.children.push(testNodeId);
      createdTestNodeId = testNodeId;
    }

    // 12. 自动状态转换：如果父节点是 pending/planning，创建第一个子节点时转为 monitoring
    const isFirstChild = graph.nodes[parentId].children.length === 1;
    if (isFirstChild && (parentMeta.status === "pending" || parentMeta.status === "planning")) {
      graph.nodes[parentId].status = "monitoring";
      // 同步更新 Info.md 中的状态（使用父节点的 dirName）
      const pDirName = parentMeta.dirName || parentId;  // 向后兼容
      await this.md.updateNodeStatus(projectRoot, wsDirName, pDirName, "monitoring");
    }

    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 12. 更新工作区 updatedAt
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, wsDirName, config);

    // 13. 同步更新索引中的 updatedAt
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (wsEntry) {
      wsEntry.updatedAt = currentTime;
      await this.json.writeIndex(index);
    }

    // 14. 追加日志
    let logEvent: string;
    if (upgradedToPlanning) {
      logEvent = `管理节点 "[管理] ${title}" (${nodeId}) 已创建，包含执行子节点 (${createdExecNodeId}) 和测试子节点 (${createdTestNodeId})`;
    } else if (isNeedTest && type === "planning") {
      logEvent = `规划节点 "${title}" (${nodeId}) 已创建，包含集成测试子节点 (${createdTestNodeId})`;
    } else {
      const typeLabel = newNode.type === "planning" ? "规划" : "执行";
      logEvent = `${typeLabel}节点 "${title}" (${nodeId}) 已创建`;
    }
    await this.md.appendLog(projectRoot, wsDirName, {
      time: currentTime,
      operator: "system",
      event: logEvent,
    });

    // 14. 生成提示
    const hasDispatchedDocs = docs.length > 0;
    let hint: string;
    if (upgradedToPlanning) {
      // isNeedTest=true 的执行节点已升级为管理节点
      hint = `💡 已创建管理节点 "[管理] ${title}"，自动生成了：\n` +
        `  - [执行] 子节点 (${createdExecNodeId})：实际执行任务\n` +
        `  - [测试] 子节点 (${createdTestNodeId})：验收测试\n` +
        `下一步：调用 node_transition(action="start") 开始管理节点，然后派发 [执行] 子节点。`;
    } else if (isNeedTest && type === "planning") {
      // 规划节点 + isNeedTest=true
      hint = `💡 规划节点已创建，自动生成了集成测试子节点 (${createdTestNodeId})。\n` +
        `下一步：调用 node_transition(action="start") 进入规划状态，创建执行子节点。所有执行完成后执行集成测试。`;
    } else if (newNode.type === "execution") {
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

    // 生成引导内容
    const guidanceContext: GuidanceContext = {
      toolName: "node_create",
      nodeType: type,
      nodeRole: role,
      toolInput: { type, role, parentId },
    };
    const guidance = this.guidanceService.generateFromContext(guidanceContext, 0);

    // 构建返回结果
    const result: NodeCreateResult = {
      nodeId,
      path: nodePath,
      autoReopened: autoReopened ? parentId : undefined,
      hint,
      // 测试节点附属化输出
      upgradedToPlanning,
      execNodeId: createdExecNodeId,
      guidance: guidance.content,
      testNodeId: createdTestNodeId,
    };

    // 如果在根节点下创建非信息收集的子节点，添加 show_plan actionRequired
    if (parentId === "root" && role !== "info_collection") {
      // 生成 confirmation token（如果 StateService 可用）
      let confirmationToken: string | undefined;
      if (this.stateService) {
        const confirmation = this.stateService.createPendingConfirmation(workspaceId, nodeId, "show_plan", {
          nodeId,
          title,
          type,
        });
        confirmationToken = confirmation.token;
      }

      result.actionRequired = {
        type: "show_plan",
        message: "已创建计划节点，请向用户展示当前计划并等待确认后再开始执行。",
        data: {
          nodeId,
          title,
          type,
        },
        confirmationToken,
      };
    }

    // 推送 SSE 事件通知前端
    eventService.emitNodeUpdate(workspaceId, nodeId);

    return result;
  }

  /**
   * 获取节点详情
   */
  async get(params: NodeGetParams): Promise<NodeGetResult> {
    const { workspaceId, nodeId } = params;

    // 获取工作区信息（包括归档状态和目录名）
    const { projectRoot, wsDirName, isArchived } = await this.resolveWorkspaceInfo(workspaceId);

    // 验证节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName, isArchived);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    const meta = graph.nodes[nodeId];
    const nodeDirName = meta.dirName || nodeId;  // 向后兼容
    const infoMd = await this.md.readNodeInfoRaw(projectRoot, wsDirName, nodeDirName, isArchived);
    const logMd = await this.md.readLogRaw(projectRoot, wsDirName, nodeDirName, isArchived);
    const problemMd = await this.md.readProblemRaw(projectRoot, wsDirName, nodeDirName, isArchived);

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

    // 获取工作区信息（包括归档状态和目录名）
    const { projectRoot, wsDirName, isArchived } = await this.resolveWorkspaceInfo(workspaceId);

    const graph = await this.json.readGraph(projectRoot, wsDirName, isArchived);
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName, isArchived);

    // 确定根节点
    const startId = rootId || config.rootNodeId;
    if (!graph.nodes[startId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${startId}" 不存在`);
    }

    // 构建树
    const tree = await this.buildNodeTree(projectRoot, wsDirName, graph, startId, 0, depth, isArchived);

    return { tree };
  }

  /**
   * 递归构建节点树
   */
  private async buildNodeTree(
    projectRoot: string,
    wsDirName: string,
    graph: { nodes: Record<string, NodeMeta> },
    nodeId: string,
    currentDepth: number,
    maxDepth?: number,
    isArchived: boolean = false
  ): Promise<NodeTreeItem> {
    const node = graph.nodes[nodeId];
    const nodeDirName = node.dirName || nodeId;  // 向后兼容
    const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName, isArchived);

    const item: NodeTreeItem = {
      id: nodeId,
      type: node.type,
      title: nodeInfo.title,
      status: node.status,
      role: node.role,
      dispatch: node.dispatch,
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
        wsDirName,
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

    // 1. 获取 projectRoot 和 wsDirName
    const { projectRoot, wsDirName } = await this.resolveProjectRoot(workspaceId);

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    const config = await this.json.readWorkspaceConfig(projectRoot, wsDirName);

    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    // 3. 检查是否为根节点
    if (nodeId === config.rootNodeId) {
      throw new TanmiError("CANNOT_DELETE_ROOT", "无法删除根节点");
    }

    // 4. 递归收集所有子节点 ID
    const deletedNodes = this.collectAllChildren(graph, nodeId);

    // 5. 删除所有节点目录（使用节点的 dirName）
    for (const id of deletedNodes) {
      const nodeDirName = graph.nodes[id]?.dirName || id;  // 向后兼容
      const nodePath = this.fs.getNodePath(projectRoot, wsDirName, nodeDirName);
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

    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 7. 更新工作区 updatedAt
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, wsDirName, config);

    // 8. 同步更新索引中的 updatedAt
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (wsEntry) {
      wsEntry.updatedAt = currentTime;
      await this.json.writeIndex(index);
    }

    // 9. 追加日志
    await this.md.appendLog(projectRoot, wsDirName, {
      time: currentTime,
      operator: "system",
      event: `节点 "${nodeId}" 及其 ${deletedNodes.length - 1} 个子节点已删除`,
    });

    // 推送 SSE 事件通知前端
    eventService.emitNodeUpdate(workspaceId, nodeId);

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

    // 1. 获取 projectRoot 和 wsDirName
    const { projectRoot, wsDirName } = await this.resolveProjectRoot(workspaceId);

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    // 3. 如果提供了新标题，验证合法性
    if (title !== undefined) {
      validateNodeTitle(title);
    }

    const currentTime = now();
    let nodeDirName = graph.nodes[nodeId].dirName || nodeId;  // 向后兼容

    // 4. 读取现有 Info.md
    const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName);

    // 5. 更新指定字段
    const updates: string[] = [];
    let titleChanged = false;
    if (title !== undefined && title !== nodeInfo.title) {
      nodeInfo.title = title;
      updates.push(`标题: "${title}"`);
      titleChanged = true;
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

    // 6. 如果标题改变，同步更新目录名（非 root 节点）
    if (titleChanged && nodeId !== "root") {
      const newDirName = generateNodeDirName(title!, nodeId);
      if (newDirName !== nodeDirName) {
        const nodesDir = this.fs.getNodesDir(projectRoot, wsDirName);
        const oldPath = this.fs.getNodePath(projectRoot, wsDirName, nodeDirName);
        // 安全重命名（处理冲突）
        const actualDirName = await this.fs.safeRenameDir(oldPath, nodesDir, newDirName);
        nodeDirName = actualDirName;
        graph.nodes[nodeId].dirName = actualDirName;
      }
    }

    // 7. 更新时间戳
    nodeInfo.updatedAt = currentTime;

    // 8. 写入 Info.md（使用可能已更新的目录名）
    await this.md.writeNodeInfo(projectRoot, wsDirName, nodeDirName, nodeInfo);

    // 9. 更新 graph.json 的 updatedAt 和 conclusion
    graph.nodes[nodeId].updatedAt = currentTime;
    if (conclusion !== undefined) {
      graph.nodes[nodeId].conclusion = conclusion || null;
    }
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 10. 追加日志
    await this.md.appendLog(projectRoot, wsDirName, {
      time: currentTime,
      operator: "AI",
      event: `更新节点: ${updates.join(", ")}`,
    }, nodeDirName);

    // 推送 SSE 事件通知前端
    eventService.emitNodeUpdate(workspaceId, nodeId);

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

    // 1. 获取 projectRoot 和 wsDirName
    const { projectRoot, wsDirName } = await this.resolveProjectRoot(workspaceId);

    // 2. 读取图结构
    const graph = await this.json.readGraph(projectRoot, wsDirName);

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
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 12. 读取节点 Info.md 获取标题用于日志
    const nodeDirName = nodeMeta.dirName || nodeId;  // 向后兼容
    const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName);

    // 13. 记录日志
    await this.md.appendLog(projectRoot, wsDirName, {
      time: currentTime,
      operator: "AI",
      event: `移动节点 "${nodeInfo.title}" 到 ${newParentId === "root" ? "根节点" : newParentId}`,
    }, nodeDirName);

    // 推送 SSE 事件通知前端
    eventService.emitNodeUpdate(workspaceId, nodeId);

    return {
      success: true,
      previousParentId,
      newParentId,
    };
  }

  /**
   * 重新排序节点的子节点
   * @param workspaceId 工作区 ID
   * @param nodeId 父节点 ID
   * @param orderedChildIds 排序后的子节点 ID 数组
   */
  async reorderChildren(params: {
    workspaceId: string;
    nodeId: string;
    orderedChildIds: string[];
  }): Promise<void> {
    const { workspaceId, nodeId, orderedChildIds } = params;

    // 1. 获取 projectRoot 和 wsDirName
    const { projectRoot, wsDirName } = await this.resolveProjectRoot(workspaceId);

    // 2. 读取图结构
    const graph = await this.json.readGraph(projectRoot, wsDirName);

    // 3. 验证节点存在
    const nodeMeta = graph.nodes[nodeId];
    if (!nodeMeta) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    // 4. 验证所有子节点 ID 都在 orderedChildIds 中
    const currentChildren = new Set(nodeMeta.children);
    const newChildren = new Set(orderedChildIds);

    if (currentChildren.size !== newChildren.size) {
      throw new TanmiError("INVALID_TRANSITION", "子节点数量不匹配");
    }

    for (const childId of orderedChildIds) {
      if (!currentChildren.has(childId)) {
        throw new TanmiError("NODE_NOT_FOUND", `子节点 "${childId}" 不存在`);
      }
    }

    // 5. 更新子节点顺序
    nodeMeta.children = orderedChildIds;

    // 6. 保存图结构
    await this.json.writeGraph(projectRoot, wsDirName, graph);
  }
}
