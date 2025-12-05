// 工作区状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { workspaceApi } from '@/api'
import type {
  WorkspaceEntry,
  WorkspaceConfig,
  WorkspaceInitParams,
  NodeGraph,
} from '@/types'

export const useWorkspaceStore = defineStore('workspace', () => {
  // 状态
  const workspaces = ref<WorkspaceEntry[]>([])
  const currentWorkspace = ref<WorkspaceConfig | null>(null)
  const currentGraph = ref<NodeGraph | null>(null)
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
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取工作区详情失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createWorkspace(params: WorkspaceInitParams) {
    loading.value = true
    error.value = null
    try {
      const result = await workspaceApi.create(params)
      await fetchWorkspaces()
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
      await fetchWorkspaces()
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

  function clearCurrent() {
    currentWorkspace.value = null
    currentGraph.value = null
  }

  return {
    // 状态
    workspaces,
    currentWorkspace,
    currentGraph,
    loading,
    error,
    // 计算属性
    activeWorkspaces,
    archivedWorkspaces,
    currentFocus,
    // 方法
    fetchWorkspaces,
    fetchWorkspace,
    createWorkspace,
    deleteWorkspace,
    clearCurrent,
  }
})
