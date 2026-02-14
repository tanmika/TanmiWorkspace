// Diff 渲染工具函数
// 将 ChangeOperationSummary 转为前端可渲染的行数组

import type { ChangeOperationSummary } from '@/types'

export interface DiffLine {
  type: 'hunk' | 'ctx' | 'add' | 'del' | 'info'
  lineNum?: number       // 原始文件行号
  newLineNum?: number    // 新文件行号
  content: string
}

/**
 * 根据 operation 类型构造 diff 行数组
 */
export function buildDiffLines(operation: ChangeOperationSummary): DiffLine[] {
  switch (operation.type) {
    case 'add':
      return [{ type: 'info', content: `+ 新建文件 · ${operation.lineCount} 行` }]

    case 'delete':
      return [{ type: 'info', content: '文件已删除' }]

    case 'overwrite':
      return [{
        type: 'info',
        content: operation.hasOriginal
          ? '文件被整体覆盖（可回滚）'
          : '文件被整体覆盖（无法回滚，未保存原始内容）',
      }]

    case 'update':
      return buildUpdateDiff(operation)
  }
}

/**
 * 从 update 操作的 contextBefore/oldLines/newLines/contextAfter + lineNumber 构造 unified diff
 */
function buildUpdateDiff(operation: {
  oldLines: string[]
  newLines: string[]
  lineNumber: number
  contextBefore?: string[]
  contextAfter?: string[]
}): DiffLine[] {
  const { oldLines, newLines, lineNumber, contextBefore = [], contextAfter = [] } = operation
  const lines: DiffLine[] = []

  // hunk header — 可读格式
  const oldStart = lineNumber - contextBefore.length
  const delCount = oldLines.length
  const addCount = newLines.length
  const parts: string[] = [`Line${oldStart}`]
  if (delCount > 0) parts.push(`-${delCount}`)
  if (addCount > 0) parts.push(`+${addCount}`)
  lines.push({
    type: 'hunk',
    content: parts.join(' '),
  })

  // context before
  let currentOldLine = oldStart
  let currentNewLine = oldStart
  for (const line of contextBefore) {
    lines.push({ type: 'ctx', lineNum: currentOldLine, newLineNum: currentNewLine, content: line })
    currentOldLine++
    currentNewLine++
  }

  // deleted lines
  for (const line of oldLines) {
    lines.push({ type: 'del', lineNum: currentOldLine, content: line })
    currentOldLine++
  }

  // added lines
  for (const line of newLines) {
    lines.push({ type: 'add', newLineNum: currentNewLine, content: line })
    currentNewLine++
  }

  // context after
  for (const line of contextAfter) {
    lines.push({ type: 'ctx', lineNum: currentOldLine, newLineNum: currentNewLine, content: line })
    currentOldLine++
    currentNewLine++
  }

  return lines
}
