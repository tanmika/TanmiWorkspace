# 全局组件 - UI 升级对照表

设计稿：
- `UiDesign/Final/main-page.html` - SettingsModal
- `UiDesign/Final/global-components.html` - 其他全局组件

---

## SettingsModal - 全局设置

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| el-dialog | 自定义 Modal | `.modal-overlay .modal` |
| el-radio-group | 卡片式 Radio | `.radio-group .radio-card` |
| el-alert 警告 | 警告区块 | `.warning-block` |
| 版本网格 | 技术规格 | `.tech-spec .spec-item` |

### Radio 卡片样式

```css
.radio-card {
    border: 1px solid var(--border-color);
    padding: 16px;
    cursor: pointer;
}
.radio-card.selected {
    border-color: var(--border-heavy);
    background: #fafafa;
}
.radio-card-title {
    font-weight: 600;
}
.radio-card-desc {
    font-size: 13px;
    color: var(--text-muted);
}
```

### 警告区块样式

```css
.warning-block {
    background: #fffbeb;
    border: 1px solid #f59e0b;
    padding: 16px;
}
.warning-title {
    font-weight: 700;
    color: #b45309;
}
.warning-list {
    color: #92400e;
}
.code-tag {
    background: rgba(0,0,0,0.08);
    padding: 2px 6px;
    font-family: monospace;
}
```

### 技术规格样式

```css
.tech-spec {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    background: var(--path-bg);
    padding: 16px;
}
.spec-item label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
}
.spec-value {
    font-family: monospace;
    font-weight: 600;
}
```

---

## ServiceUnavailable - 服务不可用

设计稿：`global-components.html` Section 1

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| 全屏容器 | 浮层 | `.service-unavailable-overlay` |
| 内容区 | 居中卡片 | `.service-unavailable-content` |
| 警告图标 | 方形边框 + 感叹号 | `.warning-icon` |
| 方法区 | 灰底块 | `.method-block` |
| 命令块 | 深色代码块 | `.command-block` |

样式特点：
- 背景：`rgba(255, 255, 255, 0.98)`
- 警告图标：64px 橙色方框
- 命令块：深色背景 `#1e1e1e`，左侧 4px 橙色边框
- 动画：fadeIn 0.3s

---

## VersionUpdateNotification - 版本更新通知

设计稿：`global-components.html` Section 2

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| 通知条 | 顶部固定栏 | `.version-notification` |
| NEW 标签 | 红底标签 | `.version-tag` |
| 版本号 | 半透明背景 | `.version-badge` |
| 链接 | 下划线链接 | `.version-link` |
| 关闭按钮 | 透明按钮 | `.version-close` |

样式特点：
- 高度：44px
- 背景：黑色 `var(--border-heavy)`
- 文字：白色
- 动画：slideDown 0.3s

---

## ManualOperationToast - 手动操作感知

设计稿：`global-components.html` Section 3

| 当前实现 | 替换为 | CSS 类 |
|----------|--------|--------|
| Toast 容器 | 右下角固定 | `.toast-container` |
| 卡片 | 带边框卡片 | `.toast` |
| 头部 | 标题 + 关闭 | `.toast-header` |
| 标签 | 蓝底标签 | `.toast-badge` |
| 内容 | 描述文字 | `.toast-body` |

样式特点：
- 位置：右下角 20px
- 左边框：6px 蓝色 `var(--accent-blue)`
- 阴影：`8px 8px 0 rgba(0, 0, 0, 0.1)`
- 动画：slideUp 0.3s
- 自动关闭：5秒
