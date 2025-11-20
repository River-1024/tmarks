import { Info } from 'lucide-react'
import { SearchAutoClearSettings } from '../SearchAutoClearSettings'
import { TagSelectionAutoClearSettings } from '../TagSelectionAutoClearSettings'
import { InfoBox } from '../InfoBox'

interface AutomationSettingsTabProps {
  searchEnabled: boolean
  searchSeconds: number
  tagEnabled: boolean
  tagSeconds: number
  onSearchEnabledChange: (enabled: boolean) => void
  onSearchSecondsChange: (seconds: number) => void
  onTagEnabledChange: (enabled: boolean) => void
  onTagSecondsChange: (seconds: number) => void
}

export function AutomationSettingsTab({
  searchEnabled,
  searchSeconds,
  tagEnabled,
  tagSeconds,
  onSearchEnabledChange,
  onSearchSecondsChange,
  onTagEnabledChange,
  onTagSecondsChange,
}: AutomationSettingsTabProps) {
  return (
    <div className="space-y-6">
      <SearchAutoClearSettings
        enabled={searchEnabled}
        seconds={searchSeconds}
        onEnabledChange={onSearchEnabledChange}
        onSecondsChange={onSearchSecondsChange}
      />

      <div className="border-t border-border"></div>

      <TagSelectionAutoClearSettings
        enabled={tagEnabled}
        seconds={tagSeconds}
        onEnabledChange={onTagEnabledChange}
        onSecondsChange={onTagSecondsChange}
      />

      <div className="border-t border-border"></div>

      {/* 提示信息 */}
      <InfoBox icon={Info} title="自动化功能说明" variant="info">
        <ul className="space-y-1">
          <li>• 自动清空功能可以帮助你快速回到初始状态</li>
          <li>• 你可以根据使用习惯调整自动清空的时间</li>
          <li>• 如果不需要自动清空，可以关闭对应的开关</li>
        </ul>
      </InfoBox>
    </div>
  )
}
