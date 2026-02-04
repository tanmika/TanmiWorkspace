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

## 下一步

### 需要设计的内容

1. **存储格式**
   - `.changes/` 目录结构
   - 变更记录数据模型
   - 与节点的关联方式

2. **Hook 脚本**
   - 从测试脚本升级为正式实现
   - 调用 MCP 记录变更
   - 处理 session_id → node_id 映射

3. **MCP 工具**
   - `change_record` - 记录变更（Hook 调用）
   - `change_list` - 查看节点变更
   - `change_revert` - 回滚特定节点变更
   - `change_diff` - 对比两个节点的变更

4. **配置项**
   - `workspace.changeTracking.enabled` - 是否启用
   - 启用后不可关闭

5. **与现有系统集成**
   - 替代 dispatch 的 Git 模式
   - 工作区归档时保留变更历史

### 客户端支持

| 客户端 | Hook 支持 | 状态 |
|--------|-----------|------|
| Claude Code | PostToolUse | ✅ 已验证 |
| Cursor | afterFileEdit | 待验证 |
| OpenCode | tool.execute.after / file.edited | 待验证 |

## 参考资料

- `assets/hook-system-reference.md` - Hook 系统参考文档
- `assets/apply-patch/` - apply-patch 项目分析（部分设计可借鉴）
