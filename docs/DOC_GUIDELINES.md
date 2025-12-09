# 文档整理规范

## 目录结构

```
tanmi-workspace/
├── docs/           # 模块信息文档
│   └── *.md        # 功能说明、结构介绍
├── rules/          # 编写规则文档
│   └── *.md        # 项目规范、编码约定
└── DOC_GUIDELINES.md  # 本文件
```

## 文档类型

### 1. 信息文档 (docs/)

**目的**：快速了解模块结构和功能

**要求**：
- 包含 frontmatter 元数据（title, description, category）
- description 字段用于快速浏览查询
- 内容侧重"是什么"和"怎么用"

**模板**：
```markdown
---
title: 模块名称
description: 一句话简介，说明模块核心功能
category: core | storage | interface | types | frontend | utils
---

# 模块名称

## 概述
简要说明模块职责和定位。

## 核心功能
列出主要功能点。

## API / 接口
关键方法或接口说明。

## 依赖关系
与其他模块的依赖。

## 使用示例
典型使用场景。
```

### 2. 编写规则 (rules/)

**目的**：明确项目规范和编码约定

**要求**：
- 包含 frontmatter 元数据（title, description, scope）
- scope 说明适用范围（模块名 / 语言 / 全局）
- 内容侧重"应该怎么做"和"为什么"

**模板**：
```markdown
---
title: 规则名称
description: 一句话简介，说明规则核心内容
scope: global | typescript | vue | module-name
---

# 规则名称

## 适用范围
说明本规则适用的代码范围。

## 规则内容
具体的规范条目。

## 示例
正确和错误的代码示例。

## 原因
为什么要这样做。
```

## 粒度原则

**信息文档粒度**：
- 以"能独立理解"为单位
- 小模块可合并（如多个工具函数合为一篇）
- 大模块可拆分（如 Service 的不同功能域）
- 参考架构层级作为最细粒度，实际可调整

**编写规则粒度**：
- 以"实用性"为单位
- 可按模块（如 storage-rules.md）
- 可按语言（如 typescript-rules.md）
- 可按主题（如 error-handling-rules.md）
- 避免过于琐碎，合并相关规则

## 元数据字段说明

| 字段 | 用途 | 示例 |
|------|------|------|
| title | 文档标题 | "NodeService 模块" |
| description | 快速检索摘要 | "节点 CRUD 和层级操作服务" |
| category | 信息文档分类 | core, storage, interface |
| scope | 规则适用范围 | global, typescript, vue |

## 命名约定

**信息文档**：
- 使用模块名或功能名
- 示例：`node-service.md`, `storage-layer.md`

**编写规则**：
- 使用 `*-rules.md` 后缀
- 示例：`typescript-rules.md`, `error-handling-rules.md`

## 维护原则

1. **及时更新**：代码变更后同步更新相关文档
2. **保持简洁**：避免冗余，突出重点
3. **实用优先**：文档服务于开发，不是形式主义
4. **元数据完整**：确保 frontmatter 信息准确，便于检索
