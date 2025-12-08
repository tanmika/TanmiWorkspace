<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { TreeChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import type { NodeTreeItem, NodeStatus } from '@/types'
import { STATUS_CONFIG } from '@/types'

// 注册 ECharts 组件
use([CanvasRenderer, TreeChart, TooltipComponent])

const props = defineProps<{
  tree: NodeTreeItem | null
  selectedId: string | null
  focusId: string | null
}>()

const emit = defineEmits<{
  select: [nodeId: string]
}>()

// 状态颜色映射
function getStatusColor(status: NodeStatus): string {
  return STATUS_CONFIG[status]?.color || '#909399'
}

// 将 NodeTreeItem 转换为 ECharts 树形数据
function convertToEChartsData(node: NodeTreeItem): any {
  const isSelected = node.id === props.selectedId
  const isFocus = node.id === props.focusId

  return {
    name: node.title,
    value: node.id,
    itemStyle: {
      color: getStatusColor(node.status),
      borderColor: isSelected ? '#409EFF' : (isFocus ? '#E6A23C' : getStatusColor(node.status)),
      borderWidth: isSelected || isFocus ? 3 : 1,
    },
    label: {
      color: isSelected ? '#409EFF' : '#333',
      fontWeight: isFocus ? 'bold' : 'normal',
    },
    children: node.children?.map(convertToEChartsData) || [],
  }
}

// ECharts 配置
const chartOption = computed(() => {
  if (!props.tree) return {}

  return {
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      formatter: (params: any) => {
        return `<b>${params.name}</b>`
      },
    },
    series: [
      {
        type: 'tree',
        data: [convertToEChartsData(props.tree)],
        top: '5%',
        left: '10%',
        bottom: '5%',
        right: '20%',
        symbolSize: 14,
        orient: 'LR', // 从左到右布局
        initialTreeDepth: -1, // 全部展开
        expandAndCollapse: true,
        animationDuration: 300,
        animationDurationUpdate: 300,
        label: {
          position: 'right',
          verticalAlign: 'middle',
          align: 'left',
          fontSize: 12,
          distance: 8,
        },
        leaves: {
          label: {
            position: 'right',
            verticalAlign: 'middle',
            align: 'left',
          },
        },
        emphasis: {
          focus: 'descendant',
        },
        lineStyle: {
          color: '#ccc',
          width: 1.5,
          curveness: 0.5,
        },
        roam: true, // 启用缩放和拖动
        scaleLimit: {
          min: 0.5,
          max: 3,
        },
      },
    ],
  }
})

// 图表引用
const chartRef = ref<InstanceType<typeof VChart> | null>(null)

// 处理节点点击
function handleChartClick(params: any) {
  if (params.data?.value) {
    emit('select', params.data.value)
  }
}

// 监听 tree 变化时重新渲染
watch(() => props.tree, () => {
  chartRef.value?.setOption(chartOption.value, true)
}, { deep: true })
</script>

<template>
  <div class="node-tree-graph">
    <v-chart
      v-if="tree"
      ref="chartRef"
      class="chart"
      :option="chartOption"
      autoresize
      @click="handleChartClick"
    />
    <el-empty v-else description="暂无节点" :image-size="60" />
  </div>
</template>

<style scoped>
.node-tree-graph {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.chart {
  width: 100%;
  height: 100%;
}
</style>
