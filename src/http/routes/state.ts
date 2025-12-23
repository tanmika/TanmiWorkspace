// src/http/routes/state.ts
// 状态转换相关 API 路由

import type { FastifyInstance, FastifyRequest } from "fastify";
import { getServices } from "../services.js";
import { eventService } from "../EventService.js";
import type { NodeTransitionParams, TransitionAction } from "../../types/index.js";

// 请求类型定义
interface NodeIdParams {
  wid: string;
  nid: string;
}

interface TransitionBody {
  action: TransitionAction;
  reason?: string;
  conclusion?: string;
}

export async function stateRoutes(fastify: FastifyInstance): Promise<void> {
  const services = getServices();

  /**
   * POST /api/workspaces/:wid/nodes/:nid/transition - 状态转换
   */
  fastify.post<{ Params: NodeIdParams; Body: TransitionBody }>(
    "/workspaces/:wid/nodes/:nid/transition",
    async (request: FastifyRequest<{ Params: NodeIdParams; Body: TransitionBody }>) => {
      const params: NodeTransitionParams = {
        workspaceId: request.params.wid,
        nodeId: request.params.nid,
        action: request.body.action,
        reason: request.body.reason,
        conclusion: request.body.conclusion,
      };
      const result = await services.state.transition(params);

      // 记录手动变更（WebUI 操作）
      let manualOperationRecorded = false;
      try {
        const projectRoot = await services.workspace.resolveProjectRoot(request.params.wid);
        // 获取正确的 dirName（从索引和 graph 中读取）
        const wsEntry = await services.json.findWorkspaceEntry(request.params.wid);
        const wsDirName = wsEntry?.dirName || request.params.wid;
        const graph = await services.json.readGraph(projectRoot, wsDirName);
        const node = graph.nodes[request.params.nid];
        const nodeDirName = node?.dirName || request.params.nid;
        const nodeInfo = await services.md.readNodeInfo(projectRoot, wsDirName, nodeDirName);

        await services.workspace.addManualChange(request.params.wid, {
          timestamp: new Date().toISOString(),
          type: "transition",
          nodeId: request.params.nid,
          nodeName: nodeInfo.title,
          fromStatus: result.previousStatus,
          toStatus: result.currentStatus,
          description: `节点「${nodeInfo.title}」从 ${result.previousStatus} 变为 ${result.currentStatus}`,
          source: "webui",
        });
        manualOperationRecorded = true;
      } catch (err) {
        // 记录失败不阻塞主流程
        console.error('[HTTP] addManualChange failed:', err);
      }

      // 推送事件
      eventService.emitNodeUpdate(request.params.wid, request.params.nid);

      return { ...result, manualOperationRecorded };
    }
  );
}
