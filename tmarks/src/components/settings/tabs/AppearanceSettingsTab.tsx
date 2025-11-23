import { Palette } from 'lucide-react'
import { DefaultBookmarkIconSettings } from '../DefaultBookmarkIconSettings'
import { InfoBox } from '../InfoBox'
import type { DefaultBookmarkIcon } from '@/lib/types'

interface AppearanceSettingsTabProps {
  defaultIcon: DefaultBookmarkIcon
  onIconChange: (icon: DefaultBookmarkIcon) => void
}

export function AppearanceSettingsTab({
  defaultIcon,
  onIconChange,
}: AppearanceSettingsTabProps) {
  return (
    <div className="space-y-6">
      <DefaultBookmarkIconSettings
        selectedIcon={defaultIcon}
        onIconChange={onIconChange}
      />

      {/* 提示信息 */}
      <InfoBox icon={Palette} title="外观定制说明" variant="info">
        <ul className="space-y-1">
          <li>• 默认图标会在书签没有封面图和网站图标时显示</li>
          <li>• 所有外观设置会实时生效</li>
        </ul>
      </InfoBox>
    </div>
  )
}
