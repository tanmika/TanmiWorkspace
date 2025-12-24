// src/services/ReferenceService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  NodeIsolateParams,
  NodeIsolateResult,
  NodeReferenceParams,
  NodeReferenceResult,
  DocRefWithStatus,
} from "../types/context.js";
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
    const nodeInfo = await this.md.readNodeInfoWithStatus(projectRoot, wsDirName, nodeDirName);
    let docs = nodeInfo.docsWithStatus;

    // 4. 判断引用类型：节点引用、备忘引用或文档引用
    const isMemoReference = targetIdOrPath.startsWith("memo://");
    let isNodeReference = false;

    if (isMemoReference) {
      // 提取 memo ID 并验证备忘是否存在
      const memoId = targetIdOrPath.substring(7); // 去掉 "memo://" 前缀
      const memosIndex = graph.memos || {};
      if (!memosIndex[memoId]) {
        throw new TanmiError("MEMO_NOT_FOUND", `备忘 "${memoId}" 不存在`);
      }
    } else {
      // 检查是否是节点引用
      isNodeReference = graph.nodes[targetIdOrPath] !== undefined;
    }

    // 5. 根据 action 执行操作
    switch (action) {
      case "add":
        docs = this.addReference(docs, targetIdOrPath, description || "", isNodeReference, isMemoReference);
        // 如果是节点引用，同步更新 graph.json 的 references 数组
        if (isNodeReference && !nodeMeta.references.includes(targetIdOrPath)) {
          nodeMeta.references.push(targetIdOrPath);
        }
        // 如果是备忘引用，同步更新 graph.json 的 references 数组
        if (isMemoReference && !nodeMeta.references.includes(targetIdOrPath)) {
          nodeMeta.references.push(targetIdOrPath);
        }
        break;

      case "remove":
        docs = this.removeReference(docs, targetIdOrPath);
        // 如果是节点引用或备忘引用，同步更新 graph.json 的 references 数组
        if (isNodeReference || isMemoReference) {
          nodeMeta.references = nodeMeta.references.filter(
            id => id !== targetIdOrPath
          );
        }
        break;

      case "expire":
        docs = this.updateRefStatus(docs, targetIdOrPath, "expired");
        break;

      case "activate":
        docs = this.updateRefStatus(docs, targetIdOrPath, "active");
        break;
    }

    // 6. 写入 Info.md
    await this.md.writeNodeInfoWithStatus(projectRoot, wsDirName, nodeDirName, {
      ...nodeInfo,
      updatedAt: currentTime,
      docsWithStatus: docs,
    });

    // 7. 更新 graph.json
    nodeMeta.updatedAt = currentTime;
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 8. 追加日志
    const actionDescriptions: Record<string, string> = {
      add: "添加引用",
      remove: "移除引用",
      expire: "标记引用过期",
      activate: "激活引用",
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
    docs: DocRefWithStatus[],
    targetIdOrPath: string,
    description: string,
    isNodeReference: boolean,
    isMemoReference: boolean
  ): DocRefWithStatus[] {
    // 检查是否已存在
    const exists = docs.some(d => d.path === targetIdOrPath);
    if (exists) {
      throw new TanmiError("REFERENCE_EXISTS", `引用 "${targetIdOrPath}" 已存在`);
    }

    // 生成默认描述
    let defaultDescription = targetIdOrPath;
    if (isNodeReference) {
      defaultDescription = `节点引用: ${targetIdOrPath}`;
    } else if (isMemoReference) {
      defaultDescription = `备忘引用: ${targetIdOrPath}`;
    }

    // 添加新引用
    const newRef: DocRefWithStatus = {
      path: targetIdOrPath,
      description: description || defaultDescription,
      status: "active",
    };

    return [...docs, newRef];
  }

  /**
   * 移除引用
   */
  private removeReference(docs: DocRefWithStatus[], targetIdOrPath: string): DocRefWithStatus[] {
    const index = docs.findIndex(d => d.path === targetIdOrPath);
    if (index === -1) {
      throw new TanmiError("REFERENCE_NOT_FOUND", `引用 "${targetIdOrPath}" 不存在`);
    }
    return docs.filter(d => d.path !== targetIdOrPath);
  }

  /**
   * 更新引用状态
   */
  private updateRefStatus(
    docs: DocRefWithStatus[],
    targetIdOrPath: string,
    status: "active" | "expired"
  ): DocRefWithStatus[] {
    const index = docs.findIndex(d => d.path === targetIdOrPath);
    if (index === -1) {
      throw new TanmiError("REFERENCE_NOT_FOUND", `引用 "${targetIdOrPath}" 不存在`);
    }

    return docs.map(d => {
      if (d.path === targetIdOrPath) {
        return { ...d, status };
      }
      return d;
    });
  }
}
