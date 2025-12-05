// 路由配置
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '工作区列表' },
  },
  {
    path: '/workspace/:id',
    name: 'workspace',
    component: () => import('@/views/WorkspaceView.vue'),
    meta: { title: '工作区详情' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'notFound',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: '页面未找到' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 路由守卫 - 更新页面标题
router.beforeEach((to, _from, next) => {
  document.title = `${to.meta.title || 'TanmiWorkspace'} - TanmiWorkspace`
  next()
})

export default router
