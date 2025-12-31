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

| CapabilityId | Skill |
|--------------|-------|
| intent_alignment | aligning-intent |
| context_discovery | discovering-context |
| tech_research | researching-tech |
| diagnosis | diagnosing-issues |
| measurement_analysis | analyzing-measurements |
| solution_design | designing-solutions |
| verification_strategy | planning-verification |

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

## 相关文档

- 插件系统概览: `plugin/README.md`
- 引导内容配置: `src/prompts/guidanceContent.ts`
- API 参考: `assets/api-reference.md` actionRequired 章节
