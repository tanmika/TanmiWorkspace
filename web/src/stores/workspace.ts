// 工作区状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { workspaceApi } from '@/api'
import type {
  WorkspaceEntry,
  WorkspaceConfig,
  WorkspaceInitParams,
  NodeGraph,
  WorkspaceStatusResult,
  DocRef,
  TypedLogEntry,
} from '@/types'

// 解析 Workspace.md 提取规则和文档
function parseWorkspaceMd(md: string): { rules: string[]; docs: DocRef[] } {
  const rules: string[] = []
  const docs: DocRef[] = []

  // 提取规则部分
  const rulesMatch = md.match(/## 规则[\s\S]*?(?=##|$)/)
  if (rulesMatch) {
    const rulesSection = rulesMatch[0]
    const lines = rulesSection.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ')) {
        rules.push(trimmed.slice(2))
      }
    }
  }

  // 提取文档部分
  // 实际格式: - [name](path) - description 或 - [description](path)
  const docsMatch = md.match(/## 文档[\s\S]*?(?=##|$)/)
  if (docsMatch) {
    const docsSection = docsMatch[0]
    const lines = docsSection.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ')) {
        // 匹配 Markdown 链接格式: - [name](path) - description 或 - [name](path)
        const docMatch = trimmed.match(/^- \[(.+?)\]\((.+?)\)(?: - (.+))?$/)
        if (docMatch && docMatch[1] && docMatch[2]) {
          docs.push({
            path: docMatch[2],
            description: docMatch[3] || docMatch[1],
          })
        }
      }
    }
  }

  return { rules, docs }
}

// 解析 Log.md 提取日志条目
function parseLogMd(md: string): TypedLogEntry[] {
  const logs: TypedLogEntry[] = []
  if (!md) return logs

  // 日志格式是 Markdown 表格:
  // | 时间 | 操作者 | 事件 |
  // |------|--------|------|
  // | 2024-01-01 12:00:00 | AI | 事件描述 |
  const lines = md.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    // 跳过标题行和分隔行
    if (!trimmed.startsWith('|') || trimmed.includes('---') || trimmed.includes('时间')) {
      continue
    }
    // 解析表格行: | timestamp | operator | event |
    const parts = trimmed.split('|').map(p => p.trim()).filter(p => p)
    if (parts.length >= 3) {
      const timestamp = parts[0]
      const operator = parts[1]
      const event = parts[2]
      if (timestamp && event && (operator === 'AI' || operator === 'Human' || operator === 'system')) {
        logs.push({
          timestamp,
          operator,
          event,
        })
      }
    }
  }
  return logs
}

export const useWorkspaceStore = defineStore('workspace', () => {
  // 状态
  const workspaces = ref<WorkspaceEntry[]>([])
  const currentWorkspace = ref<WorkspaceConfig | null>(null)
  const currentGraph = ref<NodeGraph | null>(null)
  const currentStatus = ref<WorkspaceStatusResult['summary'] | null>(null)
  const currentRules = ref<string[]>([])
  const currentDocs = ref<DocRef[]>([])
  const currentLogs = ref<TypedLogEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 计算属性
  const activeWorkspaces = computed(() =>
    workspaces.value.filter((w) => w.status === 'active')
  )

  const archivedWorkspaces = computed(() =>
    workspaces.value.filter((w) => w.status === 'archived')
  )

  const currentFocus = computed(() => currentGraph.value?.currentFocus || null)

  // 派发状态计算属性
  const dispatchStatus = computed(() => {
    const dispatch = currentWorkspace.value?.dispatch
    if (!dispatch?.enabled) return 'disabled'
    return dispatch.useGit ? 'enabled-git' : 'enabled'
  })

  // 方法
  async function fetchWorkspaces(status?: 'active' | 'archived' | 'all') {
    loading.value = true
    error.value = null
    try {
      const result = await workspaceApi.list({ status })
      workspaces.value = result.workspaces
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取工作区列表失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchWorkspace(id: string) {
    loading.value = true
    error.value = null
    try {
      const result = await workspaceApi.get(id)
      currentWorkspace.value = result.config
      currentGraph.value = result.graph
      // 解析 workspaceMd 获取规则和文档
      const { rules, docs } = parseWorkspaceMd(result.workspaceMd || '')
      currentRules.value = rules
      currentDocs.value = docs
      // 解析 logMd 获取日志条目
      currentLogs.value = parseLogMd(result.logMd || '')
      // 同时获取状态摘要
      const statusResult = await workspaceApi.status(id)
      currentStatus.value = statusResult.summary
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取工作区详情失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchStatus(id: string) {
    try {
      const result = await workspaceApi.status(id)
      currentStatus.value = result.summary
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取工作区状态失败'
      throw e
    }
  }

  async function createWorkspace(params: WorkspaceInitParams) {
    loading.value = true
    error.value = null
    try {
      const result = await workspaceApi.create(params)
      await fetchWorkspaces('all')
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : '创建工作区失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteWorkspace(id: string, force?: boolean) {
    loading.value = true
    error.value = null
    try {
      await workspaceApi.delete(id, force)
      await fetchWorkspaces('all')
      if (currentWorkspace.value?.id === id) {
        currentWorkspace.value = null
        currentGraph.value = null
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '删除工作区失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function archiveWorkspace(id: string) {
    loading.value = true
    error.value = null
    try {
      await workspaceApi.archive(id)
      await fetchWorkspaces('all')
    } catch (e) {
      error.value = e instanceof Error ? e.message : '归档工作区失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function restoreWorkspace(id: string) {
    loading.value = true
    error.value = null
    try {
      await workspaceApi.restore(id)
      await fetchWorkspaces('all')
    } catch (e) {
      error.value = e instanceof Error ? e.message : '恢复工作区失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  function clearCurrent() {
    currentWorkspace.value = null
    currentGraph.value = null
    currentStatus.value = null
    currentRules.value = []
    currentDocs.value = []
    currentLogs.value = []
  }

  async function enableDispatch(useGit?: boolean) {
    if (!currentWorkspace.value) {
      throw new Error('当前没有选中的工作区')
    }
    loading.value = true
    error.value = null
    try {
      const result = await workspaceApi.enableDispatch(currentWorkspace.value.id, useGit)
      // 刷新工作区配置
      await fetchWorkspace(currentWorkspace.value.id)
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : '启用派发失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function disableDispatch(options: import('@/types').DisableDispatchOptions) {
    if (!currentWorkspace.value) {
      throw new Error('当前没有选中的工作区')
    }
    loading.value = true
    error.value = null
    try {
      const result = await workspaceApi.executeDisableDispatch(currentWorkspace.value.id, options)
      // 刷新工作区配置
      await fetchWorkspace(currentWorkspace.value.id)
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : '禁用派发失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function switchDispatchMode(useGit: boolean) {
    if (!currentWorkspace.value) {
      throw new Error('当前没有选中的工作区')
    }
    loading.value = true
    error.value = null
    try {
      const result = await workspaceApi.switchDispatchMode(currentWorkspace.value.id, useGit)
      // 刷新工作区配置
      await fetchWorkspace(currentWorkspace.value.id)
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : '切换派发模式失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    // 状态
    workspaces,
    currentWorkspace,
    currentGraph,
    currentStatus,
    currentRules,
    currentDocs,
    currentLogs,
    loading,
    error,
    // 计算属性
    activeWorkspaces,
    archivedWorkspaces,
    currentFocus,
    dispatchStatus,
    // 方法
    fetchWorkspaces,
    fetchWorkspace,
    fetchStatus,
    createWorkspace,
    deleteWorkspace,
    archiveWorkspace,
    restoreWorkspace,
    clearCurrent,
    enableDispatch,
    disableDispatch,
    switchDispatchMode,
  }
})
