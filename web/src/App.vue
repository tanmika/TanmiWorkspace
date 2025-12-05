<script setup lang="ts">
// App 根组件
</script>

<template>
  <el-config-provider>
    <router-view />
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
