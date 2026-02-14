// 节点状态管理
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { nodeApi, contextApi } from '@/api'
import { useWorkspaceStore } from './workspace'
import type {
  NodeTreeItem,
  NodeMeta,
  ContextGetResult,
  TransitionAction,
  DocRef,
  NodeType,
} from '@/types'

export const useNodeStore = defineStore('node', () => {
  // 状态
  const nodeTree = ref<NodeTreeItem | null>(null)
  const nodeMap = ref<Map<string, NodeTreeItem>>(new Map())  // nodeId -> NodeTreeItem 索引
  const selectedNodeId = ref<string | null>(null)
  const selectedNodeMeta = ref<NodeMeta | null>(null)
  const nodeContext = ref<ContextGetResult | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const workspaceStore = useWorkspaceStore()

  // 辅助函数：递归构建 nodeId -> NodeTreeItem 索引
  function buildNodeMap(tree: NodeTreeItem | null): Map<string, NodeTreeItem> {
    const map = new Map<string, NodeTreeItem>()
    if (!tree) return map

    const stack: NodeTreeItem[] = [tree]
    while (stack.length > 0) {
      const node = stack.pop()!
      map.set(node.id, node)
      stack.push(...node.children)
    }
    return map
  }

  // 方法
  async function fetchNodeTree() {
    const workspaceId = workspaceStore.currentWorkspace?.id
    if (!workspaceId) return

    loading.value = true
    error.value = null
    try {
      const result = await nodeApi.list(workspaceId)
      nodeTree.value = result.tree
      nodeMap.value = buildNodeMap(result.tree)
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取节点树失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function selectNode(nodeId: string) {
    const workspaceId = workspaceStore.currentWorkspace?.id
    if (!workspaceId) return

    selectedNodeId.value = nodeId
    loading.value = true
    error.value = null

    try {
      const [nodeResult, contextResult] = await Promise.all([
        nodeApi.get(workspaceId, nodeId),
        contextApi.get(workspaceId, nodeId),
      ])
      selectedNodeMeta.value = nodeResult.meta
      nodeContext.value = contextResult
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取节点详情失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createNode(params: {
    parentId: string
    type: NodeType
    title: string
    requirement?: string
    docs?: DocRef[]
  }) {
    const workspaceId = workspaceStore.currentWorkspace?.id
    if (!workspaceId) throw new Error('未选择工作区')

    loading.value = true
    error.value = null
    try {
      const result = await nodeApi.create(workspaceId, params)
      await fetchNodeTree()
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : '创建节点失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateNode(params: { title?: string; requirement?: string; note?: string }) {
    const workspaceId = workspaceStore.currentWorkspace?.id
    const nodeId = selectedNodeId.value
    if (!workspaceId || !nodeId) throw new Error('未选择节点')

    loading.value = true
    error.value = null
    try {
      await nodeApi.update(workspaceId, nodeId, params)
      await fetchNodeTree()
      await selectNode(nodeId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : '更新节点失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteNode(nodeId: string, revert?: boolean) {
    const workspaceId = workspaceStore.currentWorkspace?.id
    if (!workspaceId) throw new Error('未选择工作区')

    loading.value = true
    error.value = null
    try {
      await nodeApi.delete(workspaceId, nodeId, revert)
      await fetchNodeTree()
      if (selectedNodeId.value === nodeId) {
        selectedNodeId.value = null
        selectedNodeMeta.value = null
        nodeContext.value = null
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '删除节点失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function transition(action: TransitionAction, reason?: string, conclusion?: string) {
    const workspaceId = workspaceStore.currentWorkspace?.id
    const nodeId = selectedNodeId.value
    if (!workspaceId || !nodeId) throw new Error('未选择节点')

    loading.value = true
    error.value = null
    try {
      const result = await nodeApi.transition(workspaceId, nodeId, { action, reason, conclusion })
      await fetchNodeTree()
      await selectNode(nodeId)
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : '状态转换失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function setFocus(nodeId: string) {
    const workspaceId = workspaceStore.currentWorkspace?.id
    if (!workspaceId) throw new Error('未选择工作区')

    loading.value = true
    error.value = null
    try {
      await contextApi.focus(workspaceId, nodeId)
      await workspaceStore.fetchWorkspace(workspaceId)
      // 刷新当前选中节点的详情（包括 docs/MEMO 引用）
      if (selectedNodeId.value) {
        await selectNode(selectedNodeId.value)
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '设置焦点失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  function clearSelection() {
    selectedNodeId.value = null
    selectedNodeMeta.value = null
    nodeContext.value = null
  }

  function clearAll() {
    nodeTree.value = null
    nodeMap.value = new Map()
    clearSelection()
  }

  return {
    // 状态
    nodeTree,
    nodeMap,
    selectedNodeId,
    selectedNodeMeta,
    nodeContext,
    loading,
    error,
    // 方法
    fetchNodeTree,
    selectNode,
    createNode,
    updateNode,
    deleteNode,
    transition,
    setFocus,
    clearSelection,
    clearAll,
  }
})
