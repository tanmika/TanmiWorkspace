import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import './style.css'
import './styles/variables.css'
import { initTheme } from './utils/theme'

initTheme()

const app = createApp(App)

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
