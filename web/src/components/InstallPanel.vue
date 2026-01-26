<script setup lang="ts">
import { ref, computed } from 'vue'
import { settingsApi, type SetupInstallResponse, type PlatformResult, type InstallationStatusResult, type PlatformStatus as APIPlatformStatus } from '@/api/settings'

// 组件状态类型
type InstallState = 'idle' | 'installing' | 'done'

// Props
interface Props {
  installationStatus: InstallationStatusResult | null
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'success'): void
  (e: 'close'): void
}>()

// 平台选择
const selectedPlatforms = ref<Set<string>>(new Set())

// 组件状态
const state = ref<InstallState>('idle')

// 安装结果
const installSuccess = ref(false)
const installResults = ref<PlatformResult[]>([])
const errorMessage = ref('')

// 检查平台是否有过期组件
function hasOutdatedComponent(platform: APIPlatformStatus): boolean {
  const comps = platform.components
  const hooksOrPluginsOutdated = comps.hooks?.outdated || comps.plugins?.outdated || false
  return comps.mcp.outdated || hooksOrPluginsOutdated || comps.agents.outdated || comps.skills.outdated
}

// 获取平台状态类名
function getPlatformStatusClass(platformKey: 'claudeCode' | 'cursor' | 'opencode'): string {
  if (!props.installationStatus) return 'disabled'
  const platform = props.installationStatus.platforms[platformKey]
  if (!platform.enabled) return 'disabled'
  if (hasOutdatedComponent(platform)) return 'outdated'
  return 'installed'
}

// 获取平台状态文本
function getPlatformStatusText(platformKey: 'claudeCode' | 'cursor' | 'opencode'): string {
  if (!props.installationStatus) return 'NOT INSTALLED'
  const platform = props.installationStatus.platforms[platformKey]
  if (!platform.enabled) return 'NOT INSTALLED'
  if (hasOutdatedComponent(platform)) return 'UPDATE'
  return 'INSTALLED'
}

// 平台配置
// id: 用于 API 请求（必须与后端 VALID_PLATFORMS 一致）
// key: 用于访问 installationStatus.platforms
const platforms = [
  { id: 'claude', key: 'claudeCode' as const, name: 'Claude Code', desc: 'Anthropic 官方 CLI 工具' },
  { id: 'cursor', key: 'cursor' as const, name: 'Cursor', desc: 'AI-first 代码编辑器' },
  { id: 'opencode', key: 'opencode' as const, name: 'OpenCode', desc: '开源 AI 编程助手' },
]

// 是否可以安装
const canInstall = computed(() => selectedPlatforms.value.size > 0)

// 切换平台选择
function togglePlatform(id: string) {
  if (state.value !== 'idle') return

  if (selectedPlatforms.value.has(id)) {
    selectedPlatforms.value.delete(id)
  } else {
    selectedPlatforms.value.add(id)
  }
  // 触发响应式更新
  selectedPlatforms.value = new Set(selectedPlatforms.value)
}

// 执行安装
async function handleInstall() {
  if (!canInstall.value || state.value !== 'idle') return

  state.value = 'installing'
  errorMessage.value = ''
  installResults.value = []

  try {
    const platformList = Array.from(selectedPlatforms.value)
    const response: SetupInstallResponse = await settingsApi.install(platformList)

    installResults.value = response.results || []
    installSuccess.value = response.success
    if (!response.success) {
      errorMessage.value = response.error || '安装失败'
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '安装过程发生未知错误'
    installSuccess.value = false
  }

  state.value = 'done'
}

// 确认完成
function handleConfirm() {
  if (installSuccess.value) {
    emit('success')
  }
  emit('close')
  resetState()
}

// 关闭面板
function handleClose() {
  emit('close')
  resetState()
}

// 重置状态
function resetState() {
  state.value = 'idle'
  selectedPlatforms.value = new Set()
  errorMessage.value = ''
  installResults.value = []
  installSuccess.value = false
}

// 复制命令
async function copyCommand() {
  const command = 'tanmi-workspace setup'
  try {
    await navigator.clipboard.writeText(command)
  } catch {
    // 复制失败静默处理
  }
}

</script>

<template>
  <div class="install-panel">
    <!-- 平台选择区 -->
    <div class="platform-selector">
      <div class="selector-label">选择平台</div>
      <div class="platform-options">
        <div
          v-for="platform in platforms"
          :key="platform.id"
          class="platform-option"
          :class="{
            selected: selectedPlatforms.has(platform.id),
            disabled: state !== 'idle'
          }"
          @click="togglePlatform(platform.id)"
        >
          <div class="platform-checkbox" :class="{ checked: selectedPlatforms.has(platform.id) }"></div>
          <div class="platform-info">
            <div class="platform-name">{{ platform.name }}</div>
            <div class="platform-desc">{{ platform.desc }}</div>
          </div>
          <!-- 安装状态徽章 -->
          <span class="platform-status" :class="getPlatformStatusClass(platform.key)">
            {{ getPlatformStatusText(platform.key) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 安装进度/结果区 -->
    <div v-if="state !== 'idle'" class="install-status">
      <!-- 进度指示 -->
      <div v-if="state === 'installing'" class="status-row installing">
        <div class="status-indicator">
          <div class="spinner"></div>
        </div>
        <div class="status-text">正在安装...</div>
      </div>

      <!-- 结果展示 -->
      <div v-else class="status-row" :class="installSuccess ? 'success' : 'failed'">
        <div class="status-indicator">
          <span class="status-icon">{{ installSuccess ? '✓' : '✕' }}</span>
        </div>
        <div class="status-content">
          <div class="status-text">{{ installSuccess ? '安装成功' : '安装失败' }}</div>
          <div v-if="installSuccess" class="status-hint">请重启 AI 工具使配置生效</div>
          <div v-else class="status-hint">{{ errorMessage }}</div>
        </div>
      </div>

      <!-- 失败时显示命令行方式 -->
      <div v-if="state === 'done' && !installSuccess" class="fallback-command">
        <div class="command-label">命令行安装</div>
        <div class="command-box" @click="copyCommand">
          <code>tanmi-workspace setup</code>
          <span class="copy-hint">COPY</span>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="install-actions">
      <button v-if="state === 'idle'" class="btn" @click="handleClose">取消</button>
      <button
        v-if="state === 'idle'"
        class="btn primary"
        :disabled="!canInstall"
        @click="handleInstall"
      >
        开始安装
      </button>
      <button v-if="state === 'done'" class="btn primary" @click="handleConfirm">
        {{ installSuccess ? '完成' : '关闭' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.install-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 平台选择区 */
.platform-selector {
}

.selector-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}

.platform-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.platform-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--path-bg);
  cursor: pointer;
  transition: background 0.1s;
}

.platform-option:hover:not(.disabled) {
  background: var(--card-bg);
}

.platform-option.selected {
  background: var(--card-bg);
}

.platform-option.disabled {
  cursor: default;
  opacity: 0.7;
}

.platform-checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-heavy);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.1s;
}

[data-theme="dark"] .platform-checkbox {
  border-color: #888;
}

.platform-checkbox.checked {
  background: var(--border-heavy);
}

[data-theme="dark"] .platform-checkbox.checked {
  background: #fff;
  border-color: #fff;
}

.platform-checkbox.checked::after {
  content: '✓';
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

[data-theme="dark"] .platform-checkbox.checked::after {
  color: #111;
}

.platform-info {
  flex: 1;
  min-width: 0;
}

.platform-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.platform-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
}

/* 平台状态标签 - 与 SettingsModal 保持一致 */
.platform-status {
  font-family: var(--mono-font);
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

/* 已安装：黑底白字 */
.platform-status.installed {
  background: #000;
  color: #fff;
}

[data-theme="dark"] .platform-status.installed {
  background: #fff;
  color: #000;
}

/* 需更新：红底白字 */
.platform-status.outdated {
  background: #D92424;
  color: #fff;
}

/* 未安装：灰色边框 */
.platform-status.disabled {
  background: transparent;
  color: #999;
  border: 1px solid #ccc;
}

[data-theme="dark"] .platform-status.disabled {
  color: #666;
  border-color: #444;
}

/* 安装状态区 */
.install-status {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--path-bg);
}

.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-indicator {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-color);
  border-top-color: var(--border-heavy);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

[data-theme="dark"] .spinner {
  border-color: #444;
  border-top-color: #fff;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-icon {
  font-size: 16px;
  font-weight: 700;
}

.status-row.success .status-icon {
  color: var(--accent-green);
}

.status-row.failed .status-icon {
  color: var(--accent-red);
}

.status-content {
  flex: 1;
}

.status-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.status-row.success .status-text {
  color: var(--accent-green);
}

.status-row.failed .status-text {
  color: var(--accent-red);
}

.status-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* 命令行回退 */
.fallback-command {
  margin-top: 4px;
}

.command-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.command-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #1e1e1e;
  cursor: pointer;
  transition: background 0.1s;
}

.command-box:hover {
  background: #2a2a2a;
}

.command-box code {
  font-family: var(--mono-font);
  font-size: 12px;
  color: #d4d4d4;
}

.command-box .copy-hint {
  font-size: 9px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
}

/* 按钮区 */
.install-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}

.btn {
  height: 32px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-main);
  transition: all 0.1s;
}

.btn:hover {
  border-color: var(--border-heavy);
}

[data-theme="dark"] .btn:hover {
  border-color: #fff;
}

.btn.primary {
  background: var(--border-heavy);
  border-color: var(--border-heavy);
  color: #fff;
}

[data-theme="dark"] .btn.primary {
  background: #fff;
  border-color: #fff;
  color: #111;
}

.btn.primary:hover {
  background: var(--accent-red);
  border-color: var(--accent-red);
}

[data-theme="dark"] .btn.primary:hover {
  background: var(--accent-red);
  border-color: var(--accent-red);
  color: #fff;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn:disabled:hover {
  border-color: var(--border-color);
}
</style>
