<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import WsModal from './ui/WsModal.vue'
import { useToastStore } from '@/stores/toast'

interface VersionInfo {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
}

interface DismissState {
  version: string
  dismissCount: number
  lastDismissDate: string
}

const toastStore = useToastStore()
const versionInfo = ref<VersionInfo | null>(null)
const dismissed = ref(false)
const loading = ref(true)
const showModal = ref(false)
const dismissState = ref<DismissState | null>(null)

const DISMISS_KEY = 'tanmi-version-dismiss-state'
const MAX_DISMISS_COUNT = 3

// 获取今天日期字符串
function getToday(): string {
  return new Date().toISOString().split('T')[0] ?? ''
}

// 读取关闭状态
function loadDismissState(): DismissState | null {
  try {
    const data = localStorage.getItem(DISMISS_KEY)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

// 保存关闭状态
function saveDismissState(state: DismissState) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify(state))
  dismissState.value = state
}

// 检查是否应该隐藏通知
function shouldHide(version: string): boolean {
  const state = loadDismissState()
  dismissState.value = state

  // 不同版本，重置状态
  if (!state || state.version !== version) {
    return false
  }

  // 已关闭3次，永不显示
  if (state.dismissCount >= MAX_DISMISS_COUNT) {
    return true
  }

  // 今天已关闭，不显示
  if (state.lastDismissDate === getToday()) {
    return true
  }

  return false
}

// 计算当前是第几次关闭（1-3）
const currentDismissNumber = computed(() => {
  const count = dismissState.value?.dismissCount ?? 0
  return count + 1
})

// 计算关闭按钮文案
const dismissButtonText = computed(() => {
  if (currentDismissNumber.value >= MAX_DISMISS_COUNT) {
    return '本版本不再提示'
  }
  return '今日不再提示'
})

// 关闭通知
function dismiss() {
  const version = versionInfo.value?.latestVersion
  if (!version) return

  const state = dismissState.value
  const newState: DismissState = {
    version,
    dismissCount: (state?.version === version ? state.dismissCount : 0) + 1,
    lastDismissDate: getToday()
  }

  saveDismissState(newState)
  dismissed.value = true

  // 显示提示
  if (newState.dismissCount >= MAX_DISMISS_COUNT) {
    toastStore.info('本版本不再提示')
  } else {
    toastStore.info('今日不再提示')
  }
}

function openModal() {
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function copyCommand() {
  const command = 'npm update -g tanmi-workspace'
  try {
    await navigator.clipboard.writeText(command)
    toastStore.success('已复制到剪贴板')
  } catch {
    toastStore.error('复制失败')
  }
}

function openNpm() {
  window.open('https://www.npmjs.com/package/tanmi-workspace', '_blank')
}

async function checkVersion() {
  try {
    const response = await fetch('/api/version')
    if (response.ok) {
      const data = await response.json()
      versionInfo.value = data
      // 检查是否应该隐藏
      if (data.latestVersion && shouldHide(data.latestVersion)) {
        dismissed.value = true
      }
    }
  } catch {
    // 静默处理错误
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  checkVersion()
})
</script>

<template>
  <!-- 顶部通知栏 -->
  <Transition name="slide-down">
    <div
      v-if="!loading && versionInfo?.updateAvailable && !dismissed"
      class="version-notification"
    >
      <div class="notification-content">
        <span class="version-tag">NEW</span>
        <span class="notification-text">
          TanmiWorkspace 有新版本可用！
          <span class="version-info">
            {{ versionInfo.currentVersion }} → {{ versionInfo.latestVersion }}
          </span>
        </span>
        <button class="view-btn" @click="openModal">
          查看
        </button>
        <button class="dismiss-btn" @click="dismiss" :title="dismissButtonText">
          ✕
        </button>
      </div>
    </div>
  </Transition>

  <!-- 更新弹窗 -->
  <WsModal v-model="showModal" title="VERSION UPDATE" width="480px">
    <div class="update-modal-content">
      <!-- 版本变化 -->
      <div class="version-change">
        <span class="version-number old">{{ versionInfo?.currentVersion }}</span>
        <span class="version-arrow">→</span>
        <span class="version-number new">{{ versionInfo?.latestVersion }}</span>
      </div>

      <!-- 更新方式 -->
      <div class="update-section">
        <h3 class="section-title">更新方式</h3>
        <p class="section-desc">在终端中运行以下命令：</p>

        <div class="command-box" @click="copyCommand" title="点击复制">
          <code class="command-text">npm update -g tanmi-workspace</code>
          <span class="copy-hint">COPY</span>
        </div>
      </div>

      <!-- 提示 -->
      <div class="tip-box">
        <span class="tip-label">TIP</span>
        <span class="tip-text">更新后需重启 AI 工具使新版本生效</span>
      </div>
    </div>

    <template #footer>
      <button class="btn-secondary" @click="openNpm">查看 NPM</button>
      <button class="btn-primary" @click="closeModal">关闭</button>
    </template>
  </WsModal>
</template>

<style scoped>
/* 顶部通知栏 */
.version-notification {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 44px;
  background: var(--border-heavy);
  color: #fff;
  z-index: 9998;
}

.notification-content {
  max-width: 1200px;
  height: 100%;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 14px;
}

.version-tag {
  font-family: var(--mono-font);
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  background: var(--accent-red);
  text-transform: uppercase;
}

.notification-text {
  flex: 0 1 auto;
}

.version-info {
  font-family: var(--mono-font);
  background: rgba(255, 255, 255, 0.15);
  padding: 2px 8px;
  margin-left: 8px;
}

.view-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: #fff;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.view-btn:hover {
  background: #fff;
  color: var(--border-heavy);
  border-color: #fff;
}

.dismiss-btn {
  background: transparent;
  border: none;
  color: #fff;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.dismiss-btn:hover {
  opacity: 1;
}

/* 弹窗内容 */
.update-modal-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 版本变化 */
.version-change {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 0;
}

.version-number {
  font-family: var(--mono-font);
  font-size: 28px;
  font-weight: 700;
  color: var(--text-main);
}

.version-number.new {
  color: var(--accent-red);
}

.version-arrow {
  font-size: 20px;
  color: var(--text-muted);
}

/* 更新方式 */
.update-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
  color: var(--text-main);
}

.section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.command-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s ease;
}

.command-box:hover {
  border-color: var(--accent-red);
}

.command-box:hover .command-text {
  color: var(--accent-red);
}

.command-box:hover .copy-hint {
  color: var(--accent-red);
}

.command-text {
  font-family: var(--mono-font);
  font-size: 14px;
  color: var(--text-main);
  transition: color 0.15s ease;
}

.copy-hint {
  font-family: var(--mono-font);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  transition: color 0.15s ease;
}

/* 提示框 */
.tip-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-color);
  border-left: 4px solid var(--accent-red);
}

.tip-label {
  font-family: var(--mono-font);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  background: var(--accent-red);
  color: #fff;
  text-transform: uppercase;
}

.tip-text {
  font-size: 13px;
  color: var(--text-secondary);
}

/* 按钮 */
.btn-primary,
.btn-secondary {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary {
  background: var(--border-heavy);
  border: 2px solid var(--border-heavy);
  color: #fff;
}

.btn-primary:hover {
  background: #000;
  border-color: #000;
}

.btn-secondary {
  background: transparent;
  border: 2px solid var(--border-heavy);
  color: var(--text-main);
}

.btn-secondary:hover {
  background: var(--border-color);
}

/* 动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

/* 深色模式 */
[data-theme="dark"] .version-notification {
  background: var(--border-heavy);
  color: #111;
}

[data-theme="dark"] .version-info {
  background: rgba(0, 0, 0, 0.15);
}

[data-theme="dark"] .view-btn {
  border-color: rgba(0, 0, 0, 0.3);
  color: #111;
}

[data-theme="dark"] .view-btn:hover {
  background: #111;
  color: var(--border-heavy);
  border-color: #111;
}

[data-theme="dark"] .dismiss-btn {
  color: #111;
}

[data-theme="dark"] .btn-primary {
  color: #111;
}

[data-theme="dark"] .btn-primary:hover {
  background: #fff;
  border-color: #fff;
  color: #111;
}
</style>
