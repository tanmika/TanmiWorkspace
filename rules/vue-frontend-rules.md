---
title: Vue 前端规范
description: Vue 前端规范，包括组件结构、Pinia Store 设计、命名约定
scope: vue
---

# Vue 前端规范

## 适用范围

本规范适用于 `web/src/` 目录下所有 Vue 3 代码。

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.x | 响应式框架 |
| TypeScript | 5.x | 类型安全 |
| Pinia | 2.x | 状态管理 |
| Vue Router | 4.x | 路由管理 |
| Element Plus | 2.x | UI 组件库 |
| Vite | 5.x | 构建工具 |

## 组件规范

### 单文件组件结构

```vue
<script setup lang="ts">
// 1. 导入
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useWorkspaceStore } from '@/stores'
import type { NodeTreeItem } from '@/types'

// 2. Props 和 Emits
const props = defineProps<{
  tree: NodeTreeItem | null
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [nodeId: string]
}>()

// 3. Store 和 Router
const store = useWorkspaceStore()
const router = useRouter()

// 4. 响应式状态
const loading = ref(false)
const searchQuery = ref('')

// 5. 计算属性
const filteredItems = computed(() => {
  // ...
})

// 6. 方法
function handleSelect(id: string) {
  emit('select', id)
}

async function loadData() {
  loading.value = true
  try {
    await store.fetchWorkspaces()
  } finally {
    loading.value = false
  }
}

// 7. 生命周期
onMounted(loadData)
</script>

<template>
  <!-- 模板内容 -->
</template>

<style scoped>
/* 组件样式 */
</style>
```

### 组件命名

| 类型 | 命名 | 示例 |
|------|------|------|
| 页面组件 | `XxxView.vue` | `HomeView.vue`, `WorkspaceView.vue` |
| 功能组件 | `XxxYyy.vue` | `NodeTree.vue`, `NodeDetail.vue` |
| 通用组件 | `XxxYyy.vue` | `StatusIcon.vue`, `MarkdownContent.vue` |

### 组件目录

```
components/
├── common/          # 通用组件
│   ├── StatusIcon.vue
│   └── MarkdownContent.vue
├── node/            # 节点相关
│   ├── NodeTree.vue
│   ├── NodeTreeGraph.vue
│   └── NodeDetail.vue
└── log/             # 日志相关
    └── LogTimeline.vue
```

## Props 和 Emits

### Props 定义

```typescript
// 使用泛型定义（推荐）
const props = defineProps<{
  tree: NodeTreeItem | null
  selectedId: string | null
  focusId: string | null
}>()

// 带默认值
const props = withDefaults(defineProps<{
  loading?: boolean
  size?: 'small' | 'medium' | 'large'
}>(), {
  loading: false,
  size: 'medium'
})
```

### Emits 定义

```typescript
// 使用泛型定义（推荐）
const emit = defineEmits<{
  select: [nodeId: string]
  update: [data: NodeData]
  'update:modelValue': [value: string]
}>()

// 调用
emit('select', nodeId)
```

## Pinia Store 规范

### Store 结构

```typescript
// stores/workspace.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useWorkspaceStore = defineStore('workspace', () => {
  // 1. 状态
  const workspaces = ref<WorkspaceEntry[]>([])
  const currentWorkspace = ref<WorkspaceConfig | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 2. 计算属性
  const activeWorkspaces = computed(() =>
    workspaces.value.filter(w => w.status === 'active')
  )

  // 3. 方法
  async function fetchWorkspaces(status?: string) {
    loading.value = true
    error.value = null
    try {
      const result = await workspaceApi.list({ status })
      workspaces.value = result.workspaces
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  function clearCurrent() {
    currentWorkspace.value = null
  }

  // 4. 返回
  return {
    // 状态
    workspaces,
    currentWorkspace,
    loading,
    error,
    // 计算属性
    activeWorkspaces,
    // 方法
    fetchWorkspaces,
    clearCurrent,
  }
})
```

### Store 命名

- 文件：`camelCase.ts`（如 `workspace.ts`）
- 函数：`use{Name}Store`（如 `useWorkspaceStore`）
- Store ID：与文件名一致（如 `'workspace'`）

### 错误处理

```typescript
async function fetchData() {
  loading.value = true
  error.value = null
  try {
    // 请求
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
    throw e  // 重新抛出，让调用方处理
  } finally {
    loading.value = false
  }
}
```

## API 封装

### API 模块结构

```typescript
// api/workspace.ts
import { client } from './client'
import type { WorkspaceInitParams, WorkspaceInitResult } from '@/types'

export const workspaceApi = {
  async create(params: WorkspaceInitParams): Promise<WorkspaceInitResult> {
    return client.post('/api/workspaces', params)
  },

  async list(params?: { status?: string }): Promise<WorkspaceListResult> {
    return client.get('/api/workspaces', { params })
  },

  async get(id: string): Promise<WorkspaceGetResult> {
    return client.get(`/api/workspaces/${id}`)
  },

  async delete(id: string, force?: boolean): Promise<void> {
    return client.delete(`/api/workspaces/${id}`, { params: { force } })
  },
}
```

### 统一导出

```typescript
// api/index.ts
export { workspaceApi } from './workspace'
export { nodeApi } from './node'
export { contextApi } from './context'
```

## 路由规范

### 路由定义

```typescript
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '工作区列表' },
  },
  {
    path: '/workspace/:id',
    name: 'workspace',
    component: () => import('@/views/WorkspaceView.vue'),
    meta: { title: '工作区详情' },
  },
]
```

### 路由守卫

```typescript
router.beforeEach((to, _from, next) => {
  // 更新页面标题
  document.title = `${to.meta.title || 'TanmiWorkspace'} - TanmiWorkspace`
  next()
})
```

## 样式规范

### Scoped 样式

```vue
<style scoped>
.node-tree {
  min-height: 200px;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
```

### 类命名

使用 `kebab-case`：

```css
.node-tree { }
.node-item { }
.is-selected { }
.is-focus { }
```

### 状态类

```css
.is-active { }
.is-disabled { }
.is-loading { }
.is-selected { }
.is-focus { }
```

## 本地存储

### 使用规范

```typescript
// 键名格式：tanmi-workspace-{feature}
const VIEW_MODE_KEY = 'tanmi-workspace-view-mode'
const SIDEBAR_WIDTH_KEY = 'tanmi-workspace-sidebar-width'

// 读取
const viewMode = localStorage.getItem(VIEW_MODE_KEY) || 'list'

// 保存
localStorage.setItem(VIEW_MODE_KEY, mode)
```

## 最佳实践

1. **Composition API**：使用 `<script setup>` 语法
2. **类型安全**：Props/Emits 使用泛型定义
3. **状态管理**：复杂状态使用 Pinia，简单状态使用 ref
4. **懒加载**：路由组件使用动态导入
5. **错误处理**：统一在 Store 中处理，组件显示提示
6. **样式隔离**：使用 `scoped` 样式
