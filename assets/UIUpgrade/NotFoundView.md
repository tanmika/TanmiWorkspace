# 404 页面 (NotFoundView) - UI 升级对照表

设计稿：`UiDesign/Final/not-found.html`

---

## 两种可选风格

### Style 1: 构成主义装饰风格

```
          ┌────┐
          │红块│
     ─────┼────┼─────  (红色横线穿过)
          │404 │    □ (空心方框)
          └────┘

      页面未找到
      您访问的页面不存在或已被移除

      [ ← 返回首页 ]
```

| 元素 | CSS 类 | 说明 |
|------|--------|------|
| 容器 | `.not-found-container` | 居中布局 |
| 数字 | `.error-number` | 160px, 等宽字体 |
| 红色块 | `.decor-block-1` | 60x60 红色实心 |
| 空心框 | `.decor-block-2` | 40x40 黑边框 |
| 横线 | `.decor-line` | 4px 红色穿过 |
| 标题 | `.error-title` | 24px 粗体 |
| 描述 | `.error-desc` | 14px 灰色 |
| 按钮 | `.btn-secondary` | 黑边框按钮 |

---

### Style 2: 极简风格

```
        4   ╳   4

      页面未找到
      您访问的页面不存在或已被移除

      [ ← 返回首页 ]
```

| 元素 | CSS 类 | 说明 |
|------|--------|------|
| 容器 | `.not-found-minimal` | 居中布局 |
| 数字区 | `.minimal-code` | flex 布局 |
| 数字 | `.minimal-number` | 120px 等宽 |
| X 图标 | `.minimal-icon` | 80x80 红色边框+X |

---

## 组件替换

| 当前实现 | 替换为 |
|----------|--------|
| el-empty | 自定义 404 页面 |
| el-button | `.btn-secondary` |

---

## 按钮样式

```css
.btn-secondary {
    height: 40px;
    padding: 0 24px;
    font-size: 14px;
    font-weight: 600;
    background: var(--card-bg);
    border: 2px solid var(--border-heavy);
}
.btn-secondary:hover {
    background: var(--border-heavy);
    color: #fff;
}
```
