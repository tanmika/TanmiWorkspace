// 工作区 API
import client from './client'
import type {
  WorkspaceInitParams,
  WorkspaceListParams,
  WorkspaceInitResult,
  WorkspaceListResult,
  WorkspaceGetResult,
  WorkspaceDeleteResult,
  WorkspaceStatusResult,
} from '@/types'

export const workspaceApi = {
  // 创建工作区
  create(params: WorkspaceInitParams): Promise<WorkspaceInitResult> {
    return client.post('/workspaces', params)
  },

  // 列出工作区
  list(params?: WorkspaceListParams): Promise<WorkspaceListResult> {
    return client.get('/workspaces', { params })
  },

  // 获取工作区详情
  get(id: string): Promise<WorkspaceGetResult> {
    return client.get(`/workspaces/${id}`)
  },

  // 获取工作区状态
  status(id: string, format?: 'box' | 'markdown'): Promise<WorkspaceStatusResult> {
    return client.get(`/workspaces/${id}/status`, { params: { format } })
  },

  // 删除工作区
  delete(id: string, force?: boolean): Promise<WorkspaceDeleteResult> {
    return client.delete(`/workspaces/${id}`, { params: { force: force ? 'true' : undefined } })
  },

  // 归档工作区
  archive(id: string): Promise<{ success: boolean; archivePath: string }> {
    return client.post(`/workspaces/${id}/archive`)
  },

  // 恢复归档的工作区
  restore(id: string): Promise<{ success: boolean; restoredPath: string }> {
    return client.post(`/workspaces/${id}/restore`)
  },

  // 获取开发调试信息
  getDevInfo(): Promise<DevInfoResult> {
    return client.get('/dev-info')
  },
}

// 开发信息结果类型
export interface DevInfoResult {
  available: boolean
  isDev?: boolean
  serverStartTime?: string
  codeBuildTime?: string | null
  packageVersion?: string | null
  nodeVersion?: string
  platform?: string
  dataDir?: string
}
