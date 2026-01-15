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

  // 切换置顶状态
  togglePin(id: string): Promise<{ pinned: boolean }> {
    return client.post(`/workspaces/${id}/pin`)
  },

  // 获取开发调试信息
  getDevInfo(): Promise<DevInfoResult> {
    return client.get('/dev-info')
  },

  // 启用派发模式
  enableDispatch(id: string, useGit?: boolean): Promise<import('@/types').EnableDispatchResult> {
    return client.post(`/workspaces/${id}/dispatch/enable`, { useGit })
  },

  // 查询禁用派发选项
  queryDisableDispatch(id: string): Promise<import('@/types').DisableDispatchQueryResult> {
    return client.post(`/workspaces/${id}/dispatch/disable`)
  },

  // 执行禁用派发
  executeDisableDispatch(id: string, options: import('@/types').DisableDispatchOptions): Promise<import('@/types').DisableDispatchExecuteResult> {
    return client.post(`/workspaces/${id}/dispatch/disable/execute`, options)
  },

  // 切换派发模式
  switchDispatchMode(id: string, useGit: boolean): Promise<{ success: boolean; hint?: string }> {
    return client.post(`/workspaces/${id}/dispatch/switch`, { useGit })
  },

  // 重新加载错误状态的工作区
  reload(id: string): Promise<{ success: boolean; message: string }> {
    return client.post(`/workspaces/${id}/reload`)
  },

  // 诊断工作区问题
  diagnose(id: string): Promise<DiagnoseResult> {
    return client.post(`/workspaces/${id}/diagnose`)
  },

  // 修复工作区问题
  repair(id: string, issueIds?: string[]): Promise<RepairResult> {
    return client.post(`/workspaces/${id}/repair`, { issueIds })
  },

  // 标记工作区为错误状态
  markError(id: string, message: string, errorType?: string): Promise<{ success: boolean }> {
    return client.post(`/workspaces/${id}/mark-error`, { message, errorType })
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

// 诊断问题类型
export interface RepairIssue {
  id: string
  severity: 'error' | 'warning' | 'info'
  message: string
  detail?: string
  fixType: 'auto' | 'interactive' | 'manual'
}

// 诊断结果类型
export interface DiagnoseResult {
  workspaceId: string
  workspacePath: string
  issues: RepairIssue[]
  summary: {
    total: number
    errors: number
    warnings: number
    autoFixable: number
    interactiveFixable: number
    manualFixable: number
  }
}

// 修复结果类型
export interface RepairResult {
  workspaceId: string
  fixed: number
  failed: number
  skipped: number
  details: {
    issueId: string
    success: boolean
    message?: string
  }[]
}
