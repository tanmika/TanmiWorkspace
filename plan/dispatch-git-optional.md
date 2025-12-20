# 派发 Git 功能可选化

## 背景

当前派发功能强依赖 git，用户无法在非 git 项目或不需要 git 功能时使用派发。

## 目标

允许用户自行决定是否启用派发功能中的 git 操作。

## 设计原则

| 模式 | 定位 | 默认 | 风险等级 |
|------|------|------|----------|
| **无 Git 模式** | 标准模式 | ✅ 默认 | 低（仅更新元数据） |
| **Git 模式** | 实验功能 | 需手动开启 | 中-高（涉及分支操作） |

**Git 模式风险点：**
- 创建 `tanmi_workspace/process/*` 分支
- 自动 commit（可能与用户 commit 习惯冲突）
- 测试失败时 `git reset --hard`（可能丢失未提交代码）
- 合并时可能产生冲突

---

## 可行性分析

### 当前 Git 耦合点

| 文件 | 函数 | Git 操作 |
|------|------|----------|
| DispatchService.ts | enableDispatch | isGitRepo、createBackupBranch、createProcessBranch |
| DispatchService.ts | prepareDispatch | isOnProcessBranch、checkoutProcessBranch、getCurrentCommit |
| DispatchService.ts | completeDispatch | commitDispatch |
| DispatchService.ts | handleTestResult | resetToCommit |
| DispatchService.ts | queryDisableDispatch | getCommitsBetween |
| DispatchService.ts | executeDisableChoice | rebaseMerge、squashMerge、cherryPick、checkoutBranch |
| DispatchService.ts | getGitStatus | getCurrentBranch、hasUncommittedChanges、isOnProcessBranch |
| DispatchService.ts | cleanupBranches | deleteAllWorkspaceBranches |

### 功能降级对比

| 场景 | Git 模式 | 无 Git 模式 |
|------|----------|-------------|
| 启用派发 | 创建 process 分支 | 仅更新配置 |
| 有未提交内容 | 创建 backup 分支 | 警告用户手动备份 |
| 执行任务 | 在 process 分支执行 | 直接在当前目录执行 |
| 任务完成 | git commit | 仅更新元数据（记录时间戳） |
| 测试失败 | git reset 回滚 | 无法回滚，需手动处理 |
| 禁用派发 | 4种合并策略 | 仅清理配置 |
| 并发检测 | 通过 git 分支名检测 | 通过配置文件检测 |

### 风险评估

- **低风险：** 启用/禁用派发、任务执行
- **中风险：** 测试失败无法回滚、并发派发冲突（无分支隔离）

**结论：可行，但需明确告知用户限制**

---

## 配置方案

### 类型定义扩展

```typescript
// types/workspace.ts
interface DispatchConfig {
  enabled: boolean;
  useGit: boolean;        // 新增：是否使用 git 功能
  enabledAt: number;
  originalBranch?: string;  // git 模式才有
  processBranch?: string;   // git 模式才有
  backupBranches?: string[]; // git 模式才有
  limits?: { ... };
}
```

### 工具参数扩展

```typescript
// tools/dispatch.ts - dispatch_enable
inputSchema: {
  properties: {
    workspaceId: { type: "string" },
    useGit: {
      type: "boolean",
      description: "是否使用 Git 模式（实验功能：分支隔离、自动提交、回滚）。默认 false（无 Git 模式）。设为 true 需要项目是 git 仓库。"
    }
  },
  required: ["workspaceId"]
}
```

### 全局配置文件

```typescript
// ~/.tanmi-workspace/settings.json
interface GlobalSettings {
  version: "1.0";
  dispatch: {
    useGitByDefault: boolean;  // 默认 false（无 Git 模式）
  };
}
```

### 默认值决策逻辑

```typescript
async enableDispatch(
  workspaceId: string,
  projectRoot: string,
  options?: { useGit?: boolean }
): Promise<{ success: boolean; config: DispatchConfig }> {
  // 1. 读取全局配置
  const globalSettings = await readGlobalSettings();
  const defaultUseGit = globalSettings.dispatch?.useGitByDefault ?? false;

  // 2. 检测是否 git 仓库
  const isGit = await isGitRepo(projectRoot);

  // 3. 确定 useGit 值
  let useGit: boolean;
  if (options?.useGit !== undefined) {
    // 用户显式指定
    if (options.useGit && !isGit) {
      throw new TanmiError("GIT_NOT_FOUND", "当前项目不是 git 仓库，无法启用 Git 模式");
    }
    useGit = options.useGit;
  } else {
    // 使用全局默认值，但需要项目支持
    useGit = defaultUseGit && isGit;
  }

  // 4. 根据 useGit 执行不同逻辑
  if (useGit) {
    // Git 模式：创建分支等
  } else {
    // 无 Git 模式：仅更新配置
  }
}
```

### 用户提示设计

**启用 Git 模式时返回警告（实验功能）：**

```typescript
// Git 模式警告
{
  hint: "⚠️ Git 模式（实验功能）已启用",
  warnings: [
    "将自动创建派发分支",
    "任务完成时自动提交",
    "测试失败时自动回滚（可能丢失未提交代码）"
  ]
}
```

**启用无 Git 模式时的提示：**

```typescript
// 无 Git 模式提示
{
  hint: "派发模式已启用（无 Git）",
  limitations: [
    "测试失败时无法自动回滚",
    "建议在执行前手动备份重要文件"
  ]
}
```

---

## 实施计划

> **编号说明**：Phase 1-5 为已完成的基础派发功能，Phase 6+ 为本次扩展。

---

### Phase 6-11 核心功能

---

### Phase 6 - 类型定义

#### 6.1 workspace.ts - DispatchConfig
- [ ] 添加 `useGit: boolean` 字段

#### 6.2 DispatchService.ts - 接口类型 (新增)

**DispatchPrepareResult** - 改用模式无关的字段名：
```typescript
export interface DispatchPrepareResult {
  success: boolean;
  startMarker: string;  // git 模式=commit hash，无 git 模式=时间戳
  actionRequired: ActionRequired;
}
```

**DispatchCompleteResult** - 改用模式无关的字段名：
```typescript
export interface DispatchCompleteResult {
  success: boolean;
  endMarker?: string;  // git 模式=commit hash，无 git 模式=时间戳
  nextAction?: "dispatch_test" | "return_parent";
  testNodeId?: string;
  hint?: string;
}
```

**DisableDispatchQueryResult** - 字段改为可选：
```typescript
export interface DisableDispatchQueryResult {
  actionRequired: ActionRequired;
  status: {
    originalBranch?: string;   // git 模式才有
    processBranch?: string;    // git 模式才有
    backupBranch?: string | null;
    hasBackupChanges: boolean;
    processCommits?: Array<{ hash: string; message: string }>;  // git 模式才有
    startMarker?: string;      // 统一字段名
    useGit: boolean;           // 新增：标识当前模式
  };
}
```

#### 6.3 node.ts - NodeDispatchInfo
```typescript
export interface NodeDispatchInfo {
  startMarker: string;   // git 模式=commit hash，无 git 模式=时间戳
  endMarker?: string;    // git 模式=commit hash，无 git 模式=时间戳
  status: NodeDispatchStatus;
}
```

#### 6.4 tools/dispatch.ts - 工具定义
- [ ] `dispatch_enable` 添加 `useGit` 参数
- [ ] 更新所有工具描述，说明无 git 模式行为

### Phase 7 - DispatchService 改造

#### 7.1 核心方法改造
- [ ] `enableDispatch` - 添加自动检测和条件分支
- [ ] `prepareDispatch` - useGit=false 时跳过分支操作，用时间戳代替 commit
- [ ] `completeDispatch` - useGit=false 时跳过 commitDispatch，记录时间戳
- [ ] `handleTestResult` - useGit=false 时跳过回滚，返回警告提示
- [ ] `queryDisableDispatch` - useGit=false 时返回简化的 actionRequired
- [ ] `executeDisableChoice` - useGit=false 时跳过 git 操作，仅清理配置

#### 7.2 辅助方法改造
- [ ] `getGitStatus` - 根据 `config.dispatch.useGit` 决定返回值
  - useGit=true: 返回实际 git 状态
  - useGit=false: 返回 null 或简化状态
- [ ] `cleanupBranches` - useGit=false 时直接返回 `{ success: true, deleted: [] }`

#### 7.3 并发检测机制 (新增)
- [ ] 新增 `getActiveDispatchWorkspaceByConfig(projectRoot)` 方法
  - 遍历项目下所有工作区配置
  - 检查 `dispatch.enabled` 字段
  - 返回第一个启用派发的工作区 ID
- [ ] 修改 `enableDispatch` 中的并发检测逻辑
  - useGit=true: 使用原有的 git 分支检测
  - useGit=false: 使用配置文件检测

### Phase 8 - 工具处理函数 (index.ts)

#### 8.1 dispatch_enable
- [ ] 传递 `useGit` 参数给 `enableDispatch`
- [ ] 返回信息包含模式说明

#### 8.2 dispatch_disable
- [ ] 检查 `config.dispatch.useGit`
- [ ] useGit=false 时返回简化的选项（无合并策略）

#### 8.3 dispatch_disable_execute
- [ ] useGit=false 时忽略 `mergeStrategy` 参数
- [ ] 直接执行配置清理

#### 8.4 dispatch_cleanup
- [ ] useGit=false 时为 no-op

### Phase 9 - 状态展示 (WorkspaceService.ts)

#### 9.1 workspace_status 输出
- [ ] `generateBoxStatus` 添加派发模式信息
  ```
  │ 派发: 已启用 (无 Git 模式)                    │
  ```
- [ ] `generateMarkdownStatus` 添加派发模式信息
  ```markdown
  **派发模式**: 已启用 (无 Git 模式)
  ```

### Phase 10 - 提示与文档 (StateService.ts, instructions.ts)

#### 10.1 StateService - ask_dispatch 逻辑
- [ ] 修改 `isFirstNonInfoCollectionExecution` 后的询问逻辑
  - 非 git 仓库时也询问，但提示是无 git 模式
  - 调整 actionRequired 的 message 说明两种模式差异

#### 10.2 instructions.ts - 派发模式文档
- [ ] 更新 `SCENARIO_GUIDES["dispatch_mode"]`
  - 添加无 git 模式说明
  - 添加模式选择建议
  - 添加无 git 模式限制提醒

#### 10.3 tools/dispatch.ts - 工具描述更新
- [ ] `dispatch_enable` - 添加 useGit 参数说明
- [ ] `dispatch_disable` - 说明无 git 模式下无需选择合并策略
- [ ] `node_dispatch` - 说明 startMarker 的含义（commit 或时间戳）
- [ ] `node_dispatch_complete` - 说明 endMarker 的含义
- [ ] `dispatch_cleanup` - 说明无 git 模式下为 no-op

### Phase 11 - 边缘情况处理

#### 11.1 模式不可变
- [ ] 派发启用后，useGit 不可变更
- [ ] 如需切换模式，必须先 disable 再重新 enable

#### 11.2 环境变化检测
- [ ] 如果启用 git 模式后 .git 目录被删除
  - 下次操作时检测并警告
  - 建议用户执行 dispatch_disable

#### 11.3 混合场景禁止
- [ ] 同一 projectRoot 下只允许一种模式
- [ ] 新增派发时检查现有工作区的模式

---

## 测试用例

### 基本场景
1. **git 仓库 + 默认参数** → useGit=false（默认无 Git 模式）
2. **git 仓库 + useGit=true** → useGit=true，Git 模式（实验功能）
3. **git 仓库 + 全局开启 Git** → useGit=true，跟随全局配置
4. **非 git 目录 + 默认参数** → useGit=false
5. **非 git 目录 + useGit=true** → 报错

### 执行流程
6. **无 git 模式 prepareDispatch** → 返回时间戳 startMarker
7. **无 git 模式 completeDispatch** → 不调用 commitDispatch，记录时间戳
8. **无 git 模式测试失败** → 返回警告，不回滚
9. **无 git 模式禁用派发** → 仅清理配置，无合并选项

### 并发与状态
10. **无 git 模式并发检测** → 通过配置文件检测冲突
11. **useGit 字段持久化** → 重启后正确读取
12. **workspace_status 展示** → 正确显示派发模式（Git/无 Git）

### 边缘情况
13. **模式切换** → 必须先 disable 再 enable
14. **git 目录消失** → 警告用户
15. **混合模式禁止** → 同项目只允许一种模式

### Web UI 配置
16. **设置页面正常打开** → 显示实验功能区块
17. **全局配置保存** → 写入 `~/.tanmi-workspace/settings.json`
18. **全局配置读取** → 新建工作区时正确读取默认值
19. **工作区页面派发状态显示** → 正确显示当前模式
20. **通过 Web UI 启用派发** → 调用 dispatch_enable
21. **通过 Web UI 关闭派发** → 调用 dispatch_disable（Git 模式显示合并选项）
22. **Git 模式警告** → 开启时显示实验功能警告

---

## 字段重命名映射

为保持向后兼容，采用渐进式重命名：

| 旧字段名 | 新字段名 | 说明 |
|----------|----------|------|
| startCommit | startMarker | 代码内部统一使用新名称 |
| endCommit | endMarker | 代码内部统一使用新名称 |

API 层面暂时保留旧字段名作为别名，后续版本移除。

---

## Phase 12-14 Web UI 配置

---

### Phase 12 - 全局配置服务

#### 12.1 配置文件定义

```typescript
// src/types/settings.ts
export interface GlobalSettings {
  version: "1.0";
  dispatch: {
    useGitByDefault: boolean;  // 默认 false
  };
}

// 默认值
export const DEFAULT_SETTINGS: GlobalSettings = {
  version: "1.0",
  dispatch: {
    useGitByDefault: false,
  },
};
```

#### 12.2 SettingsService 实现

- [ ] 新增 `src/services/SettingsService.ts`
- [ ] 配置文件路径：`~/.tanmi-workspace/settings.json`
- [ ] 方法：
  - `readSettings(): Promise<GlobalSettings>` - 读取配置，不存在则返回默认值
  - `writeSettings(settings: GlobalSettings): Promise<void>` - 写入配置
  - `updateSettings(partial: Partial<GlobalSettings>): Promise<GlobalSettings>` - 部分更新

#### 12.3 HTTP API

- [ ] `GET /api/settings` - 返回当前配置
- [ ] `PUT /api/settings` - 更新配置

#### 12.4 DispatchService 集成

- [ ] `enableDispatch` 读取全局配置作为默认值
- [ ] 优先级：显式参数 > 全局配置 > 代码默认值

### Phase 13 - Web UI 设置页面

#### 13.1 路由与组件

- [ ] 新增 `web/src/api/settings.ts` - API 客户端
- [ ] 新增 `web/src/stores/settings.ts` - 配置状态管理
- [ ] 新增 `web/src/components/SettingsDialog.vue` - 设置弹窗

#### 13.2 HomeView 改动

- [ ] Header 右侧添加设置按钮（齿轮图标）
- [ ] 点击打开设置弹窗

#### 13.3 设置弹窗 UI

```
┌────────────────────────────────────────────────────┐
│ 设置                                          [×] │
├────────────────────────────────────────────────────┤
│                                                    │
│ ⚗️ 实验功能                                        │
│ ┌────────────────────────────────────────────────┐ │
│ │ □ 默认启用 Git 派发模式                        │ │
│ │                                                │ │
│ │ ⚠️ 测试功能，可能不稳定                         │ │
│ │                                                │ │
│ │ 启用后，新建工作区的派发将默认使用 Git 模式：   │ │
│ │ • 自动创建派发分支                             │ │
│ │ • 任务完成自动提交                             │ │
│ │ • 测试失败自动回滚                             │ │
│ │                                                │ │
│ │ 风险提示：                                     │ │
│ │ • 会修改 Git 历史                              │ │
│ │ • 回滚可能丢失未提交代码                       │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│                              [取消]  [保存]        │
└────────────────────────────────────────────────────┘
```

#### 13.4 交互逻辑

- [ ] 打开时加载当前配置
- [ ] 开启 Git 模式时显示确认提示
- [ ] 保存后显示成功提示
- [ ] 配置实时生效（无需重启）

### Phase 14 - 工作区页面派发控制

#### 14.1 派发状态显示

在 `WorkspaceView.vue` 的 info-bar 添加派发状态：

```
┌────────────────────────────────────────────────────────────┐
│ 目标: xxx | 进度: 3/10 | 派发: ✅已启用 [关闭]             │
│                         或 派发: ⚠️已启用(Git) [关闭]       │
│                         或 派发: ❌未启用 [启用]            │
└────────────────────────────────────────────────────────────┘
```

#### 14.2 workspaceStore 扩展

- [ ] 新增 `dispatchStatus` 计算属性
- [ ] 新增 `enableDispatch(useGit?: boolean)` 方法
- [ ] 新增 `disableDispatch(options)` 方法

#### 14.3 启用派发弹窗

```
┌────────────────────────────────────────┐
│ 启用派发模式                           │
├────────────────────────────────────────┤
│                                        │
│ 选择模式：                             │
│ ● 标准模式（无 Git）                   │
│   仅更新元数据，不影响代码             │
│                                        │
│ ○ Git 模式（实验功能）                 │
│   ⚠️ 自动创建分支、提交、回滚          │
│   可能影响 Git 历史                    │
│                                        │
│              [取消]  [启用]            │
└────────────────────────────────────────┘
```

#### 14.4 关闭派发弹窗

**无 Git 模式：** 直接确认关闭

```
┌────────────────────────────────────────┐
│ 关闭派发模式                           │
├────────────────────────────────────────┤
│ 确定要关闭派发模式吗？                 │
│                                        │
│              [取消]  [确认]            │
└────────────────────────────────────────┘
```

**Git 模式：** 显示合并选项

```
┌────────────────────────────────────────┐
│ 关闭派发模式                           │
├────────────────────────────────────────┤
│ 当前有 3 个提交在派发分支上。          │
│                                        │
│ 合并策略：                             │
│ ○ 按顺序合并（保留提交历史）           │
│ ● squash（压缩为一个提交）             │
│ ○ cherry-pick（遴选到当前分支）        │
│ ○ 跳过（不合并，保留分支）             │
│                                        │
│ □ 保留备份分支                         │
│ □ 保留派发分支                         │
│                                        │
│              [取消]  [确认关闭]        │
└────────────────────────────────────────┘
```

#### 14.5 API 扩展

复用现有 MCP 工具，通过 HTTP 暴露：

- [ ] `POST /api/workspace/:id/dispatch/enable` - 启用派发
- [ ] `POST /api/workspace/:id/dispatch/disable` - 查询关闭选项
- [ ] `POST /api/workspace/:id/dispatch/disable/execute` - 执行关闭

---

## 配置优先级

```
显式参数（API/工具调用）
    ↓ 未指定时
工作区配置（已启用派发的工作区）
    ↓ 新建时
全局配置（~/.tanmi-workspace/settings.json）
    ↓ 配置文件不存在时
代码默认值（useGitByDefault = false）
```

---

## 文件变更清单

### 新增文件
- `src/types/settings.ts` - 全局配置类型
- `src/services/SettingsService.ts` - 配置服务
- `web/src/api/settings.ts` - 配置 API 客户端
- `web/src/stores/settings.ts` - 配置状态管理
- `web/src/components/SettingsDialog.vue` - 设置弹窗
- `web/src/components/dispatch/EnableDispatchDialog.vue` - 启用派发弹窗
- `web/src/components/dispatch/DisableDispatchDialog.vue` - 关闭派发弹窗

### 修改文件
- `src/index.ts` - 添加设置 API 路由
- `src/services/DispatchService.ts` - 读取全局配置
- `web/src/views/HomeView.vue` - 添加设置入口
- `web/src/views/WorkspaceView.vue` - 添加派发状态与控制
- `web/src/stores/workspace.ts` - 添加派发相关方法
- `web/src/api/workspace.ts` - 添加派发相关 API
