// src/http/EventService.ts
// SSE 事件推送服务

import { FastifyReply } from "fastify";

export type EventType =
  | "workspace_updated"
  | "node_updated"
  | "log_updated"
  | "memo_updated"
  | "dispatch_updated"
  | "context_updated"
  | "reference_updated";

export interface SSEEvent {
  type: EventType;
  workspaceId: string;
  nodeId?: string;
  timestamp: string;
}

class EventService {
  private clients: Map<string, FastifyReply> = new Map();
  private clientCounter = 0;

  /**
   * 添加 SSE 客户端连接
   */
  addClient(reply: FastifyReply): string {
    const clientId = `client_${++this.clientCounter}_${Date.now()}`;
    this.clients.set(clientId, reply);

    // 客户端断开时清理
    reply.raw.on("close", () => {
      this.clients.delete(clientId);
    });

    return clientId;
  }

  /**
   * 移除客户端
   */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  /**
   * 向所有客户端推送事件
   */
  broadcast(event: SSEEvent): void {
    const data = JSON.stringify(event);
    const message = `data: ${data}\n\n`;

    for (const [clientId, reply] of this.clients) {
      try {
        reply.raw.write(message);
      } catch {
        // 写入失败，移除客户端
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * 推送工作区更新事件
   */
  emitWorkspaceUpdate(workspaceId: string): void {
    this.broadcast({
      type: "workspace_updated",
      workspaceId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 推送节点更新事件
   */
  emitNodeUpdate(workspaceId: string, nodeId?: string): void {
    this.broadcast({
      type: "node_updated",
      workspaceId,
      nodeId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 推送日志更新事件
   */
  emitLogUpdate(workspaceId: string, nodeId: string): void {
    this.broadcast({
      type: "log_updated",
      workspaceId,
      nodeId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 推送派发状态更新事件
   */
  emitDispatchUpdate(workspaceId: string, nodeId: string): void {
    this.broadcast({
      type: "dispatch_updated",
      workspaceId,
      nodeId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 推送备忘更新事件
   */
  emitMemoUpdate(workspaceId: string, memoId?: string): void {
    this.broadcast({
      type: "memo_updated",
      workspaceId,
      nodeId: memoId, // 复用 nodeId 字段传递 memoId
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 推送上下文更新事件（聚焦变更）
   */
  emitContextUpdate(workspaceId: string, nodeId?: string): void {
    this.broadcast({
      type: "context_updated",
      workspaceId,
      nodeId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 推送引用更新事件
   */
  emitReferenceUpdate(workspaceId: string, nodeId: string): void {
    this.broadcast({
      type: "reference_updated",
      workspaceId,
      nodeId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 获取当前连接数
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

// 单例导出
export const eventService = new EventService();
