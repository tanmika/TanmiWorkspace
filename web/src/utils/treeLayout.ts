// 树形布局工具 - 将 NodeTreeItem 转换为 Vue Flow 格式
import type { Node, Edge } from '@vue-flow/core'
import type { NodeTreeItem, NodeDispatchInfo, NodeRole } from '@/types'

// 节点数据类型
export interface GraphNodeData {
  title: string
  type: NodeTreeItem['type']
  status: NodeTreeItem['status']
  role?: NodeRole
  dispatch?: NodeDispatchInfo
  isFocused: boolean
  isSelected: boolean
  isActivePath: boolean
}

// 布局配置
export interface LayoutConfig {
  nodeWidth: number      // 节点宽度
  nodeHeight: number     // 节点高度
  horizontalGap: number  // 水平间距
  verticalGap: number    // 垂直间距
}

// 默认布局配置
const defaultConfig: LayoutConfig = {
  nodeWidth: 200,       // 与节点 max-width 一致，避免长标题时重叠
  nodeHeight: 32,
  horizontalGap: 40,
  verticalGap: 12,
}

// 计算子树高度（包含所有后代节点）
function calculateSubtreeHeight(node: NodeTreeItem, config: LayoutConfig): number {
  if (node.children.length === 0) {
    return config.nodeHeight
  }

  // 计算所有子树的高度总和
  let totalChildrenHeight = 0
  for (const child of node.children) {
    totalChildrenHeight += calculateSubtreeHeight(child, config)
  }

  // 加上子节点之间的间距
  const gaps = (node.children.length - 1) * config.verticalGap

  return totalChildrenHeight + gaps
}

// 获取从根到某节点的路径
function getPathToNode(root: NodeTreeItem, targetId: string): string[] {
  if (root.id === targetId) {
    return [root.id]
  }

  for (const child of root.children) {
    const path = getPathToNode(child, targetId)
    if (path.length > 0) {
      return [root.id, ...path]
    }
  }

  return []
}

// 转换参数
export interface TransformParams {
  tree: NodeTreeItem
  focusId: string | null
  selectedId: string | null
  config?: Partial<LayoutConfig>
}

// 转换结果
export interface TransformResult {
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
}

/**
 * 将 NodeTreeItem 树转换为 Vue Flow 的 nodes 和 edges
 * 使用两阶段布局：先计算子树高度，再定位节点
 */
export function transformTreeToFlow(params: TransformParams): TransformResult {
  const { tree, focusId, selectedId, config: configOverride } = params
  const config = { ...defaultConfig, ...configOverride }

  const nodes: Node<GraphNodeData>[] = []
  const edges: Edge[] = []

  // 计算活跃路径（从根到选中节点的路径）
  const activePath = new Set<string>(
    selectedId ? getPathToNode(tree, selectedId) : []
  )

  // 缓存每个节点的子树高度
  const subtreeHeights = new Map<string, number>()

  // 第一阶段：计算所有子树高度
  function cacheSubtreeHeights(node: NodeTreeItem): number {
    const height = calculateSubtreeHeight(node, config)
    subtreeHeights.set(node.id, height)
    node.children.forEach(cacheSubtreeHeights)
    return height
  }

  cacheSubtreeHeights(tree)

  // 第二阶段：定位节点
  function positionNode(
    node: NodeTreeItem,
    x: number,
    yStart: number,
    yEnd: number,
    parentId: string | null
  ): void {
    // 计算节点的垂直中心位置
    const nodeY = (yStart + yEnd) / 2 - config.nodeHeight / 2

    // 添加节点
    nodes.push({
      id: node.id,
      type: 'custom',
      position: { x, y: nodeY },
      data: {
        title: node.title,
        type: node.type,
        status: node.status,
        role: node.role,
        dispatch: node.dispatch,
        isFocused: node.id === focusId,
        isSelected: node.id === selectedId,
        isActivePath: activePath.has(node.id),
      },
    })

    // 添加边（从父节点到当前节点）
    if (parentId) {
      const isHighlight = activePath.has(parentId) && activePath.has(node.id)

      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: 'smoothstep',
        style: isHighlight
          ? { stroke: 'var(--accent-red)', strokeWidth: 2.5 }
          : { stroke: '#bbb', strokeWidth: 2 },
        pathOptions: { borderRadius: 0, offset: 0 },
        zIndex: isHighlight ? 10 : 0,
      })
    }

    // 处理子节点
    if (node.children.length === 0) return

    const childX = x + config.nodeWidth + config.horizontalGap
    let currentY = yStart

    for (const child of node.children) {
      const childSubtreeHeight = subtreeHeights.get(child.id) || config.nodeHeight
      const childYEnd = currentY + childSubtreeHeight

      positionNode(child, childX, currentY, childYEnd, node.id)

      currentY = childYEnd + config.verticalGap
    }
  }

  // 从根节点开始布局
  const totalHeight = subtreeHeights.get(tree.id) || config.nodeHeight
  positionNode(tree, 0, 0, totalHeight, null)

  return { nodes, edges }
}
