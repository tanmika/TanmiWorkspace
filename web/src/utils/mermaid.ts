import mermaid from 'mermaid'
import { getTheme } from './theme'

// 从 CSS 变量读取颜色值
function getCSSVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name).trim() || fallback
}

// 根据当前主题生成 mermaid 配置
function getThemeVariables() {
  const isDark = getTheme() === 'dark'

  return {
    // 通用
    primaryColor: getCSSVar('--accent-red', isDark ? '#E84545' : '#D92B2B'),
    primaryTextColor: getCSSVar('--text-main', isDark ? '#E0E0E0' : '#111'),
    primaryBorderColor: getCSSVar('--accent-red', isDark ? '#E84545' : '#D92B2B'),
    lineColor: getCSSVar('--text-secondary', isDark ? '#888' : '#666'),
    secondaryColor: getCSSVar('--bg-secondary', isDark ? '#2A2A2A' : '#F5F5F5'),
    tertiaryColor: getCSSVar('--bg-main', isDark ? '#1E1E1E' : '#FFFFFF'),
    background: getCSSVar('--bg-main', isDark ? '#1E1E1E' : '#FFFFFF'),

    // 文字
    textColor: getCSSVar('--text-main', isDark ? '#E0E0E0' : '#111'),

    // Sequence Diagram 专属
    actorBkg: getCSSVar('--bg-secondary', isDark ? '#2A2A2A' : '#F5F5F5'),
    actorBorder: getCSSVar('--accent-red', isDark ? '#E84545' : '#D92B2B'),
    actorTextColor: getCSSVar('--text-main', isDark ? '#E0E0E0' : '#111'),
    signalColor: getCSSVar('--text-main', isDark ? '#E0E0E0' : '#111'),
    signalTextColor: getCSSVar('--text-main', isDark ? '#E0E0E0' : '#111'),
    activationBkgColor: getCSSVar('--path-bg', isDark ? '#333' : '#F0F0F0'),
    activationBorderColor: getCSSVar('--accent-red', isDark ? '#E84545' : '#D92B2B'),

    // Flowchart
    nodeBkg: getCSSVar('--bg-secondary', isDark ? '#2A2A2A' : '#F5F5F5'),
    nodeBorder: getCSSVar('--accent-red', isDark ? '#E84545' : '#D92B2B'),
    nodeTextColor: getCSSVar('--text-main', isDark ? '#E0E0E0' : '#111'),

    // 字体
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  }
}

// 初始化 mermaid
export function initMermaid() {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: getThemeVariables(),
    securityLevel: 'loose',
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
    },
    sequence: {
      diagramMarginX: 10,
      diagramMarginY: 10,
      actorMargin: 50,
      mirrorActors: false,
    },
  })
}

// 主题变更时重新初始化
export function updateMermaidTheme() {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: getThemeVariables(),
    securityLevel: 'loose',
  })
}

// 渲染队列：串行化 mermaid 渲染，避免并发冲突
let renderQueue: Promise<void> = Promise.resolve()
let renderCounter = 0

function cleanupMermaidElement(id: string) {
  // mermaid.render() 可能在 DOM 中残留临时元素，手动清理
  const el = document.getElementById(id)
  if (el) el.remove()
  // 同时清理可能的 d{id} 容器
  const dEl = document.getElementById('d' + id)
  if (dEl) dEl.remove()
}

async function doRender(code: string): Promise<string> {
  const id = `mermaid-${Date.now()}-${renderCounter++}`
  try {
    const { svg } = await mermaid.render(id, code)
    // 成功后也需要清理临时 DOM 元素，避免泄漏
    cleanupMermaidElement(id)
    return svg
  } catch (error) {
    cleanupMermaidElement(id)
    console.error('Mermaid render error:', error)
    throw error
  }
}

// 渲染单个 mermaid 图表（串行化 + 重试）
export function renderMermaid(code: string, retries = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    renderQueue = renderQueue.then(async () => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const svg = await doRender(code)
          resolve(svg)
          return
        } catch (error) {
          if (attempt < retries) {
            // 重试前重新初始化 mermaid，清除可能的脏状态
            initMermaid()
            await new Promise(r => setTimeout(r, 100))
          } else {
            // 最后一次重试失败，reject 错误
            reject(error)
          }
        }
      }
    })
  })
}

// 检测是否为 mermaid 代码块
const MERMAID_PATTERNS = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'erDiagram',
  'gantt',
  'pie',
  'journey',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'sankey',
  'xychart',
]

export function isMermaidCode(code: string): boolean {
  const trimmed = code.trim()
  return MERMAID_PATTERNS.some(pattern =>
    trimmed.startsWith(pattern) || trimmed.startsWith(`%%{`) // 支持 directive
  )
}
