import type { Bookmark } from '@/lib/types'
import { AdaptiveImage } from '@/components/common/AdaptiveImage'
import { useRecordClick } from '@/hooks/useBookmarks'
import { useState, useEffect, useRef } from 'react'
import type { ImageType } from '@/lib/image-utils'

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

  // 按置顶状态分组书签，置顶的在前面
  const sortedBookmarks = [
    ...bookmarks.filter(b => b.is_pinned),
    ...bookmarks.filter(b => !b.is_pinned)
  ]

  return (
    <div ref={containerRef} className="w-full">
      {/* CSS Grid 自动填充布局 - 让浏览器自动按行填充 */}
      {sortedBookmarks.length > 0 && (
        <div
          className="w-full"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(280px, 1fr))`,
            gap: '1rem'
          } as React.CSSProperties}
        >
          {sortedBookmarks.map((bookmark) => (
            <div key={bookmark.id}>
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
  const recordClick = useRecordClick()

  // 生成Google Favicon URL作为fallback
  const getFaviconUrl = (url: string): string => {
    try {
      const urlObj = new URL(url)
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`
    } catch {
      return ''
    }
  }

  const fallbackFaviconUrl = getFaviconUrl(bookmark.url)
  
  // 决定显示什么图片
  const hasCoverImage = bookmark.cover_image && bookmark.cover_image.trim() !== '' && !coverImageError
  const shouldShowFallback = !hasCoverImage && fallbackFaviconUrl && !faviconError
  const shouldShowImageArea = hasCoverImage || shouldShowFallback

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
      className={`card hover:shadow-xl transition-all relative group flex flex-col cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/60 touch-manipulation ${
        batchMode && isSelected ? 'ring-2 ring-primary' : ''
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
            className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
              isSelected
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
          className={`absolute top-2 right-2 sm:top-3 sm:right-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110 z-10 touch-manipulation ${
            showEditHint ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 active:opacity-100'
          }`}
          title="编辑"
        >
          <svg className="w-4 h-4 text-base-content drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}

      {/* 图片区域 - 优先显示cover_image，失败则显示favicon，都在顶部居中 */}
      {shouldShowImageArea && (
        <div
          className={`relative bg-base-200 overflow-hidden flex-shrink-0 flex items-center justify-center ${
            imageType === 'favicon' || shouldShowFallback 
              ? 'h-24 sm:h-20' 
              : 'h-40 sm:h-32'
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
          ) : shouldShowFallback ? (
            <img
              src={fallbackFaviconUrl}
              alt={bookmark.title}
              className="w-14 h-14 sm:w-12 sm:h-12 object-contain"
              onError={() => setFaviconError(true)}
            />
          ) : null}
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

        {/* 标签 */}
        {bookmark.tags && bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {bookmark.tags.slice(0, 4).map((tag) => (
              <span
                key={tag.id}
                className="text-xs sm:text-[11px] px-2.5 sm:px-2 py-1 sm:py-0.5 rounded-full bg-primary/10 text-primary"
              >
                {tag.name}
              </span>
            ))}
            {bookmark.tags.length > 4 && (
              <span className="text-xs sm:text-[11px] text-base-content/60 flex items-center px-1">
                +{bookmark.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
