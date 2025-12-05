// 日志 API
import client from './client'
import type { LogAppendResult, ProblemUpdateResult, ProblemClearResult } from '@/types'

export const logApi = {
  // 追加工作区日志
  appendWorkspaceLog(
    workspaceId: string,
    params: { operator: 'AI' | 'Human'; event: string }
  ): Promise<LogAppendResult> {
    return client.post(`/workspaces/${workspaceId}/logs`, params)
  },

  // 追加节点日志
  appendNodeLog(
    workspaceId: string,
    nodeId: string,
    params: { operator: 'AI' | 'Human'; event: string }
  ): Promise<LogAppendResult> {
    return client.post(`/workspaces/${workspaceId}/nodes/${nodeId}/logs`, params)
  },

  // 更新工作区问题
  updateWorkspaceProblem(
    workspaceId: string,
    params: { problem: string; nextStep?: string }
  ): Promise<ProblemUpdateResult> {
    return client.put(`/workspaces/${workspaceId}/problem`, params)
  },

  // 更新节点问题
  updateNodeProblem(
    workspaceId: string,
    nodeId: string,
    params: { problem: string; nextStep?: string }
  ): Promise<ProblemUpdateResult> {
    return client.put(`/workspaces/${workspaceId}/nodes/${nodeId}/problem`, params)
  },

  // 清空工作区问题
  clearWorkspaceProblem(workspaceId: string): Promise<ProblemClearResult> {
    return client.delete(`/workspaces/${workspaceId}/problem`)
  },

  // 清空节点问题
  clearNodeProblem(workspaceId: string, nodeId: string): Promise<ProblemClearResult> {
    return client.delete(`/workspaces/${workspaceId}/nodes/${nodeId}/problem`)
  },
}
