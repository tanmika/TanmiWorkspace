// 变更追踪 API
import client from './client'
import type {
  ChangeListResult,
  AmbiguousCountResult,
  ChangeRevertResult,
  WorkspaceChangesOverviewResult,
} from '@/types'

export const changeApi = {
  // 获取节点变更列表（summary 模式，精简数据）
  list(workspaceId: string, nodeId: string, summary = true): Promise<ChangeListResult> {
    return client.get(`/workspaces/${workspaceId}/nodes/${nodeId}/changes`, {
      params: { summary: summary ? 'true' : 'false' },
    })
  },

  // 获取 ambiguous 变更数量
  ambiguousCount(workspaceId: string): Promise<AmbiguousCountResult> {
    return client.get(`/workspaces/${workspaceId}/changes/ambiguous`)
  },

  // 获取 ambiguous 变更列表（summary 模式）
  ambiguousList(workspaceId: string): Promise<ChangeListResult> {
    return client.get(`/workspaces/${workspaceId}/changes/ambiguous/list`)
  },

  // 回滚变更（实际执行）
  revert(workspaceId: string, changeIds: string[]): Promise<ChangeRevertResult> {
    return client.post(`/workspaces/${workspaceId}/changes/revert`, { changeIds })
  },

  // 模拟回滚（dry-run）
  revertCheck(workspaceId: string, changeIds: string[]): Promise<ChangeRevertResult> {
    return client.post(`/workspaces/${workspaceId}/changes/revert-check`, { changeIds })
  },

  // 工作区变更概览（按文件分组）
  overview(workspaceId: string): Promise<WorkspaceChangesOverviewResult> {
    return client.get(`/workspaces/${workspaceId}/changes/overview`)
  },
}
