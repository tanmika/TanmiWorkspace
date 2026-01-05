// 索引管理 API
import client from './client'

// 类型定义
export interface PickDirectoryResult {
  path?: string
  cancelled?: boolean
}

// 导入结果（支持单个和批量）
export interface ImportResult {
  success: boolean
  added: number
  existing: number
  workspaces: Array<{ id: string; name: string; isNew: boolean }>
  error?: string
  message?: string
}

// 同步清理预览结果
export interface SyncCleanPreviewResult {
  toAdd: Array<{ id: string; name: string; projectRoot: string }>
  toRemove: Array<{ id: string; name: string; reason: string }>
  hasChanges: boolean
}

// 同步清理执行结果
export interface SyncCleanExecuteResult {
  success: boolean
  added: number
  removed: number
  addedList: Array<{ id: string; name: string }>
  removedList: Array<{ id: string; name: string }>
}

export interface IndexStatsResult {
  total: number
  valid: number
  invalid: number
}

export const adminApi = {
  // 打开目录选择对话框
  pickDirectory(): Promise<PickDirectoryResult> {
    return client.post('/admin/pick-directory')
  },

  // 智能导入工作区（支持：项目目录、.tanmi-workspace目录、名称_id工作区目录）
  import(path: string): Promise<ImportResult> {
    return client.post('/admin/import', { path })
  },

  // 同步清理预览
  syncCleanPreview(): Promise<SyncCleanPreviewResult> {
    return client.post('/admin/sync-clean-preview')
  },

  // 执行同步清理
  syncCleanExecute(): Promise<SyncCleanExecuteResult> {
    return client.post('/admin/sync-clean-execute')
  },

  // 获取索引统计
  getIndexStats(): Promise<IndexStatsResult> {
    return client.get('/admin/index-stats')
  },
}
