# Claude Code 项目记忆

## 环境配置

- **Node.js 版本要求**: 20.x 或更高（前端 Vite 7 需要 Node 20.19+）
- **切换命令**: `nvm use 20`

## 构建命令

- 后端: `npx tsc`
- 前端: `cd web && npm run build`
- 开发服务器: `npm run dev:all` 或分别启动

## 注意事项

- 前端构建前请先确认 Node.js 版本 >= 20.19

## 版本规范

遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

| 版本位 | 变更类型 | 示例 |
|--------|----------|------|
| **x.y.Z (Patch)** | Bug 修复、小功能优化 | 1.4.0 → 1.4.1 |
| **x.Y.z (Minor)** | 新功能引入、较大改进 | 1.4.0 → 1.5.0 |
| **X.y.z (Major)** | 破坏性变更、架构重构 | 1.4.0 → 2.0.0 |

版本变更记录在 [CHANGELOG.md](CHANGELOG.md)。

## Commit 规范

使用中括号前缀格式：

| 前缀 | 说明 | 版本影响 |
|------|------|----------|
| `[Feature]` | 新功能 | Minor |
| `[Fix]` | Bug 修复 | Patch |
| `[Improve]` | 功能优化、性能提升 | Patch |
| `[Refactor]` | 代码重构（不影响功能） | Patch |
| `[Doc]` / `[Docs]` | 文档更新 | - |
| `[Chore]` | 构建、工具、依赖更新 | - |
| `[Breaking]` | 破坏性变更 | Major |

**示例**：
```
[Feature] 添加工作区归档功能
[Fix] 修复日志换行符处理问题
[Doc] 更新 README 安装说明
```

## 发布流程

1. 更新 `CHANGELOG.md` 记录变更
2. 更新 `package.json` 版本号
3. 同步版本说明：`npx tsx scripts/sync-versions.ts`
4. 填写 `docs/version-notes.yaml` 中新版本的 `requirement` 字段
5. 提交：`[Chore] Release vX.Y.Z`
6. 打 tag：`git tag vX.Y.Z`
7. 推送：`git push && git push --tags`

> 注意：`version-notes.yaml` 用于生成版本更新工作区，`requirement` 是简短描述，`conclusion` 自动从 CHANGELOG 提取。
