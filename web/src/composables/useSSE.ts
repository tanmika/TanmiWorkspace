// src/composables/useSSE.ts
// SSE 事件监听 composable

import { ref, onMounted } from 'vue'

export type SSEEventType =
  | 'connected'
  | 'workspace_updated'
  | 'node_updated'
  | 'log_updated'
  | 'dispatch_updated'

export interface SSEEvent {
  type: SSEEventType
  workspaceId?: string
  nodeId?: string
  clientId?: string
  timestamp?: string
}

type EventCallback = (event: SSEEvent) => void

export function useSSE() {
  const connected = ref(false)
  const clientId = ref<string | null>(null)

  let eventSource: EventSource | null = null
  const callbacks: Map<SSEEventType | '*', Set<EventCallback>> = new Map()

  /**
   * 连接 SSE
   */
  function connect() {
    if (eventSource) {
      return
    }

    const baseUrl = import.meta.env.DEV ? 'http://localhost:19541' : ''
    eventSource = new EventSource(`${baseUrl}/api/events`)

    eventSource.onopen = () => {
      connected.value = true
      console.log('[SSE] 连接已建立')
    }

    eventSource.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data)

        if (event.type === 'connected') {
          clientId.value = event.clientId || null
          console.log('[SSE] 客户端ID:', clientId.value)
        }

        // 触发特定类型的回调
        const typeCallbacks = callbacks.get(event.type)
        if (typeCallbacks) {
          typeCallbacks.forEach(cb => cb(event))
        }

        // 触发通配符回调
        const wildcardCallbacks = callbacks.get('*')
        if (wildcardCallbacks) {
          wildcardCallbacks.forEach(cb => cb(event))
        }
      } catch (err) {
        console.error('[SSE] 解析消息失败:', err)
      }
    }

    eventSource.onerror = () => {
      connected.value = false
      console.log('[SSE] 连接断开，将自动重连...')
    }
  }

  /**
   * 断开 SSE
   */
  function disconnect() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
      connected.value = false
      clientId.value = null
      console.log('[SSE] 连接已关闭')
    }
  }

  /**
   * 监听事件
   */
  function on(type: SSEEventType | '*', callback: EventCallback) {
    if (!callbacks.has(type)) {
      callbacks.set(type, new Set())
    }
    callbacks.get(type)!.add(callback)

    // 返回取消监听的函数
    return () => {
      callbacks.get(type)?.delete(callback)
    }
  }

  /**
   * 移除监听
   */
  function off(type: SSEEventType | '*', callback: EventCallback) {
    callbacks.get(type)?.delete(callback)
  }

  return {
    connected,
    clientId,
    connect,
    disconnect,
    on,
    off,
  }
}

// 全局单例
let globalSSE: ReturnType<typeof useSSE> | null = null

export function getGlobalSSE() {
  if (!globalSSE) {
    globalSSE = useSSE()
  }
  return globalSSE
}

/**
 * Vue 组件用的 composable - 自动连接/断开
 */
export function useSSEAutoConnect() {
  const sse = getGlobalSSE()

  onMounted(() => {
    sse.connect()
  })

  // 注意：不在 onUnmounted 断开，因为是全局单例
  // 只有在整个应用卸载时才需要断开

  return sse
}
