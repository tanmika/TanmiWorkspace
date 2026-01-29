// src/services/NodeService.ts

import * as crypto from "node:crypto";
import { computeConclusionsHash } from "../utils/hash.js";
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
  NodeReplaceParams,
  NodeEditParams,
  NodeMeta,
  NodeTreeItem,
  NodeInfoData,
  NodeType,
} from "../types/node.js";
import { TanmiError } from "../types/errors.js";
import { generateNodeId, generateNodeDirName, extractShortId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { validateNodeTitle, validateAcceptanceCriteria } from "../utils/validation.js";
import { computeNodeHash } from "../utils/hash.js";
import { devLog } from "../utils/devLog.js";
import { GuidanceService } from "./GuidanceService.js";

/**
 * 内部调用专用的 magic hash，绕过 rulesHash 验证
 * 仅供 capability_select 等内部模块使用
 */
export const INTERNAL_RULES_HASH = "__internal__";
import type { GuidanceContext } from "../types/guidance.js";
import { eventService } from "./EventService.js";

/**
 * 节点服务
 * 处理节点相关的业务逻辑
 */
export class NodeService {
  private stateService?: import("./StateService.js").StateService;
  private referenceService?: import("./ReferenceService.js").ReferenceService;
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
   * 设置 ReferenceService 依赖（用于引用链清理）
   */
  setReferenceService(referenceService: import("./ReferenceService.js").ReferenceService): void {
    this.referenceService = referenceService;
  }

  /**
   * 根据 workspaceId 获取 projectRoot 和 wsDirName
   */
  private async resolveProjectRoot(workspaceId: string): Promise<{ projectRoot: string; wsDirName: string }> {
    const index = await this.json.readIndex();
    const entry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!entry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    if (entry.status === "error" && entry.errorInfo) {
      throw new TanmiError("WORKSPACE_ERROR", `工作区 "${workspaceId}" 处于错误状态: ${entry.errorInfo.message}`);
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
    // 检查 error 状态
    if (wsEntry.status === "error" && wsEntry.errorInfo) {
      throw new TanmiError(
        "WORKSPACE_ERROR",
        `工作区 "${workspaceId}" 处于错误状态: ${wsEntry.errorInfo.message}\n` +
        `请先修复工作区后再操作节点。`
      );
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
   * 解析并验证节点目录名
   * 当 graph.json 中的 dirName 对应的目录不存在时，尝试通过 shortId 查找实际目录
   * 这是运行时兜底机制，用于处理迁移失败或遗漏的情况
   *
   * @param projectRoot 项目根目录
   * @param wsDirName 工作区目录名
   * @param nodeId 节点 ID
   * @param meta 节点元数据
   * @param isArchived 是否归档
   * @returns 实际的节点目录名
   */
  private async resolveNodeDirName(
    projectRoot: string,
    wsDirName: string,
    nodeId: string,
    meta: NodeMeta,
    isArchived: boolean
  ): Promise<string> {
    const dirName = meta.dirName || nodeId;

    // 检查目录是否存在
    const nodePath = this.fs.getNodePath(projectRoot, wsDirName, dirName);
    if (await this.fs.exists(nodePath)) {
      return dirName;
    }

    // 目录不存在，尝试通过 shortId 查找
    const shortId = extractShortId(nodeId);
    const nodesDir = this.fs.getNodesDir(projectRoot, wsDirName);

    try {
      const entries = await this.fs.readdir(nodesDir);

      // 优先匹配 `_shortId` 后缀
      for (const entry of entries) {
        if (entry.endsWith(`_${shortId}`)) {
          devLog.warn(`[runtime] 节点目录名修复: ${nodeId} → ${entry}`);
          // 更新 meta 中的 dirName（调用方需要保存 graph.json）
          meta.dirName = entry;
          return entry;
        }
      }

      // 兜底：匹配包含 shortId 的目录
      if (shortId.length >= 6) {
        for (const entry of entries) {
          if (entry.includes(shortId)) {
            devLog.warn(`[runtime] 节点目录名修复（模糊匹配）: ${nodeId} → ${entry}`);
            meta.dirName = entry;
            return entry;
          }
        }
      }
    } catch (error) {
      // 读取目录失败，记录日志后返回原始值
      devLog.warn("[NodeService] 读取节点目录失败，使用原始 dirName", { nodeId, dirName, nodesDir, error: error instanceof Error ? error.message : String(error) });
    }

    // 未找到匹配目录，返回原始值（后续可能会抛出文件不存在错误）
    return dirName;
  }

  /**
   * 创建节点
   */
  async create(params: NodeCreateParams): Promise<NodeCreateResult> {
    const { workspaceId, parentId, type, title, requirement = "", docs = [], role, acceptanceCriteria, isNeedTest, testRequirement } = params;

    // 0. 校验 acceptanceCriteria 格式（必须是 { when, then } 对象数组）
    validateAcceptanceCriteria(acceptanceCriteria);

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
        // 自动 reopen 时，如果父节点有 conclusion，设置 stale
        parentMeta.conclusionStale = true;
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
    // 内部调用使用 INTERNAL_RULES_HASH 可绕过验证
    const workspaceMdData = await this.md.readWorkspaceMd(projectRoot, wsDirName);
    if (workspaceMdData.rules.length > 0 && params.rulesHash !== INTERNAL_RULES_HASH) {
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
      acceptanceCriteria,
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
      acceptanceCriteria,  // 验收标准（可选）
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
        acceptanceCriteria,
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
        acceptanceCriteria,
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
        acceptanceCriteria,
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
    const originalDirName = meta.dirName;

    // 解析并验证节点目录名（运行时兜底机制）
    const nodeDirName = await this.resolveNodeDirName(projectRoot, wsDirName, nodeId, meta, isArchived);

    // 如果目录名被修复，保存更新后的 graph.json（仅非归档工作区）
    if (!isArchived && meta.dirName !== originalDirName) {
      await this.json.writeGraph(projectRoot, wsDirName, graph);
    }

    const infoMd = await this.md.readNodeInfoRaw(projectRoot, wsDirName, nodeDirName, isArchived);

    // 读取并压缩日志：截取最新 5 条，简化格式
    const MAX_LOG_ENTRIES = 5;
    const logContent = await this.md.readLogRaw(projectRoot, wsDirName, nodeDirName, isArchived);
    const logs = this.md.parseLogTable(logContent);
    const recentLogs = logs.slice(-MAX_LOG_ENTRIES);

    let logMd = "";
    if (recentLogs.length > 0) {
      const lines = recentLogs.map(log => {
        const operator = log.operator !== "AI" ? `[${log.operator}] ` : "";
        return `- [${log.timestamp}] ${operator}${log.event}`;
      });
      if (logs.length > MAX_LOG_ENTRIES) {
        lines.unshift(`（共 ${logs.length} 条，显示最新 ${MAX_LOG_ENTRIES} 条）`);
      }
      logMd = lines.join("\n");
    }

    const problemMd = await this.md.readProblemRaw(projectRoot, wsDirName, nodeDirName, isArchived);

    // 兼容旧数据：从 Info.md 补充缺失的 meta 字段
    if (!meta.status || !meta.createdAt || !meta.updatedAt) {
      const nodeInfo = await this.md.readNodeInfoFull(projectRoot, wsDirName, nodeDirName, isArchived);
      if (!meta.status) meta.status = nodeInfo.status;
      if (!meta.createdAt) meta.createdAt = nodeInfo.createdAt;
      if (!meta.updatedAt) meta.updatedAt = nodeInfo.updatedAt;
      if (!meta.conclusion && nodeInfo.conclusion) meta.conclusion = nodeInfo.conclusion;
      if (!meta.references) meta.references = [];
    }

    // 计算 nodeHash（用于先读后写校验）
    const nodeInfoParsed = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName, isArchived);
    const nodeHash = computeNodeHash({
      title: nodeInfoParsed.title,
      requirement: nodeInfoParsed.requirement,
      note: nodeInfoParsed.notes,
      conclusion: nodeInfoParsed.conclusion,
    });

    return {
      meta,
      infoMd,
      logMd,
      problemMd,
      nodeHash,
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
      status: node.status || nodeInfo.status,  // 兼容旧数据：优先用 graph.json，fallback 到 Info.md
      role: node.role,
      dispatch: node.dispatch,
      children: [],
    };

    // 检查深度限制：-1 或 undefined 表示无限深度
    if (maxDepth !== undefined && maxDepth >= 0 && currentDepth >= maxDepth) {
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

    // 5. 清理其他节点中对被删除节点的引用（MUST be done BEFORE modifying graph）
    let totalReferencesCleared = 0;
    if (this.referenceService) {
      // 使用 ReferenceService 的引用链清理机制
      for (const deletedNodeId of deletedNodes) {
        const targetUri = `node://${deletedNodeId}`;
        try {
          const clearedCount = await this.referenceService.cleanupReferences(workspaceId, targetUri);
          totalReferencesCleared += clearedCount;
        } catch (error) {
          console.warn(`[NodeService] 清理节点 ${deletedNodeId} 的引用失败:`, error);
        }
      }
      if (totalReferencesCleared > 0) {
        console.log(`[NodeService] 已清理 ${totalReferencesCleared} 个引用链接`);
      }

      // 重新读取 graph，以获取 cleanupReferences 写回的更新
      // (cleanupReferences 已经修改并保存了 graph，我们需要同步)
      const updatedGraph = await this.json.readGraph(projectRoot, wsDirName);
      // 将更新后的 nodes 复制回当前 graph
      Object.assign(graph.nodes, updatedGraph.nodes);
    }

    // 6. 删除所有节点目录（使用节点的 dirName）
    for (const id of deletedNodes) {
      const nodeDirName = graph.nodes[id]?.dirName || id;  // 向后兼容
      const nodePath = this.fs.getNodePath(projectRoot, wsDirName, nodeDirName);
      await this.fs.rmdir(nodePath);
    }

    // 7. 更新 graph.json
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

    // 注意：引用清理已在步骤 5 中完成，这里不需要降级处理

    // 如果当前聚焦的节点被删除，重置聚焦
    if (graph.currentFocus && deletedNodes.includes(graph.currentFocus)) {
      graph.currentFocus = config.rootNodeId;
    }

    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 8. 更新工作区 updatedAt
    config.updatedAt = currentTime;
    await this.json.writeWorkspaceConfig(projectRoot, wsDirName, config);

    // 9. 同步更新索引中的 updatedAt
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (wsEntry) {
      wsEntry.updatedAt = currentTime;
      await this.json.writeIndex(index);
    }

    // 10. 追加日志
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
    const { workspaceId, nodeId, nodeHash, title, requirement, note, conclusion, field, oldStr, newStr, conclusionsHash } = params;

    // 1. 获取 projectRoot 和 wsDirName
    const { projectRoot, wsDirName } = await this.resolveProjectRoot(workspaceId);

    // 3. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    // 4. 如果提供了新标题，验证合法性
    if (title !== undefined) {
      validateNodeTitle(title);
    }

    const currentTime = now();
    let nodeDirName = graph.nodes[nodeId].dirName || nodeId;  // 向后兼容

    // 5. 读取现有 Info.md
    const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName);

    // 6. 如果提供了 nodeHash，进行先读后写校验（MCP 调用必须提供，内部调用可跳过）
    if (nodeHash) {
      const currentHash = computeNodeHash({
        title: nodeInfo.title,
        requirement: nodeInfo.requirement,
        note: nodeInfo.notes,
        conclusion: nodeInfo.conclusion,
      });
      if (currentHash !== nodeHash) {
        throw new TanmiError("CONTENT_CHANGED", "内容已变更，请重新 node_get");
      }
    }

    // 6.1 stale 节点更新 conclusion 时要求 conclusionsHash
    const nodeMeta = graph.nodes[nodeId];
    const isUpdatingConclusion = conclusion !== undefined || (field === "conclusion" && oldStr !== undefined);
    if (nodeMeta.conclusionStale && isUpdatingConclusion) {
      if (!conclusionsHash) {
        throw new TanmiError(
          "CONCLUSIONS_HASH_REQUIRED",
          "结论已过期，更新前需要提供 conclusionsHash，请先调用 context_get 获取最新上下文。"
        );
      }

      // 计算当前 conclusionsHash 并验证
      const childConclusions = nodeMeta.children
        .map(cid => {
          const childMeta = graph.nodes[cid];
          return childMeta ? { nodeId: cid, conclusion: childMeta.conclusion || "" } : null;
        })
        .filter((c): c is { nodeId: string; conclusion: string } => c !== null && !!c.conclusion);

      const currentContextHash = computeConclusionsHash(childConclusions);

      if (conclusionsHash !== currentContextHash) {
        throw new TanmiError(
          "CONCLUSIONS_HASH_MISMATCH",
          "conclusionsHash 不匹配，子节点结论可能已变化。请重新调用 context_get 获取最新上下文。"
        );
      }
    }

    // 7. 处理精确替换逻辑（field + oldStr + newStr）
    const updates: string[] = [];
    let titleChanged = false;

    if (field && oldStr !== undefined && newStr !== undefined) {
      // 精确替换模式
      const fieldKey = field === "note" ? "notes" : field;
      const targetContent = nodeInfo[fieldKey] || "";

      // 使用正则计算匹配次数（转义特殊字符）
      const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapeRegExp(oldStr), "g");
      const matches = targetContent.match(regex);
      const count = matches ? matches.length : 0;

      if (count === 0) {
        throw new TanmiError("NO_MATCH", "未找到匹配内容");
      }
      if (count > 1) {
        throw new TanmiError("MULTI_MATCH", `找到 ${count} 处匹配，请提供更多上下文`);
      }

      // 执行替换
      const newContent = targetContent.replace(oldStr, newStr);
      nodeInfo[fieldKey] = newContent;
      updates.push(`${field} 精确替换`);
    } else {
      // 传统整体更新模式
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
      // 清除 stale 标志：用户已确认读取了子节点结论并更新了本节点结论
      if (nodeMeta.conclusionStale) {
        delete graph.nodes[nodeId].conclusionStale;
      }
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

  // ========== 工具拆分: replace/edit 方法 ==========

  /**
   * 全量替换节点字段
   * 直接替换 requirement/conclusion/notes 字段内容
   */
  async replace(params: NodeReplaceParams): Promise<{ success: boolean; error?: string; contentHash?: string }> {
    const { workspaceId, nodeId, contentHash, requirement, conclusion, notes } = params;

    // 1. 获取 projectRoot 和 wsDirName
    const { projectRoot, wsDirName } = await this.resolveProjectRoot(workspaceId);

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    if (!graph.nodes[nodeId]) {
      return { success: false, error: `节点 "${nodeId}" 不存在` };
    }

    const nodeDirName = graph.nodes[nodeId].dirName || nodeId;

    // 3. 读取现有 Info.md
    const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName);

    // 4. 验证 contentHash（防止并发覆盖）
    if (!contentHash) {
      return { success: false, error: "contentHash 必填，请先 node_get 获取" };
    }
    const currentHash = computeNodeHash({
      title: nodeInfo.title,
      requirement: nodeInfo.requirement,
      note: nodeInfo.notes,
      conclusion: nodeInfo.conclusion,
    });
    if (currentHash !== contentHash) {
      return { success: false, error: "内容已变更，请重新 node_get" };
    }

    const currentTime = now();
    const updates: string[] = [];

    // 5. 执行替换
    if (requirement !== undefined && requirement !== nodeInfo.requirement) {
      nodeInfo.requirement = requirement;
      updates.push("requirement");
    }
    if (conclusion !== undefined && conclusion !== nodeInfo.conclusion) {
      nodeInfo.conclusion = conclusion;
      updates.push("conclusion");
    }
    if (notes !== undefined && notes !== nodeInfo.notes) {
      nodeInfo.notes = notes;
      updates.push("notes");
    }

    // 如果没有任何更新，直接返回成功（contentHash 不变）
    if (updates.length === 0) {
      return { success: true, contentHash };
    }

    // 6. 更新时间戳
    nodeInfo.updatedAt = currentTime;

    // 7. 写入 Info.md
    await this.md.writeNodeInfo(projectRoot, wsDirName, nodeDirName, nodeInfo);

    // 8. 更新 graph.json
    graph.nodes[nodeId].updatedAt = currentTime;
    if (conclusion !== undefined) {
      graph.nodes[nodeId].conclusion = conclusion || null;
      // 清除 stale 标志：用户已确认读取了子节点结论并更新了本节点结论
      if (graph.nodes[nodeId].conclusionStale) {
        delete graph.nodes[nodeId].conclusionStale;
      }
    }
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 9. 追加日志
    await this.md.appendLog(projectRoot, wsDirName, {
      time: currentTime,
      operator: "AI",
      event: `替换节点字段: ${updates.join(", ")}`,
    }, nodeDirName);

    // 10. 推送 SSE 事件
    eventService.emitNodeUpdate(workspaceId, nodeId);

    // 11. 计算并返回新的 contentHash（供后续操作复用，避免重复 node_get）
    const newContentHash = computeNodeHash({
      title: nodeInfo.title,
      requirement: nodeInfo.requirement,
      note: nodeInfo.notes,
      conclusion: nodeInfo.conclusion,
    });

    return { success: true, contentHash: newContentHash };
  }

  /**
   * 精确替换节点字段中的特定字符串或行范围
   *
   * 替换模式：
   * - mode='string': 字符串精确替换，需提供 oldStr + newStr
   * - mode='line_range': 行范围替换，需提供 lineStart + lineEnd + newStr
   */
  async edit(params: NodeEditParams): Promise<{ success: boolean; error?: string; contentHash?: string }> {
    const { workspaceId, nodeId, contentHash, field, oldStr, newStr, lineStart, lineEnd } = params;

    // 1. 验证 mode 参数（默认 'string'）
    const mode = params.mode ?? "string";

    // 2. 参数校验
    if (mode === "string") {
      if (oldStr === undefined || oldStr === null) {
        return { success: false, error: "mode=string 时 oldStr 必填" };
      }
      if (lineStart !== undefined || lineEnd !== undefined) {
        return { success: false, error: "mode=string 时不能指定 lineStart/lineEnd" };
      }
    } else if (mode === "line_range") {
      if (lineStart === undefined || lineEnd === undefined) {
        return { success: false, error: "mode=line_range 时 lineStart 和 lineEnd 必填" };
      }
      if (oldStr !== undefined) {
        return { success: false, error: "mode=line_range 时不能指定 oldStr" };
      }
      // 行号基本校验
      if (lineStart < 1) {
        return { success: false, error: "lineStart 必须 >= 1" };
      }
      if (lineStart > lineEnd) {
        return { success: false, error: "lineStart 不能大于 lineEnd" };
      }
    } else {
      return { success: false, error: `无效的 mode: ${mode}，支持 'string' 或 'line_range'` };
    }

    // 3. 获取 projectRoot 和 wsDirName
    const { projectRoot, wsDirName } = await this.resolveProjectRoot(workspaceId);

    // 4. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    if (!graph.nodes[nodeId]) {
      return { success: false, error: `节点 "${nodeId}" 不存在` };
    }

    const nodeDirName = graph.nodes[nodeId].dirName || nodeId;

    // 5. 读取现有 Info.md
    const nodeInfo = await this.md.readNodeInfo(projectRoot, wsDirName, nodeDirName);

    // 6. 验证 contentHash（防止并发覆盖）
    if (!contentHash) {
      return { success: false, error: "contentHash 必填，请先 node_get 获取" };
    }
    const currentHash = computeNodeHash({
      title: nodeInfo.title,
      requirement: nodeInfo.requirement,
      note: nodeInfo.notes,
      conclusion: nodeInfo.conclusion,
    });
    if (currentHash !== contentHash) {
      return { success: false, error: "内容已变更，请重新 node_get" };
    }

    // 7. 获取目标字段内容
    const fieldKey = field === "notes" ? "notes" : field;
    const targetContent = nodeInfo[fieldKey] || "";

    let newContent: string;
    const currentTime = now();

    if (mode === "string") {
      // 8a. 字符串模式：检查 oldStr 存在性和唯一性
      // 特殊情况：oldStr 为空字符串时，仅当目标字段也为空时允许（用于向空字段添加内容）
      if (oldStr === "") {
        if (targetContent !== "") {
          return { success: false, error: "oldStr 为空时，目标字段也必须为空（用于向空字段添加内容）" };
        }
        newContent = newStr;
      } else {
        const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escapeRegExp(oldStr!), "g");
        const matches = targetContent.match(regex);
        const count = matches ? matches.length : 0;

        if (count === 0) {
          return { success: false, error: "oldStr 未找到" };
        }
        if (count > 1) {
          return { success: false, error: "oldStr 出现多次，请提供更精确的匹配" };
        }

        // 执行替换
        newContent = targetContent.replace(oldStr!, newStr);
      }
    } else {
      // 8b. 行范围模式：按行替换
      const lines = targetContent.split("\n");
      const totalLines = lines.length;

      // 验证行号范围
      if (lineEnd! > totalLines) {
        return { success: false, error: `lineEnd (${lineEnd}) 超出总行数 (${totalLines})` };
      }

      // 执行行范围替换：
      // - 删除 lineStart 到 lineEnd 的行（闭区间）
      // - 在 lineStart 位置插入 newStr（可能是多行或空字符串）
      const beforeLines = lines.slice(0, lineStart! - 1);
      const afterLines = lines.slice(lineEnd!);

      if (newStr === "") {
        // 空字符串：删除指定行
        newContent = [...beforeLines, ...afterLines].join("\n");
      } else {
        // 非空：替换为新内容（可能是多行）
        const newLines = newStr.split("\n");
        newContent = [...beforeLines, ...newLines, ...afterLines].join("\n");
      }
    }

    // 9. 更新内容和元数据
    nodeInfo[fieldKey] = newContent;
    nodeInfo.updatedAt = currentTime;

    // 10. 写入 Info.md
    await this.md.writeNodeInfo(projectRoot, wsDirName, nodeDirName, nodeInfo);

    // 11. 更新 graph.json
    graph.nodes[nodeId].updatedAt = currentTime;
    if (field === "conclusion") {
      graph.nodes[nodeId].conclusion = newContent || null;
      // 清除 stale 标志：用户已确认读取了子节点结论并更新了本节点结论
      if (graph.nodes[nodeId].conclusionStale) {
        delete graph.nodes[nodeId].conclusionStale;
      }
    }
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 12. 追加日志
    const logEvent = mode === "string"
      ? `精确替换 ${field} 字段`
      : `行范围替换 ${field} 字段 (行 ${lineStart}-${lineEnd})`;
    await this.md.appendLog(projectRoot, wsDirName, {
      time: currentTime,
      operator: "AI",
      event: logEvent,
    }, nodeDirName);

    // 13. 推送 SSE 事件
    eventService.emitNodeUpdate(workspaceId, nodeId);

    // 14. 计算并返回新的 contentHash（供后续操作复用，避免重复 node_get）
    const newContentHash = computeNodeHash({
      title: nodeInfo.title,
      requirement: nodeInfo.requirement,
      note: nodeInfo.notes,
      conclusion: nodeInfo.conclusion,
    });

    return { success: true, contentHash: newContentHash };
  }
}
