<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface VersionInfo {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
}

const versionInfo = ref<VersionInfo | null>(null)
const dismissed = ref(false)
const loading = ref(true)

// 检查本地存储是否已关闭过此版本的通知
const DISMISS_KEY = 'tanmi-version-dismissed'

function isDismissed(version: string): boolean {
  const dismissedVersion = localStorage.getItem(DISMISS_KEY)
  return dismissedVersion === version
}

function dismiss() {
  if (versionInfo.value?.latestVersion) {
    localStorage.setItem(DISMISS_KEY, versionInfo.value.latestVersion)
  }
  dismissed.value = true
}

async function checkVersion() {
  try {
    const response = await fetch('/api/version')
    if (response.ok) {
      const data = await response.json()
      versionInfo.value = data
      // 检查是否已关闭过此版本的通知
      if (data.latestVersion && isDismissed(data.latestVersion)) {
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
        <a
          href="https://www.npmjs.com/package/tanmi-workspace"
          target="_blank"
          class="update-link"
        >
          查看更新
        </a>
        <button class="dismiss-btn" @click="dismiss" title="关闭">
          ✕
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
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

.update-link {
  color: #fff;
  text-decoration: underline;
  font-weight: 500;
  white-space: nowrap;
  transition: color 0.15s ease;
}

.update-link:hover {
  color: var(--accent-orange);
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

/* 深色模式 - 白底黑字 */
[data-theme="dark"] .version-notification {
  background: var(--border-heavy);
  color: #111;
}

[data-theme="dark"] .version-info {
  background: rgba(0, 0, 0, 0.15);
}

[data-theme="dark"] .update-link {
  color: #111;
}

[data-theme="dark"] .dismiss-btn {
  color: #111;
}
</style>
