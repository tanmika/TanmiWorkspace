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
        <span class="notification-icon">🎉</span>
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  z-index: 9998;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.notification-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 14px;
}

.notification-icon {
  font-size: 16px;
}

.notification-text {
  flex: 0 1 auto;
}

.version-info {
  font-family: 'SF Mono', Consolas, monospace;
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 8px;
}

.update-link {
  color: white;
  text-decoration: underline;
  font-weight: 500;
  white-space: nowrap;
}

.update-link:hover {
  opacity: 0.9;
}

.dismiss-btn {
  background: transparent;
  border: none;
  color: white;
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
</style>
