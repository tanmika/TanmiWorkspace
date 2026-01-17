# Skill 系统

Skill 是指导 AI 执行特定任务的 SOP 文档，系统根据流程自动触发，用户无需手动调用。

## 触发机制

Skill 通过 `actionRequired.type = "invoke_skill"` 强制触发，AI 必须立即执行。

**触发点实现**:
- 工作区创建后: `src/services/WorkspaceService.ts:266-292`
- 派发升级后: `src/services/DispatchService.ts:722-758`

**触发协议定义**: `src/prompts/instructions.ts` CRITICAL_PROTOCOLS

## 分类

### 流程引导类（3 个）

在特定流程节点强制触发。

| Skill | 触发场景 |
|-------|----------|
| bootstrapping-workspace | workspace_init 后 |
| dispatching-parent | dispatch_node 后 |
| starting-info-flow | 现有工作区中用户请求新任务 |

**详细内容**: `plugin/skills/{skill-name}/SKILL.md`

### 能力执行类（7 个）

与 CapabilityId 一一对应，capability_select 创建能力节点时触发。

| CapabilityId | Skill | 说明 |
|--------------|-------|------|
| intent_alignment | aligning-intent | 意图对齐 |
| context_discovery | discovering-context | 上下文探索 |
| tech_research | researching-tech | 技术调研 |
| diagnosis | diagnosing-issues | 诊断分析 |
| measurement_analysis | analyzing-measurements | 度量分析 |
| solution_design | designing-solutions | 方案设计 |
| verification_strategy | planning-verification | 验证策略 |

**映射定义**: `src/services/CapabilityService.ts:19-27` CAPABILITY_TO_SKILL_DIR

**场景配置**: `config/scenarioCapabilities.json`

### 派发角色类（4 个）

派发执行流程中根据节点角色触发。

| Skill | 角色 |
|-------|------|
| preparing-dispatch | 准备派发节点 |
| executing-task | dispatch_exec |
| reviewing-spec | dispatch_spec |
| reviewing-quality | dispatch_quality |

**角色定义**: `src/types/node.ts` DispatchRole

### 工具辅助类（1 个）

辅助特定工具使用的 SOP 指导。

| Skill | 触发场景 |
|-------|----------|
| memo-create | 创建 MEMO 时指导格式和内容规范 |

## Skill 完整列表

共 15 个 Skills：

| 类别 | Skills |
|------|--------|
| 流程引导 | bootstrapping-workspace, dispatching-parent, starting-info-flow |
| 能力执行 | aligning-intent, discovering-context, researching-tech, diagnosing-issues, analyzing-measurements, designing-solutions, planning-verification |
| 派发角色 | preparing-dispatch, executing-task, reviewing-spec, reviewing-quality |
| 工具辅助 | memo-create |

## 文件结构

每个 Skill 位于 `plugin/skills/{skill-name}/SKILL.md`，结构：

```
---
name: skill-name
description: Use when [触发条件]. [能力说明]
---

# Skill Name
## Announcement (MANDATORY)
## Core Thinking
## SOP
## Checklist
## Mandatory Rules
```

**命名规范**: 动名词 + 连字符（如 aligning-intent）

## 关键约束

1. **Recording**: 对话输出对用户不可见，必须记录到工作区节点
2. **Progressive Recording**: 长任务必须中途 `log_append`，防止上下文丢失
3. **Present before proceed**: 完成后必须向用户展示结果，等待确认

**约束实现**: 每个 SKILL.md 的 Mandatory Rules 章节

## 加载机制

1. AI 调用 `Skill(skill: "skill-name")` 获取完整内容
2. 降级方案: `plugin_path()` → `Read(skillsPath + "/skill-name/SKILL.md")`

**加载实现**: `src/services/CapabilityService.ts` parseSkillFrontmatter()

## OpenCode 兼容性

> Skills 在 OpenCode 上**高度兼容**，是最易迁移的组件

### 兼容性评估

| 方面 | 兼容性 | 说明 |
|------|--------|------|
| 文件格式 | ✅ 100% | 相同的 SKILL.md 格式 |
| Frontmatter | ✅ 100% | YAML 格式通用 |
| 调用方式 | ✅ 100% | `skill` 工具加载 |
| 目录结构 | ⚠️ 需复制 | 位置不同 |

### 目录差异

| 平台 | Skills 目录 |
|------|-------------|
| TanmiWorkspace | `plugin/skills/` |
| OpenCode 项目级 | `.opencode/skill/` |
| OpenCode 全局 | `~/.config/opencode/skill/` |

### 迁移方式

直接复制 Skills 到 OpenCode 目录：
```bash
# 项目级迁移
cp -r plugin/skills/* .opencode/skill/

# 全局迁移
cp -r plugin/skills/* ~/.config/opencode/skill/
```

### 派发类 Skills 限制

以下 Skills 在 OpenCode 上功能受限：

| Skill | 限制原因 |
|-------|----------|
| dispatching-parent | 依赖 Task 工具并行派发 |
| executing-task | 需作为子代理被调用 |
| reviewing-spec | 需作为子代理被调用 |
| reviewing-quality | 需作为子代理被调用 |
| preparing-dispatch | 派发系统依赖 |

**替代方案**：用户手动切换 Agent 执行，而非自动派发。

### 完全兼容的 Skills

以下 Skills 可完整使用：

| 类别 | Skills |
|------|--------|
| 流程引导 | bootstrapping-workspace, starting-info-flow |
| 能力执行 | aligning-intent, discovering-context, researching-tech, diagnosing-issues, analyzing-measurements, designing-solutions, planning-verification |
| 工具辅助 | memo-create |

## 相关文档

- 插件系统概览: `plugin/README.md`
- 引导内容配置: `src/prompts/guidanceContent.ts`
- API 参考: `assets/api-reference.md` actionRequired 章节
- OpenCode 调研: 工作区 Memo `OpenCode 特性调研报告`
