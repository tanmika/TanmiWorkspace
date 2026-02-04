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

### 1. 数据存储：引用方式

**方案**：`.changes/` 存储变更内容，节点存储引用

```
.tanmiworkspace/{workspace}/
├── graph.json
├── changes/                    # 变更记录存储
│   ├── {changeId}.json         # 单个变更记录
│   └── index.json              # 索引（按节点、时间等）
└── ...
```

**悬空 patch 处理**：
- 节点删除时，对应的 changes **保留**（作为历史记录）
- 在 index.json 中标记为 `orphaned: true`
- 提供清理工具：`change_cleanup` 清理悬空记录

### 2. 节点关联：并发问题

**当前机制**：
- `session_bind` 绑定 workspace
- `context_focus` 设置聚焦节点（focusNodeId）

**派发并发问题**：
- 派发模式下可能有多个 subagent 并发执行
- 每个 subagent 有自己的 session_id
- 但共享同一个 workspace

**解决方案**：
```typescript
// 方案 A: 使用 session → node 映射
sessionNodeMapping: {
  "session-abc": "node-exec-1",
  "session-def": "node-exec-2"
}

// 方案 B: 在 node 元数据中记录执行会话
node.dispatch.executingSessionId = "session-abc"
```

**推荐方案 B**：派发子节点创建时记录执行会话 ID

### 3. 回滚机制

**流程**：
1. 自动尝试回滚（使用 originalFile 恢复）
2. 回滚失败时返回详细信息
3. AI 根据信息手动处理

**冲突检测**：
- 回滚前检查文件当前内容是否与 `afterContent` 匹配
- 不匹配说明文件已被后续修改，标记为冲突

### 4. Hook 集成方式

**现有架构**：
```
Claude Code → PostToolUse Hook
                    ↓
              hook-entry.cjs
                    ↓
              handleFileToolUse()
                    ↓
              直接读写 JSON 文件
```

**变更追踪集成**：
```javascript
// 在 handleFileToolUse() 中扩展
function handleFileToolUse(sessionId, binding, tool_name, tool_input, tool_response) {
  // ... 现有逻辑 ...

  // 新增：变更追踪
  if (binding?.changeTracking?.enabled) {
    recordChange(binding, sessionId, {
      tool: tool_name,
      filePath: tool_input.file_path,
      originalFile: tool_response.originalFile,
      structuredPatch: tool_response.structuredPatch,
      // ...
    });
  }
}
```

**优点**：
- 复用现有 Hook 架构
- 直接操作文件，无 MCP 调用开销
- 与现有逻辑无缝集成

## 下一步

### 待设计

1. **数据模型**
   - ChangeRecord 结构
   - Index 结构
   - 与节点的引用关系

2. **派发会话映射**
   - 如何在派发时建立 session → node 映射
   - 并发场景的边界情况

3. **回滚算法**
   - 冲突检测逻辑
   - 部分回滚策略
   - 失败反馈格式

4. **MCP 工具**
   - `change_list(nodeId)` - 查看节点变更
   - `change_revert(nodeId)` - 回滚节点变更
   - `change_diff(nodeA, nodeB)` - 对比变更

5. **配置**
   - `workspace.changeTracking.enabled` - 启用后不可关闭
   - 是否需要其他配置项？

### 客户端支持

| 客户端 | Hook 支持 | 状态 |
|--------|-----------|------|
| Claude Code | PostToolUse | ✅ 已验证 |
| Cursor | afterFileEdit | 待验证（有类似字段） |
| OpenCode | tool.execute.after / file.edited | 待验证 |

## 参考资料

- `assets/hook-system-reference.md` - Hook 系统参考文档
- `plugin/scripts/hook-entry.cjs` - 现有 Hook 实现
- `plugin/scripts/shared/` - Hook 共享工具函数
