<script setup lang="ts">
import { onMounted } from 'vue'
import { useServiceStore, useToastStore, useSettingsStore } from '@/stores'
import ServiceUnavailable from '@/components/ServiceUnavailable.vue'
import VersionUpdateNotification from '@/components/VersionUpdateNotification.vue'
import ManualOperationToast from '@/components/ManualOperationToast.vue'
import WsToastContainer from '@/components/ui/WsToastContainer.vue'

const serviceStore = useServiceStore()
const toastStore = useToastStore()
const settingsStore = useSettingsStore()

// 启动时检查服务状态并加载配置
onMounted(() => {
  serviceStore.checkHealth()
  settingsStore.loadSettings()
})
</script>

<template>
  <el-config-provider>
    <VersionUpdateNotification />
    <router-view />
    <ServiceUnavailable />
    <ManualOperationToast
      :visible="toastStore.showManualOperationToast"
      @close="toastStore.closeToast"
    />
    <WsToastContainer />
  </el-config-provider>
</template>

<style>
/* 全局样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
    sans-serif;
}

body {
  background-color: #f5f7fa;
}
</style>
