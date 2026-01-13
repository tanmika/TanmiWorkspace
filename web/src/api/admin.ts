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

// 导出结果
export interface ExportResult {
  filename: string
  warnings: string[]
}

// 导入 .twsp 结果
export interface ImportTwspResult {
  success: boolean
  workspaceId: string
  name: string
  path: string
  warnings: string[]
  error?: string
}

// 导入预检查结果
export interface ImportPreviewResult {
  success: boolean
  type: 'single' | 'multiple'
  workspaces: Array<{ id: string; name: string; isNew: boolean }>
  needsTargetDir: boolean
  suggestedTargetDir?: string
  error?: string
}

export const adminApi = {
  // 打开目录选择对话框（需要用户交互，设置长超时）
  pickDirectory(): Promise<PickDirectoryResult> {
    return client.post('/admin/pick-directory', {}, { timeout: 300000 }) // 5分钟
  },

  /**
   * 导出工作区
   * 直接触发文件下载
   */
  async exportWorkspace(workspaceId: string): Promise<ExportResult> {
    const response = await fetch(`/api/admin/export-workspace/${workspaceId}`)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: '导出失败' }))
      throw new Error(errorData.error || '导出失败')
    }

    // 获取文件名
    const disposition = response.headers.get('Content-Disposition')
    const filenameMatch = disposition?.match(/filename="(.+)"/)
    const filename = filenameMatch?.[1] ? decodeURIComponent(filenameMatch[1]) : 'workspace.twsp'

    // 获取警告信息（Base64 解码）
    const warningsHeader = response.headers.get('X-Export-Warnings')
    const warnings: string[] = warningsHeader ? JSON.parse(atob(warningsHeader)) : []

    // 下载文件
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)

    return { filename, warnings }
  },

  /**
   * 预检查工作区导出（获取警告信息）
   */
  async checkExportWorkspace(workspaceId: string): Promise<{ canExport: boolean; warnings: string[] }> {
    return client.get(`/admin/export-workspace/${workspaceId}/check`)
  },

  // 智能导入工作区（支持：项目目录、.tanmi-workspace目录、工作区目录）
  import(path: string, targetDir?: string): Promise<ImportResult> {
    return client.post('/admin/import', { path, targetDir })
  },

  // 导入预检查（判断是单工作区还是多工作区）
  importPreview(path: string): Promise<ImportPreviewResult> {
    return client.post('/admin/import-preview', { path })
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

  /**
   * 导入 .twsp 文件
   */
  async importTwsp(formData: FormData): Promise<ImportTwspResult> {
    return client.post('/admin/import-twsp', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000, // 文件上传需要更长超时时间（2分钟）
    })
  },
}
