# 首页 (HomeView) - UI 升级对照表

设计稿：`UiDesign/Final/main-page.html`

---

## 组件替换对照

| 当前实现 | 替换为 | 设计稿位置 |
|----------|--------|-----------|
| `<h1>TanmiWorkspace</h1>` | `.logo` 组件 | `.header .logo` |
| `el-radio-group` 状态过滤 | `.tabs` Tab 导航 | `.filter-bar .tabs` |
| `el-input` 搜索框 | `.search-input` 下划线输入框 | `.filter-bar .search-input` |
| `el-select` 排序选择 | `.custom-select` 自定义下拉 | `.filter-bar .custom-select` |
| `el-button` 排序方向 | `.btn-icon` 图标按钮 | `.filter-bar .btn-icon` |
| `el-card` 工作区卡片 | `.card` 自定义卡片 | `.card-grid .card` |
| `el-tag` 状态标签 | `.badge` 状态徽章 | `.badge-active` / `.badge-archived` / `.badge-error` |
| `el-button (primary)` | `.btn-primary` | `.header-actions .btn-primary` |
| `el-button (default)` | `.btn-secondary` | `.header-actions .btn-secondary` |
| `el-button (text)` 卡片操作 | `.btn-ghost` / `.btn-accent` / `.btn-danger` | `.card-footer` |
| `el-dialog` 弹窗 | `.modal` 自定义弹窗 | `.modal-overlay .modal` |
| `el-empty` 空状态 | `.empty-state` | `.empty-state` |

---

## 新增功能

| 功能 | 设计稿位置 | 说明 |
|------|-----------|------|
| 主题切换 | `.theme-toggle` | 深色/浅色模式切换按钮 |
| Sticky Header | `.header { position: sticky }` | 头部固定 |
| 卡片悬停动效 | `.card:hover` | `translate(-4px,-4px) + box-shadow` |

---

## 样式变量

```css
:root {
    --bg-color: #f0f2f5;
    --card-bg: #ffffff;
    --text-main: #111;
    --text-secondary: #666;
    --text-muted: #999;
    --accent-red: #D92B2B;
    --border-color: #e0e0e0;
    --border-heavy: #111;
    --mono-font: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}
```

---

## 深色模式变量

```css
[data-theme="dark"] {
    --bg-color: #111111;
    --card-bg: #1a1a1a;
    --text-main: #ffffff;
    --text-secondary: #aaa;
    --text-muted: #777;
    --border-color: #333;
    --border-heavy: #fff;
}
```
