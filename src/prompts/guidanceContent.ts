// src/prompts/guidanceContent.ts
// 场景化引导内容配置

import type { GuidanceScenario, GuidanceConfig } from "../types/guidance.js";

/**
 * 引导内容配置
 * 每个场景包含三级引导内容：
 * - L0: 简短提示（1-2句话，~20 token）
 * - L1: 工作流片段（3-5个要点，~100 token）
 * - L2: 完整指南（详细说明）
 */
export const GUIDANCE_CONFIGS: Record<GuidanceScenario, GuidanceConfig> = {
  // ==================== 工作区相关 ====================

  workspace_init: {
    scenario: "workspace_init",
    l0: "工作区已创建。下一步：创建信息收集节点（role: info_collection）收集项目信息。",
    l1: `工作区创建后流程：
1. 告知用户 webUrl
2. 创建信息收集节点（type: planning, role: info_collection）
3. 扫描项目结构、查找文档
4. 完成信息收集后开始规划任务`,
    l2: `## 工作区创建后必做事项

### 1. 告知用户 Web UI 地址
workspace_init 返回的 webUrl 是可视化界面，**务必告知用户**。

### 2. 创建信息收集节点（必须！）
\`\`\`typescript
node_create({
  workspaceId: "...",
  parentId: "root",
  type: "planning",
  role: "info_collection",
  title: "项目信息收集",
  requirement: "收集项目结构、开发规范、相关文档"
})
\`\`\`

### 3. 在信息收集节点中执行调研
- 扫描项目根目录一级菜单
- 查找文档文件夹（./assets/, ./Doc/）
- 阅读 README 和配置文件
- 收集环境配置信息

### 4. 完成信息收集后归档
在 conclusion 中按格式归档规则和文档，系统会自动追加到工作区。`,
    relatedHelpTopics: ["start_task"],
    metadata: { priority: 100, critical: true },
  },

  workspace_first_planning: {
    scenario: "workspace_first_planning",
    l0: "根节点已启动。请先确认是否有已完成的信息收集节点。",
    l1: `根节点首次规划流程：
1. 检查是否有 role=info_collection 的已完成子节点
2. 如果没有，先创建信息收集节点
3. 信息收集完成后再规划具体任务
4. 创建子节点分解任务`,
    l2: `## 根节点首次规划

根节点 start 前必须完成信息收集。如果没有信息收集节点，会收到 INFO_COLLECTION_REQUIRED 提醒。

### 信息收集节点的作用
1. 收集项目结构、规范、文档
2. 自动归档到工作区规则和文档
3. 为后续任务提供上下文支持

### 规划流程
1. 分析任务，确定分解方案
2. 创建子节点（简单任务用 execution，复杂任务用 planning）
3. 向用户展示计划并等待确认
4. 确认后开始执行第一个子节点`,
    relatedHelpTopics: ["start_task"],
    metadata: { priority: 90, critical: true },
  },

  workspace_archived: {
    scenario: "workspace_archived",
    l0: "工作区已归档。如需继续，使用 workspace_restore 恢复。",
    l1: `归档说明：
1. 归档的工作区会从活跃列表移除
2. 数据保留在 archive 目录
3. 使用 workspace_restore 可恢复`,
    l2: `## 工作区归档

归档用于暂停或完成的工作区。

### 归档后
- 工作区从 workspace_list 默认列表中隐藏
- 数据保存在 .tanmi-workspace/archive/ 目录
- 可随时恢复继续工作

### 恢复工作区
\`\`\`typescript
workspace_restore({ workspaceId: "..." })
\`\`\``,
    relatedHelpTopics: [],
  },

  workspace_restored: {
    scenario: "workspace_restored",
    l0: "工作区已恢复。可以继续之前的任务。",
    l1: `恢复后操作：
1. 查看当前聚焦节点
2. 检查节点状态
3. 继续未完成的任务`,
    l2: `## 工作区恢复

工作区已从归档恢复为活跃状态。

### 恢复后建议
1. 使用 workspace_status 查看整体进度
2. 使用 context_get 获取当前聚焦节点上下文
3. 继续执行未完成的任务`,
    relatedHelpTopics: ["resume_task"],
  },

  // ==================== 任务场景引导 ====================

  scenario_feature: {
    scenario: "scenario_feature",
    l0: "功能开发场景。建议流程：需求澄清 → 技术调研 → 设计 → 分解 → 执行+测试。",
    l1: `功能开发推荐流程：
1. 需求澄清 - 确认功能边界和验收标准
2. 技术调研 - 评估技术方案和依赖
3. 技术设计 - 设计接口、数据结构
4. 任务分解 - 拆分为可测试的子任务
5. 执行+测试 - 编码并编写测试用例`,
    l2: `## 功能开发场景

此场景适用于新功能开发，强调需求分析和测试验证。

### 推荐工作流
1. **需求澄清** - 创建规划节点明确功能需求
   - 用户故事和场景
   - 验收标准（WHEN/THEN）
   - 功能边界和限制

2. **技术调研** - 评估实现方案
   - 现有代码结构分析
   - 技术选型和依赖
   - 风险评估

3. **技术设计** - 设计实现方案
   - API/接口设计
   - 数据结构设计
   - 模块划分

4. **任务分解** - 创建执行节点
   - 核心功能实现
   - 边界情况处理
   - 测试用例编写

5. **执行+测试** - 实现并验证
   - 默认 isNeedTest=true
   - 编写单元测试
   - 集成测试验证

### 注意事项
- 功能开发默认需要测试
- 使用 acceptanceCriteria 明确验收标准
- 考虑向后兼容性`,
    relatedHelpTopics: ["start_task", "node_workflow"],
    metadata: { priority: 70 },
  },

  scenario_summary: {
    scenario: "scenario_summary",
    l0: "文档总结场景。建议流程：文档扫描 → 分析维度 → 分析执行 → 输出总结。",
    l1: `文档总结推荐流程：
1. 文档扫描 - 确定要分析的文档范围
2. 分析维度 - 确定总结的角度和重点
3. 分析执行 - 阅读文档并提取关键信息
4. 输出总结 - 生成结构化总结文档`,
    l2: `## 文档总结场景

此场景适用于文档分析、代码总结、知识梳理等任务。

### 推荐工作流
1. **文档扫描** - 确定分析范围
   - 使用 Glob 查找相关文档
   - 使用 node_reference 引用文档
   - 确认文档版本和时效性

2. **分析维度** - 确定总结角度
   - 技术架构总结
   - API 使用说明
   - 最佳实践提炼
   - 变更历史梳理

3. **分析执行** - 提取关键信息
   - 阅读并理解文档
   - 提取核心概念
   - 识别关联关系

4. **输出总结** - 生成文档
   - 结构化组织内容
   - 补充缺失的元信息
   - 提供示例和说明

### 注意事项
- 默认 isNeedTest=false（不需要测试）
- 输出应该是文档而非代码
- 关注可读性和结构化`,
    relatedHelpTopics: ["start_task"],
    metadata: { priority: 60 },
  },

  scenario_optimize: {
    scenario: "scenario_optimize",
    l0: "性能优化场景。建议流程：性能基准(前) → 优化方案 → 执行+测试 → 性能基准(后) → 对比验收。",
    l1: `性能优化推荐流程：
1. 性能基准(前) - 测量当前性能指标
2. 优化方案 - 分析瓶颈并设计优化方案
3. 执行+测试 - 实施优化并验证正确性
4. 性能基准(后) - 测量优化后性能
5. 对比验收 - 验证优化效果`,
    l2: `## 性能优化场景

此场景适用于性能优化、资源消耗降低等任务。

### 推荐工作流
1. **性能基准(前)** - 建立基线
   - 测量关键性能指标
   - 记录资源使用情况
   - 确定优化目标

2. **优化方案** - 分析和设计
   - 性能分析定位瓶颈
   - 评估优化方案
   - 权衡性能与可维护性

3. **执行+测试** - 实施优化
   - 实现优化方案
   - 确保功能正确性
   - 编写性能测试

4. **性能基准(后)** - 测量结果
   - 使用相同测试场景
   - 记录优化后指标
   - 验证无性能回退

5. **对比验收** - 验证效果
   - 对比前后数据
   - 确认达到优化目标
   - 记录优化结论

### 注意事项
- 默认 isNeedTest=true
- 必须进行性能对比验证
- 关注优化的副作用`,
    relatedHelpTopics: ["start_task"],
    metadata: { priority: 65 },
  },

  scenario_debug: {
    scenario: "scenario_debug",
    l0: "问题调试场景。建议流程：错误分析 → 假设 → 验证 → (循环) → 修复+回归测试。",
    l1: `问题调试推荐流程：
1. 错误分析 - 复现问题并收集信息
2. 假设 - 提出可能的原因
3. 验证 - 验证假设是否成立
4. 循环 - 如假设不成立，重复2-3
5. 修复+回归测试 - 修复并验证`,
    l2: `## 问题调试场景

此场景适用于 bug 修复、问题排查等任务。

### 推荐工作流
1. **错误分析** - 理解问题
   - 复现问题
   - 收集错误信息和日志
   - 确定影响范围

2. **假设** - 提出可能原因
   - 分析代码逻辑
   - 检查相关变更
   - 列出可能的根因

3. **验证** - 测试假设
   - 编写测试用例
   - 调试验证
   - 排除或确认原因

4. **循环** - 持续迭代
   - 如假设不成立，提出新假设
   - 使用 problem_update 记录进展
   - 必要时 fail 并寻求帮助

5. **修复+回归测试** - 解决问题
   - 实施修复方案
   - 编写回归测试
   - 验证不影响其他功能

### 注意事项
- 默认 isNeedTest=true
- 使用 problem_update 记录调试过程
- 编写回归测试防止复发`,
    relatedHelpTopics: ["task_blocked"],
    metadata: { priority: 70 },
  },

  scenario_misc: {
    scenario: "scenario_misc",
    l0: "杂项场景。自由规划任务流程，根据具体情况灵活调整。",
    l1: `杂项场景建议：
1. 分析任务性质和目标
2. 确定是否需要测试
3. 自由规划执行流程
4. 根据实际情况调整`,
    l2: `## 杂项场景

此场景用于不属于其他场景的任务，提供最大灵活性。

### 工作流建议
1. **分析任务** - 理解任务性质
   - 确定任务类型
   - 评估复杂度
   - 识别依赖

2. **规划执行** - 制定方案
   - 自由规划流程
   - 灵活调整策略
   - 参考其他场景经验

3. **执行验证** - 完成任务
   - 根据需要决定是否测试
   - 记录执行过程
   - 验证结果

### 注意事项
- 默认 isNeedTest=false
- 灵活运用各种工具
- 可参考其他场景的最佳实践`,
    relatedHelpTopics: ["start_task"],
    metadata: { priority: 50 },
  },

  // ==================== 节点创建 ====================

  node_create_planning: {
    scenario: "node_create_planning",
    l0: "规划节点已创建。下一步：start 进入规划状态，分析需求并创建子节点。",
    l1: `规划节点流程：
1. start → planning 状态
2. 分析任务，创建子节点
3. 展示计划，等待用户确认
4. 子节点执行时进入 monitoring
5. 所有子节点完成后 complete`,
    l2: `## 规划节点工作流

规划节点负责分析、分解任务，不直接执行具体操作。

### 状态流转
\`\`\`
pending → planning → monitoring → completed
                 ↘ cancelled
\`\`\`

### 关键步骤
1. **start** 进入 planning 状态
2. **创建子节点** 分解任务
   - 简单任务 → execution 类型
   - 复杂任务 → planning 类型
3. **展示计划** 等待用户确认
4. **监控执行** 自动进入 monitoring
5. **complete** 汇总子节点结论`,
    relatedHelpTopics: ["node_workflow"],
  },

  node_create_execution: {
    scenario: "node_create_execution",
    l0: "执行节点已创建。下一步：start 开始执行，完成后 complete。",
    l1: `执行节点流程：
1. start → implementing 状态
2. 执行任务，用 log_append 记录
3. 遇到问题用 problem_update 记录
4. 完成后 complete，失败则 fail`,
    l2: `## 执行节点工作流

执行节点负责具体执行，不能有子节点。

### 状态流转
\`\`\`
pending → implementing → validating → completed
                     ↘ failed
\`\`\`

### 关键步骤
1. **start** 进入 implementing 状态
2. **执行任务** 边做边用 log_append 记录
3. **阶段性结论** 用 node_update 记录到 note
4. **遇阻处理**
   - 任务过大 → fail 回退父节点分解
   - 信息不足 → fail 并说明
   - 可继续 → problem_update 记录
5. **complete** 填写最终 conclusion`,
    relatedHelpTopics: ["node_workflow"],
  },

  node_create_info_collection: {
    scenario: "node_create_info_collection",
    l0: "信息收集节点已创建。请扫描项目结构、查找文档，完成时按格式归档。",
    l1: `信息收集节点流程：
1. start 开始收集
2. 扫描项目结构和文档
3. 阅读 README 和配置
4. complete 时在 conclusion 中按格式归档
5. 系统自动追加规则和文档到工作区`,
    l2: `## 信息收集节点

信息收集节点用于初始化工作区上下文，收集项目规范和文档。

### 收集内容
- 项目结构和目录布局
- 开发规范和代码风格
- 相关文档路径
- 环境配置信息

### complete 时归档格式
\`\`\`markdown
## 规则
- 规则1
- 规则2

## 文档
- /path/to/doc1: 文档描述
- /path/to/doc2: 文档描述
\`\`\`

系统会自动将规则和文档追加到工作区。`,
    relatedHelpTopics: ["start_task"],
    metadata: { priority: 80 },
  },

  // ==================== 状态转换 ====================

  execution_start: {
    scenario: "execution_start",
    l0: "执行任务已开始。请用 log_append 记录执行过程，完成后调用 complete。",
    l1: `执行中注意事项：
1. 用 log_append 记录关键动作
2. 阶段性结论用 node_update 记录
3. 遇到问题用 problem_update
4. 完成后 complete，失败则 fail`,
    l2: `## 执行节点开始

任务已进入 implementing 状态。

### 执行期间
1. **记录日志** - 关键操作用 log_append 记录
2. **阶段性结论** - 用 node_update 更新 note
3. **检查文档** - 确认文档引用充足

### 遇阻处理
- 任务过于复杂 → fail 回退父节点重新分解
- 信息不足 → fail 并说明缺少什么
- 可继续但有问题 → problem_update 记录

### 完成
\`\`\`typescript
node_transition({
  action: "complete",
  conclusion: "完成内容描述..."
})
\`\`\``,
    relatedHelpTopics: ["node_workflow"],
  },

  execution_complete: {
    scenario: "execution_complete",
    l0: "执行任务已完成。如有引用文档，请确认是否需要同步更新。",
    l1: `完成后检查：
1. 确认结论完整准确
2. 检查引用的文档是否需要更新
3. 查看是否有同级未完成节点
4. 返回父节点继续`,
    l2: `## 执行节点完成

任务已完成，结论已记录。

### 完成后建议
1. **文档检查** - 如果修改了代码，相关文档可能需要更新
2. **同级节点** - 检查是否有其他待执行的同级节点
3. **父节点状态** - 当所有同级节点完成时，考虑完成父节点`,
    relatedHelpTopics: ["complete_task"],
  },

  execution_fail: {
    scenario: "execution_fail",
    l0: "任务已标记失败。请返回父规划节点，分析原因并调整方案。",
    l1: `失败后处理：
1. 结论中说明失败原因
2. 返回父规划节点
3. 分析是否需要重新分解
4. 或者 retry 修复后重试`,
    l2: `## 执行节点失败

任务执行失败，需要调整策略。

### 失败原因分析
- **需求不清** - 需要更多信息，让父节点补充
- **任务过大** - 需要进一步分解
- **外部阻塞** - 依赖未满足，需要调整顺序

### 下一步
1. 如果问题可修复 → 使用 retry 重试
2. 如果需要重新规划 → 返回父节点 reopen 并调整`,
    relatedHelpTopics: ["task_blocked"],
  },

  planning_start: {
    scenario: "planning_start",
    l0: "进入规划状态。请分析需求，创建子节点分解任务。",
    l1: `规划中操作：
1. 分析当前需求
2. 确定分解方案
3. 创建子节点（planning 或 execution）
4. 展示计划等待用户确认`,
    l2: `## 规划节点开始

进入 planning 状态，开始任务分解。

### 规划步骤
1. **分析需求** - 理解任务目标和范围
2. **确定方案** - 选择实现路径
3. **创建子节点** - 分解为可执行的步骤
4. **展示计划** - 向用户说明计划内容
5. **等待确认** - 用户说"好/继续/可以"后开始执行`,
    relatedHelpTopics: ["start_task"],
  },

  planning_complete: {
    scenario: "planning_complete",
    l0: "规划节点已完成。请汇总子节点结论到 conclusion。",
    l1: `规划完成时：
1. 汇总所有子节点结论
2. 写入综合性 conclusion
3. 检查是否有遗漏的子任务`,
    l2: `## 规划节点完成

所有子节点已完成，规划节点可以 complete。

### 汇总结论
在 conclusion 中汇总子节点的关键成果：
- 主要完成内容
- 重要决策和变更
- 遗留问题（如有）`,
    relatedHelpTopics: ["complete_task"],
  },

  planning_monitoring: {
    scenario: "planning_monitoring",
    l0: "进入监控状态。等待子节点执行完成。",
    l1: `监控状态说明：
1. 子节点开始执行时自动进入
2. 等待所有子节点完成
3. 可以添加新的子节点
4. 所有子节点完成后可 complete`,
    l2: `## 规划节点监控中

第一个子节点开始执行后，规划节点自动进入 monitoring 状态。

### 监控期间
- 等待子节点完成
- 可以动态添加新的子节点
- 可以调整执行顺序`,
    relatedHelpTopics: [],
  },

  node_reopen_with_children: {
    scenario: "node_reopen_with_children",
    l0: "节点已 reopen，存在子节点。请先查看子节点状态再决定下一步。",
    l1: `reopen 后操作：
1. 查看现有子节点结构
2. 分析哪些需要调整
3. 决定：修改已有 / 新增 / 删除
4. 合并新旧结论`,
    l2: `## 重开已有子节点的节点

节点已 reopen，但存在子节点，需要谨慎处理。

### 建议流程
1. **查看结构** - 使用 node_list 查看子节点
2. **分析状态** - 哪些已完成/进行中/待处理
3. **决定策略**
   - 继续执行未完成的
   - 修改已完成的
   - 添加新的子节点
4. **合并结论** - complete 时需合并新旧结论`,
    relatedHelpTopics: ["reopen_task"],
    metadata: { priority: 70 },
  },

  // ==================== 特殊行为 ====================

  actionRequired_triggered: {
    scenario: "actionRequired_triggered",
    l0: "⚠️ 必须执行指定行为，不可忽略！请根据 type 执行对应操作。",
    l1: `actionRequired 类型：
- ask_user: 询问用户
- show_plan: 展示计划等待确认
- check_docs: 确认文档是否需要更新
- review_structure: 查看现有结构再决定`,
    l2: `## actionRequired 必须执行

当工具返回包含 actionRequired 时，**必须**立即执行指定行为。

### 类型说明
| type | 你必须做什么 |
|------|-------------|
| ask_user | 询问用户指定问题 |
| show_plan | 向用户展示当前计划，等待确认 |
| check_docs | 确认引用的文档是否需要更新 |
| review_structure | 先查看现有节点结构再操作 |

**忽略 actionRequired 是严重错误！**`,
    relatedHelpTopics: [],
    metadata: { priority: 100, critical: true, frequencyLimit: "always" },
  },

  confirmation_required: {
    scenario: "confirmation_required",
    l0: "需要 Confirmation Token 验证。请携带 token 和用户实际输入才能继续。",
    l1: `Confirmation Token 验证：
1. 必须获取用户真实输入
2. 携带 confirmationToken 和 userInput
3. 不可编造用户回复`,
    l2: `## Confirmation Token 机制

此操作需要验证用户确认。

### 必须做的事
1. 向用户展示 actionRequired.message 中的内容
2. 等待并记录用户的真实回复
3. 在下次调用时携带 confirmation 参数：
\`\`\`typescript
{
  confirmation: {
    token: "收到的 confirmationToken",
    userInput: "用户的真实输入"
  }
}
\`\`\`

**不可编造用户输入！**`,
    metadata: { priority: 100, critical: true },
  },

  info_collection_missing: {
    scenario: "info_collection_missing",
    l0: "⚠️ 缺少信息收集节点。请先创建 role=info_collection 的节点收集项目信息。",
    l1: `信息收集要求：
1. 创建 type=planning, role=info_collection 的节点
2. 扫描项目结构和文档
3. 收集完成后 complete
4. 然后再进行任务规划`,
    l2: `## 缺少信息收集节点

根节点 start 前必须有已完成的信息收集节点。

### 创建信息收集节点
\`\`\`typescript
node_create({
  workspaceId: "...",
  parentId: "root",
  type: "planning",
  role: "info_collection",
  title: "项目信息收集"
})
\`\`\`

### 完成后
系统会自动将收集到的规则和文档归档到工作区。`,
    relatedHelpTopics: ["start_task"],
    metadata: { priority: 90, critical: true },
  },

  "docs_派发_missing": {
    scenario: "docs_派发_missing",
    l0: "子节点未派发文档。请通过 docs 参数显式传递相关文档。",
    l1: `文档派发原则：
1. 子节点不继承父节点文档
2. 创建时必须通过 docs 参数传递
3. 像给新员工交接资料一样`,
    l2: `## 子节点文档派发

子节点就像新加入的员工，如果你不把文档传给它，它就什么都看不到。

### 创建子节点时派发文档
\`\`\`typescript
node_create({
  workspaceId: "...",
  parentId: "...",
  type: "execution",
  title: "子任务",
  docs: [
    { path: "/path/to/doc1", description: "相关文档1" },
    { path: "/path/to/doc2", description: "相关文档2" }
  ]
})
\`\`\``,
    relatedHelpTopics: [],
    metadata: { priority: 60 },
  },

  // ==================== 错误场景 ====================

  error_invalid_transition: {
    scenario: "error_invalid_transition",
    l0: "非法状态转换。请检查当前状态和目标动作是否匹配。",
    l1: `常见错误：
- pending 不能直接 complete（需先 start）
- completed 不能 start（需先 reopen）
- failed 需要 retry 重试`,
    l2: `## 非法状态转换

当前状态不支持执行该动作。

### 执行节点状态图
\`\`\`
pending → start → implementing
implementing → complete → completed
implementing → fail → failed
completed → reopen → implementing
failed → retry → implementing
\`\`\`

### 规划节点状态图
\`\`\`
pending → start → planning
planning → 创建子节点 → monitoring
monitoring → complete → completed
completed → reopen → planning
\`\`\``,
    relatedHelpTopics: ["transitions"],
    metadata: { priority: 80 },
  },

  error_execution_has_children: {
    scenario: "error_execution_has_children",
    l0: "执行节点不能有子节点。如需分解，请改为规划节点。",
    l1: `解决方案：
1. 如果任务需要分解，创建时用 type=planning
2. 已创建的执行节点不能添加子节点
3. 执行节点遇到复杂任务应 fail 回退`,
    l2: `## 执行节点不能有子节点

执行节点设计用于具体执行，不能分解。

### 选择节点类型
- **execution**: 单一具体任务，不可分解
- **planning**: 需要分解的复杂任务

### 如果发现任务过于复杂
1. 使用 fail 标记当前执行节点
2. 在 conclusion 中说明需要分解
3. 返回父规划节点重新设计`,
    relatedHelpTopics: ["node_workflow"],
  },

  error_workspace_not_found: {
    scenario: "error_workspace_not_found",
    l0: "工作区或节点不存在。请检查 ID 是否正确，或使用 workspace_list 查找。",
    l1: `可能原因：
1. ID 输入错误
2. 工作区已被删除或归档
3. 从旧会话恢复时 ID 失效

解决：使用 workspace_list 查找有效工作区`,
    l2: `## 工作区/节点不存在

请求的资源未找到。

### 常见原因
1. **ID 错误** - 检查是否拼写正确
2. **已归档** - 使用 workspace_list({ status: "archived" }) 查找
3. **会话恢复** - 从摘要恢复时 ID 可能失效

### 解决方法
\`\`\`typescript
// 查找活跃工作区
workspace_list({ status: "active" })

// 查找归档工作区
workspace_list({ status: "archived" })
\`\`\``,
    relatedHelpTopics: ["session_restore"],
  },

  // ==================== 通用 ====================

  unknown: {
    scenario: "unknown",
    l0: "使用 tanmi_help 获取详细帮助。",
    l1: `常用帮助主题：
- node_workflow: 节点工作流程
- transitions: 状态转换说明
- start_task: 开始新任务
- resume_task: 继续任务`,
    l2: `## 帮助资源

如需详细帮助，使用 tanmi_help 工具：

\`\`\`typescript
tanmi_help({ topic: "node_workflow" })
\`\`\`

### 常用主题
- node_workflow: 节点工作流程
- transitions: 状态转换
- start_task: 开始新任务
- resume_task: 继续任务
- troubleshooting: 常见问题`,
    relatedHelpTopics: ["overview"],
  },
};

/**
 * 获取指定场景的引导配置
 */
export function getGuidanceConfig(
  scenario: GuidanceScenario
): GuidanceConfig | null {
  return GUIDANCE_CONFIGS[scenario] || null;
}

/**
 * 将 TaskScenario 转换为 GuidanceScenario
 */
export function taskScenarioToGuidance(
  taskScenario: "feature" | "summary" | "optimize" | "debug" | "misc"
): GuidanceScenario {
  switch (taskScenario) {
    case "feature":
      return "scenario_feature";
    case "summary":
      return "scenario_summary";
    case "optimize":
      return "scenario_optimize";
    case "debug":
      return "scenario_debug";
    case "misc":
      return "scenario_misc";
    default:
      return "scenario_misc";
  }
}
