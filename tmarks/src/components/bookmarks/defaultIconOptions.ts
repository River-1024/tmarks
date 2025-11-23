import type { DefaultBookmarkIcon } from '@/lib/types'

// 图标选项配置 - 仅保留动态图标
export const DEFAULT_ICON_OPTIONS: Array<{ value: DefaultBookmarkIcon; label: string; description: string }> = [
  { value: 'orbital-spinner', label: '轨道旋转', description: '炫酷轨道动画' },
]
