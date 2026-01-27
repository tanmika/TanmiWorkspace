<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { marked, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import { initMermaid, renderMermaid, isMermaidCode, updateMermaidTheme } from '@/utils/mermaid'
import { getTheme } from '@/utils/theme'

const props = defineProps<{
  content: string
}>()

const containerRef = ref<HTMLElement>()
const mermaidBlocks = ref<Map<string, string>>(new Map())

// 初始化 mermaid
onMounted(() => {
  initMermaid()
})

// 监听主题变化，重新渲染 mermaid
let lastTheme = getTheme()
let themeCheckInterval: ReturnType<typeof setInterval> | null = null

const checkThemeChange = () => {
  const currentTheme = getTheme()
  if (currentTheme !== lastTheme) {
    lastTheme = currentTheme
    updateMermaidTheme()
    renderMermaidBlocks()
  }
}

// 定期检查主题变化
onMounted(() => {
  themeCheckInterval = setInterval(checkThemeChange, 500)
})

onUnmounted(() => {
  if (themeCheckInterval) {
    clearInterval(themeCheckInterval)
    themeCheckInterval = null
  }
})

// 自定义 renderer 处理 mermaid 代码块
const renderer = new marked.Renderer()
const originalCode = renderer.code.bind(renderer)

renderer.code = function(token: Tokens.Code) {
  const { text, lang } = token

  // 检测 mermaid 代码块
  if (lang === 'mermaid' || isMermaidCode(text)) {
    const id = `mermaid-block-${Math.random().toString(36).slice(2, 10)}`
    // 存储代码，稍后异步渲染
    mermaidBlocks.value.set(id, text)
    return `<div class="mermaid-container" data-mermaid-id="${id}"><div class="mermaid-loading">加载图表中...</div></div>`
  }

  return originalCode(token)
}

// 配置 marked
marked.setOptions({
  gfm: true,
  breaks: true,
})
marked.use({ renderer })

// 配置 DOMPurify 允许 mermaid 相关属性
DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName === 'data-mermaid-id') {
    data.forceKeepAttr = true
  }
})

// 渲染并清理 HTML
const renderedContent = computed(() => {
  if (!props.content) return ''
  mermaidBlocks.value.clear()
  const rawHtml = marked.parse(props.content) as string
  return DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['data-mermaid-id'],
  })
})

// 渲染版本号，用于取消过期的渲染任务
let renderVersion = 0

// 异步渲染 mermaid 图表
async function renderMermaidBlocks() {
  const currentVersion = ++renderVersion

  await nextTick()
  // 双重 nextTick 确保 v-html 更新后 DOM 完全就绪
  await nextTick()
  if (!containerRef.value) return

  const containers = containerRef.value.querySelectorAll('.mermaid-container[data-mermaid-id]')

  for (const container of containers) {
    // 如果内容已经再次变化，放弃当前渲染
    if (renderVersion !== currentVersion) return
    // 跳过已渲染的块
    if (container.classList.contains('mermaid-rendered')) continue

    const id = container.getAttribute('data-mermaid-id')
    if (!id) continue

    const code = mermaidBlocks.value.get(id)
    if (!code) continue

    try {
      const svg = await renderMermaid(code)
      // 再次检查版本，避免将过期结果写入 DOM
      if (renderVersion !== currentVersion) return
      container.innerHTML = svg
      container.classList.add('mermaid-rendered')
    } catch (error) {
      if (renderVersion === currentVersion) {
        container.innerHTML = `<div class="mermaid-error">图表渲染失败</div>`
      }
    }
  }
}

// 监听内容变化，重新渲染 mermaid
watch(renderedContent, () => {
  renderMermaidBlocks()
}, { flush: 'post' })

onMounted(() => {
  renderMermaidBlocks()
})
</script>

<template>
  <div ref="containerRef" class="markdown-content" v-html="renderedContent" />
</template>

<style scoped>
.markdown-content {
  line-height: 1.6;
  word-wrap: break-word;
  color: var(--text-main);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif, 'Noto Emoji';
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: 700;
  color: var(--text-main);
}

.markdown-content :deep(h1) { font-size: 1.5em; }
.markdown-content :deep(h2) { font-size: 1.3em; }
.markdown-content :deep(h3) { font-size: 1.1em; }

.markdown-content :deep(p) {
  margin: 0.5em 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.markdown-content :deep(li) {
  margin: 0.25em 0;
}

/* 列表项标记用红色点缀 */
.markdown-content :deep(ul) {
  list-style: none;
}

.markdown-content :deep(ul > li)::before {
  content: '■';
  color: var(--accent-red);
  font-size: 0.6em;
  margin-right: 0.8em;
  vertical-align: middle;
}

.markdown-content :deep(code) {
  background: var(--path-bg);
  padding: 0.2em 0.4em;
  border-radius: 0;
  font-family: var(--mono-font);
  font-size: 0.9em;
  color: var(--accent-red);
  border: 1px solid var(--border-color);
}

.markdown-content :deep(pre) {
  background: var(--path-bg);
  padding: 1em;
  border-radius: 0;
  overflow-x: auto;
  margin: 0.5em 0;
  border-left: 3px solid var(--accent-red);
}

.markdown-content :deep(pre code) {
  background: none;
  padding: 0;
  color: var(--text-main);
  border: none;
}

/* 引用块 - 红色左边框 */
.markdown-content :deep(blockquote) {
  border-left: 3px solid var(--accent-red);
  margin: 0.5em 0;
  padding-left: 1em;
  color: var(--text-secondary);
  background: var(--path-bg);
  padding: 0.5em 1em;
}

.markdown-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 0.5em;
  text-align: left;
}

.markdown-content :deep(th) {
  background: var(--path-bg);
  font-weight: 700;
  border-bottom: 2px solid var(--accent-red);
}

/* 链接 - 红色 */
.markdown-content :deep(a) {
  color: var(--accent-red);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

.markdown-content :deep(a:hover) {
  border-bottom-color: var(--accent-red);
}

.markdown-content :deep(strong) {
  font-weight: 700;
  color: var(--text-main);
}

/* 分隔线 - 红色 */
.markdown-content :deep(hr) {
  border: none;
  height: 2px;
  background: var(--accent-red);
  margin: 1em 0;
}

/* Mermaid 图表样式 */
.markdown-content :deep(.mermaid-container) {
  margin: 1em 0;
  padding: 1em;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--accent-red);
  overflow-x: auto;
}

.markdown-content :deep(.mermaid-container.mermaid-rendered) {
  display: flex;
  justify-content: center;
}

.markdown-content :deep(.mermaid-container svg) {
  max-width: 100%;
  height: auto;
}

.markdown-content :deep(.mermaid-loading) {
  color: var(--text-secondary);
  font-style: italic;
  padding: 1em;
  text-align: center;
}

.markdown-content :deep(.mermaid-error) {
  color: var(--accent-red);
  background: var(--path-bg);
  padding: 1em;
  border: 1px solid var(--accent-red);
  font-family: var(--mono-font);
  font-size: 0.9em;
}
</style>
