import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// 读取 package.json 获取版本
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    // 注入前端编译时间
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // 注入前端版本（与后端 package.json 同步）
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // 开发模式 API 端口为 19541（与 start:http:dev 对应）
        target: 'http://localhost:19541',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:19541',
        changeOrigin: true,
      },
    },
  },
})
