// API 客户端配置
import axios from 'axios'
import { useServiceStore } from '@/stores/service'
import { useToastStore } from '@/stores/toast'

const client = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 响应拦截器
client.interceptors.response.use(
  (response) => {
    // 请求成功，标记服务可用
    const serviceStore = useServiceStore()
    serviceStore.markAvailable()

    // 检查是否有手动操作标记，如有则显示提示
    if (response.data?.manualOperationRecorded === true) {
      const toastStore = useToastStore()
      toastStore.showToast()
    }

    return response.data
  },
  (error) => {
    const serviceStore = useServiceStore()

    // 检测网络错误或服务不可用
    if (!error.response || error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
      serviceStore.markUnavailable()
    } else {
      // 有响应说明服务是可用的
      serviceStore.markAvailable()
    }

    const message = error.response?.data?.error?.message || error.response?.data?.message || error.message || '请求失败'
    console.error('API Error:', message)
    return Promise.reject(new Error(message))
  }
)

export default client
