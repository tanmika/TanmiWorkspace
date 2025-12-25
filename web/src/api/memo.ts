// Memo API
import client from './client'
import type { MemoListResult, Memo } from '@/types'

export const memoApi = {
  // 获取工作区的 memo 列表
  list(workspaceId: string, tags?: string[]): Promise<MemoListResult> {
    return client.get(`/workspaces/${workspaceId}/memos`, { params: { tags } })
  },

  // 获取单个 memo 的完整内容
  async get(workspaceId: string, memoId: string): Promise<Memo> {
    const result = await client.get(`/workspaces/${workspaceId}/memos/${memoId}`) as { memo: Memo }
    return result.memo
  },
}
