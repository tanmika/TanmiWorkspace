# 工作台模板功能设计

## 一、目标场景

### 场景 1：重复性任务标准化
- 用户每次做类似任务（如 Bug 修复、功能开发）都要创建相似的节点结构
- 痛点：手动创建重复劳动，容易遗漏步骤

### 场景 4：从历史任务学习
- 用户完成一个任务后，想把成功的结构复用到其他项目
- 痛点：好的实践无法沉淀和复用

## 二、核心设计理念

### 2.1 模板是"有目的的提取"，不是"无脑快照"

- 同一个源工作区，根据用户需求的不同，可以生成完全不同的模板
- 例如完成了"登录流程重构"的工作区，可以生成：
  - 模板 A："流程修改"模板 - 侧重于修改现有流程
  - 模板 B："类似重构"模板 - 侧重于从头进行类似的重构工作
- 这两个模板的节点结构、需求描述、文档引用都可能完全不同

### 2.2 AI 负责智能适配

- 模板保存时：AI 根据用户需求进行剪枝、抽象
- 模板使用时：AI 根据当前任务进行适配、调整

### 2.3 保存模板是一个节点任务

完整流程：
```
用户提出保存模板
    ↓
AI 询问：这个模板用于什么场景？
    ↓
用户描述需求
    ↓
AI 基于需求分析源工作区，提出模板方案
    ↓
用户确认/调整
    ↓
保存模板
```

## 三、模板方案展示规范

AI 提出的模板方案应该用户友好，而非技术化展示：

**正确示例**：

> 我理解你想创建一个"流程重构参考"模板，方便以后做类似重构时使用。
>
> **我打算保留的部分**
> - 现状分析 → 改为"分析目标流程的现状和问题"
> - 方案设计及其子任务 → 保持结构，描述改为通用
> - 实施和验证步骤
>
> **我打算移除的部分**
> - "通知安全团队"这条规则（项目特定的）
> - 具体的业务结论和日志
> - 文档中的具体文件路径
>
> **文档引用会保留类型说明**
> - "流程图" → 留作占位，使用时补充具体路径
>
> 你觉得这样可以吗？需要调整哪些？

**要点**：
- 描述 AI 的理解和将要执行的行为
- 完整列出规则和文档引用的处理方式
- 等待用户确认或调整

## 四、模板数据结构

```typescript
interface Template {
  id: string;                           // 模板 ID，如 "tpl-xxx"
  name: string;                         // 模板名称
  description: string;                  // 用途描述
  scope: "global" | "project";          // 作用域
  sourceWorkspaceId?: string;           // 来源工作区（可选，用于溯源）

  rules: string[];                      // 规则列表
  docs: TemplateDocRef[];               // 文档引用模式
  nodeTree: TemplateNode[];             // 节点结构树

  createdAt: string;
  updatedAt: string;
}

interface TemplateDocRef {
  type: string;                         // 文档类型，如"流程图"、"测试清单"
  hint: string;                         // 提示说明
}

interface TemplateNode {
  id: string;                           // 节点 ID
  type: "planning" | "execution";       // 节点类型
  title: string;                        // 抽象化后的标题
  role?: NodeRole;                      // 节点角色
  requirementHint?: string;             // 需求描述提示
  children: TemplateNode[];             // 子节点
}
```

## 五、存储结构

### 5.1 作用域

- **全局模板**：`~/.tanmi-workspace[-dev]/templates/`
- **项目级模板**：`{projectRoot}/.tanmi-workspace[-dev]/templates/`
- 同名时项目级优先

### 5.2 文件结构

```
templates/
├── index.json              # 模板索引
└── {templateId}/
    └── template.json       # 模板完整数据
```

## 六、工具接口设计

### 6.1 创建模板

```typescript
template_init({
  name: string;                         // 模板名称
  description: string;                  // 用途描述
  scope: "global" | "project";          // 作用域
  sourceWorkspaceId?: string;           // 来源工作区
  rules?: string[];                     // 规则列表
  docs?: { type: string; hint: string }[];  // 文档引用
})
→ { templateId: string }
```

### 6.2 添加节点

```typescript
template_add_node({
  templateId: string;                   // 模板 ID
  parentId?: string;                    // 父节点 ID，空则添加到根
  type: "planning" | "execution";       // 节点类型
  title: string;                        // 节点标题
  role?: NodeRole;                      // 节点角色
  requirementHint?: string;             // 需求描述提示
})
→ { nodeId: string }
```

**说明**：
- 节点按添加顺序排列
- 模板随时可用，无需 finalize

### 6.3 查询模板

```typescript
// 列出可用模板
template_list({
  scope?: "global" | "project" | "all"; // 筛选作用域
})
→ { templates: TemplateSummary[] }

// 获取模板详情
template_get({
  templateId: string;
})
→ { template: Template }
```

### 6.4 管理模板（后续添加）

```typescript
// 修改模板
template_update({
  templateId: string;
  name?: string;
  description?: string;
  rules?: string[];
  docs?: { type: string; hint: string }[];
})

// 删除模板
template_delete({
  templateId: string;
})
```

## 七、使用示例

### 7.1 保存模板

```
// 1. 初始化模板
template_init({
  name: "流程重构",
  description: "用于对现有流程进行分析、重新设计和重构实施",
  scope: "global",
  sourceWorkspaceId: "ws-xxx",
  rules: [
    "修改前必须有完整测试覆盖",
    "重构分阶段进行，每阶段可回滚"
  ],
  docs: [
    { type: "流程现状图", hint: "记录现有流程的文档或图示" },
    { type: "流程设计图", hint: "新流程的设计文档" },
    { type: "测试清单", hint: "验证用的测试清单" }
  ]
})
→ { templateId: "tpl-001" }

// 2. 添加节点
template_add_node({
  templateId: "tpl-001",
  type: "execution",
  role: "info_collection",
  title: "信息收集",
  requirementHint: "收集目标流程相关的文档、现状说明和利益相关方需求"
})
→ { nodeId: "n1" }

template_add_node({
  templateId: "tpl-001",
  type: "execution",
  title: "现状分析",
  requirementHint: "分析现有流程的问题、瓶颈和改进点"
})
→ { nodeId: "n2" }

template_add_node({
  templateId: "tpl-001",
  type: "planning",
  title: "方案设计"
})
→ { nodeId: "n3" }

template_add_node({
  templateId: "tpl-001",
  parentId: "n3",
  type: "execution",
  title: "设计新流程",
  requirementHint: "基于分析结果设计新的流程方案"
})

template_add_node({
  templateId: "tpl-001",
  parentId: "n3",
  type: "execution",
  title: "评估影响",
  requirementHint: "评估改动对上下游的影响范围"
})

template_add_node({
  templateId: "tpl-001",
  type: "execution",
  title: "实施重构",
  requirementHint: "按计划执行重构，确保可回滚"
})

template_add_node({
  templateId: "tpl-001",
  type: "execution",
  title: "验证测试",
  requirementHint: "根据测试清单验证重构结果"
})
```

## 八、待讨论

- [ ] 使用模板创建工作区的流程
- [ ] `workspace_init` 扩展 `templateId` 参数 vs 独立工具
- [ ] AI 适配模板到具体任务的引导流程

## 九、版本

- v0.1 - 2025-12-17 - 初始设计
