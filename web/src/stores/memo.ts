// Memo 状态管理
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { memoApi } from '@/api'
import type { MemoListItem, Memo } from '@/types'

export const useMemoStore = defineStore('memo', () => {
  // 状态
  const memos = ref<MemoListItem[]>([])
  const allTags = ref<string[]>([])
  const currentMemo = ref<Memo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 计算属性
  const memoCount = computed(() => memos.value.length)

  // 方法
  async function fetchMemos(workspaceId: string, tags?: string[]) {
    loading.value = true
    error.value = null
    try {
      const result = await memoApi.list(workspaceId, tags)
      memos.value = result.memos
      allTags.value = result.allTags
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取 memo 列表失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchMemo(workspaceId: string, memoId: string) {
    loading.value = true
    error.value = null
    try {
      const memo = await memoApi.get(workspaceId, memoId)
      currentMemo.value = memo
      return memo
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取 memo 失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  function clearMemos() {
    memos.value = []
    allTags.value = []
    currentMemo.value = null
    error.value = null
  }

  return {
    // 状态
    memos,
    allTags,
    currentMemo,
    loading,
    error,
    // 计算属性
    memoCount,
    // 方法
    fetchMemos,
    fetchMemo,
    clearMemos,
  }
})
