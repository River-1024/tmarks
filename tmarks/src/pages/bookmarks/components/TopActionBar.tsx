import { 
  CheckCircle,
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
  Search,
  Plus
} from 'lucide-react'
import type { ViewMode, VisibilityFilter } from '../hooks/useBookmarksState'
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

interface TopActionBarProps {
  searchMode: 'bookmark' | 'tag'
  setSearchMode: (mode: 'bookmark' | 'tag') => void
  searchKeyword: string
  setSearchKeyword: (keyword: string) => void
  sortBy: SortOption
  onSortByChange: () => void
  visibilityFilter: VisibilityFilter
  setVisibilityFilter: (filter: VisibilityFilter) => void
  viewMode: ViewMode
  onViewModeChange: () => void
  batchMode: boolean
  setBatchMode: (mode: boolean) => void
  setSelectedIds: (ids: string[]) => void
  onOpenForm: () => void
  setIsTagSidebarOpen: (open: boolean) => void
}

export function TopActionBar({
  searchMode,
  setSearchMode,
  searchKeyword,
  setSearchKeyword,
  sortBy,
  onSortByChange,
  visibilityFilter,
  setVisibilityFilter,
  viewMode,
  onViewModeChange,
  batchMode,
  setBatchMode,
  setSelectedIds,
  onOpenForm,
  setIsTagSidebarOpen,
}: TopActionBarProps) {
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
          {/* 移动端标签抽屉按钮 + 搜索框 */}
          <div className="flex items-center gap-3 flex-1 min-w-0 w-full sm:min-w-[280px]">
            {/* 标签抽屉按钮 - 仅移动端显示 */}
            <button
              onClick={() => setIsTagSidebarOpen(true)}
              className="group lg:hidden w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-card border border-border hover:border-primary/30 hover:bg-primary/5 active:scale-95 text-foreground shadow-sm hover:shadow-md"
              title="打开标签"
              aria-label="打开标签"
            >
              <TagIcon className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
            </button>

            {/* 搜索框 */}
            <div className="flex-1 min-w-0">
              <div className="relative w-full">
                {/* 搜索模式切换按钮 */}
                <button
                  onClick={() => setSearchMode(searchMode === 'bookmark' ? 'tag' : 'bookmark')}
                  className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center transition-all hover:text-primary hover:scale-110"
                  title={searchMode === 'bookmark' ? '切换到标签搜索' : '切换到书签搜索'}
                  aria-label={searchMode === 'bookmark' ? '切换到标签搜索' : '切换到书签搜索'}
                >
                  {searchMode === 'bookmark' ? (
                    <BookmarkIcon className="w-5 h-5" />
                  ) : (
                    <TagIcon className="w-5 h-5" />
                  )}
                </button>

                {/* 搜索图标 */}
                <Search className="absolute left-10 sm:left-12 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground pointer-events-none" />

                {/* 搜索输入框 */}
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

          {/* 排序选择、视图切换和新增按钮 */}
          <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto scrollbar-hide pb-1 sm:pb-0">
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* 排序按钮 */}
              <button
                onClick={onSortByChange}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-primary/10 flex-shrink-0"
                style={{color: 'var(--foreground)'}}
                title={`${SORT_LABELS[sortBy]} (点击切换)`}
                aria-label={`${SORT_LABELS[sortBy]} (点击切换)`}
                type="button"
              >
                <SortIcon sort={sortBy} />
              </button>

              {/* 可见性筛选按钮 */}
              <button
                onClick={() => {
                  const nextFilter = visibilityFilter === 'all' 
                    ? 'public' 
                    : visibilityFilter === 'public' 
                      ? 'private' 
                      : 'all'
                  setVisibilityFilter(nextFilter)
                }}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all flex-shrink-0 ${
                  visibilityFilter === 'all'
                    ? 'hover:bg-primary/10'
                    : visibilityFilter === 'public'
                    ? 'text-success hover:bg-success/10'
                    : 'text-warning hover:bg-warning/10'
                }`}
                style={{color: visibilityFilter === 'all' ? 'var(--foreground)' : undefined}}
                title={`${VISIBILITY_LABELS[visibilityFilter]} (点击切换)`}
                aria-label={`${VISIBILITY_LABELS[visibilityFilter]} (点击切换)`}
                type="button"
              >
                <VisibilityIcon filter={visibilityFilter} />
              </button>

              {/* 视图模式按钮 */}
              <button
                onClick={onViewModeChange}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-primary/10 flex-shrink-0"
                style={{color: 'var(--foreground)'}}
                title={`${getViewModeLabel(viewMode)} (点击切换)`}
                aria-label={`${getViewModeLabel(viewMode)} (点击切换)`}
                type="button"
              >
                <ViewModeIcon mode={viewMode} />
              </button>

              {/* 批量操作按钮 */}
              <button
                onClick={() => {
                  setBatchMode(!batchMode)
                  if (batchMode) {
                    setSelectedIds([])
                  }
                }}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all flex-shrink-0 ${
                  batchMode
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'hover:bg-primary/10'
                }`}
                style={{color: batchMode ? undefined : 'var(--foreground)'}}
                title={batchMode ? '退出批量操作' : '批量操作'}
                aria-label={batchMode ? '退出批量操作' : '批量操作'}
                type="button"
              >
                <CheckCircle className="w-4 h-4" />
              </button>

              {/* 新增书签按钮 */}
              <button
                onClick={onOpenForm}
                className="flex items-center justify-center w-auto px-3 h-8 rounded-lg transition-all bg-gradient-to-br from-primary to-secondary text-primary-foreground hover:shadow-lg flex-shrink-0"
                title="新增书签"
                aria-label="新增书签"
                type="button"
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
