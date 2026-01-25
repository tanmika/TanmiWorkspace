<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { workspaceApi, type DevInfoResult } from '@/api/workspace'
import { settingsApi, type InstallationStatusResult, type PlatformStatus, type ComponentStatus } from '@/api/settings'
import { adminApi, type IndexStatsResult } from '@/api/admin'
import WsModal from '@/components/ui/WsModal.vue'
import WsButton from '@/components/ui/WsButton.vue'
import WsConfirmDialog from '@/components/ui/WsConfirmDialog.vue'
import WsCollapse from '@/components/ui/WsCollapse.vue'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import IndexManagementModal from '@/components/IndexManagementModalNew.vue'
import BackupManager from '@/components/BackupManager.vue'
import { quickStartContent, triggerWords } from '@/data/helpContent'

const settingsStore = useSettingsStore()
const toastStore = useToastStore()

// 版本信息
const devInfo = ref<DevInfoResult | null>(null)
const frontendBuildTime = __BUILD_TIME__

// 版本更新信息
interface VersionInfo {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
}
const versionInfo = ref<VersionInfo | null>(null)
const showVersionModal = ref(false)

// 插件安装状态
const installationStatus = ref<InstallationStatusResult | null>(null)

// 索引管理
const indexStats = ref<IndexStatsResult | null>(null)
const showIndexManagement = ref(false)

// 备份管理
const showBackupManager = ref(false)
const backupCount = ref<number | null>(null)

// 加载备份数量
async function loadBackupCount() {
  try {
    const response = await fetch('/api/backup/global')
    if (response.ok) {
      const data = await response.json()
      backupCount.value = data.backups?.length ?? 0
    }
  } catch {
    // 忽略错误
  }
}

// 派发配置弹窗
const showDispatchConfig = ref(false)
const tempMode = ref<'none' | 'git' | 'no-git'>('none')

// 派发模式显示文字
const dispatchModeLabel = computed(() => {
  switch (localMode.value) {
    case 'none': return '每次询问'
    case 'git': return 'Git 模式'
    case 'no-git': return '无 Git 模式'
    default: return '-'
  }
})

// 计算前后端编译时间差异是否超过100秒
const buildTimeDiffTooLarge = computed(() => {
  if (!devInfo.value?.codeBuildTime || !frontendBuildTime) return false
  const backendTime = new Date(devInfo.value.codeBuildTime).getTime()
  const frontendTime = new Date(frontendBuildTime).getTime()
  const diffSeconds = Math.abs(backendTime - frontendTime) / 1000
  return diffSeconds > 100
})


// Props
interface Props {
  visible: boolean
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'tutorialCreated'): void
  (e: 'workspaceImported'): void
}>()

// 本地状态
const localMode = ref<'none' | 'git' | 'no-git'>('none')
const localAllowUnboundWrite = ref(false)

// Git 模式警告弹窗
const showGitWarning = ref(false)

// 监听弹窗打开，加载配置
watch(() => props.visible, async (isVisible) => {
  if (isVisible) {
    await settingsStore.loadSettings()
    localMode.value = settingsStore.settings.defaultDispatchMode
    localAllowUnboundWrite.value = settingsStore.settings.security?.allowUnboundWrite ?? false
    // 并行加载版本信息和插件状态
    const [devInfoRes, installRes, versionRes] = await Promise.allSettled([
      workspaceApi.getDevInfo(),
      settingsApi.getInstallationStatus(),
      fetch('/api/version').then(r => r.ok ? r.json() : null)
    ])
    if (devInfoRes.status === 'fulfilled') {
      devInfo.value = devInfoRes.value
    }
    if (installRes.status === 'fulfilled') {
      installationStatus.value = installRes.value
    }
    if (versionRes.status === 'fulfilled' && versionRes.value) {
      versionInfo.value = versionRes.value
    }
    // 加载索引统计
    try {
      indexStats.value = await adminApi.getIndexStats()
    } catch {
      // 忽略错误
    }
    // 加载备份数量
    loadBackupCount()
  }
})

// 加载索引统计
async function loadIndexStats() {
  try {
    indexStats.value = await adminApi.getIndexStats()
  } catch {
    // 忽略错误
  }
}

// 打开索引管理弹窗
function openIndexManagement() {
  showIndexManagement.value = true
}

// 工作区导入后刷新统计并通知父组件
function handleWorkspaceImported() {
  loadIndexStats()
  emit('workspaceImported')
}

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
  // hooks 和 plugins 是互斥的：Claude Code/Cursor 用 hooks，OpenCode 用 plugins
  const hooksOrPluginsOutdated = comps.hooks?.outdated || comps.plugins?.outdated || false
  return comps.mcp.outdated || hooksOrPluginsOutdated || comps.agents.outdated || comps.skills.outdated
}

// 获取状态指示器样式类
function getIndicatorClass(comp: ComponentStatus | undefined): string {
  if (!comp) return 'not-installed'
  if (!comp.supported) return 'unsupported'
  if (!comp.installed) return 'not-installed'
  if (comp.outdated) return 'outdated'
  return 'installed'
}

// 关闭弹窗
function handleClose() {
  emit('update:visible', false)
}

// 选择模式（弹窗内临时选择）
function selectMode(mode: 'none' | 'git' | 'no-git') {
  tempMode.value = mode
}

// 打开派发配置弹窗
function openDispatchConfig() {
  tempMode.value = localMode.value
  showDispatchConfig.value = true
}

// 取消派发配置
function cancelDispatchConfig() {
  showDispatchConfig.value = false
}

// 保存派发配置
async function saveDispatchConfig() {
  // 如果切换到 git 模式，显示警告确认
  if (settingsStore.settings.defaultDispatchMode !== 'git' && tempMode.value === 'git') {
    showGitWarning.value = true
    return
  }
  await doSaveDispatch()
}

// 执行保存派发配置
async function doSaveDispatch() {
  try {
    await settingsStore.updateSettings({
      defaultDispatchMode: tempMode.value,
    })
    localMode.value = tempMode.value
    toastStore.success('配置已保存')
    showDispatchConfig.value = false
  } catch {
    toastStore.error('保存失败')
  }
}

// 切换未绑定写入限制（UI 显示"禁止"，存储值为"允许"的反转）
async function toggleAllowUnboundWrite() {
  const newValue = !localAllowUnboundWrite.value
  try {
    await settingsStore.updateSettings({
      security: { allowUnboundWrite: newValue },
    })
    localAllowUnboundWrite.value = newValue
    toastStore.success('偏好设置已更新')
  } catch {
    toastStore.error('保存失败')
  }
}

// 打开完整手册
function openFullDocs() {
  window.open('/docs', '_blank')
}

// 版本更新相关
function openVersionModal() {
  showVersionModal.value = true
}

async function copyUpdateCommand() {
  const command = 'tanmi-workspace update'
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

// 生成功能介绍工作区
const tutorialGenerating = ref(false)
const showTutorialConfirm = ref(false)

function confirmGenerateTutorial() {
  showTutorialConfirm.value = true
}

async function handleGenerateTutorial() {
  if (tutorialGenerating.value) return
  tutorialGenerating.value = true

  try {
    const result = await settingsApi.triggerTutorial()
    toastStore.success(result.message || '已生成功能介绍与版本更新记录')
    emit('tutorialCreated')
  } catch (e) {
    console.error('[Tutorial] generate failed:', e)
    toastStore.error('生成失败')
  } finally {
    tutorialGenerating.value = false
  }
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
      <!-- 版本信息 -->
      <div class="setting-section">
        <div class="setting-section-title">版本信息</div>
        <div class="tech-spec">
          <div class="spec-item">
            <label>BACKEND VERSION</label>
            <div class="spec-value-row">
              <span class="spec-value-text">v{{ devInfo?.packageVersion || '-' }}</span>
              <span
                v-if="versionInfo"
                class="version-status-tag"
                :class="{ update: versionInfo.updateAvailable, latest: !versionInfo.updateAvailable }"
                @click="openVersionModal"
              >
                {{ versionInfo.updateAvailable ? 'UPDATE' : 'LATEST' }}
              </span>
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
        <div class="version-links">
          <a class="version-link" href="javascript:void(0)" @click="openVersionModal">
            检查版本更新 <span class="version-link-arrow">&rarr;</span>
          </a>
        </div>
      </div>

      <!-- 偏好设置 -->
      <div class="setting-section preferences-section">
        <div class="setting-section-title">偏好设置</div>
        <div class="setting-section-desc">
          派发行为与安全相关配置
        </div>

        <div class="config-entry">
          <div class="config-entry-info">
            <div class="config-entry-title">默认派发模式</div>
            <div class="config-entry-desc">已启用派发的工作区不受影响</div>
          </div>
          <div class="config-entry-value">{{ dispatchModeLabel }}</div>
          <WsButton variant="primary" @click="openDispatchConfig">配置</WsButton>
        </div>

        <div class="config-entry">
          <div class="config-entry-info">
            <div class="config-entry-title">禁止未绑定写入</div>
            <div class="config-entry-desc">
              开启时，未绑定工作区的会话无法执行写操作
            </div>
          </div>
          <label class="toggle-switch">
            <input
              type="checkbox"
              :checked="!localAllowUnboundWrite"
              @change="toggleAllowUnboundWrite"
              :disabled="settingsStore.loading"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- 插件详情 -->
      <div class="setting-section plugin-section">
        <div class="setting-section-title">插件详情</div>
        <div class="setting-section-desc">
          各平台的组件安装状态
        </div>

        <div v-if="installationStatus" class="platform-grid">
          <!-- Claude Code -->
          <div class="platform-card">
            <div class="platform-label">
              <span class="platform-name">CLAUDE CODE</span>
              <span
                class="platform-status"
                :class="{
                  installed: installationStatus.platforms.claudeCode.enabled && !hasOutdatedComponent(installationStatus.platforms.claudeCode),
                  outdated: installationStatus.platforms.claudeCode.enabled && hasOutdatedComponent(installationStatus.platforms.claudeCode),
                  disabled: !installationStatus.platforms.claudeCode.enabled
                }"
              >
                {{ !installationStatus.platforms.claudeCode.enabled ? 'NOT INSTALLED' : (hasOutdatedComponent(installationStatus.platforms.claudeCode) ? 'UPDATE' : 'INSTALLED') }}
              </span>
            </div>
            <div class="component-box">
              <div
                v-for="comp in ['mcp', 'hooks', 'agents', 'skills']"
                :key="comp"
                class="component-cell"
              >
                <span
                  class="status-block"
                  :class="getIndicatorClass(installationStatus.platforms.claudeCode.components[comp as keyof typeof installationStatus.platforms.claudeCode.components])"
                ></span>
                <span
                  class="component-name"
                  :class="getIndicatorClass(installationStatus.platforms.claudeCode.components[comp as keyof typeof installationStatus.platforms.claudeCode.components])"
                >{{ comp.charAt(0).toUpperCase() + comp.slice(1) }}</span>
              </div>
            </div>
          </div>

          <!-- Cursor -->
          <div class="platform-card">
            <div class="platform-label">
              <span class="platform-name">CURSOR</span>
              <span
                class="platform-status"
                :class="{
                  installed: installationStatus.platforms.cursor.enabled && !hasOutdatedComponent(installationStatus.platforms.cursor),
                  outdated: installationStatus.platforms.cursor.enabled && hasOutdatedComponent(installationStatus.platforms.cursor),
                  disabled: !installationStatus.platforms.cursor.enabled
                }"
              >
                {{ !installationStatus.platforms.cursor.enabled ? 'NOT INSTALLED' : (hasOutdatedComponent(installationStatus.platforms.cursor) ? 'UPDATE' : 'INSTALLED') }}
              </span>
            </div>
            <div class="component-box">
              <div
                v-for="comp in ['mcp', 'hooks', 'agents', 'skills']"
                :key="comp"
                class="component-cell"
              >
                <span
                  class="status-block"
                  :class="getIndicatorClass(installationStatus.platforms.cursor.components[comp as keyof typeof installationStatus.platforms.cursor.components])"
                ></span>
                <span
                  class="component-name"
                  :class="getIndicatorClass(installationStatus.platforms.cursor.components[comp as keyof typeof installationStatus.platforms.cursor.components])"
                >{{ comp.charAt(0).toUpperCase() + comp.slice(1) }}</span>
              </div>
            </div>
          </div>

          <!-- OpenCode -->
          <div class="platform-card">
            <div class="platform-label">
              <span class="platform-name">OPENCODE</span>
              <span
                class="platform-status"
                :class="{
                  installed: installationStatus.platforms.opencode.enabled && !hasOutdatedComponent(installationStatus.platforms.opencode),
                  outdated: installationStatus.platforms.opencode.enabled && hasOutdatedComponent(installationStatus.platforms.opencode),
                  disabled: !installationStatus.platforms.opencode.enabled
                }"
              >
                {{ !installationStatus.platforms.opencode.enabled ? 'NOT INSTALLED' : (hasOutdatedComponent(installationStatus.platforms.opencode) ? 'UPDATE' : 'INSTALLED') }}
              </span>
            </div>
            <div class="component-box">
              <div
                v-for="comp in ['mcp', 'plugins', 'agents', 'skills']"
                :key="comp"
                class="component-cell"
              >
                <span
                  class="status-block"
                  :class="getIndicatorClass(installationStatus.platforms.opencode.components[comp as keyof typeof installationStatus.platforms.opencode.components])"
                ></span>
                <span
                  class="component-name"
                  :class="getIndicatorClass(installationStatus.platforms.opencode.components[comp as keyof typeof installationStatus.platforms.opencode.components])"
                >{{ comp.charAt(0).toUpperCase() + comp.slice(1) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="plugin-loading">
          加载中...
        </div>

        <div class="command-bar">
          <span class="command-label">插件安装方式</span>
          <span class="command-text">tanmi-workspace setup</span>
        </div>
      </div>

      <!-- 索引管理 -->
      <div class="setting-section index-section">
        <div class="setting-section-title">数据管理</div>
        <div class="setting-section-desc">
          管理工作区索引和全局备份
        </div>

        <div class="index-entry">
          <div class="index-entry-info">
            <div class="index-entry-title">工作区索引</div>
            <div class="index-entry-desc">导入外部工作区或管理本地索引</div>
          </div>
          <div class="index-entry-stats">
            <div class="stat-box">
              <div class="stat-number">{{ indexStats?.total ?? '-' }}</div>
              <div class="stat-label">已索引</div>
            </div>
          </div>
          <WsButton variant="primary" @click="openIndexManagement">管理</WsButton>
        </div>

        <div class="index-entry">
          <div class="index-entry-info">
            <div class="index-entry-title">全局备份</div>
            <div class="index-entry-desc">创建、恢复或导入工作台备份文件</div>
          </div>
          <div class="index-entry-stats">
            <div class="stat-box">
              <div class="stat-number">{{ backupCount ?? '-' }}</div>
              <div class="stat-label">备份</div>
            </div>
          </div>
          <WsButton variant="primary" @click="showBackupManager = true">管理</WsButton>
        </div>
      </div>

      <!-- 用户帮助 -->
      <div class="setting-section help-section">
        <div class="setting-section-title">用户帮助</div>
        <div class="setting-section-desc">
          在对话中使用 TanmiWorkspace 的指南
        </div>

        <div class="help-collapse-group">
          <WsCollapse title="快速入门">
            <MarkdownContent :content="quickStartContent" />
          </WsCollapse>

          <WsCollapse title="触发词速查">
            <div class="trigger-table-wrapper">
              <table class="trigger-table">
                <thead>
                  <tr>
                    <th>意图</th>
                    <th>说法</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in triggerWords" :key="item.intent">
                    <td>{{ item.intent }}</td>
                    <td>{{ item.phrases.join(' / ') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </WsCollapse>
        </div>

        <div class="doc-links">
          <a class="doc-link" href="javascript:void(0)" @click="openFullDocs">
            查看完整手册 <span class="doc-link-arrow">&rarr;</span>
          </a>
          <a
            class="doc-link"
            :class="{ disabled: tutorialGenerating }"
            href="javascript:void(0)"
            @click="confirmGenerateTutorial"
          >
            {{ tutorialGenerating ? '生成中...' : '生成功能介绍与版本更新记录' }} <span class="doc-link-arrow">&rarr;</span>
          </a>
        </div>
      </div>
    </div>

    <template #footer>
      <WsButton variant="primary" @click="handleClose">关闭</WsButton>
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
    @confirm="doSaveDispatch"
  />

  <!-- 索引管理弹窗 -->
  <IndexManagementModal
    v-model:visible="showIndexManagement"
    @workspace-imported="handleWorkspaceImported"
  />

  <!-- 备份管理弹窗 -->
  <BackupManager v-model:visible="showBackupManager" @change="loadBackupCount" />

  <!-- 生成功能介绍确认弹窗 -->
  <WsConfirmDialog
    v-model="showTutorialConfirm"
    title="生成功能介绍"
    message="将重新生成「功能简介」和「版本更新」工作区。如果已存在，将被覆盖。确定继续吗？"
    type="info"
    confirm-text="确定生成"
    cancel-text="取消"
    @confirm="handleGenerateTutorial"
  />

  <!-- 版本更新弹窗 -->
  <WsModal v-model="showVersionModal" title="VERSION INFO" width="480px">
    <div class="version-modal-content">
      <!-- 版本状态 -->
      <div class="version-change">
        <span class="version-number current">{{ versionInfo?.currentVersion }}</span>
        <template v-if="versionInfo?.updateAvailable">
          <span class="version-arrow">→</span>
          <span class="version-number new">{{ versionInfo?.latestVersion }}</span>
        </template>
      </div>

      <!-- 已是最新版本 -->
      <div v-if="!versionInfo?.updateAvailable" class="latest-info">
        <div class="latest-graphic">
          <!-- 两个对齐的方块：表示版本同步 -->
          <div class="sync-block-back"></div>
          <div class="sync-block-front"></div>
          <div class="sync-dot"></div>
        </div>
        <div class="latest-title">已是最新版本</div>
        <div class="latest-text">v{{ versionInfo?.currentVersion }}</div>
      </div>

      <!-- 有更新可用 -->
      <template v-else>
        <div class="update-section">
          <h3 class="section-title">更新方式</h3>
          <p class="section-desc">在终端中运行以下命令：</p>

          <div class="command-box-clickable" @click="copyUpdateCommand" title="点击复制">
            <code class="command-code">tanmi-workspace update</code>
            <span class="copy-hint">COPY</span>
          </div>
        </div>

        <div class="tip-box">
          <span class="tip-label">TIP</span>
          <span class="tip-text">更新后需重启 AI 工具使新版本生效</span>
        </div>
      </template>
    </div>

    <template #footer>
      <button class="btn-secondary" @click="openNpm">查看 NPM</button>
      <button class="btn-primary" @click="showVersionModal = false">关闭</button>
    </template>
  </WsModal>

  <!-- 派发配置弹窗 -->
  <WsModal v-model="showDispatchConfig" title="DISPATCH CONFIG" width="520px">
    <div class="dispatch-config-content">
      <div class="radio-group">
        <label
          class="radio-card"
          :class="{ selected: tempMode === 'none' }"
          @click="selectMode('none')"
        >
          <input type="radio" name="dispatch-mode" :checked="tempMode === 'none'">
          <div>
            <span class="radio-card-title">每次询问 (Recommended)</span>
            <span class="radio-card-desc">启用派发时弹窗让用户选择模式。</span>
          </div>
        </label>

        <label
          class="radio-card"
          :class="{ selected: tempMode === 'no-git' }"
          @click="selectMode('no-git')"
        >
          <input type="radio" name="dispatch-mode" :checked="tempMode === 'no-git'">
          <div>
            <span class="radio-card-title">自动使用无 Git 模式</span>
            <span class="radio-card-desc">直接启用派发，仅更新元数据，不影响代码仓库。</span>
          </div>
        </label>

        <label
          class="radio-card"
          :class="{ selected: tempMode === 'git' }"
          @click="selectMode('git')"
        >
          <input type="radio" name="dispatch-mode" :checked="tempMode === 'git'">
          <div>
            <span class="radio-card-title">自动使用 Git 模式 (Experimental)</span>
            <span class="radio-card-desc">直接启用派发，自动创建分支、提交、回滚。</span>
          </div>
        </label>
      </div>

      <!-- Git 模式警告 -->
      <div v-if="tempMode === 'git'" class="warning-block">
        <div class="warning-title">GIT MODE RISKS</div>
        <ul class="warning-list">
          <li>自动创建 <span class="code-tag">tanmi_workspace/process/*</span> 分支</li>
          <li>任务完成时自动提交代码</li>
          <li>测试失败时执行 <span class="code-tag">git reset --hard</span>（可能丢失未提交代码）</li>
          <li>合并时可能产生冲突</li>
        </ul>
      </div>

      <!-- 无 Git 模式说明 -->
      <div v-if="tempMode === 'no-git'" class="info-block">
        <div class="info-title">NO-GIT MODE LIMITS</div>
        <ul class="info-list">
          <li>测试失败时无法自动回滚</li>
          <li>建议在执行前手动备份重要文件</li>
        </ul>
      </div>
    </div>

    <template #footer>
      <WsButton variant="cancel" @click="cancelDispatchConfig">取消</WsButton>
      <WsButton variant="primary" @click="saveDispatchConfig" :loading="settingsStore.loading">
        保存
      </WsButton>
    </template>
  </WsModal>
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

/* 配置入口（类似索引管理） */
.config-entry {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--path-bg);
  border: 1px solid var(--border-color);
}

.config-entry-info {
  flex: 1;
}

.config-entry-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 4px;
}

.config-entry-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.config-entry-value {
  font-family: var(--mono-font);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  padding: 4px 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
}

.config-entry + .config-entry {
  margin-top: 12px;
}

/* 开关样式 - 构成主义工业风格 */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--card-bg);
  border: 2px solid var(--border-color);
  transition: background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1),
              border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: var(--border-color);
  /* 段落感：快速启动 + 干脆到位 */
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
              background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 开启状态 - 红色背景 */
.toggle-switch input:checked + .toggle-slider {
  background-color: var(--accent-red);
  border-color: var(--accent-red);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(24px);
  background-color: #fff;
}

/* 禁用状态 */
.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 派发配置弹窗 */
.dispatch-config-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

/* 派发配置区 */
.preferences-section {
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

/* 插件详情区 */
.plugin-section {
  border-top: 1px solid var(--border-color);
  padding-top: 20px;
}

.plugin-loading {
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
  font-size: 13px;
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

/* 平台卡片：无边框容器 */
.platform-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 平台标签行：名称 + 状态 */
.platform-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
}

/* 平台名称：小号粗体 */
.platform-name {
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

/* 平台状态标签 */
.platform-status {
  font-family: var(--mono-font);
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  letter-spacing: 0.3px;
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

/* 未安装：灰色 */
.platform-status.disabled {
  background: transparent;
  color: #999;
  border: 1px solid #ccc;
}

[data-theme="dark"] .platform-status.disabled {
  color: #666;
  border-color: #444;
}

/* 组件框：细灰边框，无内部分割 */
.component-box {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 16px;
  padding: 10px 12px;
  border: 1px solid #ddd;
}

[data-theme="dark"] .component-box {
  border-color: #444;
}

/* 单元格：无边框 */
.component-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 状态方块：8x8 */
.status-block {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

/* 已安装：实心黑色方块 */
.status-block.installed {
  background: #000;
}

[data-theme="dark"] .status-block.installed {
  background: #fff;
}

/* 需更新：实心红色方块 */
.status-block.outdated {
  background: #D92424;
}

/* 未安装：空心方块（与已安装同色，黑色边框） */
.status-block.not-installed {
  background: transparent;
  border: 1px solid #000;
}

[data-theme="dark"] .status-block.not-installed {
  border-color: #fff;
}

/* 不支持：空心灰色方块 */
.status-block.unsupported {
  background: transparent;
  border: 1px solid #bbb;
}

[data-theme="dark"] .status-block.unsupported {
  border-color: #555;
}

/* 组件名称 */
.component-name {
  font-family: var(--mono-font);
  font-size: 11px;
  color: #000;
}

[data-theme="dark"] .component-name {
  color: #fff;
}

.component-name.outdated {
  color: #D92424;
}

.component-name.not-installed {
  color: #000;
}

[data-theme="dark"] .component-name.not-installed {
  color: #fff;
}

/* 不支持：灰色文字 */
.component-name.unsupported {
  color: #999;
}

[data-theme="dark"] .component-name.unsupported {
  color: #666;
}

/* 命令栏：引用风格 */
.command-bar {
  margin-top: 12px;
  padding-left: 12px;
  border-left: 2px solid #ddd;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

[data-theme="dark"] .command-bar {
  border-left-color: #444;
}

.command-label {
  font-size: 10px;
  color: var(--text-muted);
}

.command-text {
  font-family: var(--mono-font);
  font-size: 11px;
  color: var(--text-secondary);
}

/* 用户帮助区 */
.help-section {
  border-top: 1px solid var(--border-color);
  padding-top: 20px;
}

.help-collapse-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 触发词表格包装器 */
.trigger-table-wrapper {
  padding: 0 !important;
}

/* 触发词表格 */
.trigger-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.trigger-table th,
.trigger-table td {
  padding: 10px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.trigger-table th {
  background: var(--path-bg);
  font-weight: 600;
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.trigger-table th:first-child {
  border-right: 1px solid var(--border-color);
}

.trigger-table td:first-child {
  font-weight: 600;
  color: var(--text-main);
  border-right: 1px solid var(--border-color);
  width: 100px;
}

.trigger-table td:last-child {
  color: var(--text-secondary);
  font-family: var(--mono-font);
  font-size: 12px;
}

.trigger-table tr:last-child td {
  border-bottom: none;
}

/* 文档链接组 */
.doc-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.doc-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--accent-red);
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.doc-link:hover {
  opacity: 0.8;
}

.doc-link.disabled {
  color: var(--text-muted);
  cursor: not-allowed;
  pointer-events: none;
}

.doc-link-arrow {
  font-size: 14px;
  transition: transform 0.2s ease;
}

.doc-link:hover .doc-link-arrow {
  transform: translateX(3px);
}

/* 索引管理区 */
.index-section {
  border-top: 1px solid var(--border-color);
  padding-top: 20px;
}

.index-entry {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--path-bg);
  border: 1px solid var(--border-color);
}

.index-entry-info {
  flex: 1;
}

.index-entry-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 4px;
}

.index-entry-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.index-entry-stats {
  display: flex;
  gap: 12px;
}

.stat-box {
  text-align: center;
  min-width: 50px;
}

.stat-number {
  font-family: var(--mono-font);
  font-size: 24px;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1;
}

.stat-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 4px;
}

.index-entry-icon {
  width: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.index-entry + .index-entry {
  margin-top: 12px;
}
/* 版本状态标签 */
.spec-value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.spec-value-text {
  font-size: 14px;
  font-family: var(--mono-font);
  color: var(--text-main);
  font-weight: 600;
}

.version-status-tag {
  font-family: var(--mono-font);
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.version-status-tag:hover {
  opacity: 0.8;
}

.version-status-tag.update {
  background: #D92424;
  color: #fff;
}

.version-status-tag.latest {
  background: #000;
  color: #fff;
}

[data-theme="dark"] .version-status-tag.latest {
  background: #fff;
  color: #000;
}

/* 版本更新弹窗 */
.version-modal-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

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

.latest-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px 0;
}

.latest-graphic {
  position: relative;
  width: 72px;
  height: 72px;
}

/* 后方方块：黑色边框 */
.sync-block-back {
  position: absolute;
  top: 0;
  left: 0;
  width: 56px;
  height: 56px;
  border: 3px solid var(--border-heavy);
}

[data-theme="dark"] .sync-block-back {
  border-color: #fff;
}

/* 前方方块：完全对齐，偏移叠加 */
.sync-block-front {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 56px;
  height: 56px;
  background: var(--border-heavy);
}

[data-theme="dark"] .sync-block-front {
  background: #fff;
}

/* 红色确认点 */
.sync-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 12px;
  height: 12px;
  background: var(--accent-red);
}

.latest-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}

.latest-text {
  font-family: var(--mono-font);
  font-size: 13px;
  color: var(--text-secondary);
}

.update-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.update-section .section-title {
  font-size: 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
  color: var(--text-main);
}

.update-section .section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.command-box-clickable {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s ease;
}

.command-box-clickable:hover {
  border-color: var(--accent-red);
}

.command-box-clickable:hover .command-code {
  color: var(--accent-red);
}

.command-box-clickable:hover .copy-hint {
  color: var(--accent-red);
}

.command-code {
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

/* 弹窗按钮 */
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

[data-theme="dark"] .btn-primary {
  color: #111;
}

[data-theme="dark"] .btn-primary:hover {
  background: #fff;
  border-color: #fff;
  color: #111;
}

/* 版本链接 */
.version-links {
  margin-top: 16px;
}

.version-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--accent-red);
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.version-link:hover {
  opacity: 0.8;
}

.version-link-arrow {
  font-size: 14px;
  transition: transform 0.2s ease;
}

.version-link:hover .version-link-arrow {
  transform: translateX(3px);
}

</style>
