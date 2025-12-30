<p align="center">
  <img src="assets/logo.svg" alt="TanmiWorkspace" height="48">
</p>

<h3 align="center">AI 编程任务的结构化管理方案</h3>

<p align="center">
  树形任务结构 · 上下文聚焦 · 过程可追溯
</p>

---

## 这是什么？

TanmiWorkspace 就像是 AI 的项目管理系统。

想象你在和一个能干但健忘的同事合作——他很聪明，但对话一长就忘了早期的决策；任务一复杂就容易跑偏。TanmiWorkspace 就是给这个"同事"配的任务管理工具：把大任务拆成小步骤，每步都记录下来，随时能回顾进度。

| 概念 | 说明 |
|------|------|
| **工作台** | TanmiWorkspace 本身，管理所有工作区 |
| **工作区** | 单个任务的完整记录，包含一棵任务树 |
| **节点** | 任务树中的每个任务单元 |

### 解决什么问题？

| 问题 | 没有工作台时 | 有工作台后 |
|------|-------------|-----------|
| **AI 忘事** | 对话超过 10 轮，AI 忘了开头说的需求 | 所有决策都记录在节点里，随时查阅 |
| **过程黑盒** | 不知道 AI 做了什么、为什么这样做 | WebUI 实时展示任务树和执行日志 |
| **粒度失控** | AI 一次规划太多，执行质量下降 | 强制拆分，一次只做一个任务 |
| **难以继续** | 关掉对话就没了，下次从头来 | 工作区持久化，随时恢复进度 |

---

## 核心特性

- **树形任务结构**：无限层级嵌套，规划节点分解任务，执行节点逐个完成
- **派发上下文控制**：子任务只获取与当前任务相关的信息，隔离无关上下文
- **可视化 WebUI**：直观快捷地查看任务树进度，无需翻聊天记录
- **过程可追溯**：完整操作日志和决策路径，支持回溯复盘
- **5 种任务场景**：新功能 / 调试修复 / 优化重构 / 总结分析 / 其他，自动匹配引导策略
- **边界自由**：不要求统一项目根目录，支持跨仓库、跨目录管理任务

## 快速开始

```bash
# 安装（需要 Node.js >= 20）
npm install -g tanmi-workspace

# 配置（自动检测环境）
tanmi-workspace setup
```

**支持的 AI 助手**：

| AI 助手 | 支持程度 | 说明 |
|---------|---------|------|
| **Claude Code** | 完全支持 | 所有功能可用，推荐使用 |
| **Cursor** | 基础支持 | subagent 和 skill 支持有限 |
| **其他 MCP 兼容助手** | 基础功能 | 支持 MCP 即可使用核心功能 |

配置完成后，在 AI 助手中说：

> "使用**工作台**，帮我实现用户登录功能"

**注意**：必须提及"工作区"或"工作台"才会触发，否则 AI 会直接执行而不创建工作区。

<details>
<summary>其他配置方式</summary>

### 一键配置

```bash
tanmi-workspace setup --claude-code  # Claude Code
tanmi-workspace setup --cursor       # Cursor
```

### 其他平台

运行 `tanmi-workspace setup` 获取配置信息后手动配置。

### WebUI 管理

```bash
tanmi-workspace webui          # 启动 WebUI 服务
tanmi-workspace webui status   # 查看服务状态
tanmi-workspace webui stop     # 停止服务
tanmi-workspace webui restart  # 重启服务
```

</details>

## 使用样例

```
你：用工作台帮我加个登录功能

AI：工作区建好了 → http://localhost:19540/workspace/ws-xxx，核对一下需求：
    登录方式想用哪种？密码、验证码还是第三方？

[用户与AI进行需求核对以及剩余任务开始前需要的信息收集并记录到工作区中]

AI：[展示任务规划]
    共计3个任务：用户表、中间件、登录API，可以开始吗？

你：可以，使用派发模式进行

AI：收到，派发任务1...
    [子agent只拿到"创建用户表和密码验证"这个具体任务，前面讨论的细节不会干扰它]
    任务1完成了，继续派发任务2...

[任务逐个完成，过程记录在工作区日志中，可通过WebUI实时查看]

---（隔了一天，新开对话）---

你：昨天那个登录做到哪了

AI：[从工作区恢复上下文] 3个任务都完成了。还需要改什么吗？

你：再加个验证码登录，进行计划

AI：好，我加个新任务

[继续进任务补充至工作区统一管理]
```

**优势体现**：派发隔离无关上下文、进度持久保存、新对话无缝恢复

更多使用场景，请参阅 **[用户手册](docs/用户手册.md)**。

### 跨仓库任务

传统工具要求统一项目根目录，TanmiWorkspace 不受此限制——按**逻辑层级**管理分散在不同路径的任务：

```
涉及的项目根路径：
  ~/work/mobile/FlutterApp/
  ~/sdk/camera/CameraSDK/
  ~/sdk/decoder/QRDecoder/
  ~/libs/CommonUtils/
```

```
二维码扫描功能                              进度: 13/17
│
├─ 📱 应用层
│   ├── [✓] 扫描页面 UI                    → ~/work/mobile/FlutterApp/
│   ├── [▶] 相机调用封装                   → ~/work/mobile/FlutterApp/
│   ├── [ ] 解码结果处理                   → ~/work/mobile/FlutterApp/
│   └── [ ] 集成测试                       → ~/work/mobile/FlutterApp/
│
├─ 📷 相机 SDK 层
│   ├── [✓] 预览流接口                     → ~/sdk/camera/CameraSDK/
│   ├── [✓] 帧数据回调                     → ~/sdk/camera/CameraSDK/
│   ├── [✓] 权限处理                       → ~/sdk/camera/CameraSDK/
│   └── [✓] 错误恢复                       → ~/sdk/camera/CameraSDK/
│
├─ 🔍 解码器层
│   ├── [✓] 解码引擎封装                   → ~/sdk/decoder/QRDecoder/
│   ├── [✓] 多格式支持                     → ~/sdk/decoder/QRDecoder/
│   ├── [✓] 性能优化                       → ~/sdk/decoder/QRDecoder/
│   └── [✓] 单元测试                       → ~/sdk/decoder/QRDecoder/
│
└─ 🔧 基础库层
    ├── [✓] 日志工具                       → ~/libs/CommonUtils/
    ├── [✓] 错误处理                       → ~/libs/CommonUtils/
    ├── [✓] 配置管理                       → ~/libs/CommonUtils/
    ├── [✓] 类型定义                       → ~/libs/CommonUtils/
    └── [✓] 版本同步                       → ~/libs/CommonUtils/
```

---

## 已知局限

- **长对话下 AI 唤起能力下降**：对话过长时，AI 可能忘记使用工作台，可提醒"用工作台记录一下"
- **派发模式需要 AI 支持 subagent**：Cursor 等部分助手的派发功能受限
- **上下文恢复依赖记录完整性**：暂停前建议让 AI 充分记录当前状态

详见 [用户手册 - 已知局限](docs/用户手册.md#已知局限)。

---

## 更多资源

- **[用户手册](docs/用户手册.md)**：完整使用指南、场景示例、FAQ
- **[更新日志](CHANGELOG.md)**：版本历史和变更记录