---
title: TypeScript 编码规范
description: TypeScript 代码编写规范，包括类型定义、ESM 模块、命名约定
scope: typescript
---

# TypeScript 编码规范

## 适用范围

本规范适用于 `src/` 目录下所有 TypeScript 代码。

## 模块系统

### ESM 规范

项目使用 ES Modules，配置如下：

```json
{
  "module": "NodeNext",
  "moduleResolution": "NodeNext"
}
```

**导入规则**：

```typescript
// 正确：显式 .js 扩展名
import { TanmiError } from "./types/errors.js";
import type { NodeMeta } from "./types/node.js";

// 错误：省略扩展名
import { TanmiError } from "./types/errors";
```

### 导入顺序

```typescript
// 1. Node.js 内置模块
import * as path from "node:path";
import * as fs from "node:fs";

// 2. 第三方库
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import Fastify from "fastify";

// 3. 项目内部模块（类型优先）
import type { NodeMeta, NodeStatus } from "./types/node.js";
import { TanmiError } from "./types/errors.js";
import { generateId } from "./utils/id.js";
```

### 类型导入

优先使用 `import type` 导入纯类型：

```typescript
// 正确：纯类型使用 type 导入
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { NodeMeta, NodeStatus } from "./types/node.js";

// 混合导入：值和类型分开
import { TanmiError } from "./types/errors.js";
import type { ErrorCode } from "./types/errors.js";
```

## 类型定义

### 接口 vs 类型别名

```typescript
// 接口：用于对象结构
interface NodeMeta {
  id: string;
  parentId: string | null;
  children: string[];
}

// 类型别名：用于联合类型、工具类型
type NodeStatus = "pending" | "implementing" | "completed";
type TransitionAction = "start" | "submit" | "complete";
```

### API 类型命名

```typescript
// 输入参数：{Tool}Params
interface NodeCreateParams {
  workspaceId: string;
  parentId: string;
  title: string;
}

// 输出结果：{Tool}Result
interface NodeCreateResult {
  nodeId: string;
  path: string;
}
```

### 可选字段

```typescript
// 输入参数：可选用 ?
interface NodeCreateParams {
  title: string;           // 必填
  requirement?: string;    // 可选
}

// 输出结果：可能缺失用 ?
interface NodeTransitionResult {
  success: boolean;
  hint?: string;           // 仅特定场景返回
}
```

## 命名约定

### 文件命名

| 类型 | 命名 | 示例 |
|------|------|------|
| Service | PascalCase | `NodeService.ts` |
| 类型文件 | camelCase | `node.ts`, `workspace.ts` |
| 工具函数 | camelCase | `validation.ts`, `time.ts` |
| 路由文件 | camelCase | `workspace.ts`, `node.ts` |

### 变量命名

```typescript
// 常量：UPPER_SNAKE_CASE
const INVALID_CHARS = /[/\\:*?"<>|]/;
const DEFAULT_PORT = 3000;

// 变量/参数：camelCase
const workspaceId = params.workspaceId;
const nodeTree = await service.list(params);

// 类/接口：PascalCase
class NodeService { }
interface NodeMeta { }

// 类型别名：PascalCase
type NodeStatus = "pending" | "implementing";
```

### 函数命名

```typescript
// 动词开头，camelCase
function generateId(): string { }
function validateWorkspaceName(name: string): void { }
async function fetchWorkspace(id: string): Promise<Workspace> { }

// 布尔返回：is/has/can 开头
function isPortInUse(port: number): Promise<boolean> { }
function hasChildren(node: NodeMeta): boolean { }
```

## 类设计

### Service 类结构

```typescript
export class NodeService {
  // 1. 构造函数（依赖注入）
  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

  // 2. 私有辅助方法
  private async resolveProjectRoot(workspaceId: string): Promise<string> { }

  // 3. 公共 API 方法
  async create(params: NodeCreateParams): Promise<NodeCreateResult> { }
  async get(params: NodeGetParams): Promise<NodeGetResult> { }
}
```

### 依赖注入

```typescript
// 正确：通过构造函数注入
class NodeService {
  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage
  ) {}
}

// 使用
const service = new NodeService(jsonStorage, mdStorage);
```

## 异步处理

### async/await

```typescript
// 正确：使用 async/await
async function loadWorkspace(id: string): Promise<Workspace> {
  const projectRoot = await json.getProjectRoot(id);
  const config = await json.readWorkspaceConfig(projectRoot, id);
  return config;
}

// 避免：裸 Promise
function loadWorkspace(id: string): Promise<Workspace> {
  return json.getProjectRoot(id)
    .then(root => json.readWorkspaceConfig(root, id));
}
```

### 并行执行

```typescript
// 无依赖时并行执行
const [config, graph] = await Promise.all([
  json.readWorkspaceConfig(projectRoot, workspaceId),
  json.readGraph(projectRoot, workspaceId),
]);
```

## 严格模式

项目启用 `strict: true`，包括：

- `strictNullChecks`：必须处理 null/undefined
- `noImplicitAny`：禁止隐式 any
- `strictFunctionTypes`：严格函数类型检查

```typescript
// 必须处理可能为 null 的值
const projectRoot = await json.getProjectRoot(workspaceId);
if (!projectRoot) {
  throw new TanmiError("WORKSPACE_NOT_FOUND", "工作区不存在");
}
// 此处 projectRoot 类型为 string（非 null）
```

## 注释规范

### JSDoc 注释

用于公共 API 和复杂逻辑：

```typescript
/**
 * 验证并规范化项目根目录路径
 * @param inputPath 用户输入的路径
 * @param basePath 基准路径，用于解析相对路径
 * @returns 规范化后的绝对路径
 * @throws TanmiError 如果路径不安全或不存在
 */
export function validateProjectRoot(
  inputPath: string,
  basePath: string = process.cwd()
): string { }
```

### 行内注释

简短说明，避免冗余：

```typescript
// 检查隔离标记，截断上下文链
if (nodeMeta.isolate) break;

// Phase 3: 节点分裂与更新
case "node_split":
```
