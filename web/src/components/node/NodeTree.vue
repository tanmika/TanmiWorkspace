<script setup lang="ts">
import { computed } from 'vue'
import type { NodeTreeItem, NodeStatus, NodeRole } from '@/types'
import { STATUS_CONFIG, NODE_ROLE_CONFIG } from '@/types'

const props = defineProps<{
  tree: NodeTreeItem | null
  selectedId: string | null
  focusId: string | null
}>()

const emit = defineEmits<{
  select: [nodeId: string]
}>()

// 树形数据
const treeData = computed(() => {
  if (!props.tree) return []
  return [props.tree]
})

// 获取状态图标颜色
function getStatusColor(status: NodeStatus) {
  return STATUS_CONFIG[status]?.color || '#909399'
}

// 获取状态 emoji
function getStatusEmoji(status: NodeStatus) {
  return STATUS_CONFIG[status]?.emoji || '⚪'
}

// 获取角色 emoji
function getRoleEmoji(role?: NodeRole) {
  if (!role) return ''
  return NODE_ROLE_CONFIG[role]?.emoji || ''
}

// 选择节点
function handleNodeClick(data: NodeTreeItem) {
  emit('select', data.id)
}

// 判断是否当前焦点
function isFocus(id: string) {
  return props.focusId === id
}

// 判断是否选中
function isSelected(id: string) {
  return props.selectedId === id
}
</script>

<template>
  <div class="node-tree">
    <el-tree
      v-if="treeData.length"
      :data="treeData"
      :props="{ label: 'title', children: 'children' }"
      node-key="id"
      :current-node-key="selectedId"
      :default-expanded-keys="[tree?.id || 'root']"
      highlight-current
      @node-click="handleNodeClick"
    >
      <template #default="{ data }">
        <span
          class="node-item"
          :class="{ 'is-focus': isFocus(data.id), 'is-selected': isSelected(data.id) }"
        >
          <span class="status-icon" :style="{ color: getStatusColor(data.status) }">
            {{ getStatusEmoji(data.status) }}
          </span>
          <span v-if="data.role" class="role-icon" :title="NODE_ROLE_CONFIG[data.role as NodeRole]?.label">
            {{ getRoleEmoji(data.role as NodeRole) }}
          </span>
          <span class="node-title">{{ data.title }}</span>
          <span v-if="isFocus(data.id)" class="focus-indicator">◄</span>
        </span>
      </template>
    </el-tree>
    <el-empty v-else description="暂无节点" :image-size="60" />
  </div>
</template>

<style scoped>
.node-tree {
  min-height: 200px;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.node-item.is-focus {
  font-weight: 600;
}

.status-icon {
  font-size: 14px;
}

.role-icon {
  font-size: 12px;
  opacity: 0.8;
}

.node-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.focus-indicator {
  color: #409eff;
  font-size: 12px;
  margin-left: 4px;
}
</style>
