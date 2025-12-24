# UI 升级对照表汇总

设计稿目录：`UiDesign/Final/`

---

## 已完成模块

| 模块 | 文件 | 设计稿来源 |
|------|------|-----------|
| 首页 | HomeView.md | main-page.html |
| 任务树 | NodeTree.md | elements-detail.html |
| 工作区详情页 | WorkspaceView.md | elements-detail.html, detail-page-supplement.html |
| 全局组件 | GlobalComponents.md | main-page.html, global-components.html |
| 节点详情面板 | NodeDetail.md | elements-detail.html, node-detail.html |
| 404 页面 | NotFoundView.md | not-found.html |

**全部模块完成！**

---

## 样式变量

```css
/* 浅色模式 */
:root {
    --bg-color: #f0f2f5;
    --card-bg: #ffffff;
    --text-main: #111;
    --text-secondary: #666;
    --text-muted: #999;
    --accent-red: #D92B2B;
    --accent-blue: #3b82f6;
    --border-color: #e0e0e0;
    --border-heavy: #111;
    --mono-font: 'JetBrains Mono', monospace;
}

/* 深色模式 */
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
