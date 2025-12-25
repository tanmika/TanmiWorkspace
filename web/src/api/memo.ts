// Memo API
import client from './client'
import type { MemoListResult, Memo } from '@/types'

export const memoApi = {
  // 获取工作区的 memo 列表
  list(workspaceId: string, tags?: string[]): Promise<MemoListResult> {
    return client.get(`/workspaces/${workspaceId}/memos`, { params: { tags } })
  },

  // 获取单个 memo 的完整内容
  get(workspaceId: string, memoId: string): Promise<Memo> {
    return client.get(`/workspaces/${workspaceId}/memos/${memoId}`)
  },
}
