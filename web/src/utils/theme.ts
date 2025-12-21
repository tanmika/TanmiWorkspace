export function getTheme(): 'light' | 'dark' {
  return (document.documentElement.dataset.theme as 'light' | 'dark') || 'light'
}

export function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme
  localStorage.setItem('theme', theme)
}

export function initTheme() {
  const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  setTheme(saved || (prefersDark ? 'dark' : 'light'))
}
