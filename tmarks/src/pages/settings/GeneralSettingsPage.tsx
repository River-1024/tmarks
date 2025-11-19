import { useState, useEffect } from 'react'
import { Save, RotateCcw } from 'lucide-react'
import { usePreferences, useUpdatePreferences } from '@/hooks/usePreferences'
import { useToastStore } from '@/stores/toastStore'

export function GeneralSettingsPage() {
  const { data: preferences, isLoading } = usePreferences()
  const updatePreferences = useUpdatePreferences()
  const { addToast } = useToastStore()

  // 1. 搜索和筛选相关
  const [searchAutoClearSeconds, setSearchAutoClearSeconds] = useState(15)
  const [tagSelectionAutoClearSeconds, setTagSelectionAutoClearSeconds] = useState(30)
  const [enableSearchAutoClear, setEnableSearchAutoClear] = useState(true)
  const [enableTagSelectionAutoClear, setEnableTagSelectionAutoClear] = useState(false)

  // 从服务器加载设置
  useEffect(() => {
    if (preferences) {
      setSearchAutoClearSeconds(preferences.search_auto_clear_seconds || 15)
      setTagSelectionAutoClearSeconds(preferences.tag_selection_auto_clear_seconds || 30)
      setEnableSearchAutoClear(preferences.enable_search_auto_clear ?? true)
      setEnableTagSelectionAutoClear(preferences.enable_tag_selection_auto_clear ?? false)
    }
  }, [preferences])

  const handleSave = async () => {
    try {
      await updatePreferences.mutateAsync({
        search_auto_clear_seconds: searchAutoClearSeconds,
        tag_selection_auto_clear_seconds: tagSelectionAutoClearSeconds,
        enable_search_auto_clear: enableSearchAutoClear,
        enable_tag_selection_auto_clear: enableTagSelectionAutoClear,
      })
      addToast('success', '设置已保存')
    } catch {
      addToast('error', '保存失败')
    }
  }

  const handleReset = () => {
    setSearchAutoClearSeconds(15)
    setTagSelectionAutoClearSeconds(30)
    setEnableSearchAutoClear(true)
    setEnableTagSelectionAutoClear(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">通用设置</h1>
          <p className="text-sm text-muted-foreground mt-1">
            配置应用的通用行为和用户体验
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="btn btn-secondary flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
          <button
            onClick={handleSave}
            disabled={updatePreferences.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {updatePreferences.isPending ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        {/* 搜索框自动清空设置 */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">搜索框自动清空</h3>
            <p className="text-sm text-muted-foreground mt-1">
              设置搜索框在无操作后自动清空的时间
            </p>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableSearchAutoClear}
                onChange={(e) => setEnableSearchAutoClear(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm text-foreground">启用搜索框自动清空</span>
            </label>
          </div>

          {enableSearchAutoClear && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                自动清空时间（秒）
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={searchAutoClearSeconds}
                  onChange={(e) => setSearchAutoClearSeconds(Number(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={searchAutoClearSeconds}
                  onChange={(e) => setSearchAutoClearSeconds(Number(e.target.value))}
                  className="w-20 px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-background"
                />
                <span className="text-sm text-muted-foreground">秒</span>
              </div>
              <p className="text-xs text-muted-foreground">
                搜索框在 {searchAutoClearSeconds} 秒无操作后会自动清空
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-border"></div>

        {/* 标签选中自动清空设置 */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">标签选中自动清空</h3>
            <p className="text-sm text-muted-foreground mt-1">
              设置标签选中状态在无操作后自动清空的时间
            </p>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableTagSelectionAutoClear}
                onChange={(e) => setEnableTagSelectionAutoClear(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm text-foreground">启用标签选中自动清空</span>
            </label>
          </div>

          {enableTagSelectionAutoClear && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                自动清空时间（秒）
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="10"
                  max="120"
                  step="10"
                  value={tagSelectionAutoClearSeconds}
                  onChange={(e) => setTagSelectionAutoClearSeconds(Number(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={tagSelectionAutoClearSeconds}
                  onChange={(e) => setTagSelectionAutoClearSeconds(Number(e.target.value))}
                  className="w-20 px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-background"
                />
                <span className="text-sm text-muted-foreground">秒</span>
              </div>
              <p className="text-xs text-muted-foreground">
                标签选中状态在 {tagSelectionAutoClearSeconds} 秒无操作后会自动清空
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-border"></div>

        {/* 说明信息 */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            💡 使用提示
          </h4>
          <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <li>• 搜索框自动清空可以帮助你快速回到全部内容视图</li>
            <li>• 标签选中自动清空可以避免长时间保持筛选状态</li>
            <li>• 你可以根据使用习惯调整自动清空的时间</li>
            <li>• 如果不需要自动清空功能，可以关闭对应的开关</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
