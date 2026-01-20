// Search API
import client from './client'
import type { ContentSearchParams, ContentSearchResult } from '@/types'

export const searchApi = {
  /**
   * 内容搜索 - 搜索工作区内的节点和 Memo
   */
  contentSearch(workspaceId: string, params: ContentSearchParams): Promise<ContentSearchResult> {
    return client.get(`/workspaces/${workspaceId}/search`, {
      params: {
        query: params.query,
        regex: params.regex ? 'true' : undefined,
        id: params.id,
        target: params.target,
        limit: params.limit,
        context: params.context,
      },
    })
  },
}
