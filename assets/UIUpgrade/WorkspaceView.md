# 工作区详情页 (WorkspaceView) - UI 升级对照表

设计稿：
- `UiDesign/Final/elements-detail.html` - 元素设计
- `UiDesign/Final/detail-page-supplement.html` - 布局与对话框

---

## 节点图标替换

### 执行节点 (方形 20x20)

| 状态 | 当前 | 替换为 | CSS 类 |
|------|------|--------|--------|
| pending | emoji ⏳ | 空心黑框 | `.node-exec.pending` |
| implementing | emoji 🔧 | 蓝白斜纹 | `.node-exec.implementing` |
| validating | emoji 🔍 | 橙色+白点 | `.node-exec.validating` |
| completed | emoji ✅ | 实心黑块 | `.node-exec.completed` |
| failed | emoji ❌ | 红底白X | `.node-exec.failed` |

### 规划节点 (菱形 16x16, rotate 45deg)

| 状态 | 当前 | 替换为 | CSS 类 |
|------|------|--------|--------|
| pending | emoji ⏳ | 空心菱形 | `.node-plan.pending` |
| planning | emoji 📋 | 紫色横纹 | `.node-plan.planning` |
| monitoring | emoji 👁️ | 蓝框+中心点 | `.node-plan.monitoring` |
| completed | emoji ✅ | 实心黑菱形 | `.node-plan.completed` |
| cancelled | emoji 🚫 | 灰色虚线 | `.node-plan.cancelled` |

---

## 聚焦状态 (准星)

| 节点类型 | CSS 类 |
|----------|--------|
| 执行节点 | `.focus-wrapper` + `.focus-crosshair` |
| 规划节点 | `.focus-wrapper-diamond` + `.focus-diamond` |

颜色：`--accent-red: #D92B2B`

---

## 派发徽章替换

| 状态 | 当前 | 替换为 | CSS 类 |
|------|------|--------|--------|
| pending | 圆角pill | `WAIT` 灰底 | `.dispatch-badge.wait` |
| executing | 圆角pill | `RUN_` 蓝底+闪烁光标 | `.dispatch-badge.run` |
| testing | 圆角pill | `TEST` 橙底 | `.dispatch-badge.test` |
| passed | 圆角pill | `PASS` 黑底 | `.dispatch-badge.pass` |
| failed | 圆角pill | `FAIL` 红底 | `.dispatch-badge.fail` |

样式：`font-family: monospace; font-size: 10px; text-transform: uppercase`

---

## 角色标签替换

| 角色 | 当前 | 替换为 | CSS 类 |
|------|------|--------|--------|
| info_collection | emoji + el-tag | `INFO` 橙底 | `.role-badge.info-collection` |
| validation | emoji + el-tag | `VALID` 绿底 | `.role-badge.validation` |
| summary | emoji + el-tag | `SUMM` 灰底 | `.role-badge.summary` |

---

## 隔离状态标签

| 当前 | 替换为 | CSS 类 |
|------|--------|--------|
| el-tag "已隔离" | `ISOLATED` 橙底虚线边框 | `.isolate-tag` |

---

## 详情面板区块

| 区块 | CSS 类 | 说明 |
|------|--------|------|
| 面板容器 | `.panel-section` | 2px 黑边框 + 阴影 |
| 面板头部 | `.panel-header` + `.panel-title` | 红色竖条装饰 |
| 日志区块 | `.log-container` | 左侧 4px 黑边框 |
| 结论区块 | `.conclusion-box` | 左侧 4px 黑边框 |
| 问题区块 | `.problem-box` | 橙色边框 |
| 备注区块 | `.note-box` | 左侧 4px 灰边框 |
| 文档列表 | `.docs-list` | 左侧 4px 蓝边框 |
| 规则列表 | `.rules-list` | 左侧 3px 橙边框 |

---

## 日志操作者标签

| 操作者 | 当前 | 替换为 | CSS 类 |
|--------|------|--------|--------|
| AI | el-tag 蓝色 | `AI` 黑底白字 | `.log-operator.ai` |
| Human | el-tag 绿色 | `USR` 绿底白字 | `.log-operator.usr` |
| system | el-tag 灰色 | `SYS` 灰底白字 | `.log-operator.sys` |

---

## 状态转换按钮

| 类型 | CSS 类 | 说明 |
|------|--------|------|
| 默认 | `.btn-action` | 白底黑边 |
| 主要 | `.btn-action.primary` | 黑底白字，hover 变红 |
| 成功 | `.btn-action.success` | 绿底 |
| 警告 | `.btn-action.warning` | 橙底 |
| 危险 | `.btn-action.danger` | 红底 |

尺寸：`height: 32px; padding: 0 14px; font-size: 12px`

---

## 工作区操作按钮

| 当前 | 替换为 | CSS 类 |
|------|--------|--------|
| el-button circle 返回 | 方形图标按钮 | `.ws-btn` |
| el-button circle 聚焦 | 方形图标按钮 | `.ws-btn` |
| el-button circle 刷新 | 方形图标按钮 | `.ws-btn` |
| el-button circle 信息栏 | 带文字按钮 | `.info-toggle` |
| 视图切换 radio | 按钮组 | `.view-toggle .ws-btn` |

---

## 树形连线

| 视图 | 当前 | 替换为 |
|------|------|--------|
| 列表视图 | el-tree 默认 | 曼哈顿连线 (垂直+水平) |
| 画布视图 | ECharts 曲线 | 正交折线 (step/smoothstep) |

连线样式：
- 默认：`#999, 1.5px`
- 选中路径：`#111, 2px` (加粗变黑)

---

## 创建节点对话框

| 当前 | 替换为 | CSS 类 |
|------|--------|--------|
| el-dialog | 自定义 Modal | `.modal-dialog` |
| el-radio-group 类型选择 | 自定义 Radio | `.radio-group .radio-option` |
| el-input | 自定义输入框 | `.form-input` |
| el-input textarea | 自定义文本域 | `.form-textarea` |

类型标签颜色：
- 执行节点：`.radio-label.exec` 蓝色
- 规划节点：`.radio-label.plan` 紫色

---

## 页面整体布局

设计稿：`detail-page-supplement.html` Section 1

```
┌─────────────────────────────────────────────────┐
│ .layout-header (56px)                           │
│ [返回] 工作区名称 [i]      [FOCUS] [SYNC] [+NEW]│
├─────────────────────────────────────────────────┤
│ .layout-infobar (可折叠)                        │
│ 目标 | 进度 | 派发状态 | 引用 | [DETAILS]       │
├─────────────┬───────────────────────────────────┤
│ .layout-    │ .layout-content                   │
│ sidebar     │                                   │
│ (260px)     │ NodeDetail 区域                   │
│             │                                   │
└─────────────┴───────────────────────────────────┘
```

---

## 信息栏组件

| 元素 | CSS 类 | 说明 |
|------|--------|------|
| 容器 | `.layout-infobar` | 灰底，gap: 40px |
| 标签 | `.info-label` | 10px 大写灰色 |
| 值 | `.info-value` | 13px 黑色 |
| 进度条 | `.progress-track` + `.progress-fill` | 黑色填充 |
| 派发状态 | `.badge-status.disabled/enabled/git` | 灰/绿/橙 |

---

## 工作区详情抽屉

设计稿：`detail-page-supplement.html` Section 2

| 元素 | CSS 类 | 说明 |
|------|--------|------|
| 遮罩 | `.drawer-overlay` | 半透明黑 |
| 面板 | `.drawer-panel` | 450px 宽，左侧粗边框 |
| 头部 | `.modal-header` | 灰底 |
| 内容 | `.modal-body` | 包含目标、规则、日志 |

---

## 派发对话框

设计稿：`detail-page-supplement.html` Section 3

### 启用派发 (Enable)

| 元素 | CSS 类 |
|------|--------|
| 选项卡 | `.card-option` / `.card-option.selected` |
| 标题 | `.card-option-title` |
| 描述 | `.card-option-desc` |
| 实验标签 | `.tag.fill-orange` |

### 切换模式 (Switch)

| 元素 | CSS 类 |
|------|--------|
| 警告框 | `.warning-box` |
| 模式切换展示 | `.mode-switch-viz` + `.mode-tag` |
| 确认按钮 | 橙色背景 |

### 关闭派发 (Disable)

| 元素 | CSS 类 |
|------|--------|
| 提示框 | 灰底信息块 |
| 合并策略 | `.card-option` 单选 |
| 提交信息 | `textarea.input-box` |
| 复选框 | `.checkbox-custom` |
| 代码块 | `.code-inline` |
