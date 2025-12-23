// src/services/ReferenceService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  NodeIsolateParams,
  NodeIsolateResult,
  NodeReferenceParams,
  NodeReferenceResult,
} from "../types/context.js";
import type { DocRef } from "../types/workspace.js";
import { TanmiError } from "../types/errors.js";
import { now, formatShort } from "../utils/time.js";

/**
 * 引用服务
 * 处理节点隔离和引用管理
 */
export class ReferenceService {
  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 根据 workspaceId 获取工作区信息
   */
  private async resolveWorkspaceInfo(workspaceId: string): Promise<{ projectRoot: string; wsDirName: string }> {
    const entry = await this.json.findWorkspaceEntry(workspaceId);
    if (!entry) {
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    return {
      projectRoot: entry.projectRoot,
      wsDirName: entry.dirName || entry.id,  // 向后兼容
    };
  }

  /**
   * 设置节点隔离状态
   */
  async isolate(params: NodeIsolateParams): Promise<NodeIsolateResult> {
    const { workspaceId, nodeId, isolate } = params;

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    const currentTime = now();
    const timestamp = formatShort(currentTime);

    // 3. 更新节点的 isolate 字段
    const nodeMeta = graph.nodes[nodeId];
    const nodeDirName = nodeMeta.dirName || nodeId;  // 向后兼容
    const previousIsolate = nodeMeta.isolate;
    nodeMeta.isolate = isolate;

    // 4. 更新 updatedAt
    nodeMeta.updatedAt = currentTime;

    // 5. 写入 graph.json
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 6. 追加日志
    if (previousIsolate !== isolate) {
      const event = isolate ? "设置节点隔离（切断上下文继承）" : "取消节点隔离";
      await this.md.appendTypedLogEntry(projectRoot, wsDirName, {
        timestamp,
        operator: "AI",
        event,
      }, nodeDirName);
    }

    // 7. 返回结果
    return {
      success: true,
    };
  }

  /**
   * 管理引用
   */
  async reference(params: NodeReferenceParams): Promise<NodeReferenceResult> {
    const { workspaceId, nodeId, targetIdOrPath, action, description } = params;

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    const currentTime = now();
    const timestamp = formatShort(currentTime);
    const nodeMeta = graph.nodes[nodeId];
    const nodeDirName = nodeMeta.dirName || nodeId;  // 向后兼容

    // 3. 读取节点 Info.md
    const nodeInfo = await this.md.readNodeInfoFull(projectRoot, wsDirName, nodeDirName);
    let docs = nodeInfo.docs;

    // 4. 判断是节点引用还是文档引用
    const isNodeReference = graph.nodes[targetIdOrPath] !== undefined;

    // 5. 根据 action 执行操作
    switch (action) {
      case "add":
        docs = this.addReference(docs, targetIdOrPath, description || "", isNodeReference);
        // 如果是节点引用，同步更新 graph.json 的 references 数组
        if (isNodeReference && !nodeMeta.references.includes(targetIdOrPath)) {
          nodeMeta.references.push(targetIdOrPath);
        }
        break;

      case "remove":
        docs = this.removeReference(docs, targetIdOrPath);
        // 如果是节点引用，同步更新 graph.json 的 references 数组
        if (isNodeReference) {
          nodeMeta.references = nodeMeta.references.filter(
            id => id !== targetIdOrPath
          );
        }
        break;
    }

    // 6. 写入 Info.md
    await this.md.writeNodeInfoFull(projectRoot, wsDirName, nodeDirName, {
      ...nodeInfo,
      docs,
      updatedAt: currentTime,
    });

    // 7. 更新 graph.json
    nodeMeta.updatedAt = currentTime;
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 8. 追加日志
    const actionDescriptions: Record<string, string> = {
      add: "添加引用",
      remove: "移除引用",
    };
    await this.md.appendTypedLogEntry(projectRoot, wsDirName, {
      timestamp,
      operator: "AI",
      event: `${actionDescriptions[action]}: ${targetIdOrPath}`,
    }, nodeDirName);

    // 9. 返回更新后的引用列表
    return {
      success: true,
      references: docs,
    };
  }

  /**
   * 添加引用
   */
  private addReference(
    docs: DocRef[],
    targetIdOrPath: string,
    description: string,
    isNodeReference: boolean
  ): DocRef[] {
    // 检查是否已存在
    const exists = docs.some(d => d.path === targetIdOrPath);
    if (exists) {
      throw new TanmiError("REFERENCE_EXISTS", `引用 "${targetIdOrPath}" 已存在`);
    }

    // 添加新引用
    const newRef: DocRef = {
      path: targetIdOrPath,
      description: description || (isNodeReference ? `节点引用: ${targetIdOrPath}` : targetIdOrPath),
    };

    return [...docs, newRef];
  }

  /**
   * 移除引用
   */
  private removeReference(docs: DocRef[], targetIdOrPath: string): DocRef[] {
    const index = docs.findIndex(d => d.path === targetIdOrPath);
    if (index === -1) {
      throw new TanmiError("REFERENCE_NOT_FOUND", `引用 "${targetIdOrPath}" 不存在`);
    }
    return docs.filter(d => d.path !== targetIdOrPath);
  }
}
