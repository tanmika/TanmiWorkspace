<script setup lang="ts">
import { computed } from 'vue'
import { useServiceStore } from '@/stores/service'
import { useToastStore } from '@/stores/toast'

const serviceStore = useServiceStore()
const toastStore = useToastStore()

const isVisible = computed(() => serviceStore.versionMismatch)

async function handleRestart() {
  try {
    await navigator.clipboard.writeText('tanmi-workspace webui restart')
    toastStore.success('命令已复制，请在终端执行')
  } catch {
    toastStore.info('请在终端执行: tanmi-workspace webui restart')
  }
}

function handleRefresh() {
  window.location.reload()
}
</script>

<template>
  <Transition name="fade">
    <div v-if="isVisible" class="version-mismatch">
      <div class="container">
        <!-- 警告图标 -->
        <div class="warning-icon"></div>

        <!-- 文案区域 -->
        <h2 class="warning-title">版本不匹配</h2>
        <p class="warning-desc">
          前后端版本不一致，可能导致功能异常或数据损坏，<br>
          请通过以下方式同步版本：
        </p>

        <!-- 版本信息 -->
        <div class="method-block">
          <div class="version-row">
            <span class="version-label">前端版本</span>
            <span class="version-value">{{ serviceStore.frontendVersion }}</span>
          </div>
          <div class="version-row">
            <span class="version-label">后端版本</span>
            <span class="version-value error">{{ serviceStore.backendVersion }}</span>
          </div>
        </div>

        <!-- 解决方式 -->
        <div class="method-block">
          <div class="method-item">
            <div class="method-title">方式一：重启 WebUI 服务</div>
            <div class="command-block" @click="handleRestart">
              <span>tanmi-workspace webui restart</span>
              <span class="copy-hint">CLICK TO COPY</span>
            </div>
          </div>
          <div class="method-item">
            <div class="method-title">方式二：重启 AI 编辑器</div>
            <div class="method-desc">重启 Claude Code / Cursor 以加载新版本 MCP 服务</div>
          </div>
        </div>

        <!-- 按钮 -->
        <button class="btn" @click="handleRefresh">刷新页面</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.version-mismatch {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.98);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.container {
  max-width: 520px;
  width: 100%;
  padding: 40px;
  text-align: center;
}

/* 警告图标 */
.warning-icon {
  width: 64px;
  height: 64px;
  border: 4px solid var(--accent-red, #E53E3E);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
}
.warning-icon::before {
  content: '!';
  font-family: var(--mono-font);
  font-size: 32px;
  font-weight: 900;
  color: var(--accent-red, #E53E3E);
}

/* 标题 */
.warning-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 12px 0;
  letter-spacing: 2px;
  color: var(--text-main);
}

/* 描述 */
.warning-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 32px 0;
  line-height: 1.6;
}

/* 方法块 */
.method-block {
  background: #f5f7fa;
  border: 1px solid var(--border-color);
  padding: 20px;
  text-align: left;
  margin-bottom: 24px;
}

.method-item {
  margin-bottom: 20px;
}
.method-item:last-child {
  margin-bottom: 0;
}

.method-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-main);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.method-title::before {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--border-heavy);
}

.method-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* 版本信息行 */
.version-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 4px 0;
}

.version-label {
  color: var(--text-secondary);
}

.version-value {
  font-family: var(--mono-font);
  font-weight: 600;
  color: var(--text-main);
}

.version-value.error {
  color: var(--accent-red, #E53E3E);
}

/* 命令块 */
.command-block {
  background: #1e1e1e;
  padding: 12px 16px;
  font-family: var(--mono-font);
  font-size: 13px;
  color: #d4d4d4;
  border-left: 4px solid var(--accent-red, #E53E3E);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  cursor: pointer;
}
.command-block .copy-hint {
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
}

/* 按钮 */
.btn {
  height: 36px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 2px solid var(--border-heavy);
  background: var(--border-heavy);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.1s;
}
.btn:hover {
  background: var(--accent-red);
  border-color: var(--accent-red);
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--border-heavy);
}
.btn:active {
  transform: translate(0, 0);
  box-shadow: none;
}

/* 深色模式 */
[data-theme="dark"] .version-mismatch {
  background: rgba(26, 26, 26, 0.98);
}

[data-theme="dark"] .method-block {
  background: #2a2a2a;
}

[data-theme="dark"] .command-block {
  background: #111;
}

[data-theme="dark"] .btn {
  background: var(--border-heavy);
  color: #111;
}
[data-theme="dark"] .btn:hover {
  color: #fff;
  box-shadow: 4px 4px 0 rgba(255, 255, 255, 0.3);
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
