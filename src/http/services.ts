// src/http/services.ts
// 服务工厂 - 创建并管理所有服务实例

import { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import { JsonStorage } from "../storage/JsonStorage.js";
import { MarkdownStorage } from "../storage/MarkdownStorage.js";
import { SessionBindingStorage } from "../storage/SessionBindingStorage.js";
import { WorkspaceService } from "../services/WorkspaceService.js";
import { NodeService } from "../services/NodeService.js";
import { StateService } from "../services/StateService.js";
import { ContextService } from "../services/ContextService.js";
import { ReferenceService } from "../services/ReferenceService.js";
import { LogService } from "../services/LogService.js";
import { SessionService } from "../services/SessionService.js";
import { DispatchService } from "../services/DispatchService.js";
import { ConfigService } from "../services/ConfigService.js";
import { MemoService } from "../services/MemoService.js";
import { TutorialService } from "../services/TutorialService.js";
import { InstallationService } from "../services/InstallationService.js";
import { DetectionService } from "../services/DetectionService.js";
import { BackupService } from "../services/BackupService.js";
import { HealthService } from "../services/HealthService.js";
import { SearchService } from "../services/SearchService.js";
import { HelpService } from "../tools/help.js";
import { extractShortId } from "../utils/id.js";

export interface Services {
  fs: FileSystemAdapter;
  json: JsonStorage;
  md: MarkdownStorage;
  sessionStorage: SessionBindingStorage;
  workspace: WorkspaceService;
  node: NodeService;
  state: StateService;
  context: ContextService;
  reference: ReferenceService;
  log: LogService;
  session: SessionService;
  dispatch: DispatchService;
  config: ConfigService;
  memo: MemoService;
  tutorial: TutorialService;
  installation: InstallationService;
  detection: DetectionService;
  backup: BackupService;
  health: HealthService;
  search: SearchService;
  help: HelpService;
}

let servicesInstance: Services | null = null;

/**
 * 创建服务实例（单例模式）
 */
export function createServices(): Services {
  if (servicesInstance) {
    return servicesInstance;
  }

  // 初始化存储层
  const fs = new FileSystemAdapter();
  const json = new JsonStorage(fs);
  const md = new MarkdownStorage(fs);
  const sessionStorage = new SessionBindingStorage(fs);

  // 初始化服务层
  const config = new ConfigService();
  const workspace = new WorkspaceService(json, md, fs);
  const node = new NodeService(json, md, fs);
  const state = new StateService(json, md, fs);
  const context = new ContextService(json, md, fs);

  // 设置 StateService 依赖（用于 token 生成）
  workspace.setStateService(state);
  node.setStateService(state);

  const log = new LogService(json, md, fs);
  const reference = new ReferenceService(json, md, fs);
  const dispatch = new DispatchService(json, md, fs, config);
  dispatch.setNodeService(node);  // 设置 NodeService 依赖（用于自动创建 Review 节点）
  const memo = new MemoService(json, md, fs);

  // 设置 WorkspaceService 依赖（用于清除手动变更）
  context.setWorkspaceService(workspace);
  // 设置 MemoService 依赖（用于获取 memo 内容）
  context.setMemoService(memo);
  const tutorial = new TutorialService(workspace, node, state, log, context, reference, dispatch, config, memo);

  // 创建独立服务实例
  const session = new SessionService(sessionStorage, json, md, fs);
  const installation = new InstallationService();
  const detection = new DetectionService();
  const backup = new BackupService(json, fs);
  const health = new HealthService(json, fs);
  const search = new SearchService(json, md, fs);
  const help = new HelpService();

  // 设置服务依赖
  session.setInstallationService(installation);
  help.setInstallationService(installation);
  context.setInstallationService(installation);
  health.setWorkspaceService(workspace);

  servicesInstance = {
    fs,
    json,
    md,
    sessionStorage,
    workspace,
    node,
    state,
    context,
    reference,
    log,
    session,
    dispatch,
    config,
    memo,
    tutorial,
    installation,
    detection,
    backup,
    health,
    search,
    help,
  };

  return servicesInstance;
}

/**
 * 获取服务实例
 */
export function getServices(): Services {
  if (!servicesInstance) {
    return createServices();
  }
  return servicesInstance;
}

/**
 * 确保基础目录和索引文件存在
 */
export async function ensureBaseSetup(): Promise<void> {
  const services = getServices();
  await services.fs.ensureIndex();

  // 启动时轻量检测：验证所有工作区的基础完整性
  await performStartupHealthCheck(services);
}

/**
 * 启动时轻量健康检测
 * 检测 index 中所有工作区的基础完整性，发现问题则标记为 error 状态
 */
async function performStartupHealthCheck(services: Services): Promise<void> {
  try {
    const index = await services.json.readIndex();
    const validStatuses = new Set(["active", "archived", "error"]);

    // 检测 ID 重复
    const idSet = new Set<string>();
    const duplicateIds = new Set<string>();
    for (const ws of index.workspaces) {
      if (idSet.has(ws.id)) {
        duplicateIds.add(ws.id);
      }
      idSet.add(ws.id);
    }

    let needSaveIndex = false;

    for (const ws of index.workspaces) {
      // 跳过已标记为 error 的工作区
      if (ws.status === "error") continue;

      try {
        // 1. 字段完整性检测
        const requiredFields = ["id", "name", "dirName", "projectRoot", "status", "createdAt", "updatedAt"];
        for (const field of requiredFields) {
          if (!ws[field as keyof typeof ws]) {
            console.error(`[health] 工作区 ${ws.id} 缺少必填字段: ${field}`);
          }
        }

        // 2. 状态值有效性检测
        if (!validStatuses.has(ws.status)) {
          console.error(`[health] 工作区 ${ws.id} 状态值无效: ${ws.status}`);
        }

        // 3. ID 重复检测
        if (duplicateIds.has(ws.id)) {
          console.error(`[health] 工作区 ID 重复: ${ws.id}`);
        }

        // 4. 目录存在检测（含自动修复）
        let wsDirName = ws.dirName || ws.id;
        const isArchived = ws.status === "archived";
        let workspacePath = isArchived
          ? services.fs.getArchivePath(ws.projectRoot, wsDirName)
          : services.fs.getWorkspacePath(ws.projectRoot, wsDirName);

        if (!(await services.fs.exists(workspacePath))) {
          // 尝试通过 shortId 查找实际目录
          const baseDir = isArchived
            ? services.fs.getArchiveDir(ws.projectRoot)
            : services.fs.getWorkspaceRootPath(ws.projectRoot);

          let fixedDirName: string | undefined;
          if (await services.fs.exists(baseDir)) {
            const shortId = extractShortId(ws.id);
            try {
              const entries = await services.fs.readdir(baseDir);
              // 优先匹配 _shortId 后缀
              fixedDirName = entries.find(e => e.endsWith(`_${shortId}`));
              // 兜底：包含 shortId 的目录
              if (!fixedDirName && shortId.length >= 6) {
                fixedDirName = entries.find(e => e.includes(shortId));
              }
            } catch {
              // 读取目录失败，继续使用原逻辑
            }
          }

          if (fixedDirName) {
            // 自动修复：更新 index.json 中的 dirName
            ws.dirName = fixedDirName;
            wsDirName = fixedDirName;
            workspacePath = isArchived
              ? services.fs.getArchivePath(ws.projectRoot, wsDirName)
              : services.fs.getWorkspacePath(ws.projectRoot, wsDirName);
            needSaveIndex = true;
            console.error(`[health] 工作区 ${ws.id} 自动修复 dirName: ${fixedDirName}`);
          } else {
            await services.workspace.markAsError(ws.id, "dir_missing", `工作区目录不存在: ${workspacePath}`);
            console.error(`[health] 工作区 ${ws.id} 目录不存在，已标记为 error`);
            continue;
          }
        }

        // 5. 配置文件检测
        const configPath = isArchived
          ? `${services.fs.getArchivePath(ws.projectRoot, wsDirName)}/workspace.json`
          : services.fs.getWorkspaceConfigPath(ws.projectRoot, wsDirName);

        if (!(await services.fs.exists(configPath))) {
          await services.workspace.markAsError(ws.id, "config_corrupted", `配置文件不存在: workspace.json`);
          console.error(`[health] 工作区 ${ws.id} 配置文件不存在，已标记为 error`);
          continue;
        }

        try {
          const configContent = await services.fs.readFile(configPath);
          JSON.parse(configContent);
        } catch {
          await services.workspace.markAsError(ws.id, "config_corrupted", `配置文件 JSON 格式无效`);
          console.error(`[health] 工作区 ${ws.id} 配置文件格式错误，已标记为 error`);
          continue;
        }

        // 6. 图文件检测
        const graphPath = isArchived
          ? services.fs.getGraphPathWithArchive(ws.projectRoot, wsDirName, true)
          : services.fs.getGraphPath(ws.projectRoot, wsDirName);

        if (!(await services.fs.exists(graphPath))) {
          await services.workspace.markAsError(ws.id, "graph_corrupted", `图文件不存在: graph.json`);
          console.error(`[health] 工作区 ${ws.id} 图文件不存在，已标记为 error`);
          continue;
        }

        try {
          const graphContent = await services.fs.readFile(graphPath);
          JSON.parse(graphContent);
        } catch {
          await services.workspace.markAsError(ws.id, "graph_corrupted", `图文件 JSON 格式无效`);
          console.error(`[health] 工作区 ${ws.id} 图文件格式错误，已标记为 error`);
          continue;
        }
      } catch (e) {
        // 单个工作区检测失败不阻止其他工作区
        console.error(`[health] 工作区 ${ws.id} 检测失败:`, e instanceof Error ? e.message : e);
      }
    }

    // 如果有自动修复，保存 index.json
    if (needSaveIndex) {
      try {
        await services.json.writeIndex(index);
        console.error("[health] 已保存自动修复的 index.json");
      } catch (e) {
        console.error("[health] 保存 index.json 失败:", e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    // 整体检测失败不阻止服务启动
    console.error("[health] 启动时健康检测失败:", e instanceof Error ? e.message : e);
  }
}

// ============================================================================
// HTTP 路由辅助方法 - dirName 解析
// ============================================================================
// ⚠️ 重要：workspaceId/nodeId 与 wsDirName/nodeDirName 的区别
//
// - workspaceId: 工作区唯一标识符（不可变）
// - wsDirName: 工作区实际目录名（可能与 workspaceId 不同，存储在 index.json 中）
//
// - nodeId: 节点唯一标识符（不可变）
// - nodeDirName: 节点实际目录名（存储在 graph.json 的 nodes[nodeId].dirName 中）
//
// 所有访问文件系统的操作必须使用 dirName，不能直接使用 ID
// 使用以下辅助函数进行统一解析，避免遗漏导致的路径错误
// ============================================================================

export interface DirNameResolution {
  projectRoot: string;
  wsDirName: string;
}

export interface FullDirNameResolution extends DirNameResolution {
  nodeDirName: string;
}

/**
 * 解析工作区 dirName
 * 将 workspaceId 转换为实际的目录名
 *
 * @example
 * const { projectRoot, wsDirName } = await resolveWsDirName("ws-abc123");
 * // wsDirName 用于后续文件系统操作
 */
export async function resolveWsDirName(workspaceId: string): Promise<DirNameResolution> {
  const services = getServices();
  const projectRoot = await services.workspace.resolveProjectRoot(workspaceId);
  const wsEntry = await services.json.findWorkspaceEntry(workspaceId);
  const wsDirName = wsEntry?.dirName || workspaceId;
  return { projectRoot, wsDirName };
}

/**
 * 解析节点 dirName
 * 需要先有 projectRoot 和 wsDirName（可通过 resolveWsDirName 获取）
 *
 * @example
 * const nodeDirName = await resolveNodeDirName(projectRoot, wsDirName, "node-xyz");
 * // nodeDirName 用于访问节点目录（如 Info.md, Log.md）
 */
export async function resolveNodeDirName(
  projectRoot: string,
  wsDirName: string,
  nodeId: string
): Promise<string> {
  const services = getServices();
  const graph = await services.json.readGraph(projectRoot, wsDirName);
  const node = graph.nodes[nodeId];
  return node?.dirName || nodeId;
}

/**
 * 解析工作区和节点的 dirName（组合方法）
 * 一次性获取所有需要的目录名，适用于节点级别操作
 *
 * @example
 * const { projectRoot, wsDirName, nodeDirName } = await resolveDirNames("ws-abc", "node-xyz");
 * await md.readNodeInfo(projectRoot, wsDirName, nodeDirName);
 */
export async function resolveDirNames(
  workspaceId: string,
  nodeId: string
): Promise<FullDirNameResolution> {
  const { projectRoot, wsDirName } = await resolveWsDirName(workspaceId);
  const nodeDirName = await resolveNodeDirName(projectRoot, wsDirName, nodeId);
  return { projectRoot, wsDirName, nodeDirName };
}
