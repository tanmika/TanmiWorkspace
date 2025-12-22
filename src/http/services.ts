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
    session: new SessionService(sessionStorage, json, md, fs),
    dispatch,
    config,
    tutorial,
    help: new HelpService(),
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
