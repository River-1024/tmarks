import { 
  LayoutGrid, 
  List, 
  AlignLeft, 
  Type, 
  Eye, 
  Lock, 
  Layers, 
  Calendar, 
  RefreshCw, 
  Bookmark as BookmarkIcon, 
  TrendingUp,
  Tag as TagIcon,
  Search
} from 'lucide-react'
import type { ViewMode, VisibilityFilter } from '../hooks/usePublicShareState'
import type { SortOption } from '@/components/common/SortSelector'

const VISIBILITY_LABELS: Record<VisibilityFilter, string> = {
  all: '全部书签',
  public: '仅公开',
  private: '仅私密',
}

const SORT_LABELS: Record<SortOption, string> = {
  created: '按创建时间',
  updated: '按更新时间',
  pinned: '置顶优先',
  popular: '按热门程度',
}

// 视图模式图标组件
function ViewModeIcon({ mode }: { mode: ViewMode }) {
  switch (mode) {
    case 'card':
      return <LayoutGrid className="w-4 h-4" />
    case 'list':
      return <List className="w-4 h-4" />
    case 'minimal':
      return <AlignLeft className="w-4 h-4" />
    case 'title':
      return <Type className="w-4 h-4" />
    default:
      return <LayoutGrid className="w-4 h-4" />
  }
}

// 可见性筛选图标组件
function VisibilityIcon({ filter }: { filter: VisibilityFilter }) {
  switch (filter) {
    case 'public':
      return <Eye className="w-4 h-4" />
    case 'private':
      return <Lock className="w-4 h-4" />
    case 'all':
      return <Layers className="w-4 h-4" />
    default:
      return <Layers className="w-4 h-4" />
  }
}

// 排序图标组件
function SortIcon({ sort }: { sort: SortOption }) {
  switch (sort) {
    case 'created':
      return <Calendar className="w-4 h-4" />
    case 'updated':
      return <RefreshCw className="w-4 h-4" />
    case 'pinned':
      return <BookmarkIcon className="w-4 h-4" />
    case 'popular':
      return <TrendingUp className="w-4 h-4" />
    default:
      return <Calendar className="w-4 h-4" />
  }
}

interface ShareTopBarProps {
  searchMode: 'bookmark' | 'tag'
  setSearchMode: (mode: 'bookmark' | 'tag') => void
  searchKeyword: string
  setSearchKeyword: (keyword: string) => void
  sortBy: SortOption
  setSortBy: (sort: SortOption) => void
  visibilityFilter: VisibilityFilter
  setVisibilityFilter: (filter: VisibilityFilter) => void
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  setIsTagSidebarOpen: (open: boolean) => void
}

const SORT_OPTIONS: SortOption[] = ['created', 'updated', 'pinned', 'popular']
const VIEW_MODES = ['list', 'card', 'minimal', 'title'] as const

export function ShareTopBar({
  searchMode,
  setSearchMode,
  searchKeyword,
  setSearchKeyword,
  sortBy,
  setSortBy,
  visibilityFilter,
  setVisibilityFilter,
  viewMode,
  setViewMode,
  setIsTagSidebarOpen,
}: ShareTopBarProps) {
  const handleSortChange = () => {
    const currentIndex = SORT_OPTIONS.indexOf(sortBy)
    const nextIndex = (currentIndex + 1) % SORT_OPTIONS.length
    setSortBy(SORT_OPTIONS[nextIndex]!)
  }

  const handleViewModeChange = () => {
    const currentIndex = VIEW_MODES.indexOf(viewMode)
    const nextIndex = (currentIndex + 1) % VIEW_MODES.length
    setViewMode(VIEW_MODES[nextIndex]!)
  }

  const handleVisibilityChange = () => {
    const filters: VisibilityFilter[] = ['all', 'public', 'private']
    const currentIndex = filters.indexOf(visibilityFilter)
    const nextIndex = (currentIndex + 1) % filters.length
    setVisibilityFilter(filters[nextIndex]!)
  }

  const getViewModeLabel = (mode: ViewMode) => {
    switch (mode) {
      case 'list': return '列表视图'
      case 'card': return '卡片视图'
      case 'minimal': return '极简列表'
      case 'title': return '标题瀑布'
    }
  }

  return (
    <div className="flex-shrink-0 px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 md:pt-6 pb-3 sm:pb-4 w-full">
      <div className="p-4 sm:p-5 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full">
          <div className="flex items-center gap-3 flex-1 min-w-0 w-full sm:min-w-[280px]">
            <button
              onClick={() => setIsTagSidebarOpen(true)}
              className="group lg:hidden w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-card border border-border hover:border-primary/30 hover:bg-primary/5 active:scale-95 text-foreground shadow-sm hover:shadow-md"
              title="打开标签"
            >
              <TagIcon className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
            </button>

            <div className="flex-1 min-w-0">
              <div className="relative w-full">
                <button
                  onClick={() => setSearchMode(searchMode === 'bookmark' ? 'tag' : 'bookmark')}
                  className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center transition-all hover:text-primary hover:scale-110"
                >
                  {searchMode === 'bookmark' ? (
                    <BookmarkIcon className="w-5 h-5" />
                  ) : (
                    <TagIcon className="w-5 h-5" />
                  )}
                </button>

                <Search className="absolute left-10 sm:left-12 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground pointer-events-none" />

                <input
                  type="text"
                  className="input w-full !pl-16 sm:!pl-[4.5rem] h-11 sm:h-auto text-sm sm:text-base"
                  placeholder={searchMode === 'bookmark' ? '搜索书签...' : '搜索标签...'}
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto scrollbar-hide pb-1 sm:pb-0">
            <button
              onClick={handleSortChange}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-primary/10 flex-shrink-0"
              style={{color: 'var(--foreground)'}}
              title={`${SORT_LABELS[sortBy]} (点击切换)`}
            >
              <SortIcon sort={sortBy} />
            </button>

            <button
              onClick={handleVisibilityChange}
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all flex-shrink-0 ${
                visibilityFilter === 'all'
                  ? 'hover:bg-primary/10'
                  : visibilityFilter === 'public'
                  ? 'text-success hover:bg-success/10'
                  : 'text-warning hover:bg-warning/10'
              }`}
              style={{color: visibilityFilter === 'all' ? 'var(--foreground)' : undefined}}
              title={`${VISIBILITY_LABELS[visibilityFilter]} (点击切换)`}
            >
              <VisibilityIcon filter={visibilityFilter} />
            </button>

            <button
              onClick={handleViewModeChange}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-primary/10 flex-shrink-0"
              style={{color: 'var(--foreground)'}}
              title={`${getViewModeLabel(viewMode)} (点击切换)`}
            >
              <ViewModeIcon mode={viewMode} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
