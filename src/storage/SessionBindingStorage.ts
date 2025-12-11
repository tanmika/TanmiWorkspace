// src/storage/SessionBindingStorage.ts

import type { FileSystemAdapter } from "./FileSystemAdapter.js";
import * as path from "node:path";

/**
 * 会话绑定数据结构
 */
export interface SessionBinding {
  sessionId: string;       // Claude Code 的 session_id
  workspaceId: string;     // 绑定的工作区
  focusedNodeId?: string;  // 当前聚焦的节点（可选）
  boundAt: number;         // 绑定时间戳
}

/**
 * 会话绑定索引结构
 */
export interface SessionBindingIndex {
  version: "1.0";
  bindings: Record<string, SessionBinding>;
}

/**
 * 会话绑定存储
 * 管理 Claude Code 会话与工作区的绑定关系
 *
 * 存储位置：~/.tanmi-workspace[-dev]/session-bindings.json
 */
export class SessionBindingStorage {
  constructor(private fs: FileSystemAdapter) {}

  /**
   * 获取会话绑定文件路径
   */
  private getBindingsPath(): string {
    return path.join(this.fs.getGlobalBasePath(), "session-bindings.json");
  }

  /**
   * 读取所有会话绑定
   */
  async readBindings(): Promise<SessionBindingIndex> {
    const bindingsPath = this.getBindingsPath();
    if (!(await this.fs.exists(bindingsPath))) {
      return {
        version: "1.0",
        bindings: {}
      };
    }
    const content = await this.fs.readFile(bindingsPath);
    return JSON.parse(content) as SessionBindingIndex;
  }

  /**
   * 写入会话绑定
   */
  async writeBindings(index: SessionBindingIndex): Promise<void> {
    const bindingsPath = this.getBindingsPath();
    await this.fs.writeFile(bindingsPath, JSON.stringify(index, null, 2));
  }

  /**
   * 获取特定会话的绑定信息
   */
  async getBinding(sessionId: string): Promise<SessionBinding | null> {
    const index = await this.readBindings();
    return index.bindings[sessionId] || null;
  }

  /**
   * 绑定会话到工作区
   */
  async bind(sessionId: string, workspaceId: string, nodeId?: string): Promise<SessionBinding> {
    const index = await this.readBindings();

    const binding: SessionBinding = {
      sessionId,
      workspaceId,
      focusedNodeId: nodeId,
      boundAt: Date.now()
    };

    index.bindings[sessionId] = binding;
    await this.writeBindings(index);

    return binding;
  }

  /**
   * 解除会话绑定
   */
  async unbind(sessionId: string): Promise<boolean> {
    const index = await this.readBindings();

    if (!index.bindings[sessionId]) {
      return false;
    }

    delete index.bindings[sessionId];
    await this.writeBindings(index);

    return true;
  }

  /**
   * 更新聚焦节点
   */
  async updateFocus(sessionId: string, nodeId: string): Promise<boolean> {
    const index = await this.readBindings();

    if (!index.bindings[sessionId]) {
      return false;
    }

    index.bindings[sessionId].focusedNodeId = nodeId;
    await this.writeBindings(index);

    return true;
  }

  /**
   * 清理过期的会话绑定
   * @param maxAgeMs 最大保留时间（毫秒），默认 7 天
   */
  async cleanup(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<string[]> {
    const index = await this.readBindings();
    const now = Date.now();
    const expiredSessionIds: string[] = [];

    for (const [sessionId, binding] of Object.entries(index.bindings)) {
      if (now - binding.boundAt > maxAgeMs) {
        expiredSessionIds.push(sessionId);
        delete index.bindings[sessionId];
      }
    }

    if (expiredSessionIds.length > 0) {
      await this.writeBindings(index);
    }

    return expiredSessionIds;
  }

  /**
   * 获取绑定到特定工作区的所有会话
   */
  async getSessionsByWorkspace(workspaceId: string): Promise<SessionBinding[]> {
    const index = await this.readBindings();
    return Object.values(index.bindings).filter(b => b.workspaceId === workspaceId);
  }

  /**
   * 清理绑定到已删除工作区的会话
   */
  async cleanupByWorkspace(workspaceId: string): Promise<string[]> {
    const index = await this.readBindings();
    const removedSessionIds: string[] = [];

    for (const [sessionId, binding] of Object.entries(index.bindings)) {
      if (binding.workspaceId === workspaceId) {
        removedSessionIds.push(sessionId);
        delete index.bindings[sessionId];
      }
    }

    if (removedSessionIds.length > 0) {
      await this.writeBindings(index);
    }

    return removedSessionIds;
  }
}
