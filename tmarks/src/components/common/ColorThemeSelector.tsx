import { useThemeStore } from '@/stores/themeStore'

export function ColorThemeSelector() {
  const { colorTheme, setColorTheme } = useThemeStore()

  const toggleColorTheme = () => {
    setColorTheme(colorTheme === 'default' ? 'orange' : 'default')
  }

  return (
    <button
      onClick={toggleColorTheme}
      className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-primary/10"
      style={{color: 'var(--foreground)'}}
      aria-label="切换颜色主题"
      title={colorTheme === 'default' ? '切换到活力橙' : '切换到中性灰'}
    >
      {colorTheme === 'default' ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      )}
    </button>
  )
}
