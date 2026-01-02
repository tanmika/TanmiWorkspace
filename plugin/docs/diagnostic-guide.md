---
diagnosticToken: "使用时请调用 workspace_health(diagnosticToken: 'HEALTH_CHECK_2025')"
---

# TanmiWorkspace 诊断指南

本指南帮助诊断和解决 TanmiWorkspace 的常见问题。

## 一、常见问题与解决方案

### 1. version_mismatch (版本不匹配)

**症状**: 数据由更高版本的代码写入，当前版本无法修改

**原因**: 使用了旧版本的 tanmi-workspace 访问由新版本创建的数据

**解决方案**:
1. 升级 tanmi-workspace 到最新版本
2. 重启 MCP 服务
3. 如果必须使用旧版本，数据将处于只读模式

### 2. dir_missing (目录缺失)

**症状**: 工作区目录不存在，但索引中仍有记录

**原因**: 目录被手动删除或移动

**解决方案**:
- 如果不需要该工作区：`workspace_delete(workspaceId, force=true)`
- 如果需要恢复：从备份恢复（见紧急恢复流程）

### 3. config_corrupt (配置损坏)

**症状**: workspace.json 文件无法解析

**原因**: 文件被意外修改或损坏

**解决方案**:
1. 列出可用备份：`tanmi-workspace rebuild --list-ws-backups <workspaceId>`
2. 从备份恢复：`tanmi-workspace rebuild --restore-workspace <workspaceId> <backupName>`

### 4. graph_corrupt (图文件损坏)

**症状**: graph.json 文件无法解析

**原因**: 文件被意外修改或损坏

**解决方案**:
1. 检查备份列表
2. 从最近的备份恢复
3. 如果无备份，可能需要重建工作区

### 5. node_corrupt (节点损坏)

**症状**: 节点目录或 Info.md 文件缺失

**原因**: 节点文件被手动删除

**解决方案**:
- 删除损坏节点：`node_delete(workspaceId, nodeId)`
- 或从备份恢复整个工作区

## 二、紧急恢复流程

### 查看备份

```bash
# 列出工作区的所有备份
tanmi-workspace rebuild --list-ws-backups <workspaceId>
```

### 恢复备份

```bash
# 从指定备份恢复工作区
tanmi-workspace rebuild --restore-workspace <workspaceId> <backupName>
```

**注意**: 恢复前会自动创建当前状态的备份，以便回滚。

### 重建索引

如果索引文件损坏：

```bash
# 扫描项目目录重建索引
tanmi-workspace rebuild --scan ~/projects
```

## 三、预防措施

### 1. 定期备份

系统会在以下时机自动创建备份：
- 重要操作前（如归档、恢复）
- 手动触发备份

备份保留策略：最多保留 10 个备份，自动轮转删除最旧的。

### 2. 版本一致性

- 保持 tanmi-workspace 版本与数据版本一致
- 升级前建议手动备份重要工作区
- 不要在多台机器上使用不同版本访问同一数据

### 3. 避免手动修改

- **禁止**直接编辑 `.tanmi-workspace` 目录下的 JSON 文件
- **禁止**手动删除或移动工作区目录
- **允许**编辑 Markdown 文件（Info.md、Log.md 等）

### 4. 定期健康检查

建议定期运行健康检查：

```
workspace_health(diagnosticToken: 'HEALTH_CHECK_2025')
```

及时发现并处理潜在问题。

## 四、获取帮助

如果上述方案无法解决问题：

1. 检查错误日志
2. 在 GitHub Issues 报告问题
3. 提供工作区 ID 和错误信息
