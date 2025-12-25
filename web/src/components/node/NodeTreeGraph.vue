<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import { VueFlow, useVueFlow, type Node, type Edge, type NodeMouseEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import type { NodeTreeItem } from '@/types'
import GraphNode from '@/components/graph/GraphNode.vue'
import { transformTreeToFlow, type GraphNodeData } from '@/utils/treeLayout'

const props = defineProps<{
  tree: NodeTreeItem | null
  selectedId: string | null
  focusId: string | null
  memoCount?: number
}>()

const emit = defineEmits<{
  select: [nodeId: string]
  selectMemo: []
}>()

// Vue Flow 实例
const { fitView, setCenter, getNodes } = useVueFlow()

// 节点和边数据
const nodes = ref<Node<GraphNodeData>[]>([])
const edges = ref<Edge[]>([])

// 是否首次加载
const isFirstLoad = ref(true)

// 计算节点和边
const flowData = computed(() => {
  if (!props.tree) {
    return { nodes: [], edges: [] }
  }

  return transformTreeToFlow({
    tree: props.tree,
    focusId: props.focusId,
    selectedId: props.selectedId,
    memoCount: props.memoCount || 0,
  })
})

// 监听数据变化 - 不自动 fitView
watch(
  flowData,
  (data) => {
    nodes.value = data.nodes
    // 排序边：高亮边放最后渲染（在最上层）
    edges.value = [...data.edges].sort((a, b) => {
      const aZIndex = (a.zIndex ?? 0)
      const bZIndex = (b.zIndex ?? 0)
      return aZIndex - bZIndex
    })

    // 仅首次加载时适应视图
    if (isFirstLoad.value && data.nodes.length > 0) {
      isFirstLoad.value = false
      nextTick(() => {
        fitView({ padding: 0.15, duration: 200 })
      })
    }
  },
  { immediate: true, deep: true }
)

// 处理节点点击
function handleNodeClick(event: NodeMouseEvent) {
  // 如果点击的是memo抽屉虚拟节点，触发selectMemo事件
  if (event.node.id === '__memo_drawer__') {
    emit('selectMemo')
  } else {
    emit('select', event.node.id)
  }
}

// 聚焦到当前选中/聚焦的节点
function handleFocusNode() {
  const targetId = props.selectedId || props.focusId
  if (!targetId) return

  const node = getNodes.value.find(n => n.id === targetId)
  if (node) {
    setCenter(node.position.x + 70, node.position.y + 16, { zoom: 1, duration: 300 })
  }
}

// 适应视图
function handleFitView() {
  fitView({ padding: 0.15, duration: 300 })
}

// 初始化时适应视图
onMounted(() => {
  nextTick(() => {
    fitView({ padding: 0.15 })
  })
})
</script>

<template>
  <div class="node-tree-graph">
    <VueFlow
      v-if="tree"
      v-model:nodes="nodes"
      v-model:edges="edges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :zoom-on-scroll="true"
      :pan-on-scroll="false"
      :pan-on-drag="true"
      :min-zoom="0.5"
      :max-zoom="2"
      fit-view-on-init
      class="flow-container"
      @node-click="handleNodeClick"
    >
      <!-- 点阵背景 -->
      <Background
        :variant="'dots'"
        :gap="16"
        :size="1.5"
        pattern-color="var(--bg-dot)"
      />

      <!-- 自定义节点 -->
      <template #node-custom="nodeProps">
        <GraphNode :data="nodeProps.data" />
      </template>

      <!-- 自定义控制栏 -->
      <div class="custom-controls">
        <button
          class="control-btn"
          title="聚焦选中节点"
          :disabled="!selectedId && !focusId"
          @click="handleFocusNode"
        >
          <!-- 准星图标 -->
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 0v4M7 10v4M0 7h4M10 7h4" stroke="currentColor" stroke-width="1.5"/>
            <rect x="5" y="5" width="4" height="4" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
        </button>
        <button
          class="control-btn"
          title="适应视图"
          @click="handleFitView"
        >
          <!-- 适应视图图标 -->
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 4V1h3M10 1h3v3M13 10v3h-3M4 13H1v-3" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
      </div>
    </VueFlow>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <div class="empty-icon">[ ]</div>
      <span class="empty-text">暂无节点</span>
    </div>
  </div>
</template>

<style scoped>
.node-tree-graph {
  width: 100%;
  height: 100%;
  min-height: 400px;
  background-color: var(--bg-color);
  position: relative;
}

.flow-container {
  width: 100%;
  height: 100%;
}

/* 边样式 */
:deep(.vue-flow__edge-path) {
  stroke: #999;
  stroke-width: 1.5px;
}

/* 自定义控制栏 */
.custom-controls {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  box-shadow: 2px 2px 0 var(--border-color);
  z-index: 4;
}

.control-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: var(--card-bg);
  color: var(--text-main);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s;
}

.control-btn:not(:last-child) {
  border-bottom: 1px solid var(--border-color);
}

.control-btn:hover:not(:disabled) {
  background: var(--path-bg);
  color: var(--accent-red);
}

.control-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 32px;
  font-family: var(--mono-font);
  margin-bottom: 8px;
}

.empty-text {
  font-size: 13px;
}
</style>
