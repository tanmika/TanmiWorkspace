# 检索增强设计方案

## 1. 问题与目标

**问题**：AI 在 `info_collection` 阶段检索不够具体、计划不够结构化

**目标**：
1. 强制 AI 提交结构化检索计划
2. 引导 AI 使用 Task(Explore) 外包深度检索
3. 在 complete 时验证结论完整性

---

## 2. 整体流程

```
node_create(role="info_collection")
     ↓
node_transition(start)
     ↓ 返回 actionRequired: "submit_retrieval_plan"
     ↓
retrieval_plan_submit(plan)       ← 新增工具
     ↓ 返回 actionRequired: "execute_retrieval"
     ↓ + 推荐调用 Task(Explore)
     ↓
AI 调用 Task(Explore) 或自行检索
     ↓
node_transition(complete, conclusion)
     ↓ 验证 conclusion 完整性
     ↓
归档规则/文档
```

---

## 3. 修改清单

### 3.1 类型定义

**文件**: `src/types/workspace.ts`

```typescript
// 新增 ActionRequiredType
export type ActionRequiredType =
  | "ask_user"
  | "show_plan"
  | "check_docs"
  | "review_structure"
  | "ask_dispatch"
  | "dispatch_task"
  | "dispatch_complete_choice"
  | "submit_retrieval_plan"      // 新增
  | "execute_retrieval"          // 新增
  | "complete_with_checklist";   // 新增
```

**文件**: `src/types/retrieval.ts` (新建)

```typescript
export interface RetrievalPlan {
  questions: string[];        // 需要回答的问题（至少3个）
  filePatterns?: string[];    // 搜索的文件模式
  keywords?: string[];        // 搜索的关键词
  docCandidates?: string[];   // 候选文档路径
}

export interface RetrievalPlanResult {
  success: boolean;
  error?: string;
  hint?: string;
  actionRequired?: ActionRequired;
}
```

---

### 3.2 新增工具

**文件**: `src/tools/retrieval.ts` (新建)

```typescript
import { z } from "zod";

export const retrievalPlanSubmitSchema = z.object({
  workspaceId: z.string(),
  nodeId: z.string(),
  plan: z.object({
    questions: z.array(z.string()).min(3, "至少需要3个问题"),
    filePatterns: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    docCandidates: z.array(z.string()).optional(),
  }),
});

export const retrievalTools = [
  {
    name: "retrieval_plan_submit",
    description: `提交检索计划。在 info_collection 节点 start 后必须调用。

检索计划必须包含：
- questions: 需要回答的问题列表（至少3个）

可选包含：
- filePatterns: 需要搜索的文件模式
- keywords: 需要搜索的关键词
- docCandidates: 候选文档路径`,
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        nodeId: { type: "string" },
        plan: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
            },
            filePatterns: { type: "array", items: { type: "string" } },
            keywords: { type: "array", items: { type: "string" } },
            docCandidates: { type: "array", items: { type: "string" } },
          },
          required: ["questions"],
        },
      },
      required: ["workspaceId", "nodeId", "plan"],
    },
  },
];
```

---

### 3.3 新增服务

**文件**: `src/services/RetrievalService.ts` (新建)

```typescript
import { RetrievalPlan, RetrievalPlanResult } from "../types/retrieval";
import { ActionRequired } from "../types/workspace";

export class RetrievalService {
  constructor(
    private md: MarkdownService,
    private json: JsonService
  ) {}

  async submitPlan(
    projectRoot: string,
    workspaceId: string,
    nodeId: string,
    plan: RetrievalPlan
  ): Promise<RetrievalPlanResult> {
    // 1. 存储计划到节点 note 或单独字段
    await this.storePlan(projectRoot, workspaceId, nodeId, plan);

    // 2. 构建 Explore prompt
    const explorePrompt = this.buildExplorePrompt(plan);

    // 3. 返回 execute_retrieval
    return {
      success: true,
      hint: "💡 检索计划已保存。建议使用 Task(Explore) 进行深度检索。",
      actionRequired: {
        type: "execute_retrieval",
        message: "请执行检索。推荐使用 Task 工具调用 Explore Agent。",
        data: {
          recommendedAction: {
            tool: "Task",
            subagent_type: "Explore",
            prompt: explorePrompt,
          },
          checklist: this.generateChecklist(plan),
        },
      },
    };
  }

  private buildExplorePrompt(plan: RetrievalPlan): string {
    const parts = [
      "请对项目进行深度检索，回答以下问题：",
      "",
      "## 问题清单",
      ...plan.questions.map((q, i) => `${i + 1}. ${q}`),
    ];

    if (plan.filePatterns?.length) {
      parts.push("", "## 搜索范围", `文件模式: ${plan.filePatterns.join(", ")}`);
    }
    if (plan.keywords?.length) {
      parts.push(`关键词: ${plan.keywords.join(", ")}`);
    }
    if (plan.docCandidates?.length) {
      parts.push(`候选文档: ${plan.docCandidates.join(", ")}`);
    }

    parts.push(
      "",
      "## 输出要求",
      "1. 每个问题的答案",
      "2. 发现的规则/约定（列表形式）",
      "3. 相关文档路径及描述"
    );

    return parts.join("\n");
  }

  private generateChecklist(plan: RetrievalPlan): string[] {
    return [
      "## 规则 部分（列出发现的规则）",
      "## 文档 部分（列出相关文档路径和描述）",
      ...plan.questions.map((q) => `回答: ${q}`),
    ];
  }

  private async storePlan(
    projectRoot: string,
    workspaceId: string,
    nodeId: string,
    plan: RetrievalPlan
  ): Promise<void> {
    // 存储到节点的 metadata 或 note 中
    // 实现细节根据现有数据结构调整
  }

  async getStoredPlan(
    projectRoot: string,
    workspaceId: string,
    nodeId: string
  ): Promise<RetrievalPlan | null> {
    // 读取之前存储的计划
    return null;
  }

  validateConclusion(
    conclusion: string,
    plan: RetrievalPlan | null
  ): { passed: boolean; missingItems: string[] } {
    const missingItems: string[] = [];

    // 检查必要部分
    if (!conclusion.match(/##\s*规则/i)) {
      missingItems.push("缺少「## 规则」部分");
    }
    if (!conclusion.match(/##\s*文档/i)) {
      missingItems.push("缺少「## 文档」部分");
    }

    // 检查问题回答率（如果有计划）
    if (plan && plan.questions.length > 0) {
      const threshold = Math.ceil(plan.questions.length * 0.6);
      missingItems.push(`请确保回答了至少 ${threshold} 个计划中的问题`);
    }

    return { passed: missingItems.length === 0, missingItems };
  }
}
```

---

### 3.4 修改 StateService

**文件**: `src/services/StateService.ts`

**修改点 1**: `handleStart()` - info_collection 启动时返回 actionRequired

```typescript
// 在 handleStart 方法中，info_collection 节点启动时
if (nodeMeta.role === "info_collection") {
  return {
    success: true,
    previousStatus: "pending",
    currentStatus: "planning",
    conclusion: null,
    hint: "💡 信息收集节点已启动。请先提交检索计划。",
    actionRequired: {
      type: "submit_retrieval_plan",
      message: "请调用 retrieval_plan_submit 提交检索计划",
      data: {
        template: {
          questions: [
            "项目使用什么技术栈？",
            "项目的目录结构是怎样的？",
            "有哪些编码规范或约定？",
            "与当前任务相关的核心模块在哪里？",
          ],
          filePatterns: ["**/*.md", "**/package.json", "**/*.config.*"],
          keywords: ["config", "rule", "guide"],
        },
      },
    },
  };
}
```

**修改点 2**: `handleComplete()` - info_collection 完成时验证

```typescript
// 在 handleComplete 方法中，info_collection 节点完成时
if (nodeMeta.role === "info_collection") {
  const plan = await this.retrievalService.getStoredPlan(projectRoot, workspaceId, nodeId);
  const validation = this.retrievalService.validateConclusion(conclusion, plan);

  if (!validation.passed) {
    return {
      success: false,
      previousStatus: nodeMeta.status,
      currentStatus: nodeMeta.status,
      conclusion: null,
      hint: `💡 检索结论不完整，请补充：\n${validation.missingItems.map(i => `- ${i}`).join("\n")}`,
      actionRequired: {
        type: "complete_with_checklist",
        message: "conclusion 缺少必要信息",
        data: { missingItems: validation.missingItems },
      },
    };
  }

  // 通过验证，继续原有的归档逻辑
  const archiveResult = await this.archiveInfoCollection(projectRoot, workspaceId, conclusion);
  // ...
}
```

---

### 3.5 注册工具

**文件**: `src/index.ts` 或工具注册入口

```typescript
import { retrievalTools } from "./tools/retrieval";

// 在工具列表中添加
const allTools = [
  ...workspaceTools,
  ...nodeTools,
  ...contextTools,
  ...retrievalTools,  // 新增
  // ...
];
```

---

## 4. 文件清单

| 操作 | 文件路径 |
|------|---------|
| 修改 | `src/types/workspace.ts` - 新增 ActionRequiredType |
| 新建 | `src/types/retrieval.ts` - RetrievalPlan 类型 |
| 新建 | `src/tools/retrieval.ts` - 工具定义 |
| 新建 | `src/services/RetrievalService.ts` - 服务实现 |
| 修改 | `src/services/StateService.ts` - handleStart/handleComplete |
| 修改 | `src/index.ts` - 注册新工具 |

---

## 5. 实现优先级

| 顺序 | 任务 | 依赖 |
|:----:|------|------|
| 1 | 定义类型 (`types/`) | 无 |
| 2 | 实现 RetrievalService | 类型 |
| 3 | 实现 retrieval_plan_submit 工具 | Service |
| 4 | 修改 StateService.handleStart | Service |
| 5 | 修改 StateService.handleComplete | Service |
| 6 | 注册工具 | 工具定义 |
