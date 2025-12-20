# Git 安全操作规范

本 skill 定义 AI 在执行 Git 操作时必须遵守的安全原则。

## 核心原则

**所有涉及代码变更的 Git 操作必须由用户明确指示，AI 禁止擅自执行。**

## 禁止擅自执行的操作

| 操作类型 | 具体命令 | 说明 |
|----------|----------|------|
| 拉取代码 | `git pull`, `git fetch` + `git merge` | 可能引入远程变更 |
| 推送代码 | `git push`, `git push --force` | 影响远程仓库 |
| 合并代码 | `git merge`, `git rebase` | 改变提交历史 |
| 同步分支 | 切换分支后自动 pull/merge | 可能覆盖本地工作 |
| 选择合并策略 | sequential/squash/cherry-pick/skip | 影响提交历史 |
| 解决冲突 | 选择保留哪个版本 | 可能丢失代码 |
| 处理本地修改 | stash/commit/discard | 可能丢失未保存工作 |
| 重置提交 | `git reset --hard` | 不可逆操作 |

## 正确做法

### 1. 等待用户明确指示

```
❌ 错误：检测到远程有更新，我来帮你拉取一下
✅ 正确：检测到远程有更新，是否需要拉取？
```

### 2. 使用 AskUserQuestion 询问

遇到以下情况必须询问用户：
- 合并策略选择
- 冲突解决方案
- 本地修改处理方式（stash/commit/discard）
- 是否保留临时分支

### 3. 切换分支后保持原样

```
❌ 错误：git checkout dev && git pull origin dev
✅ 正确：git checkout dev（然后停止，等待用户下一步指示）
```

### 4. 派发模式禁用时

`dispatch_disable` 返回合并选项后：
- **必须**使用 AskUserQuestion 询问用户选择
- **禁止**AI 自行决定 mergeStrategy 参数
- **禁止**AI 自行决定是否保留分支

## 允许自主执行的操作

以下只读操作可以自主执行：
- `git status` - 查看状态
- `git log` - 查看历史
- `git diff` - 查看差异
- `git branch -a` - 列出分支
- `git stash list` - 列出暂存

## 示例场景

### 场景 1：用户说"推送"

```bash
# 用户明确说"推送"，可以执行
git push
```

### 场景 2：切换分支有未提交修改

```
AI: 切换分支前有未提交的修改，如何处理？
选项：
- 暂存 (stash)
- 丢弃修改
- 先提交
```

### 场景 3：禁用派发模式

```
AI: 派发任务完成，请选择合并策略：
选项：
- sequential: 按顺序合并
- squash: 压缩为一个提交
- cherry-pick: 遴选到工作区
- skip: 暂不合并
```

## 违规后果

擅自执行禁止操作可能导致：
- 覆盖用户本地工作
- 推送错误代码到远程
- 破坏提交历史
- 丢失未保存的修改
