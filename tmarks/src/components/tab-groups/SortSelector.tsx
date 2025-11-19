import { ArrowUpDown } from 'lucide-react'
import type { SortOption } from './sortUtils'

interface SortSelectorProps {
  value: SortOption
  onChange: (value: SortOption) => void
}

export function SortSelector({ value, onChange }: SortSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown className="w-5 h-5 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOption)}
        className="px-3 py-2 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary bg-card text-foreground"
      >
        <option value="created">按创建时间</option>
        <option value="title">按标题</option>
        <option value="count">按标签页数量</option>
      </select>
    </div>
  )
}
