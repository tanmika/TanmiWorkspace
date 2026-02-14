# Claude Code 项目记忆

## 环境配置

- **Node.js 版本要求**: 20.x 或更高（前端 Vite 7 需要 Node 20.19+）
- **切换命令**: `nvm use 20`

## 构建命令

- 后端: `npx tsc`
- 前端: `cd web && npm run build`
- 开发服务器: `npm run dev:all` 或分别启动
- **开发测试**: `./scripts/dev-rebuild.sh` (编译前后端 + 重启开发服务)
- **开发环境 setup**: `./scripts/dev-setup.sh` (自动设置 TANMI_DEV=true)

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

### 使用发布脚本（推荐）

```bash
./scripts/release.sh patch   # 补丁版本 (bug 修复)
./scripts/release.sh minor   # 次版本 (新功能)
./scripts/release.sh major   # 主版本 (破坏性变更)
```

脚本会自动执行：编译后端 → 编译前端 → 更新版本 → 同步说明 → 提交 → 发布 npm

### 手动发布流程

1. 编译后端：`npx tsc`
2. 编译前端：`cd web && npm run build`
3. 更新 `CHANGELOG.md` 记录变更
4. 更新 `package.json` 版本号
5. 同步版本说明：`npx tsx scripts/sync-versions.ts`
6. 编辑 `config/version-notes.yaml`：填写 `requirement`，精简 `conclusion`（去掉技术细节和用户看不懂的内容）
7. 提交：`[Chore] Release vX.Y.Z`
8. 打 tag：`git tag vX.Y.Z`
9. 推送：`git push && git push --tags`
10. 发布：`npm publish --registry https://registry.npmjs.org`

> **重要**：前端必须重新编译！否则 npm 包中的前端版本会与后端不匹配。

> 注意：`version-notes.yaml` 用于生成版本更新工作区。`requirement` 是简短描述，`conclusion` 从 CHANGELOG 同步后需人工精简，去掉技术细节和用户看不懂的内容。

## 团队协作模式

主进程**不进行任何代码修改**，所有任务使用 team 推进。

### 角色定义

| 角色 | 职责 |
|------|------|
| **A (designer)** | TDD 流程的测试设计 + 接口设计，产出：测试文件骨架 + 接口类型定义 |
| **B (implementer)** | 内容填充，基于 A 的接口和测试实现具体逻辑 |
| **C (tester)** | 运行测试 + 补充边界用例 + 文档 |
| **D (reviewer)** | 核查实现是否与 PRD 计划结果一致 |

### 流水线规则

1. **小模块推进**：主进程将任务拆分为小模块，每个模块按 A→B→C→D 顺序流转
2. **并发执行**：不同模块可处于不同阶段，所有角色保持忙碌（流水线满载）
3. **阻塞机制**：任何角色发现问题立即阻塞流水线，由主进程与用户确认后恢复
4. **PRD 驱动**：所有实现必须对标 PRD 文档，D 角色负责最终验收
