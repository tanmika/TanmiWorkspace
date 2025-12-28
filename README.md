<p align="center">
  <img src="assets/logo.svg" alt="TanmiWorkspace" height="48">
</p>

<h3 align="center">AI 编程任务的结构化管理方案</h3>

<p align="center">
  树形任务结构 · 上下文聚焦 · 过程可追溯
</p>

---

## 为什么需要 TanmiWorkspace？

AI 编程助手在处理复杂任务时面临三个核心问题：

| 问题 | 表现 | TanmiWorkspace 方案 |
|------|------|---------------------|
| **上下文膨胀** | 任务超过 10 步后，AI 开始遗忘早期决策 | 派发模式：子任务只获取相关上下文 |
| **粒度失控** | AI 一次规划过多，执行质量下降 | 规划/执行分离，逐层细化 |
| **过程黑盒** | 不知道 AI 做了什么、为什么这样做 | 完整日志 + 可视化任务树 |

---

## 核心特性

- **树形任务结构**：无限层级嵌套，规划节点分解任务，执行节点逐个完成
- **派发上下文控制**：子任务只获取与当前任务相关的信息，隔离无关上下文
- **可视化 WebUI**：直观快捷地查看任务树进度，无需翻聊天记录
- **过程可追溯**：完整操作日志和决策路径，支持回溯复盘
- **5 种任务场景**：新功能 / 调试修复 / 优化重构 / 总结分析 / 其他，自动匹配引导策略
- **边界自由**：不要求统一项目根目录，支持跨仓库、跨目录管理任务

## 30 秒上手

```bash
# 安装（需要 Node.js >= 20）
npm install -g tanmi-workspace

# 配置（自动检测环境）
tanmi-workspace setup
```

配置完成后，在 AI 助手中说：

> "使用工作台，帮我实现用户登录功能"

<details>
<summary>其他配置方式</summary>

### 一键配置

```bash
tanmi-workspace setup --claude-code  # Claude Code
tanmi-workspace setup --cursor       # Cursor
```

### 其他平台

运行 `tanmi-workspace setup` 获取配置信息后手动配置。

</details>

## 完整使用流程

| 阶段 | 交互示例 |
|------|----------|
| **1. 创建工作区** | 你：使用工作台，实现用户登录<br>AI：工作区已创建，WebUI 地址：`http://localhost:19540/ws-xxx` |
| **2. 选择能力** | AI：当前是 feature 场景，将执行「意图对齐」「上下文探索」<br>可选：a.技术调研 b.方案设计 c.验证策略<br>你：b |
| **3. 意图对齐** | AI：请确认几个问题：登录方式？需要记住我？失败锁定策略？<br>你：密码登录，要记住我，3次失败锁10分钟 |
| **4. 上下文探索** | AI：扫描项目结构，发现 `src/utils/jwt.ts` 已有 Token 工具类，可复用 |
| **5. 输出验收标准** | AI：**验收标准**：正确凭证→登录成功 / 记住我→7天有效 / 3次失败→锁定10分钟<br>**信心度**：90% |
| **6. 需求变更** | 你：等等，还要支持手机验证码登录<br>AI：已更新需求，变更已记录到日志，验收标准同步更新 |
| **7. 规划任务** | AI：计划 4 个任务节点：①用户表 ②密码登录 ③验证码登录 ④JWT中间件<br>你：把①②合并<br>AI：已调整为 3 个节点 |
| **8. 选择执行模式** | AI：检测到 Git 仓库，是否启用派发模式？派发模式下每个任务由独立 Agent 执行，上下文相互隔离<br>你：用派发 |
| **9. 派发执行** | AI：派发「用户表+密码登录」→ 执行 Agent 接收任务 → 创建文件 → 返回结果<br>继续派发下一个任务... |
| **10. 执行遇阻** | AI：任务「验证码登录」遇到问题：短信服务配置缺失，已记录到问题列表<br>你：先跳过，继续下一个 |
| **11. 问题解决** | 你：短信配置加好了，继续验证码登录<br>AI：检测到配置已添加，重新执行任务，完成 |
| **12. 验证测试** | AI：所有任务完成，运行测试？<br>你：跑一下<br>AI：3 个测试用例通过 |
| **13. 完成归档** | AI：是否归档工作区？<br>你：归档<br>AI：已归档，完整记录保存在 `.tanmi-workspace/`，可随时回溯 |

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