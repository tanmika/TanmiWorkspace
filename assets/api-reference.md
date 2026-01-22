# TanmiWorkspace API 参考

> 面向开发者的 MCP 工具详细文档

## 快速参考

```typescript
// 工作区生命周期
workspace_init(name, goal, scenario, rules?, docs?)  // 创建工作区
workspace_get(workspaceId)                     // 获取详情
workspace_list(status?, cwd?)                  // 列出工作区
workspace_delete(workspaceId, force?)          // 删除工作区
workspace_status(workspaceId, format?)         // 可视化状态
workspace_update_rules(workspaceId, action, rule?, rules?)  // 更新规则
workspace_archive(workspaceId)                 // 归档工作区
workspace_restore(workspaceId)                 // 恢复归档
workspace_health(workspaceId?, diagnosticToken?)  // 健康检测
workspace_import_guide(path, type, changeId?)  // 导入引导
workspace_import_list(path, type)              // 列出可导入项

// 节点管理
node_create(workspaceId, parentId, type, title, requirement, rulesHash?, role?, docs?, ...)
node_get(workspaceId, nodeId)
node_list(workspaceId, rootId?, depth?)
node_update(workspaceId, nodeId, title?, requirement?, note?, conclusion?)
node_delete(workspaceId, nodeId)
node_move(workspaceId, nodeId, newParentId)
node_reorder(workspaceId, nodeId, orderedChildIds)  // 重排子节点顺序
node_transition(workspaceId, nodeId, action, conclusion?, reason?, confirmation?)

// 上下文管理
context_get(workspaceId, nodeId, includeLog?, includeProblem?, maxLogEntries?)
context_focus(workspaceId, nodeId)
node_isolate(workspaceId, nodeId, isolate)
node_reference(workspaceId, nodeId, targetIdOrPath, action, description?)

// 日志与问题
log_append(workspaceId, nodeId?, operator, event)
problem_update(workspaceId, nodeId?, problem, nextStep?)
problem_clear(workspaceId, nodeId?)

// 会话管理
session_bind(sessionId, workspaceId, nodeId?)
session_unbind(sessionId)
session_status(sessionId)
get_pending_changes(sessionId, workspaceId?)   // 获取待处理变更

// 派发（多 Agent 协作）
dispatch_node(workspaceId, nodeId)             // 升级节点为派发母节点
dispatch_create(workspaceId, parentId, exec, includeQuality?)  // 创建派发子节点
dispatch_complete(workspaceId, nodeId, success, conclusion?)  // 完成派发
dispatch_enable(workspaceId, useGit?)          // 启用派发模式
dispatch_disable(workspaceId)                  // 禁用派发（查询状态）
dispatch_disable_execute(workspaceId, mergeStrategy, ...)  // 执行禁用
dispatch_cleanup(workspaceId, cleanupType?)    // 清理分支

// 备忘系统
memo_create(workspaceId, title, summary, content, tags)  // 创建备忘
memo_list(workspaceId, tags?)                  // 列出备忘
memo_get(workspaceId, memoId)                  // 获取备忘
memo_update(workspaceId, memoId, ...)          // 更新备忘
memo_delete(workspaceId, memoId)               // 删除备忘

// 能力包系统
capability_list(scenario?, sessionId?)         // 获取能力包列表
capability_select(workspaceId, selected, infoType?, nodeId?)  // 选择能力包
plugin_path(type?, name?)                      // 获取插件资源路径

// 配置管理
config_get()                                   // 获取配置
config_set(defaultDispatchMode?)               // 设置配置

// 搜索系统
workspace_search(query, limit?)                // 跨工作区搜索
content_search(workspaceId, query, id?, target?, limit?, context?)  // 工作区内搜索

// 帮助系统
tanmi_help(topic)
tanmi_prompt(template, params?)
```

---

## 工作区管理

### workspace_init

创建新工作区。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `name` | string | ✅ | 工作区名称（不能包含特殊字符: / \ : * ? " < > \|） |
| `goal` | string | ✅ | 工作区目标描述 |
| `scenario` | string | ✅ | 任务场景类型：`feature`(新功能)、`debug`(调试)、`optimize`(优化)、`summary`(总结)、`misc`(其他) |
| `rules` | string[] | - | 初始规则列表 |
| `docs` | DocRef[] | - | 初始文档引用列表 |

**DocRef 结构**

```typescript
{
  path: string;        // 文档路径
  description: string; // 文档描述
}
```

**返回值**

```typescript
{
  workspaceId: string;   // 工作区 ID
  path: string;          // 存储路径
  projectRoot: string;   // 项目根目录
  rootNodeId: string;    // 根节点 ID（固定为 "root"）
  webUrl: string;        // Web 界面 URL
  hint: string;          // 下一步提示
}
```

**示例**

```typescript
workspace_init({
  name: "实现登录功能",
  goal: "为应用添加用户名密码登录",
  rules: ["使用 JWT 认证", "密码需加密存储"],
  docs: [
    { path: "/docs/auth-spec.md", description: "认证规范文档" }
  ]
})
```

---

### workspace_get

获取工作区详情。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |

**返回值**

```typescript
{
  workspace: {
    id: string;
    name: string;
    goal: string;
    status: "active" | "archived";
    rules: string[];
    rulesHash: string;
    docs: DocRef[];
    createdAt: number;
    updatedAt: number;
  };
  nodeGraph: string;     // 节点树的文本表示
  workspaceMd: string;   // Workspace.md 文件内容
  webUrl: string;
}
```

---

### workspace_list

列出所有工作区。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `status` | string | - | 筛选状态：`active`、`archived`、`all`（默认 `active`） |
| `cwd` | string | - | 当前工作目录，匹配的工作区优先显示 |

**排序规则**
- 如果提供了 `cwd` 参数，匹配当前路径的工作区优先显示
- 同级别按更新时间降序排列

**返回值**

```typescript
{
  workspaces: Array<{
    id: string;
    name: string;
    goal: string;
    status: string;
    createdAt: number;
    updatedAt: number;
  }>;
}
```

---

### workspace_delete

删除工作区。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `force` | boolean | - | 是否强制删除活动状态的工作区（默认 `false`） |

**返回值**

```typescript
{
  success: boolean;
  message: string;
}
```

---

### workspace_status

获取工作区可视化状态。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `format` | string | - | 输出格式：`box`（默认）或 `markdown` |

**返回值**

```typescript
{
  status: string;   // 格式化的状态文本
  webUrl: string;   // Web 界面 URL
}
```

---

### workspace_update_rules

更新工作区规则。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `action` | string | ✅ | 操作类型：`add`、`remove`、`replace` |
| `rule` | string | - | 单条规则（`add`/`remove` 时使用） |
| `rules` | string[] | - | 规则数组（`replace` 时使用） |

**返回值**

```typescript
{
  success: boolean;
  rules: string[];      // 更新后的规则列表
  rulesHash: string;    // 新的规则哈希
}
```

---

### workspace_archive

归档工作区。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |

**返回值**

```typescript
{
  success: boolean;
  archivePath: string;  // 归档后的路径
}
```

**说明**

- 工作区状态变为 `archived`
- 目录移动到 `.tanmi-workspace/archive/` 下
- 仍可通过 `workspace_get`/`workspace_status` 查看
- 可通过 `workspace_restore` 恢复

---

### workspace_restore

恢复归档的工作区。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |

**返回值**

```typescript
{
  success: boolean;
  restoredPath: string;  // 恢复后的路径
}
```

**说明**

- 工作区状态变为 `active`
- 目录移回原位置
- 可继续正常使用

---

### workspace_health

检测工作区健康状态。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | - | 工作区 ID（不填则检测所有活跃工作区） |
| `diagnosticToken` | string | - | 诊断令牌（从诊断指南获取） |

**使用流程**

1. 首次调用返回诊断指南路径
2. 阅读诊断指南获取 `diagnosticToken`
3. 携带 token 再次调用执行检测

**检测内容**

- 目录完整性
- 配置文件有效性
- 节点文件完整性
- 版本兼容性

**返回值**

```typescript
{
  healthy: boolean;
  issues: Array<{
    workspaceId: string;
    type: string;
    message: string;
    suggestion?: string;
  }>;
}
```

---

### workspace_import_guide

获取外部规范的导入引导信息。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `path` | string | ✅ | 规范目录的绝对路径 |
| `type` | string | ✅ | 规范类型：`openspec` |
| `changeId` | string | - | 变更 ID（OpenSpec 目录名） |

**返回值**

```typescript
{
  summary: {
    title: string;
    taskCount: number;
    completedCount: number;
  };
  files: Array<{
    path: string;
    purpose: string;
  }>;
  importCommand: string;  // 导入脚本调用命令
}
```

**使用流程**

1. 调用此工具获取引导
2. 根据 `files` 列表阅读相关文件
3. 向用户展示理解的内容
4. 用户确认后执行 `importCommand`
5. 调用 `workspace_get` 获取创建的工作区详情

---

### workspace_import_list

列出可导入的变更列表。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `path` | string | ✅ | 规范目录的绝对路径 |
| `type` | string | ✅ | 规范类型：`openspec` |

**返回值**

```typescript
{
  changes: Array<{
    id: string;
    title: string;
    progress: string;  // 如 "3/5"
  }>;
}
```

---

## 节点管理

### node_create

创建子节点。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `parentId` | string | ✅ | 父节点 ID（必须是规划节点） |
| `type` | string | ✅ | 节点类型：`planning` 或 `execution` |
| `title` | string | ✅ | 节点标题 |
| `requirement` | string | - | 需求描述 |
| `rulesHash` | string | - | 规则哈希（工作区有规则时必填） |
| `role` | string | - | 节点角色（见下表） |
| `docs` | DocRef[] | - | 派发给子节点的文档引用 |
| `acceptanceCriteria` | object[] | - | 验收标准列表（动态键值对格式） |
| `isNeedTest` | boolean | - | 是否需要测试（仅执行节点有效） |
| `testRequirement` | string | - | 测试验收标准（isNeedTest=true 时使用） |

**节点角色 (NodeRole)**

| 角色 | 说明 |
|------|------|
| `info_collection` | 信息收集：调研、分析，完成时自动归档 |
| `info_summary` | 信息总结：从已有信息中提取结构化内容 |
| `dispatch_exec` | 派发执行：派发母节点自动创建的执行子节点 |
| `dispatch_spec` | 派发规格审查：验证执行结果是否符合需求规格 |
| `dispatch_quality` | 派发质量审查：检查代码质量、最佳实践 |

**节点类型选择指南**

| 场景 | 选择 | 原因 |
|------|------|------|
| 具体的代码修改、bug修复 | `execution` | 有明确产出，不需要再分解 |
| 简单的文件操作、配置更改 | `execution` | 单步完成 |
| 需要分析后再决定具体步骤 | `planning` | 先分析，再创建子节点 |
| 涉及多个模块或多步操作 | `planning` | 分解为多个执行节点 |

**返回值**

```typescript
{
  nodeId: string;    // 新节点 ID
  path: string;      // 节点存储路径
  hint: string;      // 下一步提示（包含规则提醒）
}
```

**示例**

```typescript
// 创建信息收集节点
node_create({
  workspaceId: "ws-xxx",
  parentId: "root",
  type: "execution",
  role: "info_collection",
  title: "需求调研",
  requirement: "收集项目信息，分析需求"
})

// 创建执行节点
node_create({
  workspaceId: "ws-xxx",
  parentId: "root",
  type: "execution",
  title: "实现登录接口",
  requirement: "使用 JWT 实现登录 API",
  rulesHash: "ff280711"
})
```

---

### node_transition

变更节点状态。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 节点 ID |
| `action` | string | ✅ | 转换动作（见下表） |
| `conclusion` | string | - | 结论（`complete`/`fail`/`cancel` 时必填，不能包含 `##` 二级标题） |
| `reason` | string | - | 转换原因（记录到日志） |
| `confirmation` | object | - | Confirmation Token 验证数据（当 actionRequired 返回 confirmationToken 时必须提供） |

**confirmation 结构**

```typescript
{
  token: string;     // 待验证的 confirmation token
  userInput: string; // 用户的真实输入
}
```

**执行节点 (execution) 动作**

| 动作 | 状态转换 | 说明 |
|------|----------|------|
| `start` | pending → implementing | 开始执行 |
| `submit` | implementing → validating | 提交验证 |
| `complete` | implementing/validating → completed | 完成（需 conclusion） |
| `fail` | implementing/validating → failed | 失败（需 conclusion） |
| `retry` | failed → implementing | 重试 |
| `reopen` | completed → implementing | 重新激活 |

**规划节点 (planning) 动作**

| 动作 | 状态转换 | 说明 |
|------|----------|------|
| `start` | pending → planning | 开始规划 |
| `complete` | planning/monitoring → completed | 完成汇总（需 conclusion，要求所有子节点已完成） |
| `cancel` | planning/monitoring → cancelled | 取消（需 conclusion） |
| `reopen` | completed/cancelled → planning | 重新规划 |

**返回值**

```typescript
{
  success: boolean;
  previousStatus: string;
  currentStatus: string;
  conclusion: string | null;
  hint: string;
}
```

---

### node_get

获取节点详情。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 节点 ID |

**返回值**

```typescript
{
  meta: {
    id: string;
    dirName: string;
    type: "planning" | "execution";
    status: string;
    role: string | null;
    parentId: string | null;
    children: string[];
    isolate: boolean;
    references: string[];
    conclusion: string | null;
    conclusionStale: boolean;
    dispatch?: NodeDispatchInfo;
    dispatchParent?: NodeDispatchParent;
    createdAt: string;
    updatedAt: string;
  };
  infoMd: string;       // Info.md 文件内容
  logMd: string;        // Log.md 文件内容
  problemMd: string;    // Problem.md 文件内容
  nodeHash: string;     // 节点内容哈希（用于 node_update 先读后写校验）
}
```

---

### node_list

获取节点树结构。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `rootId` | string | - | 起始节点 ID（默认为工作区根节点） |
| `depth` | number | - | 最大深度（默认无限） |

**返回值**

```typescript
{
  tree: NodeTreeItem[];
}

interface NodeTreeItem {
  id: string;
  title: string;
  type: string;
  status: string;
  children: NodeTreeItem[];
}
```

---

### node_update

更新节点信息。支持两种模式：整体替换和精确替换。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 节点 ID |
| `nodeHash` | string | ✅ | 节点内容哈希（从 node_get 获取，用于先读后写校验） |
| `title` | string | - | 新标题 |
| `requirement` | string | - | 新需求描述（整体替换） |
| `note` | string | - | 新备注（整体替换） |
| `conclusion` | string | - | 新结论（整体替换） |
| `field` | string | - | 精确替换的目标字段：`requirement`、`note`、`conclusion` |
| `old_str` | string | - | 要替换的原文本（与 field 配合使用） |
| `new_str` | string | - | 替换后的文本（与 field 配合使用） |
| `conclusionsHash` | string | - | 结论哈希（stale=true 时更新 conclusion 必填） |

**更新模式**

1. **整体替换**：直接提供 `requirement`/`note`/`conclusion` 字段值
2. **精确替换**：提供 `field` + `old_str` + `new_str` 进行字符串替换

**返回值**

```typescript
{
  success: boolean;
  updatedAt: string;
}
```

---

### node_delete

删除节点及其所有子节点。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 节点 ID（根节点无法删除） |

**返回值**

```typescript
{
  success: boolean;
  deletedCount: number;   // 删除的节点数量
}
```

---

### node_move

移动节点到新的父节点下。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 要移动的节点 ID |
| `newParentId` | string | ✅ | 目标父节点 ID（必须是规划节点） |

**限制**
- 根节点无法移动
- 不能移动到自身的子节点下（防止循环）
- 目标父节点必须是规划节点

**返回值**

```typescript
{
  success: boolean;
  hint: string;
}
```

---

### node_reorder

重新排序节点的子节点顺序。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 父节点 ID（要重排其子节点） |
| `orderedChildIds` | string[] | ✅ | 按新顺序排列的所有子节点 ID 数组 |

**限制**
- 必须提供所有子节点的 ID，不能增减
- 用于调整子节点的显示顺序

**返回值**

```typescript
{
  success: boolean;
  hint: string;
}
```

---

## 上下文管理

### context_get

获取节点的聚焦上下文。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 节点 ID |
| `includeLog` | boolean | - | 是否包含日志（默认 `true`） |
| `includeProblem` | boolean | - | 是否包含问题（默认 `true`） |
| `maxLogEntries` | number | - | 最大日志条数（默认 20，Tail-First） |
| `reverseLog` | boolean | - | 是否倒序日志（默认 `false`） |

**返回值**

```typescript
{
  workspace: {
    goal: string;
    rules: string[];
    rulesHash: string;
    docs: DocRef[];
  };
  chain: ChainNode[];           // 祖先链（从根到当前节点）
  references: Reference[];      // 跨节点引用
  childConclusions: ChildConclusion[];  // 已完成子节点的结论
  hint: string;
}

interface ChainNode {
  nodeId: string;
  title: string;
  requirement: string;
  docs: DocRef[];
  note: string;
  logEntries: LogEntry[];
}

interface ChildConclusion {
  nodeId: string;
  title: string;
  status: string;
  conclusion: string;
}
```

---

### context_focus

设置当前聚焦节点。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 要聚焦的节点 ID |

**返回值**

```typescript
{
  success: boolean;
  focusedNodeId: string;
  hint: string;
}
```

---

### node_isolate

设置节点的隔离状态。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 节点 ID |
| `isolate` | boolean | ✅ | 是否隔离 |

**说明**
- `isolate=true`：切断上下文继承，不从父节点获取信息
- `isolate=false`：恢复上下文继承

**返回值**

```typescript
{
  success: boolean;
  isolated: boolean;
}
```

---

### node_reference

管理节点的文档/节点引用。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 节点 ID |
| `targetIdOrPath` | string | ✅ | 目标节点 ID 或文档路径 |
| `action` | string | ✅ | 操作：`add`、`remove` |
| `description` | string | - | 引用说明（`add` 时建议填写） |

**动作说明**

| 动作 | 说明 |
|------|------|
| `add` | 添加新引用 |
| `remove` | 删除引用 |

**返回值**

```typescript
{
  success: boolean;
  hint: string;
}
```

---

## 日志与问题

### log_append

追加日志记录。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | - | 节点 ID（为空则追加到全局日志） |
| `operator` | string | ✅ | 操作者：`AI` 或 `Human` |
| `event` | string | ✅ | 事件描述 |

**返回值**

```typescript
{
  success: boolean;
  timestamp: string;
  hint: string;
}
```

---

### problem_update

更新当前问题。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | - | 节点 ID（为空则更新全局问题） |
| `problem` | string | ✅ | 问题描述 |
| `nextStep` | string | - | 下一步计划 |

**返回值**

```typescript
{
  success: boolean;
  hint: string;
}
```

---

### problem_clear

清空当前问题。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | - | 节点 ID（为空则清空全局问题） |

**返回值**

```typescript
{
  success: boolean;
}
```

---

## 会话管理

### session_bind

绑定当前会话到工作区。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `sessionId` | string | ✅ | Claude Code 会话 ID |
| `workspaceId` | string | ✅ | 要绑定的工作区 ID |
| `nodeId` | string | - | 同时聚焦到某个节点 |

**返回值**

```typescript
{
  success: boolean;
  message: string;
  binding: {
    sessionId: string;
    workspaceId: string;
    boundAt: number;
  };
}
```

---

### session_unbind

解除当前会话与工作区的绑定。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `sessionId` | string | ✅ | Claude Code 会话 ID |

**返回值**

```typescript
{
  success: boolean;
  message: string;
}
```

---

### session_status

查询当前会话的绑定状态。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `sessionId` | string | ✅ | Claude Code 会话 ID |

**返回值**

```typescript
// 已绑定时
{
  bound: true;
  workspaceId: string;
  workspaceName: string;
  focusedNodeId: string | null;
  rules: string[];
}

// 未绑定时
{
  bound: false;
  availableWorkspaces: Array<{
    id: string;
    name: string;
    goal: string;
  }>;
}
```

---

### get_pending_changes

获取工作区的待处理手动变更记录。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `sessionId` | string | ✅ | Claude Code 会话 ID |
| `workspaceId` | string | - | 工作区 ID（不提供则使用会话绑定的工作区） |

**返回值**

```typescript
{
  hasChanges: boolean;
  reminder: string;  // 格式化的提醒文本（无变更时为空）
}
```

**说明**

- 供 Hook 脚本调用，检测 WebUI 手动编辑
- 此工具不会清除变更记录（由 `context_get`/`workspace_get` 负责清除）

---

## 派发（多 Agent 协作）

### dispatch_node

升级执行节点为派发母节点。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 要升级的节点 ID |

**前置条件**

- 工作区已启用派发模式
- 节点类型为 `execution`

**返回值**

```typescript
{
  upgraded: boolean;    // 是否升级成功
  skipReason?: string;  // 如果跳过，原因
  actionRequired?: {
    type: "invoke_skill";
    data: { skill: "dispatching-parent", workspaceId, nodeId };
  };
}
```

---

### dispatch_create

在派发母节点下创建派发子节点（exec + spec + quality）。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `parentId` | string | ✅ | 派发母节点 ID |
| `exec` | object | ✅ | 执行节点配置 { requirement, acceptanceCriteria } |
| `includeQuality` | boolean | - | 是否创建质量审查节点（默认 true） |

**返回值**

```typescript
{
  execId: string;
  specId: string;
  qualityId?: string;
  actionRequired: {
    type: "dispatch_task";
    data: { execPrompt, specPrompt, qualityPrompt };
  };
}
```

---

### dispatch_complete

处理派发任务的执行结果。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `nodeId` | string | ✅ | 节点 ID |
| `success` | boolean | ✅ | 执行是否成功 |
| `conclusion` | string | - | 执行结论/失败原因 |

**返回值**

```typescript
{
  endMarker: string | null;  // 执行后的标记
  nextAction: "dispatch_test" | "return_parent";
  testNodeId?: string;  // 配对的测试节点 ID
}
```

**说明**

- 成功时：Git 模式自动 commit，无 Git 模式记录时间戳
- 失败时：Git 模式自动回滚，无 Git 模式需手动恢复

---

### dispatch_enable

启用工作区的派发模式。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `useGit` | boolean | - | 是否使用 Git 模式（默认 false） |

**派发模式**

| 模式 | 说明 | 推荐度 |
|------|------|--------|
| 无 Git（默认） | 仅更新元数据，安全 | ✅ 推荐 |
| Git 模式 | 自动分支、提交、回滚 | ⚠️ 实验功能 |

**返回值**

```typescript
{
  success: boolean;
  mode: "git" | "no-git";
  processBranch?: string;  // Git 模式下的派发分支
}
```

---

### dispatch_disable

禁用派发模式第一步：查询状态并返回选项。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |

**返回值**

```typescript
{
  mode: "git" | "no-git";
  originalBranch?: string;
  commits?: Array<{ hash: string; message: string }>;
  actionRequired: {
    type: "ask_merge_strategy";
    options: string[];
  };
}
```

**⚠️ 重要**：返回的选项必须由用户决策，AI 禁止擅自选择！

---

### dispatch_disable_execute

禁用派发模式第二步：执行用户选择的合并策略。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `mergeStrategy` | string | ✅ | 合并策略 |
| `keepBackupBranch` | boolean | - | 保留备份分支（默认 false） |
| `keepProcessBranch` | boolean | - | 保留派发分支（默认 false） |
| `commitMessage` | string | - | squash 合并时的提交信息 |

**合并策略**

| 策略 | 说明 |
|------|------|
| `sequential` | 按顺序合并，保留独立提交 |
| `squash` | 压缩为一个提交 |
| `cherry-pick` | 遴选修改但不提交 |
| `skip` | 不合并，保留分支 |

---

### dispatch_cleanup

清理派发相关的 git 分支。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `cleanupType` | string | - | `backup`、`process`、`all`（默认） |

**说明**

- 仅 Git 模式下有效
- 无 Git 模式下为空操作（no-op）

---

## 配置管理

### config_get

获取全局配置。

**参数**

无参数。

**返回值**

```typescript
{
  version: string;
  defaultDispatchMode: "none" | "git" | "no-git";
}
```

---

### config_set

设置全局配置。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `defaultDispatchMode` | string | - | 默认派发模式 |

**可选值**

| 值 | 说明 |
|------|------|
| `none` | 不启用派发（默认） |
| `git` | Git 模式 |
| `no-git` | 无 Git 模式 |

**返回值**

```typescript
{
  success: boolean;
  config: { ... };  // 更新后的配置
}
```

---

## 帮助系统

### tanmi_help

获取使用指南。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `topic` | string | ✅ | 帮助主题 |

**可用主题**

| 主题 | 说明 |
|------|------|
| `overview` | 系统概述 |
| `workflow` | 核心工作流程、状态流转规则 |
| `tools` | 工具速查表 |
| `start` | 如何开始新任务 |
| `resume` | 如何继续之前的任务 |
| `session_restore` | 会话恢复（从摘要恢复时验证 ID） |
| `blocked` | 任务遇到问题时怎么办 |
| `split` | 何时以及如何分解任务 |
| `complete` | 如何完成任务 |
| `progress` | 如何查看和报告进度 |
| `guide` | 如何引导不熟悉的用户 |
| `docs` | 文档引用管理（派发、查找、生命周期） |
| `dispatch` | 派发模式（subagent 执行、自动验证、失败回滚） |
| `status` | 插件安装状态（查看各平台组件版本） |
| `server` | 服务器状态与自检（端口、CLI 命令、常见问题） |
| `all` | 获取完整指南 |

**返回值**

```typescript
{
  content: string;   // Markdown 格式的帮助内容
}
```

---

### tanmi_prompt

获取用户引导话术模板。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `template` | string | ✅ | 模板名称 |
| `params` | object | - | 模板参数 |

**可用模板**

| 模板 | 说明 | 参数 |
|------|------|------|
| `welcome` | 首次使用欢迎语 | - |
| `confirm_workspace` | 确认创建工作区 | `name`, `goal` |
| `confirm_plan` | 确认任务计划 | `tasks` |
| `status_report` | 状态报告 | `progress`, `current` |
| `completion_report` | 完成报告 | `summary` |

**返回值**

```typescript
{
  prompt: string;   // 格式化的话术文本
}
```

---

## 备忘系统

备忘（Memo）是独立于节点树的草稿区，用于记录灵感、讨论、调研结果等。

### memo_create

创建工作区备忘。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `title` | string | ✅ | 备忘标题 |
| `summary` | string | ✅ | 备忘摘要（用于列表显示） |
| `content` | string | ✅ | 完整内容（Markdown 格式） |
| `tags` | string[] | ✅ | 标签列表（至少 2 个，用于分类和过滤） |

**返回值**

```typescript
{
  memoId: string;
  hint: string;
}
```

**说明**

- 创建后可使用 `node_reference` 关联到节点
- 标签用于分类，方便后续检索

---

### memo_list

列出工作区的所有备忘。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `tags` | string[] | - | 标签过滤（返回包含任一指定标签的备忘） |

**返回值**

```typescript
{
  memos: Array<{
    id: string;
    title: string;
    summary: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
  }>;
  allTags: string[];  // 所有已使用的标签列表
}
```

---

### memo_get

获取备忘的完整内容。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `memoId` | string | ✅ | 备忘 ID |
| `lineOffset` | number | - | 起始行（从 1 开始，默认 1） |
| `lineLimit` | number | - | 返回行数（默认 500） |

**返回值**

```typescript
{
  memo: {
    id: string;
    title: string;
    summary: string;
    content: string;      // 可能被截取
    tags: string[];
    createdAt: string;
    updatedAt: string;
  };
  totalLines: number;       // 总行数
  contentTruncated?: boolean; // content 是否被截取
  contentHash: string;      // 内容 MD5 hash（用于 memo_update 先读后写校验）
  hint?: string;            // 继续读取提示（截取时返回）
}
```

---

### memo_update

更新备忘。支持两种模式：全量替换和精确替换。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `memoId` | string | ✅ | 备忘 ID |
| `contentHash` | string | ✅ | 内容哈希（从 memo_get 获取，用于先读后写校验） |
| `title` | string | - | 新标题 |
| `summary` | string | - | 新摘要（全量替换） |
| `content` | string | - | 新内容（全量替换） |
| `field` | string | - | 精确替换的目标字段：`content`、`summary` |
| `old_str` | string | - | 要替换的原文本（与 field 配合使用） |
| `new_str` | string | - | 替换后的文本（与 field 配合使用） |
| `tags` | string[] | - | 新标签列表（完全替换现有标签） |

**更新模式**

1. **全量替换**：直接提供 `content`/`summary` 字段值
2. **精确替换**：提供 `field` + `old_str` + `new_str` 进行字符串替换

**返回值**

```typescript
{
  success: boolean;
  updatedAt: string;
}
```

**说明**

- 只更新提供的字段，保留其他字段不变
- 必须先 `memo_get` 获取 `contentHash`，防止并发冲突

---

### memo_delete

删除备忘。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `memoId` | string | ✅ | 备忘 ID |

**返回值**

```typescript
{
  success: boolean;
}
```

**说明**

- 会同时删除备忘文件和索引
- 删除后无法恢复

---

## 能力包系统

能力包系统用于在工作区初始化后选择和配置特定能力。

### capability_list

获取指定场景的能力包列表。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `scenario` | string | - | 任务场景：`feature`、`debug`、`optimize`、`summary`、`misc` |
| `sessionId` | string | - | 会话 ID（用于自动从绑定的工作区获取 scenario） |

**返回值**

```typescript
{
  basePackages: Array<{
    id: string;
    name: string;
    description: string;
    selected: boolean;  // 默认选中
  }>;
  optionalPackages: Array<{
    id: string;
    name: string;
    description: string;
    selected: boolean;
  }>;
}
```

**说明**

- 如果已绑定工作区且未传入 `scenario`，会自动从工作区配置获取
- 返回基础包（默认选中）和选装包（用户可选）

---

### capability_select

确认选择的能力包，创建对应节点。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `selected` | string[] | ✅ | 选择的能力 ID 列表 |
| `infoType` | string | - | 信息节点类型：`info_collection` 或 `info_summary`（首次调用时必填） |
| `nodeId` | string | - | 现有 info 节点 ID（追加能力时使用） |

**返回值**

```typescript
{
  nodeId: string;      // 创建的 info 节点 ID
  childNodes: Array<{
    id: string;
    title: string;
    requirement: string;
  }>;
  hint: string;
}
```

**说明**

- 首次调用：创建 info 节点和子节点
- 追加调用：在指定节点下追加子节点

---

### plugin_path

获取 TanmiWorkspace 插件资源的绝对路径。支持参数化查询特定资源，错误时返回可用选项列表。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 资源类型：`skill` 或 `agent`。不传则返回插件根目录 |
| name | string | 否 | 资源名称（如 `flow-info`、`tanmi-executor`）。需配合 type 使用 |

**返回值**

```typescript
// 无参数时
{
  path: string;       // 插件根目录
  skillsPath: string; // skills 目录
  agentsPath: string; // agents 目录
}

// 只传 type 时
{
  path: string;       // 对应类型目录
  available: string[]; // 可用资源列表
}

// 传 type + name 且存在时
{
  path: string;       // 资源文件路径
}

// 传 type + name 但不存在时
{
  error: string;      // 错误信息
  available: string[]; // 可用资源列表
}
```

**示例**

```typescript
// 获取根目录
plugin_path()
// → { path: "/path/plugin", skillsPath: "/path/plugin/skills", agentsPath: "/path/plugin/agents" }

// 列出所有 skill
plugin_path(type: "skill")
// → { path: "/path/plugin/skills", available: ["flow-info", "flow-design", ...] }

// 获取具体 skill 路径
plugin_path(type: "skill", name: "flow-info")
// → { path: "/path/plugin/skills/flow-info/SKILL.md" }

// 资源不存在时
plugin_path(type: "skill", name: "not-exist")
// → { error: "skill 'not-exist' 不存在", available: ["flow-info", ...] }
```

**说明**

- 当需要读取插件资源（如 Skill、Agent 模板）但找不到时使用
- 错误时返回可用选项列表，便于 AI 自动纠正

---

## 搜索系统

### workspace_search

跨工作区搜索。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `query` | string | ✅ | 搜索关键词 |
| `limit` | number | - | 返回结果数量限制（默认 20） |

**返回值**

```typescript
{
  results: Array<{
    workspaceId: string;
    workspaceName: string;
    matches: Array<{
      type: "workspace" | "node" | "memo";
      id: string;
      title: string;
      snippet: string;  // 匹配片段
      score: number;    // 相关度分数
    }>;
  }>;
  totalMatches: number;
}
```

---

### content_search

工作区内内容搜索。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `workspaceId` | string | ✅ | 工作区 ID |
| `query` | string | ✅ | 搜索关键词 |
| `id` | string | - | 指定节点/备忘 ID（限制搜索范围） |
| `target` | string | - | 搜索目标：`all`、`node`、`memo`（默认 `all`） |
| `limit` | number | - | 返回结果数量限制（默认 20） |
| `context` | number | - | 上下文行数（默认 2） |

**返回值**

```typescript
{
  results: Array<{
    type: "node" | "memo";
    id: string;
    title: string;
    matches: Array<{
      field: string;      // 匹配的字段名
      lineNumber: number; // 行号
      content: string;    // 匹配行内容
      context: string[];  // 上下文行
    }>;
  }>;
  totalMatches: number;
}
```

---

## 返回值中的 hint 字段

大多数 API 返回值中包含 `hint` 字段，提供上下文相关的下一步建议：

```typescript
{
  // ... 其他字段
  hint: "💡 执行节点已创建。下一步：调用 node_transition(action=\"start\") 开始执行。"
}
```

**hint 的作用**：
- 引导 AI 进行正确的下一步操作
- 提醒重要的规则或约束
- 在异常情况下提供恢复建议

AI 应当阅读并参考 hint 内容决定后续操作。

---

## 错误处理

所有 API 在出错时返回错误对象：

```typescript
{
  error: {
    code: string;      // 错误码
    message: string;   // 错误描述
  }
}
```

**常见错误码**

| 错误码 | 说明 |
|--------|------|
| `NOT_FOUND` | 工作区或节点不存在 |
| `INVALID_TRANSITION` | 非法状态转换 |
| `RULES_HASH_MISMATCH` | 规则哈希不匹配 |
| `INVALID_PARENT` | 父节点不是规划节点 |
| `HAS_INCOMPLETE_CHILDREN` | 存在未完成的子节点 |
| `INFO_COLLECTION_REQUIRED` | 需要先完成信息收集 |
