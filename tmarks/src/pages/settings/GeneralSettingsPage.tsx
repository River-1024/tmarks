import { useState, useEffect } from 'react'
import { Save, RotateCcw, Settings, Zap, Palette, Chrome, Key, Share2, Database } from 'lucide-react'
import { usePreferences, useUpdatePreferences } from '@/hooks/usePreferences'
import { useToastStore } from '@/stores/toastStore'
import type { UserPreferences } from '@/lib/types'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { BasicSettingsTab } from '@/components/settings/tabs/BasicSettingsTab'
import { AutomationSettingsTab } from '@/components/settings/tabs/AutomationSettingsTab'
import { AppearanceSettingsTab } from '@/components/settings/tabs/AppearanceSettingsTab'
import { BrowserSettingsTab } from '@/components/settings/tabs/BrowserSettingsTab'
import { ApiSettingsTab } from '@/components/settings/tabs/ApiSettingsTab'
import { ShareSettingsTab } from '@/components/settings/tabs/ShareSettingsTab'
import { DataSettingsTab } from '@/components/settings/tabs/DataSettingsTab'

export function GeneralSettingsPage() {
  const { data: preferences, isLoading } = usePreferences()
  const updatePreferences = useUpdatePreferences()
  const { addToast } = useToastStore()

  const [activeTab, setActiveTab] = useState('basic')
  const [localPreferences, setLocalPreferences] = useState<UserPreferences | null>(null)

  // 从服务器加载设置
  useEffect(() => {
    if (preferences) {
      setLocalPreferences(preferences)
    }
  }, [preferences])

  const handleUpdate = (updates: Partial<UserPreferences>) => {
    if (localPreferences) {
      setLocalPreferences({ ...localPreferences, ...updates })
    }
  }

  const handleSave = async () => {
    if (!localPreferences) return
    
    try {
      await updatePreferences.mutateAsync({
        theme: localPreferences.theme,
        page_size: localPreferences.page_size,
        view_mode: localPreferences.view_mode,
        density: localPreferences.density,
        tag_layout: localPreferences.tag_layout,
        sort_by: localPreferences.sort_by,
        search_auto_clear_seconds: localPreferences.search_auto_clear_seconds,
        tag_selection_auto_clear_seconds: localPreferences.tag_selection_auto_clear_seconds,
        enable_search_auto_clear: localPreferences.enable_search_auto_clear,
        enable_tag_selection_auto_clear: localPreferences.enable_tag_selection_auto_clear,
        default_bookmark_icon: localPreferences.default_bookmark_icon,
      })
      addToast('success', '设置已保存')
    } catch {
      addToast('error', '保存失败')
    }
  }

  const handleReset = () => {
    if (preferences) {
      setLocalPreferences(preferences)
      addToast('info', '已重置为上次保存的设置')
    }
  }

  if (isLoading || !localPreferences) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const tabs = [
    { id: 'basic', label: '基础', icon: <Settings className="w-4 h-4" /> },
    { id: 'automation', label: '自动化', icon: <Zap className="w-4 h-4" /> },
    { id: 'appearance', label: '外观', icon: <Palette className="w-4 h-4" /> },
    { id: 'browser', label: '浏览器', icon: <Chrome className="w-4 h-4" /> },
    { id: 'api', label: 'API', icon: <Key className="w-4 h-4" /> },
    { id: 'share', label: '分享', icon: <Share2 className="w-4 h-4" /> },
    { id: 'data', label: '数据', icon: <Database className="w-4 h-4" /> },
  ]

  return (
    <div className="mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6 w-full max-w-full sm:max-w-[95vw] lg:max-w-[61.8vw] xl:max-w-[1400px]">
      {/* 页面标题和操作按钮 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">通用设置</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            配置应用的通用行为和用户体验
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleReset}
            className="btn btn-secondary btn-sm sm:btn flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">重置</span>
          </button>
          <button
            onClick={handleSave}
            disabled={updatePreferences.isPending}
            className="btn btn-primary btn-sm sm:btn flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">{updatePreferences.isPending ? '保存中...' : '保存设置'}</span>
            <span className="sm:hidden">保存</span>
          </button>
        </div>
      </div>

      {/* 标签页容器 */}
      <div className="card p-3 sm:p-6">
        <SettingsTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
          {activeTab === 'basic' && (
            <BasicSettingsTab
              preferences={localPreferences}
              onUpdate={handleUpdate}
            />
          )}

          {activeTab === 'automation' && (
            <AutomationSettingsTab
              searchEnabled={localPreferences.enable_search_auto_clear}
              searchSeconds={localPreferences.search_auto_clear_seconds}
              tagEnabled={localPreferences.enable_tag_selection_auto_clear}
              tagSeconds={localPreferences.tag_selection_auto_clear_seconds}
              onSearchEnabledChange={(enabled) => handleUpdate({ enable_search_auto_clear: enabled })}
              onSearchSecondsChange={(seconds) => handleUpdate({ search_auto_clear_seconds: seconds })}
              onTagEnabledChange={(enabled) => handleUpdate({ enable_tag_selection_auto_clear: enabled })}
              onTagSecondsChange={(seconds) => handleUpdate({ tag_selection_auto_clear_seconds: seconds })}
            />
          )}

          {activeTab === 'appearance' && (
            <AppearanceSettingsTab
              defaultIcon={localPreferences.default_bookmark_icon}
              tagLayout={localPreferences.tag_layout}
              onIconChange={(icon) => handleUpdate({ default_bookmark_icon: icon })}
              onTagLayoutChange={(layout) => handleUpdate({ tag_layout: layout })}
            />
          )}

          {activeTab === 'browser' && <BrowserSettingsTab />}

          {activeTab === 'api' && <ApiSettingsTab />}

          {activeTab === 'share' && <ShareSettingsTab />}

          {activeTab === 'data' && <DataSettingsTab />}
        </SettingsTabs>
      </div>
    </div>
  )
}
