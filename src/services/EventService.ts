// src/services/EventService.ts
// SSE 事件推送服务 - 支持跨进程事件转发

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

// 内部事件令牌（用于验证跨进程调用）
const INTERNAL_EVENT_TOKEN = process.env.TANMI_INTERNAL_TOKEN || "tanmi-internal-event-token";

class EventService {
  private clients: Map<string, FastifyReply> = new Map();
  private clientCounter = 0;

  // 远程 HTTP 服务配置（跨进程转发用）
  private remoteHttpPort: number | null = null;
  private remoteHttpHost: string = "127.0.0.1";

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
   * 设置远程 HTTP 服务地址（用于跨进程事件转发）
   */
  setRemoteHttp(port: number, host: string = "127.0.0.1"): void {
    this.remoteHttpPort = port;
    this.remoteHttpHost = host;
  }

  /**
   * 清除远程 HTTP 配置
   */
  clearRemoteHttp(): void {
    this.remoteHttpPort = null;
  }

  /**
   * 检查是否配置了远程 HTTP
   */
  hasRemoteHttp(): boolean {
    return this.remoteHttpPort !== null;
  }

  /**
   * 获取内部事件令牌
   */
  static getInternalToken(): string {
    return INTERNAL_EVENT_TOKEN;
  }

  /**
   * 转发事件到远程 HTTP 服务
   */
  private async forwardToRemote(event: SSEEvent): Promise<void> {
    if (!this.remoteHttpPort) return;

    try {
      const url = `http://${this.remoteHttpHost}:${this.remoteHttpPort}/api/internal/events`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": INTERNAL_EVENT_TOKEN,
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        console.warn(`[EventService] 事件转发失败: ${response.status}`);
      }
    } catch (err) {
      // 转发失败不影响主流程，只记录警告
      console.warn(`[EventService] 事件转发异常:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * 向所有客户端推送事件（本地 + 远程）
   */
  broadcast(event: SSEEvent): void {
    const data = JSON.stringify(event);
    const message = `data: ${data}\n\n`;

    // 本地广播
    for (const [clientId, reply] of this.clients) {
      try {
        reply.raw.write(message);
      } catch {
        // 写入失败，移除客户端
        this.clients.delete(clientId);
      }
    }

    // 远程转发（异步，不阻塞）
    if (this.remoteHttpPort) {
      this.forwardToRemote(event);
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

// 导出类（用于类型和静态方法）
export { EventService };
