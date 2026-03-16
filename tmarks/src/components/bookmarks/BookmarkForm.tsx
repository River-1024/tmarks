import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { logger } from '@/lib/logger'
import { useCreateBookmark, useUpdateBookmark, useDeleteBookmark } from '@/hooks/useBookmarks'
import { useCreateTag, useTags } from '@/hooks/useTags'
import { useAiSettings } from '@/hooks/useAiSettings'
import { bookmarksService } from '@/services/bookmarks'
import { callAI } from '@/lib/ai/client'
import type { Bookmark, CreateBookmarkRequest, UpdateBookmarkRequest } from '@/lib/types'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Z_INDEX } from '@/lib/constants/z-index'

interface BookmarkFormProps {
  bookmark?: Bookmark | null
  onClose: () => void
  onSuccess?: () => void
}

interface SinglePromptTemplateVars {
  title: string
  url: string
  description: string
  content: string
  existingTags: string
  recentBookmarks: string
  maxTags: string
}

interface AiSuggestedTag {
  name: string
  isNew: boolean
}

function normalizeTagName(tag: string) {
  return tag.trim().toLowerCase()
}

function normalizeTags(tags: string[]) {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const tag of tags) {
    const trimmed = tag.trim()
    if (!trimmed) continue

    const normalizedName = normalizeTagName(trimmed)
    if (seen.has(normalizedName)) continue

    seen.add(normalizedName)
    normalized.push(trimmed)
  }

  return normalized.slice(0, 12)
}

function getStringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function renderPromptTemplate(template: string, vars: SinglePromptTemplateVars): string {
  return template.replace(
    /\{(title|url|description|content|existingTags|recentBookmarks|maxTags)\}/g,
    (_, key: keyof SinglePromptTemplateVars) => vars[key] ?? '',
  )
}

function extractTagNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return normalizeTags(
    value
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (isRecord(item)) {
          return getStringValue(item.name)
        }
        return null
      })
      .filter((item): item is string => Boolean(item)),
  )
}

function extractTagsFromParsedPayload(
  parsed: unknown,
  bookmarkCtx: { id?: string; url?: string },
): string[] {
  if (Array.isArray(parsed)) {
    return extractTagNames(parsed)
  }

  if (!isRecord(parsed)) {
    return []
  }

  if (Array.isArray(parsed.tags)) {
    return extractTagNames(parsed.tags)
  }

  if (Array.isArray(parsed.suggestedTags)) {
    return extractTagNames(parsed.suggestedTags)
  }

  if (Array.isArray(parsed.items)) {
    const matched = parsed.items.find((item) => {
      if (!isRecord(item)) return false
      if (bookmarkCtx.id && item.bookmark_id === bookmarkCtx.id) return true
      if (bookmarkCtx.url && item.url === bookmarkCtx.url) return true
      return false
    })

    const firstItem = matched || parsed.items[0]
    if (isRecord(firstItem) && Array.isArray(firstItem.tags)) {
      return extractTagNames(firstItem.tags)
    }
  }

  return []
}

function extractTagsFromAiResponse(
  content: string,
  bookmarkCtx: { id?: string; url?: string },
): string[] {
  const trimmed = content.trim()
  if (!trimmed) {
    return []
  }

  const candidates: string[] = []
  const fenced = trimmed.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  candidates.push(trimmed)
  if (fenced !== trimmed) {
    candidates.push(fenced)
  }

  const objectStart = fenced.indexOf('{')
  const objectEnd = fenced.lastIndexOf('}')
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(fenced.slice(objectStart, objectEnd + 1))
  }

  const arrayStart = fenced.indexOf('[')
  const arrayEnd = fenced.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    candidates.push(fenced.slice(arrayStart, arrayEnd + 1))
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      const tags = extractTagsFromParsedPayload(parsed, bookmarkCtx)
      if (tags.length > 0) {
        return tags
      }
    } catch {
      continue
    }
  }

  return []
}

function buildSingleBookmarkPrompt(input: {
  title: string
  url: string
  description: string
  selectedTags: string[]
  existingTags: string[]
  customPrompt?: string
}) {
  const bookmarkBlock = `书签信息：
- 标题：${input.title}
- URL：${input.url}
- 描述：${input.description || '（无）'}
- 当前已选标签：${input.selectedTags.length > 0 ? input.selectedTags.join('、') : '（无）'}

标签库（优先复用）：
${input.existingTags.length > 0 ? input.existingTags.join('、') : '（无）'}`

  const contract = `输出要求：
1. 只返回一个合法 JSON 对象，不要输出解释文字、Markdown、代码块
2. 优先返回 2-6 个中文标签，尽量复用标签库
3. JSON 格式必须是：{"tags":["标签1","标签2"]}`

  if (input.customPrompt?.trim()) {
    return `${input.customPrompt.trim()}\n\n${bookmarkBlock}\n\n${contract}`
  }

  return `你是书签标签助手，请为单个书签生成准确、可复用的中文标签。

${bookmarkBlock}

${contract}`
}

export function BookmarkForm({ bookmark, onClose, onSuccess }: BookmarkFormProps) {
  const { t } = useTranslation('bookmarks')
  const isEditing = !!bookmark

  const availableTagsScrollRef = useRef<HTMLDivElement | null>(null)
  const availableTagsInnerRef = useRef<HTMLDivElement | null>(null)

  const [title, setTitle] = useState(bookmark?.title || '')
  const [url, setUrl] = useState(bookmark?.url || '')
  const [description, setDescription] = useState(bookmark?.description || '')
  const [coverImage, setCoverImage] = useState(bookmark?.cover_image || '')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    bookmark?.tags.map((t) => t.id) || []
  )
  const [isPinned, setIsPinned] = useState(bookmark?.is_pinned || false)
  const [isArchived, setIsArchived] = useState(bookmark?.is_archived || false)
  const [isPublic, setIsPublic] = useState(bookmark?.is_public || false)
  const [error, setError] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [selectedNewTags, setSelectedNewTags] = useState<string[]>([])
  const [aiSuggestedTagNames, setAiSuggestedTagNames] = useState<string[]>([])
  const [isGeneratingAiTags, setIsGeneratingAiTags] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [urlWarning, setUrlWarning] = useState<{ exists: true; bookmark: Bookmark } | null>(null)
  const [checkingUrl, setCheckingUrl] = useState(false)

  const createBookmark = useCreateBookmark()
  const updateBookmark = useUpdateBookmark()
  const deleteBookmark = useDeleteBookmark()
  const createTag = useCreateTag()
  const { data: tagsData } = useTags()
  const { data: aiSettings, isLoading: isLoadingAiSettings } = useAiSettings()
  const tags = tagsData?.tags || []
  const normalizedTagMap = useMemo(
    () => new Map(tags.map((tag) => [normalizeTagName(tag.name), tag] as const)),
    [tags],
  )
  const aiConfig = useMemo(() => {
    if (!aiSettings) return null

    const provider = aiSettings.provider
    return {
      enabled: aiSettings.enabled,
      provider,
      apiKey: aiSettings.api_keys?.[provider] || '',
      apiUrl: aiSettings.api_urls?.[provider] || '',
      model: aiSettings.model || undefined,
      customPrompt:
        aiSettings.enable_custom_prompt && aiSettings.custom_prompt
          ? aiSettings.custom_prompt
          : undefined,
    }
  }, [aiSettings])
  const aiSuggestedTags = useMemo<AiSuggestedTag[]>(
    () =>
      aiSuggestedTagNames.map((name) => ({
        name,
        isNew: !normalizedTagMap.has(normalizeTagName(name)),
      })),
    [aiSuggestedTagNames, normalizedTagMap],
  )
  const selectedTagCount = selectedTagIds.length + selectedNewTags.length
  const selectedTagIdSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds])

  // URL 变化时检查是否已存在
  useEffect(() => {
    const checkUrl = async () => {
      if (!url.trim() || isEditing) {
        setUrlWarning(null)
        setCheckingUrl(false)
        return
      }

      if (url.trim().length < 10) {
        setUrlWarning(null)
        setCheckingUrl(false)
        return
      }

      try {
        new URL(url)
      } catch {
        setUrlWarning(null)
        setCheckingUrl(false)
        return
      }

      setCheckingUrl(true)
      try {
        const result = await bookmarksService.checkUrlExists(url.trim())
        if (result.exists && result.bookmark) {
          setUrlWarning({ exists: true, bookmark: result.bookmark })
        } else {
          setUrlWarning(null)
        }
      } catch (error) {
        logger.error('Failed to check URL:', error)
      } finally {
        setCheckingUrl(false)
      }
    }

    const timeoutId = setTimeout(checkUrl, 800)
    return () => clearTimeout(timeoutId)
  }, [url, isEditing])

  useEffect(() => {
    if (selectedNewTags.length === 0) return

    const nextSelectedTagIds = [...selectedTagIds]
    const selectedIdSet = new Set(nextSelectedTagIds)
    const remainingNewTags: string[] = []
    let hasIdChanged = false

    for (const tagName of selectedNewTags) {
      const existingTag = normalizedTagMap.get(normalizeTagName(tagName))
      if (existingTag) {
        if (!selectedIdSet.has(existingTag.id)) {
          selectedIdSet.add(existingTag.id)
          nextSelectedTagIds.push(existingTag.id)
          hasIdChanged = true
        }
      } else {
        remainingNewTags.push(tagName)
      }
    }

    if (hasIdChanged) {
      setSelectedTagIds(nextSelectedTagIds)
    }

    if (remainingNewTags.length !== selectedNewTags.length) {
      setSelectedNewTags(remainingNewTags)
    }
  }, [normalizedTagMap, selectedNewTags, selectedTagIds])

  const ensureResolvedTagIds = async () => {
    const resolvedTagIds = [...selectedTagIds]
    const resolvedIdSet = new Set(resolvedTagIds)

    if (selectedNewTags.length === 0) {
      return resolvedTagIds
    }

    const createdTagIds: string[] = []

    for (const tagName of selectedNewTags) {
      const existingTag = normalizedTagMap.get(normalizeTagName(tagName))
      if (existingTag) {
        if (!resolvedIdSet.has(existingTag.id)) {
          resolvedIdSet.add(existingTag.id)
          resolvedTagIds.push(existingTag.id)
        }
        continue
      }

      try {
        const newTag = await createTag.mutateAsync({ name: tagName })
        if (!resolvedIdSet.has(newTag.id)) {
          resolvedIdSet.add(newTag.id)
          resolvedTagIds.push(newTag.id)
          createdTagIds.push(newTag.id)
        }
      } catch (createError) {
        logger.error('Failed to create AI generated tag:', createError)
        throw new Error(t('form.ai.createTagFailed', { name: tagName }))
      }
    }

    if (createdTagIds.length > 0) {
      setSelectedTagIds((prev) => [...new Set([...prev, ...createdTagIds])])
    }
    setSelectedNewTags([])

    return resolvedTagIds
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError(t('form.validation.titleRequired'))
      return
    }

    if (!url.trim()) {
      setError(t('form.validation.urlRequired'))
      return
    }

    try {
      new URL(url)
    } catch {
      setError(t('form.validation.urlInvalid'))
      return
    }

    if (!isEditing && urlWarning?.exists) {
      setError(t('form.validation.urlExists'))
      return
    }

    try {
      const resolvedTagIds = await ensureResolvedTagIds()

      if (isEditing && bookmark) {
        const updateData: UpdateBookmarkRequest = {
          tag_ids: resolvedTagIds,
          is_pinned: isPinned,
          is_archived: isArchived,
          is_public: isPublic,
        }

        if (title.trim() !== (bookmark.title || '')) {
          updateData.title = title.trim()
        }

        if (url.trim() !== (bookmark.url || '')) {
          updateData.url = url.trim()
        }

        const originalDescription = bookmark.description || ''
        if (description.trim() !== originalDescription) {
          updateData.description = description.trim() ? description.trim() : null
        }

        const originalCoverImage = bookmark.cover_image || ''
        if (coverImage.trim() !== originalCoverImage) {
          updateData.cover_image = coverImage.trim() ? coverImage.trim() : null
        }

        await updateBookmark.mutateAsync({ id: bookmark.id, data: updateData })
      } else {
        const createData: CreateBookmarkRequest = {
          title: title.trim(),
          url: url.trim(),
          description: description.trim() ? description.trim() : undefined,
          cover_image: coverImage.trim() ? coverImage.trim() : undefined,
          tag_ids: resolvedTagIds,
          is_pinned: isPinned,
          is_archived: isArchived,
          is_public: isPublic,
        }

        await createBookmark.mutateAsync(createData)
      }
      onSuccess?.()
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : t('form.operationFailed'))
    }
  }

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId))
    } else {
      setSelectedTagIds([...selectedTagIds, tagId])
    }
  }

  const toggleNewTag = (tagName: string) => {
    const normalized = normalizeTagName(tagName)
    setSelectedNewTags((prev) => {
      const exists = prev.some((tag) => normalizeTagName(tag) === normalized)
      if (exists) {
        return prev.filter((tag) => normalizeTagName(tag) !== normalized)
      }
      return [...prev, tagName.trim()]
    })
  }

  const toggleTagByName = (tagName: string) => {
    const existingTag = normalizedTagMap.get(normalizeTagName(tagName))
    if (existingTag) {
      toggleTag(existingTag.id)
      return
    }
    toggleNewTag(tagName)
  }

  const handleGenerateAiTags = async () => {
    setError('')
    if (isLoadingAiSettings) {
      setError(t('form.ai.loadingSettings'))
      return
    }

    if (!aiConfig?.enabled || !aiConfig.apiKey) {
      setError(t('form.ai.notConfigured'))
      return
    }

    if (!title.trim() || !url.trim()) {
      setError(t('form.ai.requireTitleUrl'))
      return
    }

    try {
      new URL(url.trim())
    } catch {
      setError(t('form.validation.urlInvalid'))
      return
    }

    setIsGeneratingAiTags(true)
    setAiSuggestedTagNames([])

    const selectedExistingTagNames = selectedTagIds
      .map((tagId) => tags.find((tag) => tag.id === tagId)?.name)
      .filter((name): name is string => Boolean(name))
    const allSelectedTagNames = normalizeTags([...selectedExistingTagNames, ...selectedNewTags])

    const promptTemplateVars: SinglePromptTemplateVars = {
      title: title.trim(),
      url: url.trim(),
      description: description.trim(),
      content: '',
      existingTags: tags.map((tag) => tag.name).join(', '),
      recentBookmarks: '',
      maxTags: '6',
    }
    const customPrompt = aiConfig.customPrompt
      ? renderPromptTemplate(aiConfig.customPrompt, promptTemplateVars)
      : undefined
    const prompt = buildSingleBookmarkPrompt({
      title: title.trim(),
      url: url.trim(),
      description: description.trim(),
      selectedTags: allSelectedTagNames,
      existingTags: tags.map((tag) => tag.name),
      customPrompt,
    })

    try {
      const result = await callAI({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        apiUrl: aiConfig.apiUrl,
        model: aiConfig.model,
        prompt,
      })

      const extractedTags = extractTagsFromAiResponse(result.content, {
        id: bookmark?.id,
        url: url.trim(),
      })

      if (extractedTags.length === 0) {
        setError(t('form.ai.noResult'))
        return
      }

      setAiSuggestedTagNames(extractedTags)
    } catch (aiError) {
      logger.error('AI tag generation failed:', aiError)
      setError(aiError instanceof Error ? aiError.message : t('form.ai.generateFailed'))
    } finally {
      setIsGeneratingAiTags(false)
    }
  }

  const handleAvailableTagsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const scrollEl = availableTagsScrollRef.current
    if (!scrollEl) return

    e.preventDefault()
    e.stopPropagation()

    const innerEl = availableTagsInnerRef.current
    const firstItem = innerEl?.querySelector('button') as HTMLButtonElement | null
    const itemHeight = firstItem?.getBoundingClientRect().height ?? 24

    let rowGap = 0
    if (innerEl) {
      const style = window.getComputedStyle(innerEl)
      const gapValue = style.rowGap || style.gap
      const parsed = Number.parseFloat(gapValue)
      rowGap = Number.isFinite(parsed) ? parsed : 0
    }

    const step = Math.max(1, Math.round(itemHeight + rowGap))
    const direction = e.deltaY > 0 ? 1 : -1
    scrollEl.scrollBy({ top: direction * step, behavior: 'auto' })
  }

  const handleTagInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      await processTagInput()
    }
  }

  const processTagInput = async () => {
    const input = tagInput.trim()
    if (!input) return

    const tagNames = input
      .split(/[,，]/)
      .map(name => name.trim())
      .filter(name => name.length > 0)

    if (tagNames.length === 0) return

    const newSelectedIds = [...selectedTagIds]

    for (const tagName of tagNames) {
      const existingTag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
      if (existingTag) {
        if (!newSelectedIds.includes(existingTag.id)) {
          newSelectedIds.push(existingTag.id)
        }
      } else {
        try {
          const newTag = await createTag.mutateAsync({ name: tagName })
          newSelectedIds.push(newTag.id)
          setSelectedNewTags((prev) => prev.filter((tag) => normalizeTagName(tag) !== normalizeTagName(tagName)))
        } catch (error) {
          console.error('Failed to create tag:', error)
          setError(t('form.createTagFailed', { name: tagName }))
          return
        }
      }
    }

    setSelectedTagIds(newSelectedIds)
    setTagInput('')
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = async () => {
    if (!bookmark) return

    setShowDeleteConfirm(false)
    try {
      await deleteBookmark.mutateAsync(bookmark.id)
      onSuccess?.()
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : t('form.deleteFailed'))
    }
  }

  const isPending =
    createBookmark.isPending ||
    updateBookmark.isPending ||
    deleteBookmark.isPending ||
    createTag.isPending

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.BOOKMARK_FORM }}>
      <div className="card w-full max-w-4xl max-h-[92vh] flex flex-col min-h-0" style={{ backgroundColor: 'var(--card)' }}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-xl font-bold text-foreground">
            {isEditing ? t('form.editTitle') : t('form.addTitle')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-foreground transition-colors"
            disabled={isPending}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2.5 bg-error/10 border border-error/30 text-error rounded-lg text-xs animate-fade-in flex items-center gap-2 flex-shrink-0">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain" style={{ scrollbarGutter: 'stable' }}>
          <form onSubmit={handleSubmit} className="space-y-3">
          {/* 第一行：标题和URL */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="title" className="block text-xs font-medium mb-1.5 text-foreground">
                {t('form.titleRequired')} <span className="text-error">*</span>
              </label>
              <input
                id="title"
                type="text"
                className="input"
                placeholder={t('form.titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isPending}
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="url" className="block text-xs font-medium mb-1.5 text-foreground">
                {t('form.urlRequired')} <span className="text-error">*</span>
              </label>
              <div className="relative">
                <input
                  id="url"
                  type="url"
                  className={`input ${urlWarning ? 'border-warning' : ''}`}
                  placeholder={t('form.urlPlaceholder')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isPending}
                />
                {checkingUrl && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="animate-spin h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
              </div>
              {urlWarning && (
                <div className="mt-1.5 p-2 bg-warning/10 border border-warning/30 rounded-lg text-xs text-warning animate-fade-in flex items-start gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-medium">{t('form.urlWarning.title')}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {t('form.urlWarning.bookmark', { title: urlWarning.bookmark.title })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 第二行：描述和封面图 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="description" className="block text-xs font-medium mb-1.5 text-foreground">
                {t('form.description')}
              </label>
              <textarea
                id="description"
                className="input min-h-[60px] resize-none text-sm"
                placeholder={t('form.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div>
              <label htmlFor="coverImage" className="block text-xs font-medium mb-1.5 text-foreground">
                {t('form.coverImage')}
              </label>
              <div className="flex gap-2">
                <input
                  id="coverImage"
                  type="url"
                  className="input flex-1"
                  placeholder={t('form.coverImagePlaceholder')}
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  disabled={isPending}
                />
                {coverImage && (
                  <img
                    src={coverImage}
                    alt="Preview"
                    className="w-[60px] h-[60px] object-cover rounded-lg flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* 标签选择 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-foreground">
                {t('form.tags')}
                <span className="text-xs text-muted-foreground ml-1.5">
                  {t('form.tagsBatchHint')}
                </span>
              </label>
              <div className="flex items-center gap-2">
                {selectedTagCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {t('form.tagsSelected', { count: selectedTagCount })}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleGenerateAiTags}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isPending || isGeneratingAiTags || isLoadingAiSettings}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l1.9 4.8L19 9.5l-3.9 3.2L16.3 18 12 15.4 7.7 18l1.2-5.3L5 9.5l5.1-1.7L12 3z" />
                  </svg>
                  {isGeneratingAiTags ? t('form.ai.generating') : t('form.ai.generate')}
                </button>
              </div>
            </div>

            {/* 标签输入框 */}
            <input
              type="text"
              className="input mb-2"
              placeholder={t('form.tagsInputPlaceholder')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagInputKeyDown}
              disabled={isPending}
            />

            {/* 已选标签 */}
            {selectedTagCount > 0 && (
              <div className="mb-2 p-2 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex flex-wrap gap-1.5">
                  {selectedTagIds.map((tagId) => {
                    const tag = tags.find((t) => t.id === tagId)
                    if (!tag) return null
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className="text-xs px-2.5 py-1 rounded-full bg-primary text-primary-content hover:bg-primary/90 transition-colors shadow-sm"
                        disabled={isPending}
                      >
                        {tag.name} ×
                      </button>
                    )
                  })}
                  {selectedNewTags.map((tagName) => (
                    <button
                      key={`new-${tagName}`}
                      type="button"
                      onClick={() => toggleNewTag(tagName)}
                      className="text-xs px-2.5 py-1 rounded-full bg-primary text-primary-content hover:bg-primary/90 transition-colors shadow-sm"
                      disabled={isPending}
                    >
                      {tagName}
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-primary-content/85">
                        {t('form.ai.newBadge')}
                      </span>{' '}
                      ×
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent min-h-[124px]">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{t('form.ai.resultTitle')}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t('form.ai.resultHint')}</p>
                  </div>
                  <span className="px-2 py-0.5 text-[11px] rounded-full bg-primary/20 text-primary font-medium">
                    {isGeneratingAiTags ? '...' : aiSuggestedTags.length}
                  </span>
                </div>

                {isGeneratingAiTags ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" />
                    </svg>
                    <span>{t('form.ai.generating')}</span>
                  </div>
                ) : aiSuggestedTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">{t('form.ai.emptyHint')}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {aiSuggestedTags.map((tag) => {
                      const normalizedTagName = normalizeTagName(tag.name)
                      const existingTag = normalizedTagMap.get(normalizedTagName)
                      const isSelected = existingTag
                        ? selectedTagIdSet.has(existingTag.id)
                        : selectedNewTags.some((selectedTag) => normalizeTagName(selectedTag) === normalizedTagName)

                      return (
                        <button
                          key={`${tag.name}-${tag.isNew ? 'new' : 'existing'}`}
                          type="button"
                          onClick={() => toggleTagByName(tag.name)}
                          className={`text-xs px-2.5 py-1 rounded-full transition-colors border ${
                            isSelected
                              ? 'bg-primary text-primary-content border-primary'
                              : 'bg-card border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
                          }`}
                          disabled={isPending}
                        >
                          {tag.name}
                          {tag.isNew && (
                            <span
                              className={`ml-1 text-[10px] italic uppercase tracking-widest ${
                                isSelected ? 'text-primary-content/85' : 'text-info'
                              }`}
                            >
                              {t('form.ai.newBadge')}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded-lg border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent min-h-[124px]">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{t('form.tagLibrary.title')}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t('form.tagLibrary.hint')}</p>
                  </div>
                  <span className="px-2 py-0.5 text-[11px] rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium">
                    {tags.length}
                  </span>
                </div>

                <div
                  ref={availableTagsScrollRef}
                  onWheelCapture={handleAvailableTagsWheel}
                  className="max-h-[140px] overflow-y-auto scrollbar-theme min-h-0 overscroll-contain pr-0.5"
                  style={{ scrollbarGutter: 'stable' }}
                >
                  <div ref={availableTagsInnerRef} className="flex flex-wrap gap-1.5">
                    {tags.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1">
                        {t('form.noTags')}
                      </p>
                    ) : (
                      tags.map((tag) => {
                        const isSelected = selectedTagIdSet.has(tag.id)

                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => toggleTag(tag.id)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              isSelected
                                ? 'bg-primary text-primary-content border-primary'
                                : 'bg-card border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
                            }`}
                            disabled={isPending}
                          >
                            {tag.name}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 选项和按钮 */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  disabled={isPending}
                />
                <span className="text-xs text-foreground">{t('form.pinned')}</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isArchived}
                  onChange={(e) => setIsArchived(e.target.checked)}
                  disabled={isPending}
                />
                <span className="text-xs text-foreground">{t('form.archived')}</span>
              </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={isPending}
              />
              <span className="text-xs text-foreground">{t('form.public')}</span>
            </label>
            </div>

            {/* 按钮 */}
            <div className="flex gap-2">
              {isEditing && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  className="btn btn-sm btn-outline border-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground px-4"
                  disabled={isPending}
                  title={t('form.delete')}
                >
                  {deleteBookmark.isPending ? t('form.deleting') : t('form.delete')}
                </button>
              )}
              <button type="submit" className="btn btn-sm px-6" disabled={isPending}>
                {createBookmark.isPending || updateBookmark.isPending
                  ? t('form.saving')
                  : isEditing
                    ? t('form.save')
                    : t('form.create')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-sm btn-outline px-4"
                disabled={isPending}
              >
                {t('form.cancel')}
              </button>
            </div>
          </div>
          </form>
        </div>
      </div>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={t('form.deleteTitle')}
        message={t('form.deleteMessage')}
        type="error"
        confirmText={t('form.delete')}
        cancelText={t('form.cancel')}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
