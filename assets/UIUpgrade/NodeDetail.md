# NodeDetail 节点详情面板 - UI 升级对照表

设计稿：
- `UiDesign/Final/elements-detail.html` - 元素设计
- `UiDesign/Final/node-detail.html` - 完整布局

---

## 面板容器

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| el-card | 自定义面板 | `.panel-section` |
| el-card header | 面板头部 | `.panel-header` + `.panel-title` |
| el-card body | 面板主体 | `.panel-body` |

面板样式：
```css
.panel-section {
    background: var(--card-bg);
    border: 2px solid var(--border-heavy);
    box-shadow: 4px 4px 0 rgba(0,0,0,0.1);
}
.panel-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
}
.panel-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.panel-title::before {
    content: '';
    width: 3px;
    height: 14px;
    background: var(--accent-red);
}
```

---

## 日志区块

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| el-timeline | 日志列表 | `.log-container` |
| timeline-item | 日志项 | `.log-item` |
| el-tag operator | 操作者标签 | `.log-operator` |

日志样式：
```css
.log-container {
    background: #fafafa;
    border-left: 4px solid var(--border-heavy);
    max-height: 300px;
    overflow-y: auto;
}
.log-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid #eee;
}
.log-time {
    font-family: monospace;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
}
.log-operator {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    text-transform: uppercase;
}
.log-operator.ai { background: #111; color: #fff; }
.log-operator.usr { background: #22c55e; color: #fff; }
.log-operator.sys { background: #999; color: #fff; }
.log-content { flex: 1; font-size: 13px; }
.log-content.success { color: #22c55e; }
.log-content.error { color: var(--accent-red); }
```

---

## 结论区块

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| div + Markdown | 结论框 | `.conclusion-box` |

样式：
```css
.conclusion-box {
    background: #fafafa;
    border-left: 4px solid var(--border-heavy);
    padding: 16px;
    font-size: 13px;
    line-height: 1.6;
}
```

---

## 问题区块

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| el-alert warning | 问题框 | `.problem-box` |

样式：
```css
.problem-box {
    background: #fffbeb;
    border: 1px solid #f59e0b;
    padding: 16px;
}
.problem-title {
    font-size: 11px;
    font-weight: 700;
    color: #b45309;
    text-transform: uppercase;
    margin-bottom: 8px;
}
```

---

## 需求描述区块

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| MarkdownContent | 备注框 | `.note-box` |

样式：
```css
.note-box {
    background: #fafafa;
    border-left: 4px solid #999;
    padding: 16px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);
}
```

---

## 文档引用列表

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| ul 列表 | 文档列表 | `.docs-list` |

样式：
```css
.docs-list {
    background: #fafafa;
    border-left: 4px solid var(--accent-blue);
}
.docs-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid #eee;
}
.docs-path {
    font-family: monospace;
    font-size: 12px;
    color: var(--accent-blue);
}
.docs-desc {
    font-size: 12px;
    color: var(--text-muted);
}
.docs-expired {
    font-size: 10px;
    color: var(--accent-red);
    background: #fff5f5;
    padding: 2px 6px;
}
```

---

## 子节点结论 (规划节点专用)

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| 子节点卡片列表 | 结论卡片 | `.child-conclusions` |

样式：
```css
.child-conclusions {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.child-conclusion-item {
    background: #fafafa;
    border-left: 4px solid #999;
    padding: 12px 16px;
}
.child-conclusion-title {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 4px;
}
.child-conclusion-content {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
}
```

---

## 状态转换按钮

按状态显示不同按钮组：

| 当前状态 | 按钮 | 样式 |
|----------|------|------|
| pending | 开始执行 | `.btn-action.primary` |
| implementing | 提交验证 / 直接完成 / 标记失败 | `.warning` / `.success` / `.danger` |
| validating | 验证通过 / 验证失败 | `.success` / `.danger` |
| completed | 重新激活 | `.btn-action` |
| failed | 重新执行 | `.btn-action.primary` |

附加操作：
- 设为焦点：`.btn-action`
- 删除节点：`.btn-action.danger`

---

## 完整布局结构

设计稿：`node-detail.html`

### 执行节点布局

```
┌─────────────────────────────────────────────────┐
│ .detail-header                                  │
│ [图标] 状态 · 标题                    [角色]    │
│ ID: node_xxx                                    │
├─────────────────────────────────────────────────┤
│ .detail-section: Requirement / 需求描述         │
│ ┌─────────────────────────────────────────────┐ │
│ │ .note-box                                   │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ .detail-section: References / 文档引用          │
│ ┌─────────────────────────────────────────────┐ │
│ │ .docs-list                                  │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ .detail-section: Problem / 当前问题 (可选)      │
│ ┌─────────────────────────────────────────────┐ │
│ │ .problem-box                                │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ .detail-section: Conclusion / 结论 (可选)       │
│ ┌─────────────────────────────────────────────┐ │
│ │ .conclusion-box                             │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ .detail-section: Log / 执行日志                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ .log-container                              │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ .action-bar                                     │
│ [提交验证] [直接完成] [标记失败]    [设为焦点]  │
└─────────────────────────────────────────────────┘
```

### 规划节点布局

与执行节点类似，但：
- 使用菱形图标 `.node-plan`
- 显示子节点结论 `.child-conclusions` 替代执行结论
- 状态按钮不同（规划相关）

### 面板容器

| CSS 类 | 说明 |
|--------|------|
| `.node-detail-panel` | 面板容器，max-width: 700px |
| `.detail-header` | 头部区，padding: 20px |
| `.detail-section` | 内容区块，padding: 16px 20px |
| `.action-bar` | 操作按钮区，背景: #fafafa |
