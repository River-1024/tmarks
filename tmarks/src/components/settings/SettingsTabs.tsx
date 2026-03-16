import { ReactNode, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface Tab {
  id: string
  label: string
  icon: ReactNode
}

interface SettingsTabsProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
  children: ReactNode
}

export function SettingsTabs({ tabs, activeTab, onTabChange, children }: SettingsTabsProps) {
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const activeTabData = tabs.find((t) => t.id === activeTab)

  return (
    <div className="space-y-6">
      {/* 移动端下拉选择 */}
      <div className="sm:hidden relative">
        <button
          type="button"
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium bg-muted/30 rounded-lg border border-border"
        >
          <div className="flex items-center gap-2">
            {activeTabData?.icon}
            <span>{activeTabData?.label}</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${showMobileMenu ? 'rotate-180' : ''}`} />
        </button>
        {showMobileMenu && (
          <div className="absolute z-20 mt-2 w-full rounded-lg border border-border bg-popover shadow-lg">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onTabChange(tab.id)
                  setShowMobileMenu(false)
                }}
                className={`w-full flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-primary bg-primary/10'
                    : 'text-foreground hover:bg-muted/50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 桌面端标签页导航 */}
      <div className="hidden sm:block border-b border-border overflow-x-auto scrollbar-hide">
        <div className="flex gap-1 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 标签页内容 */}
      <div key={activeTab} className="animate-in fade-in duration-200">{children}</div>
    </div>
  )
}
