import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
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
  TrendingUp 
} from 'lucide-react'
import { TagSidebar } from '@/components/tags/TagSidebar'
import { BookmarkListContainer } from '@/components/bookmarks/BookmarkListContainer'
import { PaginationFooter } from '@/components/common/PaginationFooter'
import type { SortOption } from '@/components/common/SortSelector'
import { usePublicShare } from '@/hooks/useShare'
import type { Bookmark, Tag } from '@/lib/types'

const VIEW_MODES = ['list', 'card', 'minimal', 'title'] as const
type ViewMode = typeof VIEW_MODES[number]
type VisibilityFilter = 'all' | 'public' | 'private'

const SORT_OPTIONS: SortOption[] = ['created', 'updated', 'pinned', 'popular']

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

// 分页配置
const PAGE_SIZE = 30 // 每页显示30个书签

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

export function PublicSharePage() {
  const { slug = '' } = useParams()
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [debouncedSelectedTags, setDebouncedSelectedTags] = useState<string[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [debouncedSearchKeyword, setDebouncedSearchKeyword] = useState('')
  const [searchMode, setSearchMode] = useState<'bookmark' | 'tag'>('bookmark')
  const [viewMode, setViewMode] = useState<ViewMode>('card')
  const [sortBy, setSortBy] = useState<SortOption>('created')
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all')
  const [tagLayout, setTagLayout] = useState<'grid' | 'masonry'>('grid')
  const [isTagSidebarOpen, setIsTagSidebarOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const tagDebounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const autoCleanupTimerRef = useRef<NodeJS.Timeout | null>(null)
  const searchCleanupTimerRef = useRef<NodeJS.Timeout | null>(null)

  const shareQuery = usePublicShare(slug, Boolean(slug))
  const allBookmarks = useMemo(() => shareQuery.data?.bookmarks || [], [shareQuery.data?.bookmarks])

  // 标签排序状态
  const [tagSortBy, setTagSortBy] = useState<'usage' | 'name' | 'clicks'>('usage')

  // 标签选择防抖：延迟300ms更新实际标签筛选（优化性能）
  useEffect(() => {
    if (tagDebounceTimerRef.current) {
      clearTimeout(tagDebounceTimerRef.current)
    }

    tagDebounceTimerRef.current = setTimeout(() => {
      setDebouncedSelectedTags(selectedTags)
    }, 300)

    return () => {
      if (tagDebounceTimerRef.current) {
        clearTimeout(tagDebounceTimerRef.current)
      }
    }
  }, [selectedTags])

  // 搜索防抖：延迟500ms更新实际搜索关键词（优化性能）
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchKeyword(searchKeyword)
    }, 500)

    return () => clearTimeout(timer)
  }, [searchKeyword])

  // 可见性筛选后的书签
  const visibilityFilteredBookmarks = useMemo(() => {
    if (visibilityFilter === 'all') return allBookmarks
    if (visibilityFilter === 'public') {
      return allBookmarks.filter((bookmark: Bookmark) => bookmark.is_public)
    }
    return allBookmarks.filter((bookmark: Bookmark) => !bookmark.is_public)
  }, [allBookmarks, visibilityFilter])

  // 可见性 + 标签筛选后的书签（用于标签相关性计算）
  // 注意：这里使用未防抖的 selectedTags，与 TagSidebar 的计算保持同步
  const tagFilteredBookmarks = useMemo(() => {
    if (selectedTags.length === 0) {
      return visibilityFilteredBookmarks
    }
    return visibilityFilteredBookmarks.filter((bookmark: Bookmark) => {
      const bookmarkTagIds = bookmark.tags?.map((t: Tag) => t.id) || []
      return selectedTags.every((tagId) => bookmarkTagIds.includes(tagId))
    })
  }, [visibilityFilteredBookmarks, selectedTags])

  // 完整筛选后的书签列表（用于分页）
  const allFilteredBookmarks = useMemo(() => {
    // 1. 可见性筛选
    const byVisibility = visibilityFilteredBookmarks

    // 2. 标签筛选（使用防抖后的值）
    const byTags = debouncedSelectedTags.length
      ? byVisibility.filter((bookmark: Bookmark) => {
        const bookmarkTagIds = bookmark.tags?.map((t: Tag) => t.id) || []
        return debouncedSelectedTags.every((tagId) => bookmarkTagIds.includes(tagId))
      })
      : byVisibility

    // 3. 关键词搜索（使用防抖后的值，仅在书签搜索模式下生效）
    const byKeyword = searchMode === 'bookmark' && debouncedSearchKeyword.trim()
      ? byTags.filter((bookmark: Bookmark) => {
        const keyword = debouncedSearchKeyword.trim().toLowerCase()
        return (
          bookmark.title.toLowerCase().includes(keyword) ||
          (bookmark.description || '').toLowerCase().includes(keyword) ||
          bookmark.url.toLowerCase().includes(keyword)
        )
      })
      : byTags

    // 4. 排序
    const sorted = [...byKeyword].sort((a, b) => {
      switch (sortBy) {
        case 'updated':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        case 'pinned':
          if (a.is_pinned !== b.is_pinned) {
            return Number(b.is_pinned) - Number(a.is_pinned)
          }
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'popular':
          if ((b.click_count || 0) !== (a.click_count || 0)) {
            return (b.click_count || 0) - (a.click_count || 0)
          }
          if (b.last_clicked_at && a.last_clicked_at) {
            return new Date(b.last_clicked_at).getTime() - new Date(a.last_clicked_at).getTime()
          }
          return 0
        case 'created':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

    return sorted
  }, [visibilityFilteredBookmarks, debouncedSelectedTags, debouncedSearchKeyword, sortBy, searchMode])

  // 当前页显示的书签（分页后）
  const displayedBookmarks = useMemo(() => {
    return allFilteredBookmarks.slice(0, currentPage * PAGE_SIZE)
  }, [allFilteredBookmarks, currentPage])

  // 分页信息
  const hasMore = displayedBookmarks.length < allFilteredBookmarks.length
  const currentPageCount = Math.min(PAGE_SIZE, allFilteredBookmarks.length - (currentPage - 1) * PAGE_SIZE)

  const shareInfo = shareQuery.data?.profile

  // 对标签进行排序
  const tags = useMemo(() => {
    const rawTags = shareQuery.data?.tags || []
    const tagsCopy = [...rawTags]
    if (tagSortBy === 'name') {
      return tagsCopy.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    }
    // 按使用频率排序（bookmark_count）
    return tagsCopy.sort((a, b) => (b.bookmark_count || 0) - (a.bookmark_count || 0))
  }, [shareQuery.data?.tags, tagSortBy])

  // 当筛选条件改变时，重置到第一页（使用防抖后的值）
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSelectedTags, debouncedSearchKeyword, sortBy, visibilityFilter])

  // 标签自动清空逻辑 - 30秒后自动清除选中状态
  useEffect(() => {
    // 清除之前的定时器
    if (autoCleanupTimerRef.current) {
      clearTimeout(autoCleanupTimerRef.current)
      autoCleanupTimerRef.current = null
    }

    // 如果有选中的标签，设置30秒后自动清空
    if (selectedTags.length > 0) {
      autoCleanupTimerRef.current = setTimeout(() => {
        setSelectedTags([])
      }, 30000) // 30秒
    }

    // 清理函数
    return () => {
      if (autoCleanupTimerRef.current) {
        clearTimeout(autoCleanupTimerRef.current)
        autoCleanupTimerRef.current = null
      }
    }
  }, [selectedTags])

  // 搜索关键词自动清空逻辑 - 20秒后自动清除搜索内容
  useEffect(() => {
    // 清除之前的定时器
    if (searchCleanupTimerRef.current) {
      clearTimeout(searchCleanupTimerRef.current)
      searchCleanupTimerRef.current = null
    }

    // 如果有搜索关键词，设置15秒后自动清空
    if (searchKeyword.trim()) {
      searchCleanupTimerRef.current = setTimeout(() => {
        setSearchKeyword('')
      }, 15000) // 15秒
    }

    // 清理函数
    return () => {
      if (searchCleanupTimerRef.current) {
        clearTimeout(searchCleanupTimerRef.current)
        searchCleanupTimerRef.current = null
      }
    }
  }, [searchKeyword])

  // 循环切换视图模式
  const handleViewModeChange = useCallback(() => {
    const currentIndex = VIEW_MODES.indexOf(viewMode)
    const nextIndex = (currentIndex + 1) % VIEW_MODES.length
    setViewMode(VIEW_MODES[nextIndex]!)
  }, [viewMode])

  // 循环切换可见性筛选
  const handleVisibilityChange = useCallback(() => {
    const nextFilter = visibilityFilter === 'all'
      ? 'public'
      : visibilityFilter === 'public'
        ? 'private'
        : 'all'
    setVisibilityFilter(nextFilter)
  }, [visibilityFilter])

  // 循环切换排序方式
  const handleSortByChange = useCallback(() => {
    const currentIndex = SORT_OPTIONS.indexOf(sortBy)
    const nextIndex = (currentIndex + 1) % SORT_OPTIONS.length
    setSortBy(SORT_OPTIONS[nextIndex]!)
  }, [sortBy])

  const handleLoadMore = () => {
    setCurrentPage((prev) => prev + 1)
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
    <>
      <div className="w-full mx-auto py-3 sm:py-4 md:py-6 px-3 sm:px-4 md:px-6">
        {shareQuery.isLoading && (
          <div className="text-center text-muted-foreground py-24">正在加载公开书签...</div>
        )}

        {shareQuery.isError && !shareQuery.isLoading && (
          <div className="text-center text-muted-foreground py-24">分享链接无效或内容已下线。</div>
        )}

        {!shareQuery.isLoading && !shareQuery.isError && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 md:gap-6">
            <aside className="hidden lg:block lg:col-span-3 order-2 lg:order-1 fixed top-[calc(5rem+0.75rem)] sm:top-[calc(5rem+1rem)] md:top-[calc(5rem+1.5rem)] left-3 sm:left-4 md:left-6 bottom-3 w-[calc(25%-1.5rem)] z-40">
              <TagSidebar
                selectedTags={selectedTags}
                onTagsChange={setSelectedTags}
                bookmarks={tagFilteredBookmarks}
                isLoadingBookmarks={shareQuery.isLoading}
                tagLayout={tagLayout}
                onTagLayoutChange={setTagLayout}
                readOnly
                availableTags={tags}
                tagSortBy={tagSortBy}
                onTagSortChange={setTagSortBy}
                searchQuery={searchMode === 'tag' ? debouncedSearchKeyword : ''}
              />
            </aside>

            <main className="lg:col-span-9 lg:col-start-4 order-1 lg:order-2">
              <div className="space-y-3 sm:space-y-4 md:space-y-5">
                {/* 分享信息卡片 */}
                <div className="card shadow-float">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1">
                      <h1 className="text-xl sm:text-2xl font-bold text-primary">
                        {shareInfo?.title || `${shareInfo?.username || '访客'}的书签精选`}
                      </h1>
                      {shareInfo?.description && (
                        <p className="text-sm text-muted-foreground mt-1">{shareInfo.description}</p>
                      )}
                    </div>
                    {/* 统计信息 */}
                    {allBookmarks.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        {allFilteredBookmarks.length === allBookmarks.length ? (
                          <span>共 {allBookmarks.length} 个书签</span>
                        ) : (
                          <span>
                            筛选出 {allFilteredBookmarks.length} / {allBookmarks.length} 个书签
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 顶部操作栏 */}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    {/* 移动端标签抽屉按钮 + 搜索框 */}
                    <div className="flex items-center gap-3 flex-1 w-full sm:min-w-[280px]">
                      {/* 标签抽屉按钮 - 仅移动端显示 */}
                      <button
                        onClick={() => setIsTagSidebarOpen(true)}
                        className="lg:hidden w-11 h-11 rounded-xl flex items-center justify-center transition-all shadow-float bg-card border border-border hover:bg-muted hover:border-primary/30 text-foreground"
                        title="打开标签"
                        aria-label="打开标签"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                      </button>

                      {/* 搜索框 */}
                      <div className="flex-1 min-w-0">
                        <div className="relative w-full">
                          {/* 搜索模式切换按钮 - 内部左侧 */}
                          <button
                            onClick={() => setSearchMode(searchMode === 'bookmark' ? 'tag' : 'bookmark')}
                            className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center transition-all hover:text-primary"
                            title={searchMode === 'bookmark' ? '切换到标签搜索' : '切换到书签搜索'}
                            aria-label={searchMode === 'bookmark' ? '切换到标签搜索' : '切换到书签搜索'}
                          >
                            {searchMode === 'bookmark' ? (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                              </svg>
                            )}
                          </button>

                          {/* 搜索图标 */}
                          <svg className="absolute left-10 sm:left-12 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>

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

                    <div className="flex items-center gap-1 w-full sm:w-auto">
                      {/* 排序按钮 - 点击循环切换 */}
                      <button
                        onClick={handleSortByChange}
                        className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-primary/10 flex-shrink-0"
                        style={{color: 'var(--foreground)'}}
                        title={`${SORT_LABELS[sortBy]} (点击切换)`}
                        aria-label={`${SORT_LABELS[sortBy]} (点击切换)`}
                        type="button"
                      >
                        <SortIcon sort={sortBy} />
                      </button>

                      {/* 可见性筛选按钮 - 点击循环切换 */}
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
                        aria-label={`${VISIBILITY_LABELS[visibilityFilter]} (点击切换)`}
                        type="button"
                      >
                        <VisibilityIcon filter={visibilityFilter} />
                      </button>

                      {/* 视图模式按钮 - 点击循环切换 */}
                      <button
                        onClick={handleViewModeChange}
                        className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-primary/10 flex-shrink-0"
                        style={{color: 'var(--foreground)'}}
                        title={`${getViewModeLabel(viewMode)} (点击切换)`}
                        aria-label={`${getViewModeLabel(viewMode)} (点击切换)`}
                        type="button"
                      >
                        <ViewModeIcon mode={viewMode} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 书签列表 */}
                {displayedBookmarks.length > 0 ? (
                  <>
                    <BookmarkListContainer
                      bookmarks={displayedBookmarks}
                      viewMode={viewMode}
                      readOnly
                    />

                    {/* 分页控制 */}
                    <PaginationFooter
                      hasMore={hasMore}
                      isLoading={false}
                      onLoadMore={handleLoadMore}
                      currentCount={currentPageCount}
                      totalLoaded={displayedBookmarks.length}
                    />
                  </>
                ) : !shareQuery.isLoading && allBookmarks.length > 0 ? (
                  <div className="card text-center py-12">
                    <div className="text-muted-foreground mb-2">
                      <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <p className="text-lg font-medium">没有找到匹配的书签</p>
                      <p className="text-sm mt-2">尝试调整筛选条件或搜索关键词</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </main>
          </div>
        )}

        {/* 移动端标签抽屉 */}
        {isTagSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* 背景遮罩 */}
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setIsTagSidebarOpen(false)}
            />

            {/* 抽屉内容 */}
            <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-background border-r border-border shadow-xl animate-in slide-in-from-left duration-300">
              {/* 抽屉头部 */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-background">
                <h3 className="text-lg font-semibold text-foreground">标签筛选</h3>
                <button
                  onClick={() => setIsTagSidebarOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
                  aria-label="关闭标签抽屉"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 抽屉内容区域 */}
              <div className="flex-1 overflow-y-auto p-4 bg-background">
                <TagSidebar
                  selectedTags={selectedTags}
                  onTagsChange={(newTags) => {
                    setSelectedTags(newTags)
                    // 选择2个或更多标签后自动关闭抽屉
                    if (newTags.length >= 2 && newTags.length > selectedTags.length) {
                      setTimeout(() => setIsTagSidebarOpen(false), 500)
                    }
                  }}
                  tagLayout={tagLayout}
                  onTagLayoutChange={setTagLayout}
                  bookmarks={tagFilteredBookmarks}
                  isLoadingBookmarks={shareQuery.isLoading}
                  readOnly
                  availableTags={tags}
                  tagSortBy={tagSortBy}
                  onTagSortChange={setTagSortBy}
                  searchQuery={searchMode === 'tag' ? debouncedSearchKeyword : ''}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
