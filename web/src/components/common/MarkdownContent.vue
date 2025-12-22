<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{
  content: string
}>()

// 配置 marked
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // 换行符转换为 <br>
})

// 渲染并清理 HTML
const renderedContent = computed(() => {
  if (!props.content) return ''
  const rawHtml = marked.parse(props.content) as string
  return DOMPurify.sanitize(rawHtml)
})
</script>

<template>
  <div class="markdown-content" v-html="renderedContent" />
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
</style>
