<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
// 构建时静态导入用户手册
import docsContent from '@docs/用户手册.md?raw'

const router = useRouter()

// 主题 - 从 localStorage 读取
function getSavedTheme(): 'light' | 'dark' {
  try {
    const prefs = JSON.parse(localStorage.getItem('tanmi-workspace-home-preferences') || '{}')
    return prefs.theme || 'light'
  } catch {
    return 'light'
  }
}
const theme = ref<'light' | 'dark'>(getSavedTheme())
// 立即应用主题
document.documentElement.setAttribute('data-theme', theme.value)

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme.value)
  // 同步到 localStorage
  const prefs = JSON.parse(localStorage.getItem('tanmi-workspace-home-preferences') || '{}')
  prefs.theme = theme.value
  localStorage.setItem('tanmi-workspace-home-preferences', JSON.stringify(prefs))
}

// 目录项类型
interface TocItem {
  id: string
  title: string
  level: number // 2 = ##, 3 = ###
}

// 从 Markdown 内容提取目录
const tocItems = computed<TocItem[]>(() => {
  const items: TocItem[] = []
  // 匹配 ## 和 ### 标题
  const regex = /^(#{2,3})\s+(.+)$/gm
  let match
  while ((match = regex.exec(docsContent)) !== null) {
    const level = match[1]!.length
    const title = match[2]!.trim()
    // 生成 id：转换为小写，空格替换为 -，移除特殊字符
    const id = title
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, '') // 保留中文、字母、数字、空格和连字符
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    items.push({ id, title, level })
  }
  return items
})

// 当前高亮的目录项
const activeId = ref('')

// 内容区 ref
const contentRef = ref<HTMLElement | null>(null)

// 目录导航区 ref
const tocNavRef = ref<HTMLElement | null>(null)

// 点击目录项，平滑滚动到对应章节
function scrollToSection(id: string) {
  const element = document.getElementById(id)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    activeId.value = id
  }
}

// 滚动监听，更新当前高亮的目录项
function handleScroll() {
  if (!contentRef.value) return

  const offset = 100 // 偏移量，提前高亮
  const container = contentRef.value

  // 找到当前可见的章节
  let currentId = ''
  for (const item of tocItems.value) {
    const element = document.getElementById(item.id)
    if (element) {
      const rect = element.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      // 元素顶部相对于容器顶部的位置
      const relativeTop = rect.top - containerRect.top
      if (relativeTop <= offset) {
        currentId = item.id
      }
    }
  }

  if (currentId && currentId !== activeId.value) {
    activeId.value = currentId
    // 让左侧菜单的当前项滚动到可视区域居中
    scrollTocItemIntoView(currentId)
  }
}

// 将目录项滚动到左侧导航的可视区域居中
function scrollTocItemIntoView(id: string) {
  if (!tocNavRef.value) return

  const tocItem = tocNavRef.value.querySelector(`[data-toc-id="${id}"]`) as HTMLElement
  if (tocItem) {
    const navRect = tocNavRef.value.getBoundingClientRect()
    const itemRect = tocItem.getBoundingClientRect()

    // 计算目标滚动位置：让目录项在导航区中居中
    const targetScrollTop = tocNavRef.value.scrollTop + (itemRect.top - navRect.top) - (navRect.height / 2) + (itemRect.height / 2)

    tocNavRef.value.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    })
  }
}

// 返回上一页或首页
function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}

// 给标题添加 id
onMounted(() => {
  nextTick(() => {
    if (contentRef.value) {
      // 给所有 h2, h3 添加 id
      const headings = contentRef.value.querySelectorAll('h2, h3')
      headings.forEach((heading) => {
        const text = heading.textContent || ''
        const id = text
          .toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
        heading.id = id
      })

      // 添加滚动监听
      contentRef.value.addEventListener('scroll', handleScroll)

      // 初始化高亮
      if (tocItems.value.length > 0 && tocItems.value[0]) {
        activeId.value = tocItems.value[0].id
      }
    }
  })
})

onUnmounted(() => {
  if (contentRef.value) {
    contentRef.value.removeEventListener('scroll', handleScroll)
  }
})
</script>

<template>
  <div class="docs-view">
    <!-- 头部 -->
    <header class="docs-header">
      <div class="header-left">
        <button class="ws-btn text" @click="goBack" title="返回">&lt;</button>
        <h1 class="docs-title">用户手册</h1>
      </div>
      <div class="header-right">
        <button class="theme-toggle" @click="toggleTheme" :title="theme === 'light' ? '切换到深色模式' : '切换到浅色模式'">
          <svg v-if="theme === 'light'" class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg v-else class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- 主内容区 -->
    <div class="docs-main">
      <!-- 左侧目录导航 -->
      <aside class="docs-sidebar">
        <div class="sidebar-header">
          <h3>目录</h3>
        </div>
        <nav ref="tocNavRef" class="toc-nav">
          <ul class="toc-list">
            <li
              v-for="item in tocItems"
              :key="item.id"
              :data-toc-id="item.id"
              :class="['toc-item', `level-${item.level}`, { active: activeId === item.id }]"
              @click="scrollToSection(item.id)"
            >
              {{ item.title }}
            </li>
          </ul>
        </nav>
      </aside>

      <!-- 右侧内容区 -->
      <main ref="contentRef" class="docs-content">
        <MarkdownContent :content="docsContent" />
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ===== 页面布局 ===== */
.docs-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
}

/* ===== 头部 Header ===== */
.docs-header {
  height: 64px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 32px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.docs-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}

/* 按钮样式 */
.ws-btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid var(--border-heavy);
  background: var(--card-bg);
  color: var(--text-main);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.ws-btn:hover:not(:disabled) {
  border-color: var(--border-heavy);
  transform: translate(-1px, -1px);
  box-shadow: 2px 2px 0 var(--border-heavy);
}

.ws-btn:active:not(:disabled) {
  transform: translate(0, 0);
  box-shadow: none;
}

.ws-btn.text {
  border: none;
  background: transparent;
  padding: 0 8px;
  font-size: 14px;
}

.ws-btn.text:hover:not(:disabled) {
  box-shadow: none;
  background: rgba(0, 0, 0, 0.05);
  transform: none;
}

[data-theme="dark"] .ws-btn.text:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
}

/* 主题切换按钮 */
.theme-toggle {
  width: 36px;
  height: 36px;
  padding: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-heavy);
  color: var(--text-main);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.theme-toggle:hover {
  border-color: var(--border-heavy);
  color: var(--accent-red);
  background: var(--path-bg);
  transform: translateY(-1px);
  box-shadow: 2px 2px 0 var(--border-heavy);
}

.theme-toggle .icon-sun,
.theme-toggle .icon-moon {
  width: 18px;
  height: 18px;
}

/* ===== 主内容区 ===== */
.docs-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ===== 左侧目录导航 ===== */
.docs-sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border-right: 2px solid var(--border-heavy);
  overflow: hidden;
}

.sidebar-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.toc-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.toc-item {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  border-left: 2px solid transparent;
  line-height: 1.4;
}

.toc-item:hover {
  color: var(--text-main);
  background: var(--path-bg);
}

.toc-item.active {
  color: var(--accent-red);
  border-left-color: var(--accent-red);
  background: var(--path-bg);
  font-weight: 600;
}

/* 目录层级缩进 */
.toc-item.level-2 {
  padding-left: 12px;
}

.toc-item.level-3 {
  padding-left: 24px;
  font-size: 12px;
}

/* ===== 右侧内容区 ===== */
.docs-content {
  flex: 1;
  overflow-y: auto;
  padding: 32px 48px;
  background: var(--card-bg);
}

/* 内容区滚动条样式 */
.docs-content::-webkit-scrollbar {
  width: 8px;
}

.docs-content::-webkit-scrollbar-track {
  background: var(--bg-color);
}

.docs-content::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 0;
}

.docs-content::-webkit-scrollbar-thumb:hover {
  background: var(--border-heavy);
}

/* 目录导航滚动条 */
.toc-nav::-webkit-scrollbar {
  width: 4px;
}

.toc-nav::-webkit-scrollbar-track {
  background: transparent;
}

.toc-nav::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 0;
}

.toc-nav::-webkit-scrollbar-thumb:hover {
  background: var(--border-heavy);
}
</style>
