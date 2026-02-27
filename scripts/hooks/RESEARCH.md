# Change Tracking Hook 调研报告

> 调研日期：2026-02-04
> 分支：feature/change-tracking-hook
> 状态：设计完成，待实现

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
    "originalFile": "完整的原始文件内容",
    "structuredPatch": [
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

### 1. 数据存储结构

```
.tanmiworkspace/{workspace}/
├── nodes/
│   └── {nodeId}/
│       ├── node.json
│       └── changes/                    # 该节点的变更
│           ├── chg-001.json
│           └── chg-002.json
│
├── ambiguous-changes/                  # 待认领的变更（工作区级别）
│   └── chg-aaa.json
│
├── changes-index.json                  # 全局索引
├── graph.json
└── ...
```

### 2. 数据模型

#### ChangeRecord（单次文件操作）

```typescript
interface ChangeRecord {
  id: string;              // "chg-{timestamp}-{random}"
  nodeId: string | null;   // 归属节点，null 表示在 ambiguous
  timestamp: string;       // ISO 时间
  sessionId: string;       // 来源会话

  operation: {
    type: "edit" | "write";
    filePath: string;
    originalFile: string | null;  // 原始内容，新建时为 null

    // Edit 特有
    oldString?: string;
    newString?: string;
    structuredPatch?: any[];

    // Write 特有
    content?: string;
    writeType?: "create" | "overwrite";
  };
}
```

#### changes-index.json（全局索引）

```json
{
  "version": 1,
  "ambiguous": ["chg-aaa", "chg-bbb"],
  "fileIndex": {
    "/path/to/file.ts": [
      { "nodeId": "node-xxx", "changeId": "chg-001" },
      { "nodeId": "node-yyy", "changeId": "chg-003" }
    ]
  },
  "sequence": [
    { "nodeId": "node-xxx", "changeId": "chg-001" },
    { "nodeId": "node-xxx", "changeId": "chg-002" },
    { "nodeId": null, "changeId": "chg-aaa" }
  ]
}
```

**索引用途**：
- `ambiguous`：拦截时检查待认领
- `fileIndex`：查询某文件修改历史
- `sequence`：上下文展示最近修改

### 3. 并发问题解决方案

**调研结论**：Subagent 与主会话共享同一个 session_id，无法通过 session 区分。

**选定方案：ambiguous + 认领机制**

```
1. Hook 收到文件变更
   ├─ 活跃节点 = 1 → 直接归属到该节点
   └─ 活跃节点 > 1 → 记录到 ambiguous-changes/

2. 执行节点 node_transition(complete) 前
   └─ 检查 ambiguous 是否有 patch
   └─ 有则拦截，提示 AI 认领
   └─ AI 调用 change_claim(nodeId, changeIds) 认领

3. 规划节点 node_transition(complete) 前
   └─ 检查 ambiguous 是否清空
   └─ 未清空则拒绝完成（强制门控）
```

### 4. node_transition 拦截逻辑

**执行节点完成时**：
```
node_transition(nodeId, status: "completed")
    │
    ├─ ambiguous 为空？ → 正常完成
    │
    └─ ambiguous 非空？
        ├─ 节点未标记 "changeWarned"
        │   └─ 标记 changeWarned: true
        │   └─ 返回拦截："请认领变更..."（阻止完成）
        │
        └─ 节点已标记 "changeWarned"
            └─ 放行
            └─ 删除 changeWarned 标记（重置，下次再有会再次提醒）
```

**规划节点完成时**：
```
node_transition(nodeId, status: "completed")
    │
    ├─ ambiguous 为空？ → 正常完成
    │
    └─ ambiguous 非空？ → 始终阻止
        └─ "存在未认领变更，必须先处理"
```

**节点字段扩展**：
```json
{
  "id": "node-xxx",
  "changeWarned": true,  // 新增：已提醒过认领
  ...
}
```

### 5. 节点删除处理

```
用户请求删除节点
    │
    └─ 检查节点是否有 changes
        ├─ 无 changes → 直接删除
        │
        └─ 有 changes → 弹窗确认
            ├─ "回滚代码" → 执行回滚 → 删除节点 + changes
            └─ "仅删除节点" → 提示"patch 将被删除，代码修改保留"
                            → 删除节点 + changes
```

**WebUI 也需要此流程**。

### 6. 回滚机制

#### 回滚策略

**非原子性**：能成功的成功，失败的返回。

```
回滚节点 A 的 3 个操作：
  ├─ 操作 1：文件 X 的 Edit  → 匹配成功 → ✅ 已回滚
  ├─ 操作 2：文件 Y 的 Edit  → 匹配失败 → ❌ 返回 patch 路径
  └─ 操作 3：文件 Z 的 Write → 恢复原始 → ✅ 已回滚

返回：{
  success: false,
  results: [
    { changeId: "chg-001", success: true },
    { changeId: "chg-002", success: false, patchFile: "...", reason: "content not found" }
  ]
}
```

#### 各操作类型的回滚方式

| 操作类型 | 回滚方式 | 说明 |
|----------|----------|------|
| Edit | 内容匹配 + 替换 | 用 seek_sequence 找 newString，替换为 oldString |
| Write（新建）| 删除文件 | originalFile == null |
| Write（覆盖）| 恢复原始 | 写回 originalFile |

#### 内容匹配算法

参考 apply-patch 的 seek_sequence，支持 4 级模糊匹配：
1. **exact** - 完全匹配
2. **punctuation** - Unicode 标点标准化（智能引号→直引号）
3. **whitespace** - 尾部空白忽略
4. **aggressive** - 所有空白折叠

#### WebUI 回滚支持

| 操作类型 | WebUI 能回滚吗 | 说明 |
|----------|---------------|------|
| Write（新建）| ✅ | 直接删除 |
| Write（覆盖）| ✅ | 恢复 originalFile |
| Edit（匹配成功）| ✅ | seek_sequence 找到后替换 |
| Edit（匹配失败）| ❌ | 提示"需要 AI 协助处理" |

### 7. MCP 工具设计

| 工具 | 参数 | 说明 |
|------|------|------|
| `change_claim` | `nodeId: string, changeIds: string[]` | 认领 ambiguous 变更到指定节点 |
| `change_transfer` | `changeId: string, toNodeId: string` | 转移变更归属（修正错误认领）|
| `change_list` | `nodeId?: string` | 不传查 ambiguous，传则查该节点 |
| `change_revert` | `changeIds: string[]` | 回滚指定变更（支持数组）|

**change_revert 返回结构**：
```json
{
  "success": false,
  "results": [
    { "changeId": "chg-001", "success": true },
    { "changeId": "chg-002", "success": false, "patchFile": "/.../chg-002.json", "reason": "content not found" }
  ]
}
```

### 8. Hook 集成方式

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

## 待实现

1. **Hook 变更捕获**
   - 在 hook-entry.cjs 中添加变更追踪逻辑
   - 根据活跃节点数决定归属或 ambiguous

2. **MCP 工具实现**
   - change_claim
   - change_transfer
   - change_list
   - change_revert

3. **node_transition 拦截**
   - 执行节点：检查 + 单次警告
   - 规划节点：强制门控

4. **回滚算法**
   - 移植 apply-patch 的 seek_sequence
   - 实现 4 级模糊匹配

5. **WebUI 支持**
   - 删除节点时的回滚确认弹窗
   - changes 可视化展示
   - 尝试自动回滚，失败时提示需要 AI

## 客户端支持

### 测试结果（2026-02-05 实测验证）

| 客户端 | Hook | Edit | Write | session 标识 |
|--------|------|------|-------|-------------|
| **Claude Code** | PostToolUse | ✅ 完整 | ✅ 完整 | session_id |
| **Cursor** | afterFileEdit | ✅ old/new_string | ❌ 无 Hook | conversation_id |
| **OpenCode** | tool.execute.after | ✅ before/after | ⚠️ 无 content | sessionID |
| **Codex CLI** | ❌ 无 Hook 系统 | - | - | - |

### Cursor 实测数据

```json
{
  "file_path": "/tmp/cursor-test.txt",
  "edits": [{ "old_string": "Hello World", "new_string": "Hello Cursor" }],
  "conversation_id": "59b16db3-...",
  "hook_event_name": "afterFileEdit"
}
```

**特点**：
- ✅ file_path、old_string、new_string
- ✅ conversation_id 可作为 session 标识
- ❌ 无 originalFile
- ❌ 无 afterFileWrite Hook（Write 操作无法捕获）

### OpenCode 实测数据

**Edit 操作**（`tool.execute.after`）：
```json
{
  "input": { "tool": "edit", "sessionID": "ses_xxx", "callID": "edit:1" },
  "output": {
    "metadata": {
      "filediff": {
        "file": "/tmp/opencode-test.txt",
        "before": "Hello World",
        "after": "Hello OpenCode"
      }
    }
  }
}
```

**Write 操作**（`tool.execute.after`）：
```json
{
  "input": { "tool": "write", "sessionID": "ses_xxx", "callID": "write:0" },
  "output": {
    "metadata": {
      "filepath": "/tmp/opencode-test.txt",
      "exists": false
    }
    // ❌ 没有 content！
  }
}
```

**特点**：
- ✅ Edit: 通过 `output.metadata.filediff` 获取 before/after
- ⚠️ Write: 只有 filepath，**没有写入的 content**
- ✅ sessionID 可用

### Write 操作支持方案

由于 Cursor/OpenCode 的 Write 操作无法直接获取内容，需要额外处理：

#### 方案 A：Hook 中主动读取文件

```
Write 完成后 (tool.execute.after)
    │
    └─ Hook 读取文件内容
        └─ 记录 { filePath, content: fs.readFile(filePath) }
```

**问题**：无法获取 originalFile（已被覆盖）

#### 方案 B：before + after 配合

```
tool.execute.before (Write)
    └─ 检查文件是否存在
    └─ 存在则读取 originalFile 并缓存 (key: callID)

tool.execute.after (Write)
    └─ 读取新文件内容
    └─ 取出缓存的 originalFile
    └─ 组合记录
```

**优点**：可以获取 originalFile
**缺点**：需要维护 callID → originalFile 的缓存

#### 方案 C：降级处理

```
Cursor/OpenCode 的 Write 操作：
    └─ 只记录 filePath
    └─ 不记录 content 和 originalFile
    └─ 回滚时提示"需要 AI 协助"
```

**优点**：简单
**缺点**：Write 操作无法自动回滚

#### 建议

- **Claude Code**：完整支持（已有所有数据）
- **Cursor**：方案 C（降级，Write 无法追踪）
- **OpenCode**：方案 B（before+after 配合获取完整数据）

### Codex CLI（调研结论，2026-02-27）

Codex CLI **没有 Hook 系统**，无法实现变更追踪的核心能力。

**Hook 现状**：
- 只有 `notify` 配置，在任务完成/需要用户响应时执行一条 shell 命令
- 无法拦截工具调用（无 PreToolUse/PostToolUse 等价物）
- Hook 系统是社区长期需求（[Discussion #2150](https://github.com/openai/codex/discussions/2150)），官方暂无时间表

**可集成的能力**：

| 能力 | 状态 | 说明 |
|------|------|------|
| MCP 工具 | ✅ 可用 | 同时支持 stdio 和 Streamable HTTP，可直接对接现有 MCP 服务 |
| Skills | ✅ 原生支持 | `SKILL.md` + front matter 格式与 TanmiWorkspace 高度兼容，存放于 `.agents/skills/` |
| 多代理 | ⚠️ 实验性 | 内置多代理调度（`spawn_agents_on_csv`），机制与 dispatch 系统不同，不可复用 |
| 变更追踪 | ❌ 不支持 | 无 Hook，无法自动捕获 Edit/Write |
| 权限门控 | ❌ 不支持 | 无 PreToolUse，无法阻止未绑定时的写操作 |
| 自动 session 绑定 | ❌ 不支持 | 无 SessionStart，需用户手动调用 `session_bind` |

**MCP 配置示例**：
```toml
# ~/.codex/config.toml
[[mcp.servers]]
name = "tanmi-workspace"
url = "http://localhost:3000/mcp"   # Streamable HTTP，直接对接现有服务
```

**Skills 格式**（与 TanmiWorkspace 一致）：
```
.agents/skills/
└── aligning-intent/
    └── SKILL.md   # name + description front matter 相同格式
```

### 支持策略总结

| 客户端 | Edit 追踪 | Write 追踪 | 回滚能力 |
|--------|----------|-----------|---------|
| Claude Code | ✅ 完整 | ✅ 完整 | ✅ 完整 |
| Cursor | ✅ 完整 | ❌ 无法追踪 | ⚠️ 仅 Edit |
| OpenCode | ✅ 完整 | ⚠️ 需 before+after | ⚠️ Write 需额外处理 |
| Codex CLI | ❌ 无 Hook | ❌ 无 Hook | ❌ 不支持 |

### 长文本真实测试验证（2026-02-05）

使用 50 行测试文件验证各平台 Hook 数据格式：

**Claude Code**:
```json
{
  "tool_input": {
    "file_path": "/tmp/test-claudecode.ts",
    "old_string": "    return 'Hello, stranger!';",
    "new_string": "    return 'Hi there, unknown user!';"
  },
  "tool_response": {
    "originalFile_exists": true,
    "originalFile_length": 859,  // 完整文件！
    "structuredPatch": [...]
  }
}
```

**Cursor**（无 originalFile，需 Hook 读取当前文件）:
```json
{
  "parsed_input": {
    "file_path": "/tmp/test-opencode.ts",
    "edits": [{ "old_string": "...", "new_string": "..." }]
  },
  "current_file": {  // Hook 主动读取
    "content": "...(完整文件)...",
    "length": 866,
    "lines": 50
  },
  "analysis": {
    "has_original_file": false,
    "new_string_found_in_file": true  // 可用 new_string 定位
  }
}
```

**OpenCode**（有 before/after 完整文件）:
```json
{
  "filediff": {
    "file": "/tmp/change-tracking-test.ts",
    "before": "...(完整修改前文件)...",
    "after": "...(完整修改后文件)...",
    "before_length": 866,
    "after_length": 880,
    "before_lines": 50,
    "after_lines": 50
  }
}
```

**验证结论**：三个平台都能提供足够的数据生成带上下文的 ChangeRecord

## 鲁棒性审查（2026-02-10）

对 Change Tracking 实现进行了全面的边界场景分析，识别了 15 个场景。

### 需要修复的问题

| # | 问题 | 严重度 | 方案 | 状态 |
|---|------|--------|------|------|
| 1 | 所有节点 completed 后修改 → ambiguous 无消解路径 | Important | PreToolUse 门控：activeNodes=0 时阻止 Edit/Write | DONE |
| 8 | Root/Planning 节点直接工作 → 同上 | Important | 同上（同一方案解决） | DONE |
| 11 | Write 覆盖文件不保存 originalFile → 无法回滚 | Critical | 使用 toolResponse.originalFile（Claude Code 覆盖时提供） | DONE |
| 11b | isNewFile 字段判断 bug | Important | classifyWriteOperation() 统一处理 type/isNewFile/originalFile | DONE |

### PreToolUse 门控方案（#1 + #8）

```
PreToolUse 拦截 Edit/Write/MultiEdit:
  ├─ 未绑定工作区 → 放行
  └─ 已绑定工作区
      ├─ getActiveExecutingNodes() > 0 → 放行（保持原有 ambiguous 归属逻辑）
      └─ getActiveExecutingNodes() = 0 → deny
          └─ 提示用户 reopen 节点 / 创建新执行节点 / session_unbind
```

PostToolUse 归属逻辑完全不变，ambiguous + claim 机制保留（dispatch 并发场景的核心流程）。

**三平台实现状态**：
| 平台 | 门控事件 | 拦截格式 | 状态 |
|------|---------|---------|------|
| Claude Code | PreToolUse (matcher: Edit\|Write) | `{decision:'deny'}` | ✅ 已实现 |
| Cursor | preToolUse (2026-02 新增事件) | `{permission:'deny'}` (**非** decision) | ✅ 已实现（实测 2026-02-11 确认） |
| OpenCode | tool.execute.before | throw Error | ✅ 已实现 |

> **实测发现（2026-02-11）**：
> - Cursor preToolUse 的 `{decision:'deny'}` 无效，必须用 `{permission:'deny'}` 格式
> - Cursor afterFileEdit 对 Write 操作也会触发（old_string=原内容, new_string=新内容）
> - Cursor preToolUse.tool_input 包含 Write 的完整 content，可用于预缓存
> - Cursor 内建工具名：Read/Write/Edit/Shell（首字母大写，Shell 非 Bash）

### Write originalFile 方案（#11）

| 平台 | 方案 | 状态 |
|------|------|------|
| Claude Code | 方案 A: 使用 tool_response.originalFile（classifyWriteOperation 提取） | 已实现 |
| Claude Code | 方案 B: PreToolUse 预读文件 → 临时文件缓存 → PostToolUse 取用 | 备选（未使用） |
| OpenCode | tool.execute.before 内存 Map 缓存 originalFile | 推荐 |
| Cursor | postToolUse.tool_output 可能提供 Write 数据（2026-02 新增事件，待实测） | 待验证 |

### 审查确认保持现状的项目

| # | 场景 | 结论 | 原因 |
|---|------|------|------|
| 2 | Session unbind 后编辑 | OK | 设计如此，unbind 即退出追踪 |
| 3 | 节点 reopen | OK | reopen → implementing，正确追踪 |
| 4 | Info/Design 阶段编辑 | OK | PreToolUse 阶段约束已阻止 |
| 5 | 多工作区绑定 | OK | 1:1 设计 |
| 6 | Dispatch subagent | OK | subagent 共享 session_id（Claude Code Task），变更追踪通过同一 binding 触发；ambiguous + claim 是正常流程 |
| 7 | 无全局开关 | Minor | 不安装 Hook 即不追踪，MCP 工具空结果不影响功能 |
| 9 | Validating → rework | Minor | 变更有 timestamp 可区分，无需记录阶段信息 |
| 10 | Hook 崩溃 / 非原子写入 | 接受风险 | 崩溃场景无法保证原子性，代价不值得 |
| 12 | Cursor 多 edits 只取 [0] | OK | Agent 模式每次只产生一个 edit，数组格式为 Tab 补全预留 |
| 13 | 跨子树并发 → 全 ambiguous | OK | dispatch 并发的正常行为，通过 claim 解决 |
| 14 | fileIndex nodeId "" vs null | Minor | 类型不一致但不影响功能，claim/transfer 正确处理 |
| 15 | changeWarned 可跳过 | OK | 设计意图：警告一次允许跳过，规划节点不可跳过 |

## 参考资料

- `assets/hook-system-reference.md` - Hook 系统参考文档
- `plugin/scripts/hook-entry.cjs` - 现有 Hook 实现
- `/Users/tanmika/ThirdPart/agent-toolkit/mcp-servers/apply-patch` - apply-patch 项目
  - `patch_applier.py` - 核心匹配算法 seek_sequence
  - 4 级模糊匹配：exact → punctuation → whitespace → aggressive
