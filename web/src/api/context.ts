// 上下文 API
import client from './client'
import type {
  ContextGetResult,
  ContextFocusResult,
  NodeIsolateResult,
  NodeReferenceResult,
  ReferenceAction,
} from '@/types'

export const contextApi = {
  // 获取上下文
  get(
    workspaceId: string,
    nodeId: string,
    options?: {
      includeLog?: boolean
      maxLogEntries?: number
      reverseLog?: boolean
      includeProblem?: boolean
    }
  ): Promise<ContextGetResult> {
    return client.get(`/workspaces/${workspaceId}/nodes/${nodeId}/context`, { params: options })
  },

  // 设置焦点
  focus(workspaceId: string, nodeId: string): Promise<ContextFocusResult> {
    return client.post(`/workspaces/${workspaceId}/focus`, { nodeId })
  },

  // 设置隔离
  isolate(workspaceId: string, nodeId: string, isolate: boolean): Promise<NodeIsolateResult> {
    return client.patch(`/workspaces/${workspaceId}/nodes/${nodeId}/isolate`, { isolate })
  },

  // 管理引用
  reference(
    workspaceId: string,
    nodeId: string,
    params: { targetIdOrPath: string; action: ReferenceAction; description?: string }
  ): Promise<NodeReferenceResult> {
    return client.post(`/workspaces/${workspaceId}/nodes/${nodeId}/references`, params)
  },
}
