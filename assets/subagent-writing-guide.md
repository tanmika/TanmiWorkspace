# 如何编写完美的 Claude Code Subagent

> 基于 awesome-claude-code-subagents 库 125 个 subagent 的深度调研总结

## 目录

1. [核心概念](#核心概念)
2. [文件结构](#文件结构)
3. [命名规范](#命名规范)
4. [Prompt 架构](#prompt-架构)
5. [工具配置策略](#工具配置策略)
6. [模型选择指南](#模型选择指南)
7. [多代理协作模式](#多代理协作模式)
8. [质量保证机制](#质量保证机制)
9. [完整模板](#完整模板)
10. [实战案例](#实战案例)
11. [常见陷阱](#常见陷阱)

---

## 核心概念

### 什么是 Subagent

Subagent 是 Claude Code 中的专业化代理，每个 subagent 专注于特定领域，具有：

- **明确的职责边界** - 只做擅长的事
- **专业化的知识** - 深度而非广度
- **受限的工具集** - 最小权限原则
- **协作能力** - 与其他 agent 配合

### 设计哲学

```
单一职责 + 深度专业 + 显式协作 = 完美 Subagent
```

---

## 文件结构

### 标准 YAML 头部

```yaml
---
name: <subagent-name>
description: <一句话描述专业领域>
tools: <允许的工具列表>
---
```

### 完整文件示例

```markdown
---
name: code-reviewer
description: Expert code reviewer specializing in quality, security, and maintainability analysis
tools: Read, Glob, Grep, Bash
---

[Prompt 内容...]
```

---

## 命名规范

### 命名模式

| 模式 | 示例 | 适用场景 |
|------|------|----------|
| 职位 + 方向 | `frontend-developer`, `backend-developer` | 通用开发角色 |
| 技术 + 级别 | `python-pro`, `typescript-pro` | 语言专家 |
| 角色 + 领域 | `security-auditor`, `code-reviewer` | 质量保证 |
| 功能 + 层级 | `workflow-orchestrator`, `context-manager` | 元编排 |

### 命名规则

- 使用 **kebab-case**（连字符分隔）
- 全部小写，禁止大写
- 2-4 个词，简洁明确
- 名词优先，动词辅助

```
✅ code-reviewer
✅ python-pro
✅ api-designer
❌ CodeReviewer
❌ python_pro
❌ the-professional-python-developer-expert
```

---

## Prompt 架构

完美的 subagent prompt 包含 **7 个核心段落**：

### 段落 1：身份声明

```markdown
You are a senior [角色] with expertise in [具体领域].
Your focus spans [关键能力1], [关键能力2], and [关键能力3]
with emphasis on [核心价值主张].
```

**关键点：**
- 使用 "senior" 或 "expert" 建立权威
- 列出 3-5 个核心能力
- 明确价值主张

### 段落 2：触发工作流

```markdown
When invoked:
1. Query context manager for [specific requirements]
2. Review [existing artifacts/patterns]
3. Analyze [key dimensions]
4. Implement solutions following [standards]
```

**关键点：**
- 首先查询 context-manager（如果存在多代理系统）
- 4 步标准化流程
- 明确每步的产出

### 段落 3：检查清单

```markdown
[Domain] development checklist:
- Code coverage > 80% confirmed
- Response time < 100ms p95 achieved
- Security vulnerabilities zero tolerance verified
- Documentation complete and accurate
```

**关键点：**
- 量化指标（百分比、时间、数量）
- 使用强动作动词（confirmed, achieved, verified）
- 可测量、可验证

### 段落 4：能力分类

```markdown
[Capability Category 1]:
- Skill 1
- Skill 2
- Skill 3

[Capability Category 2]:
- Skill 4
- Skill 5
- Skill 6
```

**关键点：**
- 6-10 个能力分组
- 每组 6-10 项技能
- 按学习路径或功能排序

### 段落 5：通信协议

```markdown
Communication Protocol:

Initial context request:
{
  "requesting_agent": "[agent-name]",
  "request_type": "get_project_context",
  "payload": {
    "query": "Context needed: [specific requirements]"
  }
}

Progress update format:
{
  "agent": "[agent-name]",
  "status": "implementing",
  "progress": {
    "completed": ["item1", "item2"],
    "pending": ["item3"],
    "metrics": {"coverage": "95%"}
  }
}
```

**关键点：**
- JSON 格式标准化
- 三种消息类型：请求、进度、交付
- 显式的字段定义

### 段落 6：三阶段工作流

```markdown
Development Workflow:

Phase 1 - Analysis:
- Context gathering
- Requirements analysis
- Pattern identification
- Constraint evaluation

Phase 2 - Implementation:
- Implementation approach
- Pattern application
- Progress tracking
- Quality assurance

Phase 3 - Delivery:
- Excellence checklist verification
- Delivery notification
- Documentation update
- Next steps identification
```

### 段落 7：代理协作映射

```markdown
Integration with other agents:
- Collaborate with context-manager on project context
- Support backend-developer with API contracts
- Work with qa-expert on test coverage
- Guide junior developers on best practices
```

**关键点：**
- 使用方向性动词（collaborate, support, work with, guide）
- 指定具体协作点
- 覆盖上下游依赖

---

## 工具配置策略

### 工具使用矩阵

| 工具 | 用途 | 适用角色 |
|------|------|----------|
| `Read` | 读取文件 | **所有 agent** |
| `Glob` | 文件搜索 | **所有 agent** |
| `Grep` | 内容搜索 | **所有 agent** |
| `Write` | 创建文件 | 开发、文档 |
| `Edit` | 修改文件 | 开发、重构 |
| `Bash` | 执行命令 | 开发、运维、测试 |
| `WebFetch` | 获取网页 | 研究、分析 |
| `WebSearch` | 网络搜索 | 研究、市场 |

### 配置模式

**模式 A：完整开发**
```yaml
tools: Read, Write, Edit, Bash, Glob, Grep
```
适用：backend-developer, frontend-developer, fullstack-developer

**模式 B：分析审查**
```yaml
tools: Read, Glob, Grep, Bash
```
适用：code-reviewer, security-auditor, qa-expert

**模式 C：纯研究**
```yaml
tools: Read, Glob, Grep, WebFetch, WebSearch
```
适用：search-specialist, research-analyst

**模式 D：编排管理**
```yaml
tools: Read, Write, Edit, Glob, Grep
```
适用：context-manager, workflow-orchestrator

### 最小权限原则

```
只给 agent 完成任务所需的最小工具集
```

- 不需要写文件？不给 Write
- 不需要执行命令？不给 Bash
- 不需要上网？不给 WebFetch/WebSearch

---

## 模型选择指南

### 按任务复杂度

| 复杂度 | 推荐模型 | 典型角色 |
|--------|----------|----------|
| 高级推理 | Opus | llm-architect, microservices-architect |
| 代码生成 | Opus/Sonnet | frontend-developer, backend-developer |
| 分析审查 | Sonnet | code-reviewer, security-auditor |
| 信息检索 | Sonnet/Haiku | search-specialist, research-analyst |
| 简单任务 | Haiku | documentation-assistant |

### 选择决策树

```
任务需要复杂推理？
├─ 是 → Opus
└─ 否 → 任务需要高质量代码生成？
         ├─ 是 → Sonnet
         └─ 否 → 任务简单且高频？
                  ├─ 是 → Haiku
                  └─ 否 → Sonnet
```

---

## 多代理协作模式

### 协作架构

```
                    ┌─────────────────┐
                    │ context-manager │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   frontend    │   │   backend     │   │   qa-expert   │
│   developer   │   │   developer   │   │               │
└───────────────┘   └───────────────┘   └───────────────┘
```

### 通信协议

**1. 初始化查询**
```json
{
  "requesting_agent": "frontend-developer",
  "request_type": "get_project_context",
  "payload": {
    "query": "UI architecture, component ecosystem, design tokens"
  }
}
```

**2. 进度更新**
```json
{
  "agent": "frontend-developer",
  "status": "implementing",
  "progress": {
    "completed": ["component-structure", "routing"],
    "pending": ["state-management", "api-integration"],
    "metrics": {
      "components_built": 12,
      "test_coverage": "78%"
    }
  }
}
```

**3. 交付通知**
```json
{
  "agent": "frontend-developer",
  "status": "completed",
  "summary": "Built 15 components with 85% test coverage. Performance optimized to <100ms FCP.",
  "artifacts": ["src/components/**", "src/hooks/**"],
  "next_steps": ["Integration testing", "E2E setup"]
}
```

### 协作动词

| 动词 | 含义 | 示例 |
|------|------|------|
| collaborate | 双向协作 | 与 backend 协作定义 API |
| support | 提供支持 | 支持 QA 提供测试数据 |
| work with | 共同工作 | 与 designer 完成 UI |
| guide | 指导 | 指导 junior 最佳实践 |
| coordinate | 协调 | 协调 deployment 配置 |

---

## 质量保证机制

### 量化指标模板

```markdown
Quality checklist:
- Code coverage > [N]% confirmed
- Response time < [N]ms p[95/99] achieved
- Error rate < [N]% maintained
- Security vulnerabilities [zero/minimal] verified
- Documentation [complete/updated] confirmed
```

### 交付通知模板

```markdown
"[Domain] [action] completed. [动作] [数量] [对象] with [质量指标].
[关键成就列表]. Overall [指标名] improved from [旧值] to [新值]."
```

**示例：**
```
"Code review completed. Reviewed 47 files identifying 2 critical
security issues and 23 code quality improvements. Provided 41
specific suggestions. Overall code quality score improved from
72% to 89%."
```

### 完成条件

- 所有检查清单项已验证
- 量化指标达标
- 交付通知已发送
- 下一步已识别

---

## 完整模板

```markdown
---
name: [agent-name]
description: [一句话专业描述]
tools: [工具列表]
---

You are a senior [角色] with expertise in [领域]. Your focus spans [能力1], [能力2], and [能力3] with emphasis on [核心价值].

When invoked:
1. Query context manager for [需求]
2. Review [现有资产]
3. Analyze [关键维度]
4. Implement solutions following [标准]

[Domain] development checklist:
- [指标1] > [阈值] confirmed
- [指标2] < [阈值] achieved
- [指标3] [状态] verified
- [指标4] complete

[能力分类1]:
- 技能1
- 技能2
- 技能3

[能力分类2]:
- 技能4
- 技能5
- 技能6

Communication Protocol:

Initial context request:
{
  "requesting_agent": "[agent-name]",
  "request_type": "get_project_context",
  "payload": {
    "query": "[具体需求]"
  }
}

Progress update:
{
  "agent": "[agent-name]",
  "status": "[状态]",
  "progress": {
    "completed": [],
    "pending": [],
    "metrics": {}
  }
}

Development Workflow:

Phase 1 - Analysis:
- Context gathering
- Requirements analysis
- Pattern identification

Phase 2 - Implementation:
- Implementation approach
- Progress tracking
- Quality assurance

Phase 3 - Delivery:
- Excellence checklist
- Delivery notification
- Documentation

Integration with other agents:
- Collaborate with [agent1] on [task1]
- Support [agent2] with [capability]
- Work with [agent3] on [domain]
```

---

## 常见陷阱

### 1. 职责过宽

```
❌ "You are an expert in everything related to software development"
✅ "You are a senior frontend developer specializing in React and Vue ecosystems"
```

### 2. 模糊指标

```
❌ "Ensure good code quality"
✅ "Code coverage > 80% confirmed, cyclomatic complexity < 10 maintained"
```

### 3. 缺少协作定义

```
❌ [没有 Integration 段落]
✅ "Integration with other agents:
    - Collaborate with backend-developer on API contracts
    - Support qa-expert with test data"
```

### 4. 工具过度授权

```
❌ tools: Read, Write, Edit, Bash, WebFetch, WebSearch, Glob, Grep  # 给所有工具
✅ tools: Read, Glob, Grep  # code-reviewer 只需要这些
```

### 5. 被动语态

```
❌ "The code should be reviewed"
✅ "Review code for security vulnerabilities"
```

### 6. 缺少工作流

```
❌ [直接列能力，没有执行步骤]
✅ "When invoked:
    1. Query context manager...
    2. Review existing patterns...
    3. Analyze requirements...
    4. Implement solutions..."
```

---

## 总结

编写完美 Subagent 的核心公式：

```
完美 Subagent =
  清晰身份
  + 明确工作流
  + 量化指标
  + 最小工具集
  + 显式协作
```

### 检查清单

在提交 subagent 配置前，确认：

- [ ] 名称使用 kebab-case，2-4 个词
- [ ] 描述一句话，明确专业领域
- [ ] 身份声明包含 "senior/expert"
- [ ] 触发工作流有 4 步
- [ ] 检查清单有量化指标
- [ ] 能力分组 6-10 个，每组 6-10 项
- [ ] 通信协议使用 JSON 格式
- [ ] 三阶段工作流完整
- [ ] 协作映射覆盖上下游
- [ ] 工具配置最小化

---

*本指南基于 awesome-claude-code-subagents 库 125 个 subagent 的深度调研*
