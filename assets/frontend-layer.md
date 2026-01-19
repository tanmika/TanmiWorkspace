---
title: Web 前端层 (Frontend Layer)
description: Vue 3 Web 界面，包含视图、组件库、状态管理和实时更新四个模块
category: frontend
---

# Web 前端层 (Frontend Layer)

## 概述

前端层提供 TanmiWorkspace 的 Web 可视化界面，基于 Vue 3 + TypeScript 构建，使用自定义 UI 组件。

```
┌─────────────────────────────────────────────────────────────────┐
│                        web/src/                                  │
├──────────────┬───────────────┬───────────────┬──────────────────┤
│   views/     │  components/  │    stores/    │   composables/   │
│   页面视图   │    组件库     │   状态管理    │    组合式函数    │
├──────────────┴───────────────┴───────────────┴──────────────────┤
│                       api/ (HTTP 客户端)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │   HTTP Server (/api)  │
                  │   SSE (/api/events)   │
                  └───────────────────────┘
```

## 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 | 响应式 UI 框架 |
| TypeScript | 类型安全 |
| Pinia | 状态管理 |
| Vue Router | 路由管理 |
| Vite 7 | 构建工具 |
| 自定义 UI | Ws* 组件库（无 Element Plus 依赖） |

## 目录结构

```
web/src/
├── main.ts              # 应用入口
├── App.vue              # 根组件
├── router/
│   └── index.ts         # 路由配置
├── stores/              # Pinia 状态管理
│   ├── index.ts         # Store 导出
│   ├── workspace.ts     # 工作区状态
│   ├── node.ts          # 节点状态
│   ├── memo.ts          # 备忘状态
│   ├── settings.ts      # 设置状态
│   ├── toast.ts         # Toast 通知状态
│   └── service.ts       # 服务状态
├── composables/         # 组合式函数
│   └── useSSE.ts        # SSE 实时事件
├── views/
│   ├── HomeView.vue     # 首页（工作区列表）
│   ├── WorkspaceView.vue # 工作区详情页
│   └── NotFoundView.vue # 404 页面
├── components/
│   ├── ui/              # 自定义 UI 组件库
│   │   ├── WsButton.vue
│   │   ├── WsInput.vue
│   │   ├── WsModal.vue
│   │   ├── WsSelect.vue
│   │   ├── WsToast.vue
│   │   ├── WsConfirmDialog.vue
│   │   ├── WsPromptDialog.vue
│   │   ├── WsBadge.vue
│   │   ├── WsEmpty.vue
│   │   ├── WsCollapse.vue
│   │   └── index.ts
│   ├── tree/            # 树形节点组件
│   │   ├── TreeNodeItem.vue
│   │   ├── TreeChildren.vue
│   │   ├── NodeIcon.vue
│   │   ├── RoleBadge.vue
│   │   ├── DispatchBadge.vue
│   │   └── FocusCrosshair.vue
│   ├── node/            # 节点相关组件
│   │   ├── NodeTree.vue
│   │   ├── NodeTreeGraph.vue
│   │   └── NodeDetail.vue
│   ├── memo/            # 备忘组件
│   │   ├── MemoDetail.vue
│   │   └── MemoDrawerDetail.vue
│   ├── dispatch/        # 派发相关对话框
│   │   ├── EnableDispatchDialog.vue
│   │   ├── DisableDispatchDialog.vue
│   │   └── SwitchDispatchModeDialog.vue
│   ├── graph/           # 图形视图组件
│   │   └── GraphNode.vue
│   ├── common/          # 通用组件
│   │   ├── MarkdownContent.vue
│   │   ├── CompactMarkdown.vue
│   │   └── StatusIcon.vue
│   ├── log/
│   │   └── LogTimeline.vue
│   ├── BackupManager.vue
│   ├── SettingsModal.vue
│   ├── ServiceUnavailable.vue
│   ├── VersionMismatchWarning.vue
│   ├── VersionUpdateNotification.vue
│   ├── ManualOperationToast.vue
│   └── IndexManagementModalNew.vue
├── api/
│   ├── client.ts        # HTTP 客户端
│   ├── workspace.ts     # 工作区 API
│   ├── node.ts          # 节点 API
│   ├── context.ts       # 上下文 API
│   ├── log.ts           # 日志 API
│   └── settings.ts      # 设置 API
├── utils/
│   ├── errorReporter.ts # 错误上报
│   ├── mermaid.ts       # Mermaid 图表渲染
│   ├── theme.ts         # 主题管理
│   └── treeLayout.ts    # 树布局计算
└── types/
    └── index.ts         # 类型定义
```

## 模块组成

### Views (页面视图)

**目录**: `web/src/views/`

| 视图 | 路由 | 说明 |
|------|------|------|
| `HomeView` | `/` | 工作区列表，支持创建/删除/归档 |
| `WorkspaceView` | `/workspace/:id` | 工作区详情，节点树 + 节点详情 + 备忘 |
| `NotFoundView` | `/*` | 404 页面 |

**WorkspaceView 布局**:

```
┌──────────────────────────────────────────────────────────────┐
│ Header: 返回 | 工作区名称 | 派发开关 | 设置 | 刷新            │
├──────────────────────────────────────────────────────────────┤
│ Info Bar: 目标 | 进度条 | 派发状态指示                       │
├─────────────────┬────────────────────────────────────────────┤
│                 │                                            │
│  Sidebar        │  Content                                   │
│  - 视图切换     │  - NodeDetail / MemoDetail                 │
│  - NodeTree     │  - 需求/验收标准/结论/备注                 │
│  - 备忘列表     │  - 日志时间线                              │
│  - 可拖动调整   │                                            │
│                 │                                            │
└─────────────────┴────────────────────────────────────────────┘
```

### Components (组件库)

**目录**: `web/src/components/`

#### UI 组件库 (ui/)

自定义 UI 组件，无外部依赖。

| 组件 | 说明 |
|------|------|
| `WsButton` | 按钮组件（支持 loading、disabled） |
| `WsInput` | 输入框组件 |
| `WsModal` | 模态框组件 |
| `WsSelect` | 选择器组件 |
| `WsToast` | Toast 通知组件 |
| `WsConfirmDialog` | 确认对话框 |
| `WsPromptDialog` | 输入对话框 |
| `WsBadge` | 徽章组件 |
| `WsEmpty` | 空状态组件 |
| `WsCollapse` | 折叠面板组件 |

#### 树形组件 (tree/)

| 组件 | 说明 |
|------|------|
| `TreeNodeItem` | 单个树节点项 |
| `TreeChildren` | 子节点容器 |
| `NodeIcon` | 节点状态图标 |
| `RoleBadge` | 节点角色徽章 |
| `DispatchBadge` | 派发状态徽章 |
| `FocusCrosshair` | 焦点十字标记 |

#### 节点组件 (node/)

| 组件 | 说明 |
|------|------|
| `NodeTree` | 树形列表视图 |
| `NodeTreeGraph` | 图形视图（可视化节点关系） |
| `NodeDetail` | 节点详情面板（需求、验收标准、结论、备注） |

#### 备忘组件 (memo/)

| 组件 | 说明 |
|------|------|
| `MemoDetail` | 备忘详情页 |
| `MemoDrawerDetail` | 备忘抽屉详情 |

#### 派发组件 (dispatch/)

| 组件 | 说明 |
|------|------|
| `EnableDispatchDialog` | 启用派发模式对话框 |
| `DisableDispatchDialog` | 禁用派发模式对话框 |
| `SwitchDispatchModeDialog` | 切换派发模式对话框 |

#### 通用组件 (common/)

| 组件 | 说明 |
|------|------|
| `MarkdownContent` | Markdown 渲染 |
| `CompactMarkdown` | 紧凑 Markdown 渲染 |
| `StatusIcon` | 状态图标 |

#### 其他组件

| 组件 | 说明 |
|------|------|
| `BackupManager` | 备份管理器 |
| `SettingsModal` | 设置模态框 |
| `ServiceUnavailable` | 服务不可用提示 |
| `VersionMismatchWarning` | 版本不匹配警告 |
| `VersionUpdateNotification` | 版本更新通知 |
| `ManualOperationToast` | 手动操作提示 |
| `IndexManagementModalNew` | 索引管理模态框 |
| `LogTimeline` | 日志时间线 |

### Stores (状态管理)

**目录**: `web/src/stores/`

基于 Pinia 的 Composition API 风格。

#### workspaceStore

| 状态 | 类型 | 说明 |
|------|------|------|
| `workspaces` | `WorkspaceEntry[]` | 工作区列表 |
| `currentWorkspace` | `WorkspaceConfig` | 当前工作区配置 |
| `currentGraph` | `NodeGraph` | 当前节点图 |
| `dispatchConfig` | `DispatchConfig` | 派发配置 |
| `loading` | `boolean` | 加载状态 |
| `error` | `string` | 错误信息 |

#### nodeStore

| 状态 | 类型 | 说明 |
|------|------|------|
| `nodeTree` | `NodeTreeItem` | 节点树 |
| `selectedNodeId` | `string` | 选中节点 ID |
| `selectedNode` | `NodeGetResult` | 选中节点详情 |

#### memoStore

| 状态 | 类型 | 说明 |
|------|------|------|
| `memos` | `MemoListItem[]` | 备忘列表 |
| `selectedMemoId` | `string` | 选中备忘 ID |
| `selectedMemo` | `Memo` | 选中备忘详情 |

#### settingsStore

| 状态 | 类型 | 说明 |
|------|------|------|
| `settings` | `Settings` | 应用设置 |
| `theme` | `string` | 主题（light/dark） |

#### toastStore

| 方法 | 说明 |
|------|------|
| `show(message, type)` | 显示 Toast |
| `success(message)` | 成功提示 |
| `error(message)` | 错误提示 |
| `warning(message)` | 警告提示 |

#### serviceStore

| 状态 | 类型 | 说明 |
|------|------|------|
| `connected` | `boolean` | 服务连接状态 |
| `version` | `string` | 后端版本 |

### Composables (组合式函数)

**目录**: `web/src/composables/`

#### useSSE

SSE 实时事件订阅。

```typescript
const { connected, subscribe, unsubscribe } = useSSE()

// 订阅工作区事件
subscribe('workspace_updated', (data) => {
  // 处理工作区更新
})

// 订阅节点事件
subscribe('node_updated', (data) => {
  // 处理节点更新
})
```

**支持的事件类型**:

| 事件 | 说明 |
|------|------|
| `workspace_updated` | 工作区更新 |
| `node_updated` | 节点更新 |
| `focus_changed` | 焦点切换 |
| `graph_changed` | 节点图变更 |
| `memo_updated` | 备忘更新 |

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
| `settings.ts` | 设置相关 API |

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
  // 执行节点状态
  pending: { emoji: '⚪', color: '#909399', label: '待执行' },
  implementing: { emoji: '🔵', color: '#409eff', label: '执行中' },
  validating: { emoji: '🟡', color: '#e6a23c', label: '验证中' },
  completed: { emoji: '🟢', color: '#67c23a', label: '已完成' },
  failed: { emoji: '🔴', color: '#f56c6c', label: '失败' },
  // 规划节点状态
  planning: { emoji: '📋', color: '#409eff', label: '规划中' },
  monitoring: { emoji: '👁️', color: '#e6a23c', label: '监控中' },
  cancelled: { emoji: '⚫', color: '#909399', label: '已取消' },
}
```

## 交互特性

### 侧边栏可调整

- 支持拖动调整宽度
- 宽度范围：200px - 800px
- 自动保存到 localStorage

### 视图切换

- 列表视图（默认）：自定义树形展示
- 图形视图：可视化节点关系图

### 实时更新

- 基于 SSE 的实时事件推送
- 自动重连机制
- 多标签页同步

### 本地存储

| Key | 内容 |
|-----|------|
| `tanmi-workspace-view-mode` | 视图模式 (list/graph) |
| `tanmi-workspace-sidebar-width` | 侧边栏宽度 |
| `tanmi-workspace-theme` | 主题设置 |

## 构建与部署

```bash
# 开发（需要 Node.js 20.19+）
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
import { useSSE } from '@/composables/useSSE'

const workspaceStore = useWorkspaceStore()
const nodeStore = useNodeStore()
const { subscribe } = useSSE()

onMounted(async () => {
  // 加载工作区
  await workspaceStore.fetchWorkspace('ws-xxx')
  await nodeStore.fetchNodeTree()

  // 订阅实时更新
  subscribe('node_updated', (data) => {
    if (data.workspaceId === workspaceStore.currentWorkspace?.id) {
      nodeStore.fetchNodeTree()
    }
  })
})

// 选择节点
function handleSelect(nodeId: string) {
  nodeStore.selectNode(nodeId)
}
</script>
```
