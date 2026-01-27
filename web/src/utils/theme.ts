export function getTheme(): 'light' | 'dark' {
  return (document.documentElement.dataset.theme as 'light' | 'dark') || 'light'
}

export function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme
  localStorage.setItem('theme', theme)

  // 动态切换 favicon
  const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement
  if (link) {
    link.href = theme === 'dark' ? '/favicon-dark.svg' : '/favicon.svg'
  }
}

export function initTheme() {
  const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  setTheme(saved || (prefersDark ? 'dark' : 'light'))
}
