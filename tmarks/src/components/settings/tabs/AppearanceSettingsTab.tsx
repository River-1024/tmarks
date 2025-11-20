import { Palette } from 'lucide-react'
import { DefaultBookmarkIconSettings } from '../DefaultBookmarkIconSettings'
import { InfoBox } from '../InfoBox'
import type { DefaultBookmarkIcon } from '@/lib/types'

interface AppearanceSettingsTabProps {
  defaultIcon: DefaultBookmarkIcon
  tagLayout: 'grid' | 'masonry'
  onIconChange: (icon: DefaultBookmarkIcon) => void
  onTagLayoutChange: (layout: 'grid' | 'masonry') => void
}

export function AppearanceSettingsTab({
  defaultIcon,
  tagLayout,
  onIconChange,
  onTagLayoutChange,
}: AppearanceSettingsTabProps) {
  return (
    <div className="space-y-6">
      <DefaultBookmarkIconSettings
        selectedIcon={defaultIcon}
        onIconChange={onIconChange}
      />

      <div className="border-t border-border"></div>

      {/* 标签布局 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">标签布局</h3>
          <p className="text-sm text-muted-foreground mt-1">
            选择标签侧边栏的显示方式
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button
            onClick={() => onTagLayoutChange('grid')}
            className={`p-4 sm:p-6 rounded-xl border-2 transition-all ${
              tagLayout === 'grid'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex flex-col items-center gap-2 sm:gap-3">
              <svg className="w-10 h-10 sm:w-12 sm:h-12 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z" />
              </svg>
              <div>
                <div className="text-xs sm:text-sm font-medium">标准网格</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">整齐排列</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => onTagLayoutChange('masonry')}
            className={`p-4 sm:p-6 rounded-xl border-2 transition-all ${
              tagLayout === 'masonry'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex flex-col items-center gap-2 sm:gap-3">
              <svg className="w-10 h-10 sm:w-12 sm:h-12 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h5v16H4zM10 10h5v10h-5zM16 6h5v14h-5z" />
              </svg>
              <div>
                <div className="text-xs sm:text-sm font-medium">横向瀑布</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">紧凑显示</div>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="border-t border-border"></div>

      {/* 提示信息 */}
      <InfoBox icon={Palette} title="外观定制说明" variant="info">
        <ul className="space-y-1">
          <li>• 默认图标会在书签没有封面图和网站图标时显示</li>
          <li>• 标签布局影响侧边栏标签的排列方式</li>
          <li>• 所有外观设置会实时生效</li>
        </ul>
      </InfoBox>
    </div>
  )
}
