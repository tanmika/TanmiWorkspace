import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// 读取 package.json 获取版本
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))

// 开发模式后端端口（支持环境变量自定义）
const API_PORT = process.env.API_PORT || '19541'

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
      // 开发模式通过 proxy 代理到后端，支持自定义端口：API_PORT=8080 npm run dev
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
      '/health': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
})
