import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // 开发模式 API 端口为 3001（与 start:http:dev 对应）
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
