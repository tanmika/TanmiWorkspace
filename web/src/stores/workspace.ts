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
  const docsMatch = md.match(/## 文档[\s\S]*?(?=##|$)/)
  if (docsMatch) {
    const docsSection = docsMatch[0]
    const lines = docsSection.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ')) {
        // 格式: - path: description 或 - [path](url): description
        const content = trimmed.slice(2)
        const colonIdx = content.indexOf(':')
        if (colonIdx > 0) {
          docs.push({
            path: content.slice(0, colonIdx).trim(),
            description: content.slice(colonIdx + 1).trim(),
          })
        }
      }
    }
  }

  return { rules, docs }
}

export const useWorkspaceStore = defineStore('workspace', () => {
  // 状态
  const workspaces = ref<WorkspaceEntry[]>([])
  const currentWorkspace = ref<WorkspaceConfig | null>(null)
  const currentGraph = ref<NodeGraph | null>(null)
  const currentStatus = ref<WorkspaceStatusResult['summary'] | null>(null)
  const currentRules = ref<string[]>([])
  const currentDocs = ref<DocRef[]>([])
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
  }

  return {
    // 状态
    workspaces,
    currentWorkspace,
    currentGraph,
    currentStatus,
    currentRules,
    currentDocs,
    loading,
    error,
    // 计算属性
    activeWorkspaces,
    archivedWorkspaces,
    currentFocus,
    // 方法
    fetchWorkspaces,
    fetchWorkspace,
    fetchStatus,
    createWorkspace,
    deleteWorkspace,
    archiveWorkspace,
    restoreWorkspace,
    clearCurrent,
  }
})
