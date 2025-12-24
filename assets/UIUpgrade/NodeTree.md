# NodeTree 任务树 - UI 升级对照表

设计稿：`UiDesign/Final/elements-detail.html` Section 5, 8, 9

---

## 列表视图 (NodeTree)

### 节点项组合

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| el-tree node | 自定义节点项 | `.tree-node-item` |
| StatusIcon emoji | 节点图标 | `.node-exec` / `.node-plan` |
| 派发状态 pill | 派发徽章 | `.dispatch-badge` |

节点项结构：
```html
<div class="tree-node-item [selected]">
    <!-- 带聚焦时 -->
    <div class="focus-wrapper">
        <div class="node-exec implementing"></div>
        <div class="focus-crosshair"><span></span></div>
    </div>
    <!-- 或无聚焦时 -->
    <div class="node-exec completed"></div>

    <span class="node-title">节点标题</span>
    <span class="dispatch-badge run">RUN</span>
</div>
```

样式：
```css
.tree-node-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.15s;
}
.tree-node-item:hover {
    background: #f5f5f5;
}
.tree-node-item.selected {
    background: #f0f0f0;
}
.node-title {
    flex: 1;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
```

---

### 树形连线 (曼哈顿连线)

| 当前实现 | 替换为 |
|----------|--------|
| el-tree 默认缩进 | 垂直线 + 水平线连接 |

连线实现：
```css
/* 子树容器 */
.tree-children {
    margin-left: 11px;
    border-left: 2px solid #999;
    padding-left: 20px;
}

/* 子节点水平连线 */
.tree-node-item::before {
    content: '';
    position: absolute;
    left: -22px;
    top: 50%;
    width: 22px;
    height: 2px;
    background: #999;
}

/* 选中路径加粗变黑 */
.tree-children.active-path {
    border-left-color: #111;
}
.tree-node-item.active-path::before {
    background: #111;
}
```

---

## 画布视图 (NodeTreeGraph)

### 技术方案

| 当前实现 | 替换为 |
|----------|--------|
| ECharts tree 图 | Vue Flow 或 AntV G6 |

连线类型：`smoothstep` 或 `step` (正交折线)

### 连线样式

| 状态 | 颜色 | 宽度 |
|------|------|------|
| 默认 | `#999` | 1.5px |
| 选中路径 | `#111` | 2px |

### 节点渲染

使用自定义节点组件，复用 `.node-exec` / `.node-plan` 图标样式。

节点标签：
```css
.canvas-node-label {
    font-size: 10px;
    background: #f0f0f0;
    padding: 2px 6px;
    color: #666;
}
.canvas-node-label.active {
    color: #111;
    font-weight: 600;
}
```

---

## 视图切换按钮

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| el-radio-button | 按钮组 | `.view-toggle` |

样式：
```css
.view-toggle {
    display: inline-flex;
}
.view-toggle .ws-btn {
    border-radius: 0;
}
.view-toggle .ws-btn:first-child {
    border-right: none;
}
.view-toggle .ws-btn.active {
    background: var(--border-heavy);
    color: #fff;
}
```

图标：
- 列表视图：`☰`
- 画布视图：`◇`
