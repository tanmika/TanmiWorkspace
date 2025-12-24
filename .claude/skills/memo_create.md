# MEMO 创建引导

本 skill 指导 AI 如何为 TanmiWorkspace 创建高质量的 MEMO（备忘）。

## 什么是 MEMO

MEMO 是工作区的草稿区，独立于节点树存储，用于：
- 临时记录散乱的想法和讨论
- 头脑风暴阶段的非结构化内容
- 未成型的技术方案草稿
- 跨节点共享的参考资料
- **info_summary 节点创建前的信息汇总**（特定场景）

**MEMO vs 节点 Note**：
- MEMO：独立存储，可被多个节点引用，适合草稿和临时内容
- Note：绑定节点，适合该节点的实施细节和补充说明

## 何时使用 MEMO

| 场景 | 是否使用 MEMO | 说明 |
|------|---------------|------|
| 头脑风暴阶段 | ✅ 使用 | 想法散乱，结构未定 |
| 技术方案草稿 | ✅ 使用 | 尚未确定，需要讨论 |
| info_summary 前总结 | ✅ 使用 | 先用 MEMO 汇总已有信息，再创建 info_summary 节点 |
| 跨节点参考资料 | ✅ 使用 | 多个节点需要引用 |
| 临时调研笔记 | ✅ 使用 | 调研结果待整理 |
| 节点实施细节 | ❌ 使用 note | 绑定特定节点 |

**注意**：大部分 MEMO 无需归档，可长期保留作为草稿/参考。只有在创建 info_summary 节点前明确需要总结已有信息时，才会用 MEMO 作为中间产物。

## 创建 MEMO 的步骤

### 1. 生成 title（标题）

**原则**：简要、清晰、可快速识别

**格式**：
- 使用中文
- 长度：5-20 字
- 避免冗长描述

**示例**：

| ❌ 不好的标题 | ✅ 好的标题 |
|--------------|------------|
| 关于 MEMO 机制实现的一些想法 | MEMO 机制初步思路 |
| 我们需要讨论一下能力包模型的设计 | 能力包模型草案 |
| 关于如何处理 node_reference 的 memo:// 协议 | memo:// 协议处理方案 |

### 2. 生成 summary（概述）

**原则**：一句话说清核心内容，≤50 字

**格式**：
- 完整句子，有主谓宾
- 直接陈述核心内容
- 不使用"本文档..."等自指表述

**示例**：

| ❌ 不好的 summary | ✅ 好的 summary |
|------------------|----------------|
| 本文档讨论了能力包模型 | 定义 Capability、BasePack、OptionalPack 三层能力包模型 |
| 关于 MEMO 的一些想法 | MEMO 独立于节点树存储，支持多节点引用和标签筛选 |
| 这里记录了调研结果 | Vite 7 需要 Node.js 20.19+，需更新构建文档 |

### 3. 整理 content（内容）

**原则**：保留讨论过程，使用 Markdown 结构化

**推荐结构**：

```markdown
## 背景/问题
[为什么需要这个 MEMO]

## 核心想法
[主要观点或方案]

## 讨论要点
- 要点 1
- 要点 2

## 待决策
- [ ] 决策项 1
- [ ] 决策项 2

## 参考
- 相关链接或文档
```

**注意事项**：
- 保留思考过程，不必过度提炼
- 使用标题、列表、表格等结构化元素
- 代码片段使用代码块
- 可以包含未解决的问题

### 4. 推荐 tags（标签）

**原则**：少而精，便于筛选

**标签类型**：

| 类型 | 示例 | 说明 |
|------|------|------|
| 阶段标签 | draft, wip, done | 草稿/进行中/已完成 |
| 主题标签 | design, research, bug | 设计/调研/缺陷 |
| 技术标签 | typescript, react, node | 相关技术栈 |
| 项目标签 | scenario-planning, memo | 所属功能模块 |

**数量建议**：
- 最少 1 个，最多 5 个
- 必须包含 1 个阶段标签（draft/wip/done）
- 优先使用已有标签（通过 workspace_status 查看）

**示例**：

| 内容 | 推荐 tags |
|------|-----------|
| MEMO 机制设计草案 | ["draft", "design", "memo"] |
| React 性能优化调研笔记 | ["wip", "research", "react"] |
| TypeScript 类型推导问题记录 | ["done", "bug", "typescript"] |

## 创建流程示例

```typescript
// 1. 创建 MEMO
await memoCreate({
  workspaceId: "ws-xxx",
  title: "能力包模型草案",
  summary: "定义 Capability、BasePack、OptionalPack 三层能力包模型",
  content: `## 背景
场景化规划需要差异化能力配置...

## 核心想法
- Capability: 可获取的标准化元素
- BasePack: 场景默认包含的能力
- OptionalPack: 可选添加的能力

## 待决策
- [ ] 能力粒度如何定义
- [ ] 是否支持自定义能力`,
  tags: ["draft", "design", "scenario-planning"]
});

// 2. 添加到节点引用（如果需要）
await nodeReference({
  workspaceId: "ws-xxx",
  nodeId: "node-xxx",
  reference: "memo://memo-xxx",
  action: "add"
});
```

## 常见错误

### ❌ 错误 1：title 过长

```
title: "关于 TanmiWorkspace 场景化规划系统中 MEMO 机制的设计思路和实现方案"
```

**修正**：
```
title: "MEMO 机制设计思路"
```

### ❌ 错误 2：summary 超过 50 字

```
summary: "本文档详细讨论了 MEMO 机制的设计思路，包括存储位置、引用协议、标签系统等多个方面的内容，并提出了具体的实现方案"
```

**修正**：
```
summary: "MEMO 独立于节点树存储，支持多节点引用和标签筛选"
```

### ❌ 错误 3：tags 过多或无阶段标签

```
tags: ["memo", "design", "typescript", "workspace", "planning", "node", "reference"]
```

**修正**：
```
tags: ["draft", "design", "memo"]
```

### ❌ 错误 4：content 过度提炼失去讨论价值

```markdown
## 方案
使用 memos/ 目录存储。
```

**修正**：
```markdown
## 背景
需要独立于节点树的草稿区。

## 方案对比
1. 存储在 node.note：耦合太强
2. 存储在 assets/：与其他资源混淆
3. 存储在 memos/：独立清晰 ✅

## 决策
使用 memos/ 目录，理由：独立性好，便于管理。
```

## 工具调用参考

```typescript
// 创建 MEMO
mcp-cli call tanmi-workspace-dev2/memo_create '{
  "workspaceId": "ws-xxx",
  "title": "简要标题",
  "summary": "≤50字的概述",
  "content": "完整的 Markdown 内容",
  "tags": ["draft", "design"]
}'

// 查看已有标签（避免重复）
mcp-cli call tanmi-workspace-dev2/workspace_status '{
  "workspaceId": "ws-xxx"
}'
```

## 总结

创建 MEMO 的核心要点：
1. **title**：5-20 字，简明扼要
2. **summary**：≤50 字，一句话说清核心
3. **content**：保留讨论过程，使用 Markdown 结构化
4. **tags**：1-5 个，必含阶段标签（draft/wip/done）

记住：MEMO 是草稿区，允许不完善，重在记录思考过程。大部分 MEMO 无需归档，可长期保留。
