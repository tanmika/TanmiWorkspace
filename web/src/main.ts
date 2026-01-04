import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
// @ts-ignore - Font import has no type declarations
import '@fontsource/noto-emoji'

import App from './App.vue'
import router from './router'
import './style.css'
import './styles/variables.css'
import { initTheme } from './utils/theme'
import { reportError } from './utils/errorReporter'

initTheme()

const app = createApp(App)

// 注册全局错误处理器（在 mount 之前）

// 1. Vue 组件错误处理
app.config.errorHandler = (err, vm, info) => {
  try {
    const error = err as Error
    const componentName = vm?.$options?.name || 'Anonymous'
    reportError({
      type: 'vue',
      message: error?.message || String(err),
      stack: error?.stack,
      component: componentName,
      extra: { info },
    })
  } catch {
    // 错误处理器本身不应抛出异常
  }
}

// 2. 全局 JS 错误处理
window.onerror = (message, filename, lineno, colno, error) => {
  try {
    reportError({
      type: 'js',
      message: typeof message === 'string' ? message : String(message),
      stack: error?.stack,
      extra: { filename, lineno, colno },
    })
  } catch {
    // 错误处理器本身不应抛出异常
  }
}

// 3. 未处理 Promise rejection
window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  try {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    reportError({
      type: 'promise',
      message,
      stack,
    })
  } catch {
    // 错误处理器本身不应抛出异常
  }
}

// 注册 Element Plus
app.use(ElementPlus)

// 注册 Element Plus Icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 注册 Pinia
app.use(createPinia())

// 注册 Router
app.use(router)

app.mount('#app')
