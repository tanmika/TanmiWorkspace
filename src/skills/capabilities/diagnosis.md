---
id: diagnosis
name: 诊断分析
description: 溯源定位问题根因，适用于逻辑错误和性能瓶颈的诊断
type: collection
acceptanceCriteria:
  - when: 完成根因定位
    then: 明确问题的根本原因和触发路径
  - when: 输出诊断报告
    then: 包含复现路径、因果链分析、根因定位结果
---

# 诊断分析 (Diagnosis)

**核心思维**: 溯源 (Trace)

**适用场景**:
- **Debug**: 诊断逻辑错误（为什么报错）
- **Optimize**: 诊断性能瓶颈（为什么慢）

## 执行步骤 (SOP)

### 1. 复现/定位

#### Debug 场景
- 收集错误信息（错误消息、堆栈跟踪、错误码）
- 确认复现步骤（必现/偶现、触发条件）
- **定位到代码行**: 找到报错堆栈对应的代码位置

#### Optimize 场景
- 收集性能数据（响应时间、吞吐量、资源使用率）
- 识别慢的操作（API 响应、数据库查询、计算密集任务）
- **定位到瓶颈点**: 找到耗时最长的函数调用或 SQL 语句

### 2. 因果链分析

使用 AST 分析或代码追踪，建立调用链路：

```
入口函数
  ↓ 调用
中间函数 A
  ↓ 调用
中间函数 B
  ↓ 调用
问题函数 ← 定位点
  ↓ 追溯
数据来源/逻辑缺陷 ← 根因
```

**关键问题**:
- **Debug**: 这个值是怎么来的？为什么会触发异常？
- **Optimize**: 这个操作为什么慢？是否有 N+1 查询？是否有不必要的计算？

### 3. 提出假设

基于因果链分析，提出根因假设：

**Debug 示例**:
- "空值来自用户输入未校验"
- "类型转换失败因为数据格式不匹配"
- "资源未释放因为异常处理缺少 finally 块"

**Optimize 示例**:
- "N+1 查询导致数据库请求过多"
- "未使用索引导致全表扫描"
- "同步 I/O 阻塞主线程"

### 4. 静态验证

阅读相关代码逻辑，验证假设：

- **检查数据流**: 追踪变量从哪里来、如何传递
- **检查控制流**: 什么条件下会走到问题路径
- **检查边界条件**: 是否处理了异常情况
- **检查资源管理**: 是否正确打开/关闭资源

## 检查清单

### Debug 场景

#### 错误信息收集
- [ ] **错误消息**: 完整错误文本
- [ ] **堆栈跟踪**: 完整调用栈
- [ ] **错误码**: 错误代码（如有）
- [ ] **发生时间**: 何时开始出现

#### 复现信息
- [ ] **复现步骤**: 如何触发错误
- [ ] **复现概率**: 必现/偶现
- [ ] **触发条件**: 特定数据/环境
- [ ] **最小复现**: 最简单复现方式

#### 环境信息
- [ ] **运行环境**: 操作系统、版本
- [ ] **软件版本**: 语言、框架版本
- [ ] **依赖版本**: 相关依赖版本
- [ ] **配置信息**: 相关配置项

#### 根因分析
- [ ] **调用链路**: 从入口到问题点的完整路径
- [ ] **数据来源**: 问题数据从哪里来
- [ ] **逻辑缺陷**: 具体哪个判断/操作有问题
- [ ] **根本原因**: 为什么会有这个缺陷

### Optimize 场景

#### 性能数据收集
- [ ] **慢操作识别**: 哪些操作耗时长
- [ ] **响应时间**: 平均响应时间、P95/P99
- [ ] **资源使用**: CPU、内存、I/O 占用
- [ ] **并发数据**: QPS、并发数

#### 瓶颈定位
- [ ] **热点函数**: 耗时最多的函数
- [ ] **慢查询**: 耗时最长的 SQL
- [ ] **I/O 操作**: 文件/网络 I/O 频率
- [ ] **锁竞争**: 是否有锁等待

#### 根因分析
- [ ] **N+1 查询**: 是否有循环查询
- [ ] **缺少索引**: 是否有全表扫描
- [ ] **低效算法**: 是否有 O(n²) 操作
- [ ] **资源浪费**: 是否有不必要的计算/I/O

## 输出模板

### Debug 场景输出

```markdown
## 问题概要
**问题标题**: [简短描述]
**严重程度**: P0（紧急）/ P1（重要）/ P2（一般）
**影响范围**: [功能、用户]
**发现时间**: [时间]

## 错误现象

### 错误信息
```
[完整错误消息]
```

### 堆栈跟踪
```
[完整堆栈]
```

### 复现步骤
1. [步骤1]
2. [步骤2]
3. [步骤3]
4. **预期结果**: [应该怎样]
5. **实际结果**: [实际怎样]

## 根因定位

### 调用链路
```
入口: src/api/handler.ts:45 handleRequest()
  ↓
中间: src/services/UserService.ts:89 getUserData()
  ↓
问题点: src/database/query.ts:123 executeQuery()
  ↓
根因: 未检查参数为 null，直接传入 SQL 导致异常
```

### 问题代码
**文件位置**: `src/database/query.ts:123`

```typescript
// 问题代码
function executeQuery(userId: string) {
  // 缺少 null 检查
  const sql = `SELECT * FROM users WHERE id = ${userId}`;
  return db.query(sql);
}
```

### 根本原因
参数 `userId` 可能为 `null`，但代码未做校验，直接拼接到 SQL 中导致语法错误。

**数据来源追溯**:
- `userId` 来自请求参数 `req.query.userId`
- 前端未校验，可能传空值
- 后端也未校验，直接使用

## 修复方案
[修复建议，参考原 error_analysis.md 模板]
```

### Optimize 场景输出

```markdown
## 性能问题概要
**问题标题**: [简短描述]
**性能影响**: 响应时间 / 吞吐量下降
**影响范围**: [功能、用户量]

## 性能数据

### 慢操作识别
- **API 响应时间**: 平均 2.5s (目标 < 500ms)
- **数据库查询**: 平均 1.8s
- **业务逻辑**: 平均 0.5s
- **网络 I/O**: 平均 0.2s

### 瓶颈定位
**热点函数**: `src/services/OrderService.ts:156 getOrderList()`
- 执行时间: 1.8s
- 调用频率: 每秒 50 次
- 占总耗时: 72%

## 根因定位

### 调用链路
```
入口: src/api/order.ts:23 listOrders()
  ↓
服务: src/services/OrderService.ts:156 getOrderList()
  ↓
问题点: src/services/OrderService.ts:178 getOrderItems() ← N+1 查询
  ↓
根因: 循环中对每个订单单独查询商品明细
```

### 问题代码
**文件位置**: `src/services/OrderService.ts:178`

```typescript
// 问题代码 - N+1 查询
async function getOrderList(userId: string) {
  const orders = await db.query('SELECT * FROM orders WHERE user_id = ?', [userId]);

  // 对每个订单单独查询 - 导致 N+1 问题
  for (const order of orders) {
    order.items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
  }

  return orders;
}
```

### 根本原因
对每个订单单独查询商品明细，如果有 100 个订单，会执行 101 次数据库查询（1 次查订单 + 100 次查明细）。

**性能影响**:
- 100 个订单 → 101 次查询 → 1.8s
- 数据库往返时间累积

## 修复方案

### 方案一: 使用 JOIN 查询（推荐）
**修复思路**: 一次查询获取所有数据

```typescript
async function getOrderList(userId: string) {
  const result = await db.query(`
    SELECT
      o.*,
      oi.id as item_id,
      oi.product_id,
      oi.quantity
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.user_id = ?
  `, [userId]);

  // 在内存中组装数据
  return groupOrderItems(result);
}
```

**性能提升**: 101 次查询 → 1 次查询，预计从 1.8s 降至 < 200ms

### 方案二: 使用 IN 查询
**修复思路**: 分两次批量查询

```typescript
async function getOrderList(userId: string) {
  const orders = await db.query('SELECT * FROM orders WHERE user_id = ?', [userId]);
  const orderIds = orders.map(o => o.id);

  // 批量查询所有明细
  const items = await db.query('SELECT * FROM order_items WHERE order_id IN (?)', [orderIds]);

  // 在内存中关联
  return mergeOrderItems(orders, items);
}
```

**性能提升**: 101 次查询 → 2 次查询，预计从 1.8s 降至 < 300ms
```

## 诊断技巧

### Debug 技巧

#### 堆栈分析
- 从底向上看堆栈，找到第一个自己代码的位置
- 关注最内层的错误信息
- 检查参数传递路径

#### 二分法定位
- 注释掉部分代码
- 逐步缩小问题范围
- 找到最小复现代码

#### 日志追踪
- 在关键位置打印变量值
- 追踪数据流转过程
- 记录分支执行路径

### Optimize 技巧

#### 性能剖析 (Profiling)
- 使用 profiler 找到热点函数
- 查看函数调用次数和耗时
- 关注 CPU/内存/I/O 占用

#### 数据库分析
- 查看慢查询日志
- 使用 EXPLAIN 分析执行计划
- 检查是否使用索引

#### 网络分析
- 使用 Network 面板查看请求
- 检查请求次数和大小
- 关注串行/并行请求

## 验证规则

### 完整性检查
- [ ] 问题现象描述清晰
- [ ] 复现步骤/性能数据完整
- [ ] 调用链路完整追溯
- [ ] 根因定位到具体代码

### 准确性检查
- [ ] 根因定位准确（通过静态验证）
- [ ] 因果关系清晰
- [ ] 修复方案可行
- [ ] 性能提升预估合理

### 可操作性检查
- [ ] 问题代码位置明确（文件 + 行号）
- [ ] 修复方案具体可执行
- [ ] 有代码示例
- [ ] 有验证方法

## 完成标准

- 根本原因已定位到具体代码
- 调用链路/数据流追溯完整
- 修复方案已明确
- 诊断报告已输出
- （Debug）逻辑缺陷已解释清楚
- （Optimize）性能瓶颈已量化分析
