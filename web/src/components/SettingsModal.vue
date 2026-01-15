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
  return comps.mcp.outdated || comps.hooks.outdated || comps.agents.outdated || comps.skills.outdated
}

// 获取状态指示器样式类
function getIndicatorClass(comp: ComponentStatus): string {
  if (!comp.supported) return 'unsupported'
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

// 打开完整手册
function openFullDocs() {
  window.open('/docs', '_blank')
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
        </div>

        <div v-else class="plugin-loading">
          加载中...
        </div>

        <div class="command-bar">
          <span class="command-label">插件安装方式</span>
          <span class="command-text">npx tanmi-workspace setup</span>
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

      <!-- 版本信息 -->
      <div class="setting-section version-section">
        <div class="setting-section-title">版本信息</div>
        <div class="tech-spec">
          <div class="spec-item">
            <label>BACKEND VERSION</label>
            <div class="spec-value">v{{ devInfo?.packageVersion || '-' }}</div>
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

</style>
