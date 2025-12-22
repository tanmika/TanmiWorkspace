<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  content: string
}

const props = defineProps<Props>()

/**
 * 紧凑 Markdown 渲染
 * - 标题 → 加粗
 * - 换行 → 灰色分隔符
 * - 代码段 → [代码段]
 * - 表格 → [表格]
 * - 引用 → 代码块样式
 * - 保留：加粗、斜体、删除线、代码块
 */
const rendered = computed(() => {
  let text = props.content || ''

  // 1. 代码段 ```...``` → [代码段] 占位符（先处理，避免内部内容被其他规则影响）
  text = text.replace(/```[\s\S]*?```/g, '<code class="placeholder">[代码段]</code>')

  // 2. 表格检测（简单判断：连续行包含 | 且有分隔行 |---|）
  text = text.replace(/(?:^\|.+\|$\n?)+/gm, (match) => {
    if (match.includes('|---') || match.includes('| ---')) {
      return '<code class="placeholder">[表格]</code>'
    }
    return match
  })

  // 3. 标题 # → 加粗
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '**$1**')

  // 4. 引用 > → 代码块样式（移除 > 前缀，包裹为 code）
  text = text.replace(/^>\s*(.*)$/gm, '<code class="quote">$1</code>')

  // 5. 列表项 - 或 * → 红色方块（与 MarkdownContent 统一）
  text = text.replace(/^[\-\*]\s+/gm, '<span class="list-marker">■</span> ')
  // 数字列表保留原格式
  text = text.replace(/^(\d+\.)\s+/gm, '<span class="list-marker">$1</span> ')

  // 6. 加粗 **text** 或 __text__
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>')

  // 7. 斜体 *text* 或 _text_（注意不要匹配已处理的加粗）
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  text = text.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')

  // 8. 删除线 ~~text~~
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>')

  // 9. 行内代码 `code`（保留）
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')

  // 10. 链接 [text](url) → 纯文本显示
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // 11. 换行 → 分隔符（最后处理）
  // 多个连续换行压缩为一个分隔符
  text = text.replace(/\n{2,}/g, ' <span class="sep">⋮</span> ')
  text = text.replace(/\n/g, ' <span class="sep">⋮</span> ')

  // 12. 清理多余空格
  text = text.replace(/\s+/g, ' ').trim()

  return text
})
</script>

<template>
  <span class="compact-markdown" v-html="rendered"></span>
</template>

<style scoped>
.compact-markdown {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Noto Emoji';
}

/* 分隔符 */
.compact-markdown :deep(.sep) {
  color: var(--text-muted);
  margin: 0 0.3em;
  opacity: 0.6;
}

/* 列表标记 - 红色（与 MarkdownContent 统一） */
.compact-markdown :deep(.list-marker) {
  color: var(--accent-red);
  font-size: 0.7em;
  margin-right: 0.3em;
}

/* 加粗 */
.compact-markdown :deep(strong) {
  font-weight: 700;
  color: var(--text-main);
}

/* 斜体 */
.compact-markdown :deep(em) {
  font-style: italic;
}

/* 删除线 */
.compact-markdown :deep(del) {
  text-decoration: line-through;
  opacity: 0.7;
}

/* 行内代码 */
.compact-markdown :deep(code) {
  font-family: var(--mono-font);
  font-size: 11px;
  background: var(--path-bg);
  padding: 1px 4px;
  border: 1px solid var(--border-color);
  color: var(--accent-red);
}

/* 占位符（代码段、表格） */
.compact-markdown :deep(code.placeholder) {
  color: var(--text-muted);
  font-style: italic;
}

/* 引用 */
.compact-markdown :deep(code.quote) {
  color: var(--text-secondary);
  border-left: 2px solid var(--accent-red);
  background: var(--path-bg);
  padding-left: 6px;
}
</style>
