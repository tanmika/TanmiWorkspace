# Change Tracking Hook 调研报告

> 调研日期：2026-02-04
> 分支：feature/change-tracking-hook

## 背景

当前 Git 模式存在以下问题：
1. 对于无 git 仓库、仓库不在工作区根目录、涉及多个 git 文件夹的项目不适用
2. 无法进行并行探索（多方向探索后快速了解线路间差异）
3. 完成归档后，假如分支删除，无法了解实际代码修改
4. 所有操作都是线性，无法特定回滚
5. 只有派发节点才会被记录，无法支持智能派发

## 目标

设计新的变更追踪系统，完全替代 Git 模式：

| 能力 | 状态 | 说明 |
|------|------|------|
| 变更追踪 | ✅ 必须 | 记录节点修改了什么文件 |
| 代码隔离 | 🔮 预留 | 为未来「方案对比」节点预留架构空间 |
| 失败回滚 | ❌ 不需要 | 只记录，不主动回滚 |
| 并行探索 | 🔮 预留 | 同上 |
| 历史保留 | ✅ 必须 | 归档后仍可查看变更 |
| 定点回滚 | ✅ 必须 | 可回滚特定节点的变更 |

**使用模式**：用户启用后，全节点追踪，不可中途关闭

## 方案选择

### 评估的方案

| 方案 | 说明 | 结论 |
|------|------|------|
| A. 节点边界快照 | 节点开始时记录快照，结束时 diff | 需要预声明 watchFiles |
| B. AI 主动报告 | AI 每次修改后调用 change_record() | 依赖 AI 遵守，可能漏记 |
| C. Hook 监视 | 通过 PostToolUse Hook 自动捕获 Edit/Write | ✅ **选定** |

### 选定方案：Hook 监视

通过 Claude Code 的 PostToolUse Hook 自动捕获 Edit/Write 操作。

**优点**：
- 透明追踪，AI 无感知
- 数据完整，无需预声明范围
- 通过 session_id 关联节点

**限制**：
- 不追踪 Bash 中的文件操作（可接受）
- 仅支持 Claude Code（Cursor/OpenCode 需要另外适配）

## 验证结果

### PostToolUse Hook 数据结构

**Edit 操作**：
```json
{
  "session_id": "4ea76939-7c22-4060-92e6-cf51b4b56ade",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file.txt",
    "old_string": "原内容",
    "new_string": "新内容",
    "replace_all": false
  },
  "tool_response": {
    "filePath": "/path/to/file.txt",
    "oldString": "原内容",
    "newString": "新内容",
    "originalFile": "完整的原始文件内容",  // 🔥 关键
    "structuredPatch": [                    // 🔥 关键
      {
        "oldStart": 1,
        "oldLines": 2,
        "newStart": 1,
        "newLines": 3,
        "lines": [" context", "-old", "+new"]
      }
    ]
  }
}
```

**Write 操作**：
```json
{
  "session_id": "...",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.txt",
    "content": "完整文件内容"
  },
  "tool_response": {
    "type": "create",
    "filePath": "/path/to/file.txt",
    "content": "完整文件内容",
    "originalFile": "原文件内容（新建时为 null）"
  }
}
```

### 关键字段验证

| 字段 | Edit | Write | 说明 |
|------|------|-------|------|
| `file_path` | ✅ | ✅ | 绝对路径 |
| `old_string` | ✅ | - | 被替换的内容 |
| `new_string` | ✅ | - | 替换后的内容 |
| `content` | - | ✅ | 完整新文件内容 |
| `originalFile` | ✅ | ✅/null | 原始完整文件内容 |
| `structuredPatch` | ✅ | - | 标准 diff 格式 |
| `session_id` | ✅ | ✅ | 用于关联节点 |

## 设计决策

### 1. 数据存储

**方案**：`.changes/` 存储变更内容，节点存储引用

```
.tanmiworkspace/{workspace}/
├── graph.json
├── changes/
│   ├── {changeId}.json         # 单个变更记录
│   ├── ambiguous/              # 待认领的变更（并发时产生）
│   └── index.json              # 索引
└── ...
```

### 2. 并发问题解决方案

**调研结论**：Subagent 与主会话共享同一个 session_id，无法通过 session 区分。

**选定方案：ambiguous + 认领机制**

```
1. Hook 收到文件变更
   ├─ 活跃节点 = 1 → 直接归属到该节点
   └─ 活跃节点 > 1 → 记录到 ambiguous（工作区级别）

2. 执行节点 node_transition(complete) 前
   └─ 拦截，检查 ambiguous 是否有 patch
   └─ 提示 AI 认领属于该节点的 patch
   └─ AI 调用 change_claim(nodeId, patchIds) 认领

3. 规划节点 node_transition(complete) 前
   └─ 检查 ambiguous 是否清空
   └─ 未清空则拒绝完成（强制门控）
```

**需要的 MCP 工具**：
- `change_claim(nodeId, patchIds)` - 认领 patch
- `change_transfer(patchId, fromNode, toNode)` - 转移归属（单节点归错时修正）

### 3. 节点删除处理

**方案：删除前询问是否回滚**

```
用户请求删除节点
    ↓
检查节点是否有 changes
    ↓
├─ 无 changes → 直接删除
└─ 有 changes → 询问"是否回滚代码修改？"
              ├─ 是 → 执行回滚 → 删除节点 + changes
              └─ 否 → 直接删除节点 + changes（代码保留）
```

**WebUI 也需要此流程**。

### 4. 回滚机制

**流程**：
1. 自动尝试回滚（基于内容匹配，非行号）
2. 回滚失败时返回 patch 文件路径
3. AI 读取 patch 文件，手动处理

**Patch 格式**：
- ❌ 不用标准 unified diff（需要严格线性操作，行号匹配）
- ✅ 使用基于内容匹配的格式（类似 apply-patch）
- 待讨论：是否支持无 AI 情况下的回滚

### 5. Hook 集成方式

**已验证**：Hook 可以直接读写文件，复用现有 hook-entry.cjs 架构。

```javascript
// 在 handleFileToolUse() 中扩展
function handleFileToolUse(sessionId, binding, tool_name, tool_input, tool_response) {
  // 新增：变更追踪
  if (workspaceConfig?.changeTracking?.enabled) {
    const activeNodes = getActiveExecutingNodes(workspaceId);
    if (activeNodes.length === 1) {
      recordChange(activeNodes[0], ...);
    } else if (activeNodes.length > 1) {
      recordAmbiguousChange(workspaceId, ...);
    }
  }
}
```

## 待解决问题

### 1. Patch 格式设计

- 不能用标准 unified diff（需要严格线性，行号匹配）
- 需要基于内容匹配的格式（类似 apply-patch）
- 需要支持：
  - 自动回滚（内容匹配成功时）
  - 手动回滚（生成 patch 文件给 AI/用户）
- **待讨论**：无 AI 情况下如何回滚？WebUI 能否直接操作？

### 2. 数据模型细化

- ChangeRecord 结构
- ambiguous 存储结构
- index.json 结构

### 3. MCP 工具设计

| 工具 | 说明 |
|------|------|
| `change_claim(nodeId, patchIds)` | 认领 ambiguous patch |
| `change_transfer(patchId, from, to)` | 转移归属 |
| `change_list(nodeId)` | 查看节点变更 |
| `change_revert(nodeId)` | 回滚节点变更 |

### 4. node_transition 拦截逻辑

- 执行节点 complete 前：检查 ambiguous，提示认领
- 规划节点 complete 前：检查 ambiguous 清空

### 5. WebUI 支持

- 删除节点时的回滚确认弹窗
- changes 可视化展示
- 能否支持无 AI 回滚？

## 客户端支持

| 客户端 | Hook 支持 | 状态 |
|--------|-----------|------|
| Claude Code | PostToolUse | ✅ 已验证 |
| Cursor | afterFileEdit | 待验证 |
| OpenCode | tool.execute.after / file.edited | 待验证 |

## 参考资料

- `assets/hook-system-reference.md` - Hook 系统参考文档
- `plugin/scripts/hook-entry.cjs` - 现有 Hook 实现
- `/Users/tanmika/ThirdPart/agent-toolkit/mcp-servers/apply-patch` - apply-patch 项目（patch 格式参考）
