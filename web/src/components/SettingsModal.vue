<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { workspaceApi, type DevInfoResult } from '@/api/workspace'
import { settingsApi, type InstallationStatusResult, type PlatformStatus, type ComponentStatus } from '@/api/settings'
import WsModal from '@/components/ui/WsModal.vue'
import WsButton from '@/components/ui/WsButton.vue'
import WsConfirmDialog from '@/components/ui/WsConfirmDialog.vue'

const settingsStore = useSettingsStore()
const toastStore = useToastStore()

// 版本信息
const devInfo = ref<DevInfoResult | null>(null)
const frontendBuildTime = __BUILD_TIME__

// 插件安装状态
const installationStatus = ref<InstallationStatusResult | null>(null)

// 计算前后端编译时间差异是否超过100秒
const buildTimeDiffTooLarge = computed(() => {
  if (!devInfo.value?.codeBuildTime || !frontendBuildTime) return false
  const backendTime = new Date(devInfo.value.codeBuildTime).getTime()
  const frontendTime = new Date(frontendBuildTime).getTime()
  const diffSeconds = Math.abs(backendTime - frontendTime) / 1000
  return diffSeconds > 100
})

// 版本点击计数（连续点击5次触发教程创建）
const versionClickCount = ref(0)
const versionClickTimer = ref<number | null>(null)
const tutorialTriggering = ref(false)

// Props
interface Props {
  visible: boolean
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'tutorialCreated'): void
}>()

// 本地状态
const localMode = ref<'none' | 'git' | 'no-git'>('none')

// Git 模式警告弹窗
const showGitWarning = ref(false)

// 监听弹窗打开，加载配置
watch(() => props.visible, async (isVisible) => {
  if (isVisible) {
    await settingsStore.loadSettings()
    localMode.value = settingsStore.settings.defaultDispatchMode
    // 并行加载版本信息和插件状态
    const [devInfoRes, installRes] = await Promise.allSettled([
      workspaceApi.getDevInfo(),
      settingsApi.getInstallationStatus()
    ])
    if (devInfoRes.status === 'fulfilled') {
      devInfo.value = devInfoRes.value
    }
    if (installRes.status === 'fulfilled') {
      installationStatus.value = installRes.value
    }
  }
})

// 格式化时间
function formatTime(isoString?: string | null) {
  if (!isoString) return '-'
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// 检查平台是否有过期组件
function hasOutdatedComponent(platform: PlatformStatus): boolean {
  const comps = platform.components
  return comps.mcp.outdated || comps.hooks.outdated || comps.agents.outdated || comps.skills.outdated
}

// 获取组件徽章样式类
function getComponentClass(comp: ComponentStatus): string {
  if (!comp.installed) return ''
  if (comp.outdated) return 'active outdated'
  return 'active'
}

// 获取状态指示器样式类
function getIndicatorClass(comp: ComponentStatus): string {
  if (!comp.installed) return 'not-installed'
  if (comp.outdated) return 'outdated'
  return 'installed'
}

// 关闭弹窗
function handleClose() {
  emit('update:visible', false)
}

// 保存配置
function handleSave() {
  // 如果切换到 git 模式，显示警告确认
  if (settingsStore.settings.defaultDispatchMode !== 'git' && localMode.value === 'git') {
    showGitWarning.value = true
    return
  }

  doSave()
}

// 执行保存
async function doSave() {
  try {
    await settingsStore.updateSettings({
      defaultDispatchMode: localMode.value,
    })
    toastStore.success('配置已保存')
    handleClose()
  } catch {
    toastStore.error('保存失败')
  }
}

// 选择模式
function selectMode(mode: 'none' | 'git' | 'no-git') {
  localMode.value = mode
}

// 版本号点击处理（连续点击5次触发教程创建 - 彩蛋功能）
async function handleVersionClick() {
  if (tutorialTriggering.value) return

  // 清除之前的计时器
  if (versionClickTimer.value) {
    clearTimeout(versionClickTimer.value)
  }

  // 增加点击计数
  versionClickCount.value++

  // 达到5次触发教程创建
  if (versionClickCount.value >= 5) {
    versionClickCount.value = 0
    tutorialTriggering.value = true

    try {
      const result = await settingsApi.triggerTutorial()
      if (result.created) {
        toastStore.info('叮~')
        emit('tutorialCreated')
      } else {
        // 彩蛋：已存在时显示喵~
        toastStore.info('喵~')
      }
    } catch (e) {
      console.error('[Tutorial] trigger failed:', e)
    } finally {
      tutorialTriggering.value = false
    }
    return
  }

  // 设置1秒超时重置计数
  versionClickTimer.value = window.setTimeout(() => {
    versionClickCount.value = 0
  }, 1000)
}
</script>

<template>
  <WsModal
    :model-value="visible"
    title="SETTINGS"
    width="600px"
    @update:model-value="(val: boolean) => !val && handleClose()"
    @close="handleClose"
  >
    <div class="settings-content">
      <!-- 派发模式设置 -->
      <div class="setting-section">
        <div class="setting-section-title">派发行为配置</div>
        <div class="setting-section-desc">
          设置在工作区启用派发时的默认行为。已启用派发的工作区不受影响。
        </div>

        <div class="radio-group">
          <label
            class="radio-card"
            :class="{ selected: localMode === 'none' }"
            @click="selectMode('none')"
          >
            <input type="radio" name="dispatch-mode" :checked="localMode === 'none'">
            <div>
              <span class="radio-card-title">每次询问 (Recommended)</span>
              <span class="radio-card-desc">启用派发时弹窗让用户选择模式。</span>
            </div>
          </label>

          <label
            class="radio-card"
            :class="{ selected: localMode === 'no-git' }"
            @click="selectMode('no-git')"
          >
            <input type="radio" name="dispatch-mode" :checked="localMode === 'no-git'">
            <div>
              <span class="radio-card-title">自动使用无 Git 模式</span>
              <span class="radio-card-desc">直接启用派发，仅更新元数据，不影响代码仓库。</span>
            </div>
          </label>

          <label
            class="radio-card"
            :class="{ selected: localMode === 'git' }"
            @click="selectMode('git')"
          >
            <input type="radio" name="dispatch-mode" :checked="localMode === 'git'">
            <div>
              <span class="radio-card-title">自动使用 Git 模式 (Experimental)</span>
              <span class="radio-card-desc">直接启用派发，自动创建分支、提交、回滚。</span>
            </div>
          </label>
        </div>

        <!-- Git 模式警告 -->
        <div v-if="localMode === 'git'" class="warning-block">
          <div class="warning-title">GIT MODE RISKS</div>
          <ul class="warning-list">
            <li>自动创建 <span class="code-tag">tanmi_workspace/process/*</span> 分支</li>
            <li>任务完成时自动提交代码</li>
            <li>测试失败时执行 <span class="code-tag">git reset --hard</span>（可能丢失未提交代码）</li>
            <li>合并时可能产生冲突</li>
          </ul>
        </div>

        <!-- 无 Git 模式说明 -->
        <div v-if="localMode === 'no-git'" class="info-block">
          <div class="info-title">NO-GIT MODE LIMITS</div>
          <ul class="info-list">
            <li>测试失败时无法自动回滚</li>
            <li>建议在执行前手动备份重要文件</li>
          </ul>
        </div>
      </div>

      <!-- 版本信息 -->
      <div class="setting-section version-section">
        <div class="setting-section-title">版本信息</div>
        <div class="tech-spec">
          <div class="spec-item">
            <label>BACKEND VERSION</label>
            <div
              class="spec-value version-clickable"
              :class="{ 'version-clicking': versionClickCount > 2 }"
              @click="handleVersionClick"
            >
              v{{ devInfo?.packageVersion || '-' }}
              <span v-if="versionClickCount > 2" class="click-indicator">{{ versionClickCount }}/5</span>
            </div>
          </div>
          <div class="spec-item">
            <label>NODE VERSION</label>
            <div class="spec-value">{{ devInfo?.nodeVersion || '-' }}</div>
          </div>
          <!-- 调试信息（仅开发模式显示） -->
          <template v-if="devInfo?.isDev">
            <div class="spec-item">
              <label>后端编译</label>
              <div class="spec-value">{{ formatTime(devInfo?.codeBuildTime) }}</div>
            </div>
            <div class="spec-item">
              <label>前端编译</label>
              <div class="spec-value">{{ formatTime(frontendBuildTime) }}</div>
            </div>
            <div class="spec-item">
              <label>服务启动</label>
              <div class="spec-value">{{ formatTime(devInfo?.serverStartTime) }}</div>
            </div>
          </template>
        </div>
        <div
          v-if="buildTimeDiffTooLarge && devInfo?.isDev"
          class="spec-warning"
        >
          [WARN] 前后端编译时间不一致，若为版本更新后需要指示 AI 重新编译前后端
        </div>
      </div>

      <!-- 插件详情 -->
      <div class="setting-section plugin-section">
        <div class="setting-section-title">插件详情</div>
        <div class="setting-section-desc">
          各平台的 TanmiWorkspace 组件安装状态
        </div>

        <div v-if="installationStatus" class="platform-grid">
          <!-- Claude Code -->
          <div
            class="platform-card"
            :class="{ enabled: installationStatus.platforms.claudeCode.enabled }"
          >
            <div class="platform-header">
              <span class="platform-name">Claude Code</span>
              <span
                v-if="installationStatus.platforms.claudeCode.enabled"
                class="platform-status"
                :class="{ outdated: hasOutdatedComponent(installationStatus.platforms.claudeCode) }"
              >
                {{ hasOutdatedComponent(installationStatus.platforms.claudeCode) ? '需更新' : '已安装' }}
              </span>
              <span v-else class="platform-status disabled">未安装</span>
            </div>
            <div class="component-grid">
              <span
                v-for="comp in ['mcp', 'hooks', 'agents', 'skills']"
                :key="comp"
                class="component-item"
                :class="getComponentClass(installationStatus.platforms.claudeCode.components[comp as keyof typeof installationStatus.platforms.claudeCode.components])"
              >
                <span class="status-indicator" :class="getIndicatorClass(installationStatus.platforms.claudeCode.components[comp as keyof typeof installationStatus.platforms.claudeCode.components])"></span>
                {{ comp.charAt(0).toUpperCase() + comp.slice(1) }}
              </span>
            </div>
          </div>

          <!-- Cursor -->
          <div
            class="platform-card"
            :class="{ enabled: installationStatus.platforms.cursor.enabled }"
          >
            <div class="platform-header">
              <span class="platform-name">Cursor</span>
              <span
                v-if="installationStatus.platforms.cursor.enabled"
                class="platform-status"
                :class="{ outdated: hasOutdatedComponent(installationStatus.platforms.cursor) }"
              >
                {{ hasOutdatedComponent(installationStatus.platforms.cursor) ? '需更新' : '已安装' }}
              </span>
              <span v-else class="platform-status disabled">未安装</span>
            </div>
            <div class="component-grid">
              <span
                v-for="comp in ['mcp', 'hooks', 'agents', 'skills']"
                :key="comp"
                class="component-item"
                :class="getComponentClass(installationStatus.platforms.cursor.components[comp as keyof typeof installationStatus.platforms.cursor.components])"
              >
                <span class="status-indicator" :class="getIndicatorClass(installationStatus.platforms.cursor.components[comp as keyof typeof installationStatus.platforms.cursor.components])"></span>
                {{ comp.charAt(0).toUpperCase() + comp.slice(1) }}
              </span>
            </div>
          </div>
        </div>

        <div v-else class="plugin-loading">
          加载中...
        </div>

        <div class="update-hint">
          <span class="hint-label">更新命令</span>
          <code class="hint-code">bash ~/.tanmi-workspace/scripts/install-global.sh</code>
        </div>
      </div>
    </div>

    <template #footer>
      <WsButton variant="cancel" @click="handleClose">取消</WsButton>
      <WsButton variant="primary" @click="handleSave" :loading="settingsStore.loading">
        保存更改
      </WsButton>
    </template>
  </WsModal>

  <!-- Git 模式警告确认 -->
  <WsConfirmDialog
    v-model="showGitWarning"
    title="Git 模式警告"
    message="选择此选项后，启用派发时将自动使用 Git 模式（自动创建分支、提交、回滚）。此功能为实验性功能，可能会影响 Git 历史。确定要设置吗？"
    type="warning"
    confirm-text="确定设置"
    cancel-text="取消"
    @confirm="doSave"
  />
</template>

<style scoped>
.settings-content {
  padding: 0;
}

.setting-section {
  margin-bottom: 24px;
}

.setting-section:last-child {
  margin-bottom: 0;
}

/* 章节标题 - 带红色条 */
.setting-section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-main);
}

.setting-section-title::before {
  content: '';
  display: block;
  width: 4px;
  height: 14px;
  background: var(--accent-red);
}

.setting-section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  line-height: 1.5;
}

/* 单选卡片组 */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.radio-card {
  border: 1px solid var(--border-color);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: var(--card-bg);
}

.radio-card:hover {
  border-color: var(--text-secondary);
}

.radio-card input[type="radio"] {
  margin-top: 4px;
  accent-color: var(--border-heavy);
}

.radio-card.selected {
  border-color: var(--border-heavy);
  background: #fffcfc;
}

[data-theme="dark"] .radio-card.selected {
  background: #1f1f1f;
}

.radio-card.selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--accent-red);
}

.radio-card-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
  display: block;
  color: var(--text-main);
}

.radio-card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* 警告框 */
.warning-block {
  background: #fff8f0;
  border: 1px solid #e6a23c;
  border-left-width: 4px;
  padding: 16px;
  margin-top: 12px;
}

[data-theme="dark"] .warning-block {
  background: #2a2010;
  border-color: #b8860b;
}

.warning-title {
  color: #d35400;
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 8px;
  text-transform: uppercase;
  font-family: var(--mono-font);
  letter-spacing: 0.5px;
}

[data-theme="dark"] .warning-title {
  color: #f5a623;
}

.warning-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: #885a0c;
  line-height: 1.8;
}

[data-theme="dark"] .warning-list {
  color: #d4a537;
}

/* 信息框 */
.info-block {
  background: #f0f9ff;
  border: 1px solid var(--accent-blue);
  border-left-width: 4px;
  padding: 16px;
  margin-top: 12px;
}

[data-theme="dark"] .info-block {
  background: #0a1929;
  border-color: #1e88e5;
}

.info-title {
  color: #1565c0;
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 8px;
  text-transform: uppercase;
  font-family: var(--mono-font);
  letter-spacing: 0.5px;
}

[data-theme="dark"] .info-title {
  color: #64b5f6;
}

.info-list {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  color: #1565c0;
  line-height: 1.8;
}

[data-theme="dark"] .info-list {
  color: #64b5f6;
}

.code-tag {
  font-family: var(--mono-font);
  background: rgba(255, 255, 255, 0.6);
  padding: 1px 5px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  font-size: 11px;
}

[data-theme="dark"] .code-tag {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.1);
}

/* 版本信息区 */
.version-section {
  border-top: 1px solid var(--border-color);
  padding-top: 20px;
}

.tech-spec {
  background: var(--path-bg);
  border: 1px solid var(--border-color);
  padding: 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.spec-item label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 4px;
  font-family: var(--mono-font);
  letter-spacing: 0.5px;
}

.spec-item .spec-value {
  font-size: 14px;
  font-family: var(--mono-font);
  color: var(--text-main);
  font-weight: 600;
}

.spec-warning {
  font-size: 12px;
  color: #d97706;
  margin-top: 12px;
  font-family: var(--mono-font);
}

[data-theme="dark"] .spec-warning {
  color: #fbbf24;
}

/* 版本号可点击样式（彩蛋，隐藏交互反馈） */
.version-clickable {
  cursor: text;  /* 隐藏可点击的暗示 */
  user-select: none;
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* 只在点击超过2次后才显示反馈 */
.version-clicking {
  color: var(--accent-red);
  transition: color 0.15s ease;
}

.click-indicator {
  font-size: 10px;
  background: var(--accent-red);
  color: #fff;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
}

/* 插件详情区 */
.plugin-section {
  border-top: 1px solid var(--border-color);
  padding-top: 20px;
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.platform-card {
  border: 1px solid var(--border-color);
  padding: 12px;
  background: var(--card-bg);
  opacity: 0.6;
  transition: all 0.2s ease;
}

.platform-card.enabled {
  opacity: 1;
  border-color: var(--border-heavy);
}

.platform-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.platform-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-main);
}

.platform-status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 2px;
  font-family: var(--mono-font);
  background: #e8f5e9;
  color: #2e7d32;
}

[data-theme="dark"] .platform-status {
  background: #1b3d1f;
  color: #81c784;
}

.platform-status.outdated {
  background: #fff3e0;
  color: #e65100;
}

[data-theme="dark"] .platform-status.outdated {
  background: #3d2a10;
  color: #ffb74d;
}

.platform-status.disabled {
  background: var(--path-bg);
  color: var(--text-muted);
}

/* 组件网格（2x2 布局） */
.component-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin-top: 12px;
}

.component-item {
  display: flex;
  align-items: center;
  font-size: 11px;
  padding: 4px 8px;
  background: var(--path-bg);
  color: var(--text-muted);
  font-family: var(--mono-font);
}

/* 状态指示器（8x8 小方块） */
.status-indicator {
  width: 8px;
  height: 8px;
  margin-right: 6px;
  flex-shrink: 0;
}

.status-indicator.installed {
  background: var(--accent-blue);
}

.status-indicator.outdated {
  background: #f59e0b;
}

.status-indicator.not-installed {
  border: 1px solid var(--text-muted);
  background: transparent;
}

/* 已安装状态 */
.component-item.active {
  background: #e3f2fd;
  color: #1565c0;
}

[data-theme="dark"] .component-item.active {
  background: #0d2137;
  color: #64b5f6;
}

/* 过期状态 */
.component-item.outdated {
  background: #fff7ed;
  color: #c2410c;
}

[data-theme="dark"] .component-item.outdated {
  background: #431407;
  color: #fb923c;
}

.plugin-loading {
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
  font-size: 13px;
}

.update-hint {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.hint-label {
  color: var(--text-muted);
}

.hint-code {
  font-family: var(--mono-font);
  background: var(--path-bg);
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
}
</style>
