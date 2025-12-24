---
title: Web 前端层 (Frontend Layer)
description: Vue 3 Web 界面，包含视图、组件库和状态管理三个模块
category: frontend
---

# Web 前端层 (Frontend Layer)

## 概述

前端层提供 TanmiWorkspace 的 Web 可视化界面，基于 Vue 3 + TypeScript + Element Plus 构建。

```
┌─────────────────────────────────────────────────────────────┐
│                      web/src/                                │
├──────────────┬───────────────┬───────────────┬──────────────┤
│   views/     │  components/  │    stores/    │     api/     │
│   页面视图   │    组件库     │   状态管理    │   API 封装   │
└──────────────┴───────────────┴───────────────┴──────────────┘
                              │
                              ▼
                    HTTP Server (/api)
```

## 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 | 响应式 UI 框架 |
| TypeScript | 类型安全 |
| Pinia | 状态管理 |
| Vue Router | 路由管理 |
| Element Plus | UI 组件库 |
| Vite | 构建工具 |

## 目录结构

```
web/src/
├── main.ts              # 应用入口
├── App.vue              # 根组件
├── router/
│   └── index.ts         # 路由配置
├── stores/
│   ├── index.ts         # Store 导出
│   ├── workspace.ts     # 工作区状态
│   └── node.ts          # 节点状态
├── views/
│   ├── HomeView.vue     # 首页（工作区列表）
│   ├── WorkspaceView.vue # 工作区详情页
│   └── NotFoundView.vue # 404 页面
├── components/
│   ├── common/          # 通用组件
│   │   ├── MarkdownContent.vue
│   │   └── StatusIcon.vue
│   ├── node/            # 节点相关组件
│   │   ├── NodeTree.vue
│   │   ├── NodeTreeGraph.vue
│   │   └── NodeDetail.vue
│   └── log/
│       └── LogTimeline.vue
├── api/
│   ├── client.ts        # HTTP 客户端
│   ├── workspace.ts     # 工作区 API
│   ├── node.ts          # 节点 API
│   ├── context.ts       # 上下文 API
│   └── log.ts           # 日志 API
└── types/
    └── index.ts         # 类型定义
```

## 模块组成

### Views (页面视图)

**目录**: `web/src/views/`

| 视图 | 路由 | 说明 |
|------|------|------|
| `HomeView` | `/` | 工作区列表，支持创建/删除 |
| `WorkspaceView` | `/workspace/:id` | 工作区详情，节点树 + 节点详情 |
| `NotFoundView` | `/*` | 404 页面 |

**WorkspaceView 布局**:

```
┌──────────────────────────────────────────────────────┐
│ Header: 返回 | 工作区名称 | 信息栏开关 | 刷新 | 新建 │
├──────────────────────────────────────────────────────┤
│ Info Bar: 目标 | 进度条                              │
├─────────────────┬────────────────────────────────────┤
│                 │                                    │
│  Sidebar        │  Content                           │
│  - 视图切换     │  - NodeDetail                      │
│  - NodeTree     │  - 需求/结论/备注                  │
│  - 可拖动调整   │  - 日志时间线                      │
│                 │                                    │
└─────────────────┴────────────────────────────────────┘
```

### Components (组件库)

**目录**: `web/src/components/`

#### 节点组件 (node/)

| 组件 | 说明 |
|------|------|
| `NodeTree` | 树形列表视图，基于 el-tree |
| `NodeTreeGraph` | 图形视图（可视化节点关系） |
| `NodeDetail` | 节点详情面板 |

**NodeTree 特性**:
- 状态 emoji 图标显示
- 当前焦点标记（◄）
- 选中高亮
- 展开/折叠控制

#### 通用组件 (common/)

| 组件 | 说明 |
|------|------|
| `MarkdownContent` | Markdown 渲染 |
| `StatusIcon` | 状态图标 |

#### 日志组件 (log/)

| 组件 | 说明 |
|------|------|
| `LogTimeline` | 日志时间线显示 |

### Stores (状态管理)

**目录**: `web/src/stores/`

基于 Pinia 的 Composition API 风格。

#### workspaceStore

| 状态 | 类型 | 说明 |
|------|------|------|
| `workspaces` | `WorkspaceEntry[]` | 工作区列表 |
| `currentWorkspace` | `WorkspaceConfig` | 当前工作区配置 |
| `currentGraph` | `NodeGraph` | 当前节点图 |
| `currentStatus` | `StatusSummary` | 状态摘要 |
| `loading` | `boolean` | 加载状态 |
| `error` | `string` | 错误信息 |

| 方法 | 说明 |
|------|------|
| `fetchWorkspaces(status?)` | 获取工作区列表 |
| `fetchWorkspace(id)` | 获取工作区详情 |
| `fetchStatus(id)` | 获取状态摘要 |
| `createWorkspace(params)` | 创建工作区 |
| `deleteWorkspace(id, force?)` | 删除工作区 |
| `clearCurrent()` | 清空当前状态 |

| 计算属性 | 说明 |
|---------|------|
| `activeWorkspaces` | 活动工作区列表 |
| `archivedWorkspaces` | 归档工作区列表 |
| `currentFocus` | 当前焦点节点 ID |

#### nodeStore

| 状态 | 类型 | 说明 |
|------|------|------|
| `nodeTree` | `NodeTreeItem` | 节点树 |
| `selectedNodeId` | `string` | 选中节点 ID |
| `selectedNode` | `NodeGetResult` | 选中节点详情 |

| 方法 | 说明 |
|------|------|
| `fetchNodeTree()` | 获取节点树 |
| `selectNode(id)` | 选择节点 |
| `createNode(params)` | 创建节点 |
| `deleteNode(id)` | 删除节点 |
| `clearAll()` | 清空状态 |

### API (接口封装)

**目录**: `web/src/api/`

基于 fetch 的 HTTP 客户端封装。

| 文件 | 说明 |
|------|------|
| `client.ts` | 基础客户端，处理请求/响应 |
| `workspace.ts` | 工作区相关 API |
| `node.ts` | 节点相关 API |
| `context.ts` | 上下文相关 API |
| `log.ts` | 日志相关 API |

## 路由配置

```typescript
const routes = [
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
  {
    path: '/:pathMatch(.*)*',
    name: 'notFound',
    component: () => import('@/views/NotFoundView.vue'),
  },
]
```

## 状态配置

节点状态与 UI 映射：

```typescript
const STATUS_CONFIG = {
  pending: { emoji: '⚪', color: '#909399', label: '待执行' },
  implementing: { emoji: '🔵', color: '#409eff', label: '执行中' },
  validating: { emoji: '🟡', color: '#e6a23c', label: '验证中' },
  completed: { emoji: '🟢', color: '#67c23a', label: '已完成' },
  failed: { emoji: '🔴', color: '#f56c6c', label: '失败' },
}
```

## 交互特性

### 侧边栏可调整

- 支持拖动调整宽度
- 宽度范围：200px - 800px
- 自动保存到 localStorage

### 视图切换

- 列表视图（默认）：el-tree 树形展示
- 图形视图：可视化节点关系图

### 本地存储

| Key | 内容 |
|-----|------|
| `tanmi-workspace-view-mode` | 视图模式 (list/graph) |
| `tanmi-workspace-sidebar-width` | 侧边栏宽度 |

## 构建与部署

```bash
# 开发
cd web && npm run dev

# 构建
cd web && npm run build

# 产物
web/dist/  # 由 HTTP Server 静态托管
```

## 使用示例

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useWorkspaceStore, useNodeStore } from '@/stores'

const workspaceStore = useWorkspaceStore()
const nodeStore = useNodeStore()

onMounted(async () => {
  // 加载工作区
  await workspaceStore.fetchWorkspace('ws-xxx')
  await nodeStore.fetchNodeTree()
})

// 选择节点
function handleSelect(nodeId: string) {
  nodeStore.selectNode(nodeId)
}
</script>
```
