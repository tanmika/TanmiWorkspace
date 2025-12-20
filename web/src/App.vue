<script setup lang="ts">
import { onMounted } from 'vue'
import { useServiceStore } from '@/stores/service'
import ServiceUnavailable from '@/components/ServiceUnavailable.vue'
import VersionUpdateNotification from '@/components/VersionUpdateNotification.vue'

const serviceStore = useServiceStore()

// 启动时检查服务状态
onMounted(() => {
  serviceStore.checkHealth()
})
</script>

<template>
  <el-config-provider>
    <VersionUpdateNotification />
    <router-view />
    <ServiceUnavailable />
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
