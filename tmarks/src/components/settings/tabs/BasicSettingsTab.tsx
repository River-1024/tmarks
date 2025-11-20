import type { UserPreferences } from '@/lib/types'
import { Sun, Moon, Monitor, LayoutGrid, List, Minimize2, Waves, Maximize2, Minimize, AlignJustify, Info } from 'lucide-react'
import { InfoBox } from '../InfoBox'

interface BasicSettingsTabProps {
    preferences: UserPreferences
    onUpdate: (updates: Partial<UserPreferences>) => void
}

export function BasicSettingsTab({ preferences, onUpdate }: BasicSettingsTabProps) {
    return (
        <div className="space-y-6">
            {/* 主题设置 */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-foreground">主题</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        选择应用的外观主题
                    </p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {[
                        { value: 'light', label: '浅色', icon: Sun },
                        { value: 'dark', label: '深色', icon: Moon },
                        { value: 'system', label: '跟随系统', icon: Monitor },
                    ].map((theme) => {
                        const Icon = theme.icon
                        return (
                            <button
                                key={theme.value}
                                onClick={() => onUpdate({ theme: theme.value as any })}
                                className={`p-3 sm:p-4 rounded-xl border-2 transition-all ${preferences.theme === theme.value
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                                    }`}
                            >
                                <Icon className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-primary" />
                                <div className="text-xs sm:text-sm font-medium">{theme.label}</div>
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="border-t border-border"></div>

            {/* 视图模式 */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-foreground">默认视图模式</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        选择书签列表的默认显示方式
                    </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {[
                        { value: 'card', label: '卡片视图', icon: LayoutGrid },
                        { value: 'list', label: '列表视图', icon: List },
                        { value: 'minimal', label: '极简列表', icon: AlignJustify },
                        { value: 'title', label: '标题瀑布', icon: Waves },
                    ].map((mode) => {
                        const Icon = mode.icon
                        return (
                            <button
                                key={mode.value}
                                onClick={() => onUpdate({ view_mode: mode.value as any })}
                                className={`p-2 sm:p-3 rounded-lg border-2 transition-all ${preferences.view_mode === mode.value
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                                    }`}
                            >
                                <Icon className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1 text-primary" />
                                <div className="text-xs font-medium">{mode.label}</div>
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="border-t border-border"></div>

            {/* 密度设置 */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-foreground">显示密度</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        调整界面元素的紧凑程度
                    </p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {[
                        { value: 'compact', label: '紧凑', desc: '更多内容', icon: Minimize },
                        { value: 'normal', label: '标准', desc: '平衡舒适', icon: Minimize2 },
                        { value: 'comfortable', label: '舒适', desc: '宽松布局', icon: Maximize2 },
                    ].map((density) => {
                        const Icon = density.icon
                        return (
                            <button
                                key={density.value}
                                onClick={() => onUpdate({ density: density.value as any })}
                                className={`p-2 sm:p-4 rounded-lg border-2 transition-all ${preferences.density === density.value
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                                    }`}
                            >
                                <Icon className="w-4 h-4 sm:w-5 sm:h-5 mb-1 sm:mb-2 text-primary" />
                                <div className="text-xs sm:text-sm font-medium mb-0.5 sm:mb-1">{density.label}</div>
                                <div className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">{density.desc}</div>
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="border-t border-border"></div>

            {/* 每页显示数量 */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-foreground">每页显示数量</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        设置每页加载的书签数量
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <input
                        type="range"
                        min="10"
                        max="100"
                        step="10"
                        value={preferences.page_size}
                        onChange={(e) => onUpdate({ page_size: Number(e.target.value) })}
                        className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <input
                        type="number"
                        min="10"
                        max="100"
                        value={preferences.page_size}
                        onChange={(e) => onUpdate({ page_size: Number(e.target.value) })}
                        className="w-20 px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-background"
                    />
                    <span className="text-sm text-muted-foreground">条</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    当前设置：每页显示 {preferences.page_size} 条书签
                </p>
            </div>

            <div className="border-t border-border"></div>

            {/* 默认排序方式 */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-foreground">默认排序方式</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        选择书签列表的默认排序规则
                    </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {[
                        { value: 'created', label: '创建时间', desc: '最新创建' },
                        { value: 'updated', label: '更新时间', desc: '最近修改' },
                        { value: 'pinned', label: '置顶优先', desc: '置顶在前' },
                        { value: 'popular', label: '热门优先', desc: '点击最多' },
                    ].map((sort) => (
                        <button
                            key={sort.value}
                            onClick={() => onUpdate({ sort_by: sort.value as any })}
                            className={`p-2 sm:p-3 rounded-lg border-2 transition-all ${preferences.sort_by === sort.value
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                                }`}
                        >
                            <div className="text-xs sm:text-sm font-medium mb-0.5 sm:mb-1">{sort.label}</div>
                            <div className="text-[10px] sm:text-xs text-muted-foreground">{sort.desc}</div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="border-t border-border"></div>

            {/* 提示信息 */}
            <InfoBox icon={Info} title="基础设置说明" variant="info">
                <ul className="space-y-1">
                    <li>• 主题设置会立即生效，无需保存</li>
                    <li>• 视图模式可以在书签页面随时切换</li>
                    <li>• 显示密度影响所有列表和卡片的间距</li>
                    <li>• 每页显示数量越大，加载时间可能越长</li>
                </ul>
            </InfoBox>
        </div>
    )
}
