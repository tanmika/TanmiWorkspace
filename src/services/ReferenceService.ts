// src/services/ReferenceService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  NodeIsolateParams,
  NodeIsolateResult,
  NodeReferenceParams,
  NodeReferenceResult,
  NormalizedReference,
} from "../types/context.js";
import type { DocRef } from "../types/workspace.js";
import { TanmiError } from "../types/errors.js";
import { now, formatShort } from "../utils/time.js";
import { eventService } from "./EventService.js";

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

    // 7. 发送事件通知
    eventService.emitNodeUpdate(workspaceId, nodeId);

    // 8. 返回结果
    return {
      success: true,
    };
  }

  /**
   * 管理引用
   */
  async reference(params: NodeReferenceParams): Promise<NodeReferenceResult> {
    const { workspaceId, nodeId, action, description } = params;
    let { targetIdOrPath } = params;

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 1.5 规范化引用格式（智能纠错）
    const normalized = await this.normalizeReference(workspaceId, targetIdOrPath);
    targetIdOrPath = normalized.uri;

    // 2. 验证节点存在
    const graph = await this.json.readGraph(projectRoot, wsDirName);
    if (!graph.nodes[nodeId]) {
      throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
    }

    const currentTime = now();
    const timestamp = formatShort(currentTime);
    const nodeMeta = graph.nodes[nodeId];
    // 兼容旧数据：确保 references 数组存在
    if (!nodeMeta.references) {
      nodeMeta.references = [];
    }
    const nodeDirName = nodeMeta.dirName || nodeId;  // 向后兼容

    // 3. 读取节点 Info.md
    const nodeInfo = await this.md.readNodeInfoFull(projectRoot, wsDirName, nodeDirName);
    let docs = nodeInfo.docs;

    // 4. 判断引用类型（使用 normalizeReference 返回的类型）
    const isMemoReference = normalized.type === "memo";
    const isNodeReference = normalized.type === "node";

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

    // 9. 发送事件通知
    eventService.emitReferenceUpdate(workspaceId, nodeId);

    // 10. 返回更新后的引用列表
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
    isNodeReference: boolean,
    isMemoReference: boolean
  ): DocRef[] {
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
    const newRef: DocRef = {
      path: targetIdOrPath,
      description: description || defaultDescription,
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

  /**
   * 规范化引用输入
   *
   * 纠错规则：
   * 1. memo-xxx → memo://memo-xxx（自动补全）
   * 2. node-xxx → node://node-xxx（自动补全）
   * 3. ./path → file://./path（相对路径自动补全）
   * 4. memos/标题_id → memo://memo-id（路径转引用）
   * 5. nodes/标题_id → node://node-id（路径转引用）
   * 6. memo://memo-xxx 保持不变
   * 7. memo:memo-xxx 报错并提示正确格式
   * 8. 目标不存在时报错
   */
  async normalizeReference(workspaceId: string, input: string): Promise<NormalizedReference> {
    // 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);
    const graph = await this.json.readGraph(projectRoot, wsDirName);

    // 规则 7: 检测歧义格式 memo:xxx 或 node:xxx（单冒号）
    const ambiguousMatch = input.match(/^(memo|node):(?!\/)(.+)$/);
    if (ambiguousMatch) {
      const [, type, rest] = ambiguousMatch;
      throw new TanmiError(
        "INVALID_REFERENCE_FORMAT",
        `引用格式错误: "${input}"。请使用正确格式 ${type}://${rest}`
      );
    }

    // 规则 6: 已规范的 memo:// 格式
    if (input.startsWith("memo://")) {
      const memoId = input.substring(7);
      const memosIndex = graph.memos || {};
      if (!memosIndex[memoId]) {
        throw new TanmiError("MEMO_NOT_FOUND", `备忘 "${memoId}" 不存在`);
      }
      return {
        type: "memo",
        uri: input,
        targetId: memoId,
      };
    }

    // 规则 6: 已规范的 node:// 格式
    if (input.startsWith("node://")) {
      const nodeId = input.substring(7);
      if (!graph.nodes[nodeId]) {
        throw new TanmiError("NODE_NOT_FOUND", `节点 "${nodeId}" 不存在`);
      }
      return {
        type: "node",
        uri: input,
        targetId: nodeId,
      };
    }

    // 规则 6: 已规范的 file:// 格式
    if (input.startsWith("file://")) {
      const filePath = input.substring(7);
      return {
        type: "file",
        uri: input,
        path: filePath,
      };
    }

    // 规则 4: 路径转引用 memos/标题_id → memo://memo-id
    if (input.startsWith("memos/")) {
      const dirName = input.substring(6); // 去掉 "memos/" 前缀
      // 在 memos 索引中查找匹配的 dirName
      const memosIndex = graph.memos || {};
      for (const [memoId, memoMeta] of Object.entries(memosIndex)) {
        if (memoMeta.dirName === dirName) {
          return {
            type: "memo",
            uri: `memo://${memoId}`,
            targetId: memoId,
          };
        }
      }
      throw new TanmiError("MEMO_NOT_FOUND", `备忘目录 "${dirName}" 不存在`);
    }

    // 规则 5: 路径转引用 nodes/标题_id → node://node-id
    if (input.startsWith("nodes/")) {
      const dirName = input.substring(6); // 去掉 "nodes/" 前缀
      // 在 nodes 索引中查找匹配的 dirName
      for (const [nodeId, nodeMeta] of Object.entries(graph.nodes)) {
        if (nodeMeta.dirName === dirName) {
          return {
            type: "node",
            uri: `node://${nodeId}`,
            targetId: nodeId,
          };
        }
      }
      throw new TanmiError("NODE_NOT_FOUND", `节点目录 "${dirName}" 不存在`);
    }

    // 规则 1: 自动补全 memo-xxx → memo://memo-xxx
    if (input.startsWith("memo-")) {
      const memosIndex = graph.memos || {};
      if (!memosIndex[input]) {
        throw new TanmiError("MEMO_NOT_FOUND", `备忘 "${input}" 不存在`);
      }
      return {
        type: "memo",
        uri: `memo://${input}`,
        targetId: input,
      };
    }

    // 规则 2: 自动补全 node-xxx → node://node-xxx
    if (input.startsWith("node-")) {
      if (!graph.nodes[input]) {
        throw new TanmiError("NODE_NOT_FOUND", `节点 "${input}" 不存在`);
      }
      return {
        type: "node",
        uri: `node://${input}`,
        targetId: input,
      };
    }

    // 规则 3: 自动补全相对路径 ./path → file://./path
    if (input.startsWith("./") || input.startsWith("../")) {
      return {
        type: "file",
        uri: `file://${input}`,
        path: input,
      };
    }

    // 默认处理: 视为文件路径
    return {
      type: "file",
      uri: `file://${input}`,
      path: input,
    };
  }
}
