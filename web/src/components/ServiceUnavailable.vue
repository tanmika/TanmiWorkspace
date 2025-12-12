<script setup lang="ts">
import { computed } from 'vue'
import { Warning, Refresh } from '@element-plus/icons-vue'
import { useServiceStore } from '@/stores/service'

const serviceStore = useServiceStore()

const isVisible = computed(() => !serviceStore.isAvailable)

async function handleRetry() {
  await serviceStore.checkHealth()
  if (serviceStore.isAvailable) {
    // 服务恢复，刷新页面
    window.location.reload()
  }
}
</script>

<template>
  <Transition name="fade">
    <div v-if="isVisible" class="service-unavailable">
      <div class="content">
        <el-icon class="icon" :size="48">
          <Warning />
        </el-icon>
        <h2>服务未启动</h2>
        <p class="description">
          TanmiWorkspace 后端服务当前不可用，请通过以下方式启动：
        </p>
        <div class="methods">
          <div class="method">
            <div class="method-title">方式一：通过 Claude Code 启动</div>
            <div class="method-desc">在项目目录下启动 Claude Code，MCP 服务会自动附带启动 HTTP 服务</div>
          </div>
          <div class="method">
            <div class="method-title">方式二：手动启动 HTTP 服务</div>
            <code class="command">npm run start:http</code>
          </div>
        </div>
        <el-button type="primary" :icon="Refresh" @click="handleRetry">
          重新检测
        </el-button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.service-unavailable {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.content {
  text-align: center;
  max-width: 500px;
  padding: 40px;
}

.icon {
  color: #e6a23c;
  margin-bottom: 16px;
}

h2 {
  margin: 0 0 12px 0;
  font-size: 24px;
  color: #303133;
}

.description {
  color: #606266;
  margin-bottom: 24px;
  line-height: 1.6;
}

.methods {
  text-align: left;
  background: #f5f7fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.method {
  margin-bottom: 16px;
}

.method:last-child {
  margin-bottom: 0;
}

.method-title {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.method-desc {
  color: #909399;
  font-size: 13px;
}

.command {
  display: block;
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 13px;
  margin-top: 8px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
