import type { Bookmark } from '@/lib/types'
import { AdaptiveImage } from '@/components/common/AdaptiveImage'
import { useRecordClick } from '@/hooks/useBookmarks'
import { useState, useEffect, useRef } from 'react'
import type { ImageType } from '@/lib/image-utils'
import { DefaultBookmarkIconComponent } from './DefaultBookmarkIcon'
import { usePreferences } from '@/hooks/usePreferences'
import { SnapshotViewer } from './SnapshotViewer'

interface BookmarkCardViewProps {
  bookmarks: Bookmark[]
  onEdit?: (bookmark: Bookmark) => void
  readOnly?: boolean
  batchMode?: boolean
  selectedIds?: string[]
  onToggleSelect?: (id: string) => void
}

export function BookmarkCardView({
  bookmarks,
  onEdit,
  readOnly = false,
  batchMode = false,
  selectedIds = [],
  onToggleSelect,
}: BookmarkCardViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(1)
  const [showEditHint, setShowEditHint] = useState(true)

  // 移动端10秒后隐藏编辑按钮提示
  useEffect(() => {
    // 检测是否为移动端（宽度小于640px）
    const isMobile = window.innerWidth < 640

    if (isMobile) {
      const timer = setTimeout(() => {
        setShowEditHint(false)
      }, 10000)

      return () => clearTimeout(timer)
    } else {
      // PC端立即隐藏
      setShowEditHint(false)
    }
  }, [])

  // 动态计算列数
  useEffect(() => {
    const updateColumns = () => {
      if (!containerRef.current) return

      const containerWidth = containerRef.current.offsetWidth
      // 每列最小宽度280px，间距16px
      const minColumnWidth = 280
      const gap = 16

      // 计算可以容纳的列数
      let cols = 1
      for (let i = 1; i <= 4; i++) {
        const totalWidth = i * minColumnWidth + (i - 1) * gap
        if (containerWidth >= totalWidth) {
          cols = i
        } else {
          break
        }
      }

      setColumns(cols)
    }

    // 初始计算
    updateColumns()

    // 监听窗口大小变化
    const resizeObserver = new ResizeObserver(updateColumns)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // 按置顶状态分组书签
  const pinnedBookmarks = bookmarks.filter(b => b.is_pinned)
  const unpinnedBookmarks = bookmarks.filter(b => !b.is_pinned)

  // 动态分列：将书签分配到各列
  const columnedBookmarks = (() => {
    // 创建 N 个空列数组
    const cols: Bookmark[][] = Array.from({ length: columns }, () => [])

    // 1. 先将置顶书签按行分散到各列顶部
    for (let i = 0; i < pinnedBookmarks.length; i++) {
      const colIndex = i % columns
      const col = cols[colIndex]
      const bookmark = pinnedBookmarks[i]
      if (col && bookmark) {
        col.push(bookmark)
      }
    }

    // 2. 再将未置顶书签按列顺序分配
    for (let i = 0; i < unpinnedBookmarks.length; i++) {
      const colIndex = i % columns
      const col = cols[colIndex]
      const bookmark = unpinnedBookmarks[i]
      if (col && bookmark) {
        col.push(bookmark)
      }
    }

    return cols
  })()


  return (
    <div ref={containerRef} className="w-full min-w-0">
      {/* CSS Grid 布局 - 并排显示各列 */}
      {columnedBookmarks.length > 0 && (
        <div
          className="w-full min-w-0"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: '1rem'
          } as React.CSSProperties}
        >
          {columnedBookmarks.map((col, colIndex) => (
            <div key={`col-${colIndex}`} className="min-w-0">
              {col.map((bookmark) => (
                <div key={bookmark.id} className="mb-3 sm:mb-4 w-full">
                  <BookmarkCard
                    bookmark={bookmark}
                    onEdit={onEdit ? () => onEdit(bookmark) : undefined}
                    readOnly={readOnly}
                    batchMode={batchMode}
                    isSelected={selectedIds.includes(bookmark.id)}
                    onToggleSelect={onToggleSelect}
                    showEditHint={showEditHint}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface BookmarkCardProps {
  bookmark: Bookmark
  onEdit?: () => void
  readOnly?: boolean
  batchMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
  showEditHint?: boolean
}

function BookmarkCard({
  bookmark,
  onEdit,
  readOnly = false,
  batchMode = false,
  isSelected = false,
  onToggleSelect,
  showEditHint = false,
}: BookmarkCardProps) {
  const [imageType, setImageType] = useState<ImageType>('unknown')
  const [coverImageError, setCoverImageError] = useState(false)
  const [faviconError, setFaviconError] = useState(false)
  const [googleFaviconIsDefault, setGoogleFaviconIsDefault] = useState(false)
  const recordClick = useRecordClick()
  const { data: preferences } = usePreferences()
  const defaultIcon = preferences?.default_bookmark_icon || 'orbital-spinner'

  // 生成Google Favicon URL作为最终fallback
  const getFaviconUrl = (url: string): string => {
    try {
      const urlObj = new URL(url)
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`
    } catch {
      return ''
    }
  }

  const googleFaviconUrl = getFaviconUrl(bookmark.url)

  // 检测 Google Favicon 是否为默认灰色地球图标
  const checkIfGoogleDefaultIcon = (img: HTMLImageElement) => {
    // Google 的默认图标特征：
    // 1. 图片很小（通常是 16x16 或更小）
    // 2. 可以通过加载后检查图片尺寸来判断
    if (img.naturalWidth <= 16 && img.naturalHeight <= 16) {
      setGoogleFaviconIsDefault(true)
    }
  }

  // 决定显示什么图片 - 改进的回退策略
  // 1. cover_image (封面图)
  // 2. favicon (网站图标，从插件获取)
  // 3. Google Favicon API (但跳过默认灰色地球)
  // 4. 用户自定义的 SVG 图标
  const hasCoverImage = bookmark.cover_image && bookmark.cover_image.trim() !== '' && !coverImageError
  const hasFavicon = !hasCoverImage && bookmark.favicon && bookmark.favicon.trim() !== '' && !faviconError
  const shouldShowGoogleFavicon = !hasCoverImage && !hasFavicon && googleFaviconUrl && !faviconError && !googleFaviconIsDefault
  const shouldShowImageArea = hasCoverImage || hasFavicon || shouldShowGoogleFavicon

  const handleVisit = () => {
    // 记录点击统计
    if (!readOnly) {
      recordClick.mutate(bookmark.id)
    }
    // 打开书签
    window.open(bookmark.url, '_blank', 'noopener,noreferrer')
  }

  const handleCardClick = (e: React.MouseEvent) => {
    if (batchMode && onToggleSelect) {
      e.preventDefault()
      onToggleSelect(bookmark.id)
    } else {
      handleVisit()
    }
  }

  return (
    <div
      className={`card hover:shadow-xl transition-all relative group flex flex-col cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/60 touch-manipulation w-full min-w-0 ${batchMode && isSelected ? 'ring-2 ring-primary' : ''
        }`}
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          if (batchMode && onToggleSelect) {
            onToggleSelect(bookmark.id)
          } else {
            handleVisit()
          }
        }
      }}
      aria-label={`打开书签 ${bookmark.title}`}
    >
      {/* 批量选择复选框 */}
      {batchMode && onToggleSelect && (
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-10">
          <div
            className={`w-6 h-6 rounded flex items-center justify-center transition-all ${isSelected
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border-2 border-border'
              }`}
          >
            {isSelected && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* 编辑按钮 - 初始显示10秒后隐藏 */}
      {!!onEdit && !readOnly && !batchMode && (
        <button
          onClick={(event) => {
            event.stopPropagation()
            onEdit()
          }}
          className={`absolute top-2 right-2 sm:top-3 sm:right-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110 z-10 touch-manipulation ${showEditHint ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 active:opacity-100'
            }`}
          title="编辑"
        >
          <svg className="w-4 h-4 text-base-content drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}

      {/* 图片区域 - 三级回退：cover_image → favicon → Google Favicon API → 默认图标 */}
      {shouldShowImageArea && (
        <div
          className={`relative overflow-hidden flex-shrink-0 flex items-center justify-center ${imageType === 'favicon' || hasFavicon || shouldShowGoogleFavicon
            ? 'h-24 sm:h-20 bg-gradient-to-br from-primary/5 to-secondary/5'
            : 'h-40 sm:h-32 bg-gradient-to-br from-primary/10 to-secondary/10'
            }`}
          style={{ borderTopLeftRadius: 'calc(var(--radius) * 1.5)', borderTopRightRadius: 'calc(var(--radius) * 1.5)' }}
        >
          {hasCoverImage ? (
            <AdaptiveImage
              src={bookmark.cover_image!}
              alt={bookmark.title}
              className={
                imageType === 'favicon'
                  ? 'w-14 h-14 sm:w-12 sm:h-12 object-contain'
                  : 'w-full h-full object-cover'
              }
              onTypeDetected={setImageType}
              onError={() => setCoverImageError(true)}
            />
          ) : hasFavicon ? (
            <div className="relative w-14 h-14 sm:w-12 sm:h-12 flex items-center justify-center">
              <img
                src={bookmark.favicon!}
                alt={bookmark.title}
                className="w-full h-full object-contain"
                onError={() => setFaviconError(true)}
              />
            </div>
          ) : shouldShowGoogleFavicon ? (
            <div className="relative w-14 h-14 sm:w-12 sm:h-12 flex items-center justify-center">
              <img
                src={googleFaviconUrl}
                alt={bookmark.title}
                className="w-full h-full object-contain"
                onLoad={(e) => {
                  const img = e.target as HTMLImageElement
                  checkIfGoogleDefaultIcon(img)
                }}
                onError={() => setFaviconError(true)}
              />
            </div>
          ) : null}
        </div>
      )}

      {/* 没有任何图片时显示默认书签图标 */}
      {!shouldShowImageArea && (
        <div
          className="relative h-24 sm:h-20 overflow-hidden flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5"
          style={{ borderTopLeftRadius: 'calc(var(--radius) * 1.5)', borderTopRightRadius: 'calc(var(--radius) * 1.5)' }}
        >
          <DefaultBookmarkIconComponent icon={defaultIcon} />
        </div>
      )}

      {/* 内容区 */}
      <div className="flex flex-col p-4 sm:p-3 gap-2.5 sm:gap-2 relative">
        {/* 状态标识 */}
        {(!!bookmark.is_pinned || !!bookmark.is_archived) && (
          <div className="flex gap-1.5 mb-1">
            {!!bookmark.is_pinned && (
              <span className="bg-warning text-warning-content text-xs px-2 py-0.5 rounded-full font-medium">
                置顶
              </span>
            )}
            {!!bookmark.is_archived && (
              <span className="bg-base-content/40 text-base-100 text-xs px-2 py-0.5 rounded-full font-medium">
                归档
              </span>
            )}
          </div>
        )}

        {/* 标题 */}
        <h3
          className="font-semibold text-base sm:text-sm line-clamp-2 hover:text-primary transition-colors leading-snug"
          title={bookmark.title}
        >
          {bookmark.title}
        </h3>

        {/* 描述 */}
        {bookmark.description && (
          <p className="text-sm sm:text-xs text-base-content/70 line-clamp-3 leading-relaxed">
            {bookmark.description}
          </p>
        )}

        {/* 标签和快照 */}
        {(bookmark.tags && bookmark.tags.length > 0) || (bookmark.has_snapshot && (bookmark.snapshot_count ?? 0) > 0) ? (
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {/* 快照图标 - 只在有快照且数量大于0时显示 */}
            {bookmark.has_snapshot && (bookmark.snapshot_count ?? 0) > 0 && (
              <div onClick={(e) => e.stopPropagation()}>
                <SnapshotViewer 
                  bookmarkId={bookmark.id} 
                  bookmarkTitle={bookmark.title}
                  snapshotCount={bookmark.snapshot_count ?? 0}
                />
              </div>
            )}
            
            {/* 标签 */}
            {bookmark.tags && bookmark.tags.slice(0, 4).map((tag) => (
              <span
                key={tag.id}
                className="text-xs sm:text-[11px] px-2.5 sm:px-2 py-1 sm:py-0.5 rounded-full bg-primary/10 text-primary"
              >
                {tag.name}
              </span>
            ))}
            {bookmark.tags && bookmark.tags.length > 4 && (
              <span className="text-xs sm:text-[11px] text-base-content/60 flex items-center px-1">
                +{bookmark.tags.length - 4}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
