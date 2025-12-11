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
  servicesInstance = {
    fs,
    json,
    md,
    sessionStorage,
    workspace: new WorkspaceService(json, md, fs),
    node: new NodeService(json, md, fs),
    state: new StateService(json, md, fs),
    context: new ContextService(json, md, fs),
    reference: new ReferenceService(json, md, fs),
    log: new LogService(json, md, fs),
    session: new SessionService(sessionStorage, json, md, fs),
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
