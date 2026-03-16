import { useMemo, useEffect, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TagSidebar } from '@/components/tags/TagSidebar'
import { BookmarkListContainer } from '@/components/bookmarks/BookmarkListContainer'
import { BookmarkForm } from '@/components/bookmarks/BookmarkForm'
import { BatchActionBar } from '@/components/bookmarks/BatchActionBar'
import { PaginationFooter } from '@/components/common/PaginationFooter'
import { TopActionBar } from './components/TopActionBar'
import { useBookmarksState } from './hooks/useBookmarksState'
import { useBookmarksEffects } from './hooks/useBookmarksEffects'
import { setStoredViewMode } from './hooks/useBookmarksState'
import { useInfiniteBookmarks } from '@/hooks/useBookmarks'
import { useTags } from '@/hooks/useTags'
import { useToastStore } from '@/stores/toastStore'
import { bookmarksService } from '@/services/bookmarks'
import type { Bookmark, BookmarkQueryParams, UpdateBookmarkRequest } from '@/lib/types'
import type { SortOption } from '@/components/common/SortSelector'
import { Save } from 'lucide-react'

const SORT_OPTIONS: SortOption[] = ['created', 'updated', 'pinned', 'popular']
const VIEW_MODES = ['list', 'card', 'minimal', 'title'] as const

export function BookmarksPage() {
  const { t } = useTranslation('bookmarks')
  const { success, error: showError } = useToastStore()
  const pendingSyncOperationsRef = useRef<
    Array<{ id: string; bookmarkId: string; run: () => Promise<unknown> }>
  >([])
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [isSavingSync, setIsSavingSync] = useState(false)
  const [autoSyncSeconds, setAutoSyncSeconds] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const saved = window.localStorage.getItem('bookmarks-auto-sync-seconds')
    const parsed = saved ? Number(saved) : 0
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  })
  const [optimisticBookmarks, setOptimisticBookmarks] = useState<Record<string, Bookmark>>({})
  // 状态管理
  const state = useBookmarksState()
  const {
    selectedTags,
    setSelectedTags,
    debouncedSelectedTags,
    setDebouncedSelectedTags,
    searchKeyword,
    setSearchKeyword,
    debouncedSearchKeyword,
    setDebouncedSearchKeyword,
    searchMode,
    setSearchMode,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    visibilityFilter,
    setVisibilityFilter,
    tagLayout,
    setTagLayout,
    sortByInitialized,
    setSortByInitialized,
    showForm,
    setShowForm,
    editingBookmark,
    setEditingBookmark,
    batchMode,
    setBatchMode,
    selectedIds,
    setSelectedIds,
    isTagSidebarOpen,
    setIsTagSidebarOpen,
    previousCountRef,
    autoCleanupTimerRef,
    searchCleanupTimerRef,
    tagDebounceTimerRef,
  } = state

  const enqueueBookmarkUpdate = useCallback(
    (payload: { id: string; data: UpdateBookmarkRequest; optimisticBookmark: Bookmark }) => {
      pendingSyncOperationsRef.current.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        bookmarkId: payload.id,
        run: () => bookmarksService.updateBookmark(payload.id, payload.data),
      })
      setPendingSyncCount(pendingSyncOperationsRef.current.length)
      setOptimisticBookmarks((prev) => ({
        ...prev,
        [payload.id]: payload.optimisticBookmark,
      }))
    },
    []
  )

  // 副作用管理
  const { updatePreferences } = useBookmarksEffects({
    selectedTags,
    setSelectedTags,
    setDebouncedSelectedTags,
    searchKeyword,
    setSearchKeyword,
    setDebouncedSearchKeyword,
    setViewMode,
    setTagLayout,
    setSortBy,
    sortByInitialized,
    setSortByInitialized,
    autoCleanupTimerRef,
    searchCleanupTimerRef,
    tagDebounceTimerRef,
  })

  // 构建查询参数
  const queryParams = useMemo<BookmarkQueryParams>(() => {
    const params: BookmarkQueryParams = {}

    if (searchMode === 'bookmark' && debouncedSearchKeyword.trim()) {
      params.keyword = debouncedSearchKeyword.trim()
    }

    if (debouncedSelectedTags.length > 0) {
      params.tags = debouncedSelectedTags.join(',')
    }

    params.sort = sortBy

    return params
  }, [searchMode, debouncedSearchKeyword, debouncedSelectedTags, sortBy])

  const bookmarksQuery = useInfiniteBookmarks(queryParams)
  const { refetch: refetchTags } = useTags()

  const flushPendingSync = useCallback(
    async (trigger: 'manual' | 'auto' = 'manual') => {
      if (isSavingSync || pendingSyncOperationsRef.current.length === 0) return

      setIsSavingSync(true)
      const operations = [...pendingSyncOperationsRef.current]
      pendingSyncOperationsRef.current = []
      setPendingSyncCount(0)

      const failed: Array<{ id: string; bookmarkId: string; run: () => Promise<unknown> }> = []
      const successIds = new Set<string>()

      for (const op of operations) {
        try {
          await op.run()
          successIds.add(op.bookmarkId)
        } catch {
          failed.push(op)
        }
      }

      if (failed.length > 0) {
        const failedBookmarkIds = new Set(failed.map((op) => op.bookmarkId))
        pendingSyncOperationsRef.current = [...failed, ...pendingSyncOperationsRef.current]
        setPendingSyncCount(pendingSyncOperationsRef.current.length)
        setOptimisticBookmarks((prev) => {
          const next = { ...prev }
          successIds.forEach((id) => {
            if (!failedBookmarkIds.has(id)) {
              delete next[id]
            }
          })
          return next
        })
        showError(t('sync.saveFailed', { count: failed.length }))
      } else {
        setOptimisticBookmarks((prev) => {
          const next = { ...prev }
          successIds.forEach((id) => {
            delete next[id]
          })
          return next
        })
        if (trigger === 'manual') {
          success(t('sync.saveSuccess'))
        }
      }

      await bookmarksQuery.refetch()
      setIsSavingSync(false)
    },
    [bookmarksQuery, isSavingSync, showError, success, t]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('bookmarks-auto-sync-seconds', String(autoSyncSeconds))
  }, [autoSyncSeconds])

  useEffect(() => {
    if (autoSyncSeconds <= 0) return
    const timer = window.setInterval(() => {
      void flushPendingSync('auto')
    }, autoSyncSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [autoSyncSeconds, flushPendingSync])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingSyncOperationsRef.current.length === 0) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // 书签列表（去重）
  const bookmarks = useMemo(() => {
    if (!bookmarksQuery.data?.pages?.length) {
      return [] as Bookmark[]
    }
    const allBookmarks = bookmarksQuery.data.pages.flatMap(page => page.bookmarks)
    const uniqueBookmarksMap = new Map<string, Bookmark>()
    allBookmarks.forEach(bookmark => {
      const existing = uniqueBookmarksMap.get(bookmark.id)
      if (!existing) {
        uniqueBookmarksMap.set(bookmark.id, bookmark)
        return
      }

      const existingTagCount = existing.tags?.length ?? 0
      const nextTagCount = bookmark.tags?.length ?? 0

      // 优先保留 tags 更完整的版本（避免 refetch/分页混合时出现 tags 为空覆盖）
      if (nextTagCount > existingTagCount) {
        uniqueBookmarksMap.set(bookmark.id, bookmark)
        return
      }

      // 如果 tags 数量相同但新的对象字段更“新”，也用新的覆盖（例如更新时间、点击数等）
      if (nextTagCount === existingTagCount) {
        uniqueBookmarksMap.set(bookmark.id, { ...existing, ...bookmark })
      }
    })
    return Array.from(uniqueBookmarksMap.values())
  }, [bookmarksQuery.data])

  const mergedBookmarks = useMemo(() => {
    if (Object.keys(optimisticBookmarks).length === 0) return bookmarks
    return bookmarks.map((bookmark) => {
      const optimistic = optimisticBookmarks[bookmark.id]
      if (!optimistic) return bookmark
      return {
        ...bookmark,
        ...optimistic,
      }
    })
  }, [bookmarks, optimisticBookmarks])

  // 从第一页的 meta 中获取后端返回的相关标签ID
  const serverRelatedTagIds = useMemo(() => {
    const firstPageMeta = bookmarksQuery.data?.pages?.[0]?.meta
    return firstPageMeta?.related_tag_ids
  }, [bookmarksQuery.data?.pages])

  // 可见性过滤
  const filteredBookmarks = useMemo(() => {
    if (visibilityFilter === 'all') return mergedBookmarks

    return mergedBookmarks.filter((bookmark) =>
      visibilityFilter === 'public' ? bookmark.is_public : !bookmark.is_public
    )
  }, [mergedBookmarks, visibilityFilter])

  const isInitialLoading = bookmarksQuery.isLoading && bookmarks.length === 0
  const isFetchingExisting = bookmarksQuery.isFetching && !isInitialLoading

  useEffect(() => {
    if (filteredBookmarks.length > 0) {
      previousCountRef.current = filteredBookmarks.length
    }
  }, [filteredBookmarks.length, previousCountRef])

  const hasMore = Boolean(bookmarksQuery.hasNextPage)

  // 事件处理
  const handleOpenForm = useCallback((bookmark?: Bookmark) => {
    if (bookmark) {
      setEditingBookmark(bookmark)
    } else {
      setEditingBookmark(null)
    }
    setShowForm(true)
  }, [setEditingBookmark, setShowForm])

  const handleCloseForm = useCallback(() => {
    setShowForm(false)
    setEditingBookmark(null)
  }, [setShowForm, setEditingBookmark])

  const handleFormSuccess = useCallback(() => {
    bookmarksQuery.refetch()
    refetchTags()
  }, [bookmarksQuery, refetchTags])

  const handleLoadMore = useCallback(() => {
    if (bookmarksQuery.hasNextPage) {
      bookmarksQuery.fetchNextPage()
    }
  }, [bookmarksQuery])

  const handleViewModeChange = useCallback(() => {
    const currentIndex = VIEW_MODES.indexOf(viewMode)
    const nextIndex = (currentIndex + 1) % VIEW_MODES.length
    const nextMode = VIEW_MODES[nextIndex]!
    setViewMode(nextMode)
    setStoredViewMode(nextMode)
    updatePreferences.mutate({ view_mode: nextMode })
  }, [viewMode, setViewMode, updatePreferences])

  const handleTagLayoutChange = useCallback((layout: 'grid' | 'masonry') => {
    setTagLayout(layout)
    updatePreferences.mutate({ tag_layout: layout })
  }, [setTagLayout, updatePreferences])

  const handleSortByChange = useCallback(() => {
    const currentIndex = SORT_OPTIONS.indexOf(sortBy)
    const nextIndex = (currentIndex + 1) % SORT_OPTIONS.length
    const nextSort = SORT_OPTIONS[nextIndex]!
    setSortBy(nextSort)
    updatePreferences.mutate({ sort_by: nextSort })
  }, [sortBy, setSortBy, updatePreferences])

  const handleToggleSelect = useCallback((bookmarkId: string) => {
    setSelectedIds((prev) =>
      prev.includes(bookmarkId)
        ? prev.filter((id) => id !== bookmarkId)
        : [...prev, bookmarkId]
    )
  }, [setSelectedIds])

  const handleSelectAll = useCallback(() => {
    setSelectedIds(filteredBookmarks.map((b) => b.id))
  }, [filteredBookmarks, setSelectedIds])

  const handleClearSelection = useCallback(() => {
    setSelectedIds([])
    setBatchMode(false)
  }, [setSelectedIds, setBatchMode])

  const handleBatchSuccess = useCallback(() => {
    setSelectedIds([])
    setBatchMode(false)
    bookmarksQuery.refetch()
    refetchTags()
  }, [setSelectedIds, setBatchMode, bookmarksQuery, refetchTags])

  return (
    <>
      <div className="w-full h-[calc(100vh-4rem)] sm:h-[calc(100vh-5rem)] flex flex-col overflow-hidden touch-none">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-6 w-full h-full overflow-hidden touch-none">
          {/* 左侧：标签侧边栏 - 桌面端显示 */}
          <aside className="hidden lg:block lg:col-span-3 order-2 lg:order-1 fixed top-[calc(5rem+0.75rem)] sm:top-[calc(5rem+1rem)] md:top-[calc(5rem+1.5rem)] left-3 sm:left-4 md:left-6 bottom-3 w-[calc(25%-1.5rem)] z-40 flex flex-col overflow-hidden">
            <TagSidebar
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
              tagLayout={tagLayout}
              onTagLayoutChange={handleTagLayoutChange}
              bookmarks={filteredBookmarks}
              isLoadingBookmarks={isInitialLoading || isFetchingExisting}
              searchQuery={searchMode === 'tag' ? debouncedSearchKeyword : ''}
              relatedTagIds={serverRelatedTagIds}
            />
          </aside>

          {/* 右侧：书签列表 */}
          <main className="lg:col-span-9 lg:col-start-4 order-1 lg:order-2 flex flex-col h-full overflow-hidden w-full min-w-0">
            <div className="flex-shrink-0 px-3 sm:px-4 md:px-6 pt-2 w-full">
              <div className="flex items-center justify-end gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">
                  {t('sync.autoSaveSeconds')}
                </label>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={autoSyncSeconds}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (!Number.isFinite(next) || next < 0) {
                      setAutoSyncSeconds(0)
                      return
                    }
                    setAutoSyncSeconds(next)
                  }}
                  className="w-20 h-9 px-2 rounded-md border border-border bg-card text-sm text-foreground"
                  title={t('sync.autoSaveSeconds')}
                />
                <button
                  onClick={() => void flushPendingSync('manual')}
                  disabled={pendingSyncCount === 0 || isSavingSync}
                  className="btn btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  type="button"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingSync ? t('sync.saving') : t('sync.saveNow')}</span>
                  {pendingSyncCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-primary-foreground/20 text-xs">
                      {pendingSyncCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* 顶部操作栏 */}
            <TopActionBar
              searchMode={searchMode}
              setSearchMode={setSearchMode}
              searchKeyword={searchKeyword}
              setSearchKeyword={setSearchKeyword}
              sortBy={sortBy}
              onSortByChange={handleSortByChange}
              visibilityFilter={visibilityFilter}
              setVisibilityFilter={setVisibilityFilter}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              batchMode={batchMode}
              setBatchMode={setBatchMode}
              setSelectedIds={setSelectedIds}
              onOpenForm={() => handleOpenForm()}
              setIsTagSidebarOpen={setIsTagSidebarOpen}
            />

            {/* 批量操作提示栏 */}
            {batchMode && (
              <div className="flex-shrink-0 px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 w-full">
                <div className="card bg-primary/10 border border-primary/20 w-full">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                      <span className="font-medium text-foreground whitespace-nowrap">
                        {selectedIds.length > 0
                          ? t('batch.selectedCount', { count: selectedIds.length })
                          : t('batch.pleaseSelect')}
                      </span>
                      {selectedIds.length < filteredBookmarks.length && (
                        <>
                          <span className="text-border hidden sm:inline">|</span>
                          <button
                            onClick={handleSelectAll}
                            className="text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                          >
                            {t('batch.selectAll', { count: filteredBookmarks.length })}
                          </button>
                        </>
                      )}
                      {selectedIds.length > 0 && (
                        <>
                          <span className="text-border hidden sm:inline">|</span>
                          <button
                            onClick={handleClearSelection}
                            className="text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                          >
                            {t('batch.cancel')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 可滚动的书签列表区域 */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 md:px-6 pb-20 sm:pb-4 md:pb-6 w-full overscroll-contain touch-auto">
              <div className="space-y-3 sm:space-y-4 md:space-y-5 w-full min-w-0">
                <BookmarkListContainer
                  bookmarks={filteredBookmarks}
                  isLoading={isInitialLoading || isFetchingExisting}
                  viewMode={viewMode}
                  onEdit={handleOpenForm}
                  previousCount={previousCountRef.current}
                  batchMode={batchMode}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                />

                {!isInitialLoading && filteredBookmarks.length > 0 && (
                  <PaginationFooter
                    hasMore={hasMore}
                    isLoading={bookmarksQuery.isFetchingNextPage}
                    onLoadMore={handleLoadMore}
                    currentCount={filteredBookmarks.length}
                    totalLoaded={filteredBookmarks.length}
                  />
                )}
              </div>
            </div>
          </main>
        </div>

        {/* 移动端标签抽屉 */}
        {isTagSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setIsTagSidebarOpen(false)}
            />

            <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-background border-r border-border shadow-xl animate-in slide-in-from-left duration-300 flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-border bg-background flex-shrink-0">
                <h3 className="text-lg font-semibold text-foreground">{t('tags:filter.title')}</h3>
                <button
                  onClick={() => setIsTagSidebarOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
                  aria-label={t('tags:filter.close')}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 bg-background min-h-0 overscroll-contain touch-auto">
                <TagSidebar
                  selectedTags={selectedTags}
                  onTagsChange={(tags) => {
                    setSelectedTags(tags)
                    if (tags.length >= 2 && tags.length > selectedTags.length) {
                      setTimeout(() => setIsTagSidebarOpen(false), 500)
                    }
                  }}
                  tagLayout={tagLayout}
                  onTagLayoutChange={handleTagLayoutChange}
                  relatedTagIds={serverRelatedTagIds}
                  bookmarks={filteredBookmarks}
                  isLoadingBookmarks={isInitialLoading || isFetchingExisting}
                  searchQuery={searchMode === 'tag' ? debouncedSearchKeyword : ''}
                />
              </div>
            </div>
          </div>
        )}

        {/* 书签表单模态框 */}
        {showForm && (
          <BookmarkForm
            bookmark={editingBookmark}
            onClose={handleCloseForm}
            onSuccess={handleFormSuccess}
            onEnqueueUpdate={enqueueBookmarkUpdate}
          />
        )}

        {/* 批量操作栏 */}
        {batchMode && selectedIds.length > 0 && (
          <BatchActionBar
            selectedIds={selectedIds}
            bookmarks={filteredBookmarks}
            onClearSelection={handleClearSelection}
            onSuccess={handleBatchSuccess}
          />
        )}
      </div>
    </>
  )
}
