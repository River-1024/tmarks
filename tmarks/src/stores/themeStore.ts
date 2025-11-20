import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'
type ColorTheme = 'default' | 'violet' | 'green' | 'orange'

interface ThemeStore {
  theme: Theme
  colorTheme: ColorTheme
  setTheme: (theme: Theme) => void
  setColorTheme: (colorTheme: ColorTheme) => void
  toggleTheme: () => void
}

// 检测系统主题偏好
const getSystemTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: getSystemTheme(),
      colorTheme: 'default',
      setTheme: (theme) => set({ theme }),
      setColorTheme: (colorTheme) => set({ colorTheme }),
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === 'light' ? 'dark' : 'light',
        })),
    }),
    {
      name: 'theme-storage',
    }
  )
)

// 监听系统主题变化（仅在未设置过主题时跟随系统）
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleThemeChange = (e: MediaQueryListEvent) => {
    const storedTheme = localStorage.getItem('theme-storage')
    // 如果用户没有手动设置过主题，则跟随系统
    if (!storedTheme) {
      useThemeStore.getState().setTheme(e.matches ? 'dark' : 'light')
    }
  }
  
  // 添加监听器
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleThemeChange)
  } else {
    // 兼容旧版浏览器
    mediaQuery.addListener(handleThemeChange)
  }
  
  // 注意：由于这是全局store，通常不需要清理
  // 如果需要清理，可以导出清理函数供应用卸载时调用
}
