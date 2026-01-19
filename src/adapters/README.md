# OutputAdapter 设计模式

## 核心理念

**服务层保持纯净，差异化处理放在边界层。**

```
服务层 (Service)     →  返回纯净数据（无格式化）
    ↓
适配层 (Adapter)     →  根据消费者转换格式
    ↓
边界层 (HTTP/MCP)    →  调用适配器后返回
```

## 适配器类型

| 适配器 | 用途 | 转换策略 |
|--------|------|----------|
| `frontendAdapter` | HTTP/WebUI | 原样返回（identity） |
| `aiAdapter` | MCP/AI | 简化/增强格式 |

## 使用模式

### MCP 层（需要转换）

```typescript
// src/index.ts
case "node_list": {
  const fullResult = await services.node.list(params);
  // AI 适配器：简化输出
  result = aiAdapter.transformNodeList(fullResult);
  break;
}

case "memo_get": {
  const fullResult = await services.memo.get(params);
  // AI 适配器：添加行号
  result = {
    ...fullResult,
    memo: {
      ...fullResult.memo,
      content: addLineNumbers(fullResult.memo.content, lineOffset),
    },
  };
  break;
}
```

### HTTP 层（直接返回）

```typescript
// src/http/routes/memo.ts
fastify.get("/workspaces/:wid/memos/:mid", async (request) => {
  // 直接返回，不经过适配器
  return await memo.get({ workspaceId, memoId });
});
```

## 何时使用适配器

| 场景 | 是否使用 | 原因 |
|------|----------|------|
| MCP 需要简化输出 | ✅ aiAdapter | 减少 token 消耗 |
| MCP 需要增强格式 | ✅ aiAdapter | 如添加行号帮助定位 |
| HTTP 需要完整数据 | ❌ 直接返回 | 前端需要全部信息 |
| 两者行为一致 | ❌ 无需适配 | 服务层直接满足 |

## 添加新转换的步骤

1. **在 OutputAdapter.ts 中添加转换函数**
2. **在 aiAdapter 对象中导出**（如果是 AI 专用）
3. **在 MCP 层调用转换**（src/index.ts）
4. **HTTP 层保持不变**（自动获得原始数据）

## 设计原则

1. **服务层无知**：Service 不知道调用者是 HTTP 还是 MCP
2. **单一职责**：适配器只负责格式转换，不含业务逻辑
3. **显式调用**：MCP 层显式调用适配器，便于追踪
4. **向后兼容**：新增转换不影响现有 HTTP 行为
