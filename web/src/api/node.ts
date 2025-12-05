// 节点 API
import client from './client'
import type {
  NodeListResult,
  NodeGetResult,
  NodeCreateResult,
  NodeUpdateResult,
  NodeDeleteResult,
  NodeSplitResult,
  NodeTransitionResult,
  TransitionAction,
  DocRef,
} from '@/types'

export const nodeApi = {
  // 创建节点
  create(
    workspaceId: string,
    params: { parentId: string; title: string; requirement?: string; docs?: DocRef[] }
  ): Promise<NodeCreateResult> {
    return client.post(`/workspaces/${workspaceId}/nodes`, params)
  },

  // 获取节点树
  list(workspaceId: string, rootId?: string, depth?: number): Promise<NodeListResult> {
    return client.get(`/workspaces/${workspaceId}/nodes`, { params: { rootId, depth } })
  },

  // 获取节点详情
  get(workspaceId: string, nodeId: string): Promise<NodeGetResult> {
    return client.get(`/workspaces/${workspaceId}/nodes/${nodeId}`)
  },

  // 更新节点
  update(
    workspaceId: string,
    nodeId: string,
    params: { title?: string; requirement?: string; note?: string }
  ): Promise<NodeUpdateResult> {
    return client.patch(`/workspaces/${workspaceId}/nodes/${nodeId}`, params)
  },

  // 删除节点
  delete(workspaceId: string, nodeId: string): Promise<NodeDeleteResult> {
    return client.delete(`/workspaces/${workspaceId}/nodes/${nodeId}`)
  },

  // 分裂节点
  split(
    workspaceId: string,
    parentId: string,
    params: { title: string; requirement: string; inheritContext?: boolean }
  ): Promise<NodeSplitResult> {
    return client.post(`/workspaces/${workspaceId}/nodes/${parentId}/split`, params)
  },

  // 状态转换
  transition(
    workspaceId: string,
    nodeId: string,
    params: { action: TransitionAction; reason?: string; conclusion?: string }
  ): Promise<NodeTransitionResult> {
    return client.post(`/workspaces/${workspaceId}/nodes/${nodeId}/transition`, params)
  },
}
