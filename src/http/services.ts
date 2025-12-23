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
import { TutorialService } from "../services/TutorialService.js";
import { InstallationService } from "../services/InstallationService.js";
import { DetectionService } from "../services/DetectionService.js";
import { HelpService } from "../tools/help.js";

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
  tutorial: TutorialService;
  installation: InstallationService;
  detection: DetectionService;
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

  // 设置 WorkspaceService 依赖（用于清除手动变更）
  context.setWorkspaceService(workspace);

  const log = new LogService(json, md, fs);
  const reference = new ReferenceService(json, md, fs);
  const dispatch = new DispatchService(json, md, fs, config);
  const tutorial = new TutorialService(workspace, node, state, log, context, reference, dispatch, config);

  // 创建独立服务实例
  const session = new SessionService(sessionStorage, json, md, fs);
  const installation = new InstallationService();
  const detection = new DetectionService();
  const help = new HelpService();

  // 设置服务依赖
  session.setInstallationService(installation);
  help.setInstallationService(installation);
  context.setInstallationService(installation);

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
    tutorial,
    installation,
    detection,
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
