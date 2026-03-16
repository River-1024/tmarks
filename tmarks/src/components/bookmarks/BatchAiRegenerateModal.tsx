import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertDialog } from '@/components/common/AlertDialog'
import { Z_INDEX } from '@/lib/constants/z-index'
import type { Bookmark } from '@/lib/types'
import { useAiSettings } from '@/hooks/useAiSettings'
import { useTags } from '@/hooks/useTags'
import { tagsService } from '@/services/tags'
import { bookmarksService } from '@/services/bookmarks'
import { operationLogsService } from '@/services/operation-logs'
import { callAI } from '@/lib/ai/client'
import { BOOKMARKS_QUERY_KEY } from '@/hooks/useBookmarks'
import type { OperationLogWriteEntry } from '@/lib/types'

interface BatchAiRegenerateModalProps {
  isOpen: boolean
  bookmarks: Bookmark[]
  onClose: () => void
  onSuccess?: () => void
}

type Step = 1 | 2 | 3 | 4

interface DraftItem {
  bookmarkId: string
  title: string
  url: string
  description: string
  tags: string[]
}

interface AIResultPayload {
  items?: Array<{
    bookmark_id?: string
    url?: string
    tags?: string[]
  }>
}

interface AIResultItem {
  bookmark_id?: string
  url?: string
  tags?: string[]
}

interface PromptTemplateVars {
  title: string
  url: string
  description: string
  content: string
  existingTags: string
  recentBookmarks: string
  maxTags: string
}

function renderPromptTemplate(template: string, vars: PromptTemplateVars): string {
  return template.replace(
    /\{(title|url|description|content|existingTags|recentBookmarks|maxTags)\}/g,
    (_, key: keyof PromptTemplateVars) => vars[key] ?? ''
  )
}

function buildBatchSystemPrompt(basePrompt: string | undefined, bookmarkCount: number) {
  const contract = `你正在执行 TMarks 的批量书签标签整理任务。

最终输出必须严格遵循以下要求：
1. 只允许输出一个合法 JSON 对象
2. 顶层必须且只能是 {"items":[{"bookmark_id":"...","tags":["标签1","标签2"]}]}
3. 禁止返回 suggestedTags、translatedTitle、translatedDescription、explanation、reasoning 或任何额外字段
4. items 必须覆盖当前批次全部 ${bookmarkCount} 个书签
5. 每个 item 必须包含 bookmark_id 和 tags
6. tags 只能是字符串数组，返回 2-5 个简洁、可复用的中文标签
7. 如果某个书签实在无法判断，也必须返回对应 bookmark_id，且 tags 设为空数组 []
8. 禁止输出 Markdown、代码块、注释或自然语言说明`

  return basePrompt ? `${basePrompt}\n\n${contract}` : contract
}

function buildCompactRetryPrompt(bookmarks: Bookmark[]) {
  return `请只为下面书签返回最简 JSON，不要输出任何额外文本。

返回格式：
{"items":[{"bookmark_id":"...","tags":["标签1","标签2"]}]}

要求：
1. 必须覆盖全部 ${bookmarks.length} 个书签
2. 每个 tags 返回 2-5 个中文标签
3. 只保留最相关标签，优先复用现有标签
4. 不要返回 suggestedTags 或其他字段

书签列表：
${bookmarks
  .map(
    (bookmark, index) =>
      `${index + 1}. bookmark_id: ${bookmark.id}\ntitle: ${bookmark.title}\nurl: ${bookmark.url}\nexisting_tags: ${bookmark.tags.map((tag) => tag.name).join(', ')}`,
  )
  .join('\n\n')}`
}

function getStringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function extractTagsFromSuggestedTags(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return normalizeTags(
    value
      .map((tag) => {
        if (typeof tag === 'string') {
          return tag
        }
        if (isRecord(tag)) {
          return getStringValue(tag.name)
        }
        return null
      })
      .filter((tag): tag is string => Boolean(tag)),
  )
}

function normalizeParsedPayload(parsed: unknown, bookmarks: Bookmark[]): AIResultPayload {
  if (Array.isArray(parsed)) {
    return { items: parsed as AIResultItem[] }
  }

  if (!isRecord(parsed)) {
    throw new Error('AI response is not a JSON object')
  }

  if (Array.isArray(parsed.items)) {
    return { items: parsed.items as AIResultItem[] }
  }

  if ('suggestedTags' in parsed) {
    if (bookmarks.length !== 1) {
      throw new Error('AI returned suggestedTags format, but batch mode requires items format for every bookmark')
    }

    return {
      items: [
        {
          bookmark_id: bookmarks[0]?.id,
          url: bookmarks[0]?.url,
          tags: extractTagsFromSuggestedTags(parsed.suggestedTags),
        },
      ],
    }
  }

  throw new Error('No supported items or suggestedTags field found in AI response')
}

function extractJsonPayload(content: string, bookmarks: Bookmark[]): AIResultPayload {
  const trimmed = content.trim()
  const candidates: string[] = []
  const fenced = trimmed.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  if (trimmed) {
    candidates.push(trimmed)
  }
  if (fenced && fenced !== trimmed) {
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

  let lastError: Error | null = null

  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = JSON.parse(normalizeJsonText(candidate)) as unknown
      return normalizeParsedPayload(parsed, bookmarks)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw new Error(lastError?.message || 'Invalid AI response')
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 12)
}

function normalizeJsonText(content: string) {
  return content
    .trim()
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\}(\s*)\{/g, '},$1{')
}

function summarizeBookmarksForLog(bookmarks: Bookmark[]) {
  return bookmarks.map((bookmark) => ({
    bookmark_id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    description: bookmark.description || '',
    existing_tags: bookmark.tags.map((tag) => tag.name),
  }))
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getAiFinishReason(raw: unknown) {
  if (!isRecord(raw) || !Array.isArray(raw.choices) || raw.choices.length === 0) {
    return null
  }

  const firstChoice = raw.choices[0]
  if (!isRecord(firstChoice)) {
    return null
  }

  return getStringValue(firstChoice.finish_reason)
}

function createAiParseError(error: unknown, finishReason: string | null, retried: boolean) {
  if (finishReason === 'length') {
    return new Error(
      retried
        ? 'AI 回复因输出长度限制被截断，自动紧凑重试后仍未得到完整 JSON。请缩短自定义 Prompt，或改用新的 items 格式模板后重试。'
        : 'AI 回复因输出长度限制被截断，未能生成完整 JSON。请缩短自定义 Prompt，或改用新的 items 格式模板后重试。',
    )
  }

  return new Error(getErrorMessage(error))
}

function shouldRetryAiParse(error: unknown, finishReason: string | null) {
  if (finishReason === 'length') {
    return true
  }

  const message = getErrorMessage(error)
  return /suggestedtags|items format|supported items|no supported items/i.test(message)
}

function matchAiItem(
  bookmark: Bookmark,
  items: AIResultItem[],
): { item: AIResultItem | null; matchedBy: 'bookmark_id' | 'url' | null } {
  const byId = items.find((item) => item.bookmark_id === bookmark.id)
  if (byId) {
    return { item: byId, matchedBy: 'bookmark_id' }
  }

  const byUrl = items.find((item) => item.url === bookmark.url)
  if (byUrl) {
    return { item: byUrl, matchedBy: 'url' }
  }

  return { item: null, matchedBy: null }
}

export function BatchAiRegenerateModal({
  isOpen,
  bookmarks,
  onClose,
  onSuccess,
}: BatchAiRegenerateModalProps) {
  const { t } = useTranslation('bookmarks')
  const { t: tc } = useTranslation('common')
  const queryClient = useQueryClient()
  const { data: aiSettings, isLoading: isLoadingAiSettings } = useAiSettings()
  const { data: tagsData } = useTags({ sort: 'name' })

  const [step, setStep] = useState<Step>(1)
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [aiGeneratedTagsByBookmark, setAiGeneratedTagsByBookmark] = useState<Record<string, string[]>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [hasApplied, setHasApplied] = useState(false)
  const [showErrorAlert, setShowErrorAlert] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showSuccessAlert, setShowSuccessAlert] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const existingTags = tagsData?.tags || []
  const existingTagNameSet = useMemo(
    () => new Set(existingTags.map((tag) => tag.name.toLowerCase())),
    [existingTags],
  )

  useEffect(() => {
    if (!isOpen) {
      setStep(1)
      setDrafts([])
      setAiGeneratedTagsByBookmark({})
      setIsGenerating(false)
      setIsApplying(false)
      setHasApplied(false)
      setErrorMessage('')
      setSuccessMessage('')
      setShowErrorAlert(false)
      setShowSuccessAlert(false)
      document.body.style.overflow = ''
      return
    }

    document.body.style.overflow = 'hidden'
    setAiGeneratedTagsByBookmark({})
    setDrafts(
      bookmarks.map((bookmark) => ({
        bookmarkId: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        description: bookmark.description || '',
        tags: bookmark.tags.map((tag) => tag.name),
      }))
    )

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, bookmarks])

  useEffect(() => {
    if (!isOpen) return

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isGenerating && !isApplying) {
        handleRequestClose()
      }
    }

    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, isGenerating, isApplying, hasApplied])

  const steps = useMemo(
    () => [
      { id: 1, label: t('batch.ai.steps.select') },
      { id: 2, label: t('batch.ai.steps.generate') },
      { id: 3, label: t('batch.ai.steps.review') },
      { id: 4, label: t('batch.ai.steps.complete') },
    ],
    [t]
  )

  const aiConfig = useMemo(() => {
    if (!aiSettings) return null

    const provider = aiSettings.provider

    return {
      provider,
      apiKey: aiSettings.api_keys?.[provider] || '',
      apiUrl: aiSettings.api_urls?.[provider] || '',
      model: aiSettings.model || undefined,
      customPrompt:
        aiSettings.enable_custom_prompt && aiSettings.custom_prompt
          ? aiSettings.custom_prompt
          : undefined,
      enabled: aiSettings.enabled,
    }
  }, [aiSettings])

  const handleRequestClose = () => {
    if (hasApplied) {
      onSuccess?.()
    }
    onClose()
  }

  const writeOperationLogEntries = async (entries: OperationLogWriteEntry[]) => {
    if (entries.length === 0) {
      return
    }

    try {
      for (let index = 0; index < entries.length; index += 100) {
        await operationLogsService.writeEntries(entries.slice(index, index + 100))
      }
    } catch (error) {
      console.error('[BatchAiRegenerateModal] Failed to write operation logs:', error)
    }
  }

  const handleGenerate = async () => {
    if (!aiConfig?.enabled || !aiConfig.apiKey) {
      setErrorMessage(t('batch.ai.errors.notConfigured'))
      setShowErrorAlert(true)
      return
    }

    setStep(2)
    setIsGenerating(true)

    try {
      const templateVars: PromptTemplateVars = {
        title: bookmarks[0]?.title || '',
        url: bookmarks[0]?.url || '',
        description: bookmarks[0]?.description || '',
        content: bookmarks
          .slice(0, 5)
          .map((bookmark) => `${bookmark.title}\n${bookmark.description || ''}`.trim())
          .join('\n\n'),
        existingTags: existingTags.map((tag) => tag.name).join(', '),
        recentBookmarks: bookmarks
          .slice(0, 10)
          .map((bookmark) => `- ${bookmark.title} [${bookmark.tags.map((tag) => tag.name).join(', ')}]`)
          .join('\n'),
        maxTags: '5',
      }

      const prompt = `${t('batch.ai.prompt.intro')}

${bookmarks
  .map(
    (bookmark, index) =>
      `${index + 1}. id: ${bookmark.id}\ntitle: ${bookmark.title}\nurl: ${bookmark.url}\ndescription: ${bookmark.description || ''}\nexisting_tags: ${bookmark.tags.map((tag) => tag.name).join(', ')}`
  )
  .join('\n\n')}

${t('batch.ai.prompt.rules')}`
      const renderedCustomPrompt = aiConfig.customPrompt
        ? renderPromptTemplate(aiConfig.customPrompt, templateVars)
        : undefined
      const systemPrompt = buildBatchSystemPrompt(renderedCustomPrompt, bookmarks.length)
      const requestSummary = {
        provider: aiConfig.provider,
        model: aiConfig.model || null,
        api_url: aiConfig.apiUrl || null,
        temperature: 0.3,
        max_tokens: 2400,
        bookmark_count: bookmarks.length,
        bookmarks: summarizeBookmarksForLog(bookmarks),
        prompt,
        system_prompt: systemPrompt || null,
      }

      await writeOperationLogEntries([
        {
          event_type: 'ai.bookmarks.batch_regenerate.started',
          payload: requestSummary,
        },
      ])

      let result: Awaited<ReturnType<typeof callAI>>
      try {
        result = await callAI({
          provider: aiConfig.provider,
          apiKey: aiConfig.apiKey,
          apiUrl: aiConfig.apiUrl,
          model: aiConfig.model,
          prompt,
          systemPrompt,
          temperature: 0.3,
          maxTokens: 2400,
        })
      } catch (error) {
        await writeOperationLogEntries([
          {
            event_type: 'ai.bookmarks.batch_regenerate.request_failed',
            payload: {
              ...requestSummary,
              error: getErrorMessage(error),
            },
          },
        ])
        throw error
      }

      const initialFinishReason = getAiFinishReason(result.raw)
      let parsed: AIResultPayload
      try {
        parsed = extractJsonPayload(result.content, bookmarks)
      } catch (error) {
        await writeOperationLogEntries([
          {
            event_type: 'ai.bookmarks.batch_regenerate.parse_failed',
            payload: {
              ...requestSummary,
              finish_reason: initialFinishReason,
              error: getErrorMessage(error),
              response: {
                content: result.content,
                raw: result.raw,
              },
            },
          },
        ])

        if (!shouldRetryAiParse(error, initialFinishReason)) {
          throw createAiParseError(error, initialFinishReason, false)
        }

        const retryPrompt = buildCompactRetryPrompt(bookmarks)
        const retrySystemPrompt = buildBatchSystemPrompt(undefined, bookmarks.length)
        const retryRequestSummary = {
          ...requestSummary,
          prompt: retryPrompt,
          system_prompt: retrySystemPrompt,
          retry_from_finish_reason: initialFinishReason,
        }

        await writeOperationLogEntries([
          {
            event_type: 'ai.bookmarks.batch_regenerate.retry_started',
            payload: retryRequestSummary,
          },
        ])

        let retryResult: Awaited<ReturnType<typeof callAI>>
        try {
          retryResult = await callAI({
            provider: aiConfig.provider,
            apiKey: aiConfig.apiKey,
            apiUrl: aiConfig.apiUrl,
            model: aiConfig.model,
            prompt: retryPrompt,
            systemPrompt: retrySystemPrompt,
            temperature: 0.2,
            maxTokens: 2400,
          })
        } catch (retryError) {
          await writeOperationLogEntries([
            {
              event_type: 'ai.bookmarks.batch_regenerate.retry_failed',
              payload: {
                ...retryRequestSummary,
                error: getErrorMessage(retryError),
              },
            },
          ])
          throw createAiParseError(retryError, initialFinishReason, true)
        }

        const retryFinishReason = getAiFinishReason(retryResult.raw)
        try {
          parsed = extractJsonPayload(retryResult.content, bookmarks)
          result = retryResult

          await writeOperationLogEntries([
            {
              event_type: 'ai.bookmarks.batch_regenerate.retry_completed',
              payload: {
                ...retryRequestSummary,
                finish_reason: retryFinishReason,
                response: {
                  content: retryResult.content,
                  raw: retryResult.raw,
                },
              },
            },
          ])
        } catch (retryParseError) {
          await writeOperationLogEntries([
            {
              event_type: 'ai.bookmarks.batch_regenerate.retry_failed',
              payload: {
                ...retryRequestSummary,
                finish_reason: retryFinishReason,
                error: getErrorMessage(retryParseError),
                response: {
                  content: retryResult.content,
                  raw: retryResult.raw,
                },
              },
            },
          ])
          throw createAiParseError(retryParseError, retryFinishReason ?? initialFinishReason, true)
        }
      }

      const items = parsed.items || []
      const itemLogEntries: OperationLogWriteEntry[] = bookmarks.map((bookmark) => {
        const { item, matchedBy } = matchAiItem(bookmark, items)
        const generatedTags = normalizeTags(item?.tags || bookmark.tags.map((tag) => tag.name))

        return {
          event_type: 'ai.bookmarks.item_generated',
          payload: {
            bookmark_id: bookmark.id,
            title: bookmark.title,
            url: bookmark.url,
            existing_tags: bookmark.tags.map((tag) => tag.name),
            generated_tags: generatedTags,
            matched: Boolean(item),
            matched_by: matchedBy,
            ai_response_item: item,
          },
        }
      })

      await writeOperationLogEntries([
        {
          event_type: 'ai.bookmarks.batch_regenerate.completed',
          payload: {
            ...requestSummary,
            finish_reason: getAiFinishReason(result.raw),
            parsed_item_count: items.length,
            response: {
              content: result.content,
              raw: result.raw,
            },
          },
        },
        ...itemLogEntries,
      ])

      const nextDrafts = bookmarks.map((bookmark) => {
        const { item: matched } = matchAiItem(bookmark, items)

        return {
          bookmarkId: bookmark.id,
          title: bookmark.title,
          url: bookmark.url,
          description: bookmark.description || '',
          tags: normalizeTags(matched?.tags || bookmark.tags.map((tag) => tag.name)),
        }
      })

      setDrafts(nextDrafts)
      setAiGeneratedTagsByBookmark(
        Object.fromEntries(nextDrafts.map((draft) => [draft.bookmarkId, draft.tags])),
      )
      setStep(3)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('batch.ai.errors.generateFailed'))
      setShowErrorAlert(true)
      setStep(1)
    } finally {
      setIsGenerating(false)
    }
  }

  const updateDraftTags = (bookmarkId: string, value: string) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.bookmarkId === bookmarkId
          ? { ...draft, tags: normalizeTags(value.split(/[，,]/)) }
          : draft
      )
    )
  }

  const toggleDraftTag = (bookmarkId: string, tagName: string) => {
    const normalized = tagName.trim().toLowerCase()
    if (!normalized) return

    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.bookmarkId !== bookmarkId) {
          return draft
        }

        const exists = draft.tags.some((tag) => tag.toLowerCase() === normalized)
        if (exists) {
          return {
            ...draft,
            tags: draft.tags.filter((tag) => tag.toLowerCase() !== normalized),
          }
        }

        return {
          ...draft,
          tags: normalizeTags([...draft.tags, tagName]),
        }
      }),
    )
  }

  const handleApply = async () => {
    setIsApplying(true)
    const createdTags: Array<{ tag_id: string; name: string }> = []
    const appliedBookmarks: Array<{ bookmark_id: string; title: string; tags: string[] }> = []
    let failedContext: Record<string, unknown> | null = null

    try {
      await writeOperationLogEntries([
        {
          event_type: 'ai.bookmarks.batch_regenerate.apply_started',
          payload: {
            count: drafts.length,
            bookmarks: drafts.map((draft) => ({
              bookmark_id: draft.bookmarkId,
              title: draft.title,
              tags: draft.tags,
            })),
          },
        },
      ])

      const tagMap = new Map(existingTags.map((tag) => [tag.name.toLowerCase(), tag.id]))

      for (const draft of drafts) {
        for (const tagName of draft.tags) {
          const key = tagName.toLowerCase()
          if (tagMap.has(key)) continue

          try {
            const created = await tagsService.createTag({ name: tagName })
            tagMap.set(key, created.id)
            createdTags.push({ tag_id: created.id, name: created.name })
          } catch {
            const latest = await tagsService.getTags({ sort: 'name' })
            const matched = latest.tags.find((tag) => tag.name.toLowerCase() === key)
            if (!matched) {
              failedContext = {
                stage: 'create_tag',
                tag_name: tagName,
                bookmark_id: draft.bookmarkId,
              }
              throw new Error(t('batch.ai.errors.createTagFailed', { name: tagName }))
            }
            tagMap.set(key, matched.id)
          }
        }
      }

      for (const draft of drafts) {
        const tagIds = draft.tags
          .map((tagName) => tagMap.get(tagName.toLowerCase()))
          .filter((id): id is string => Boolean(id))

        failedContext = {
          stage: 'update_bookmark',
          bookmark_id: draft.bookmarkId,
          title: draft.title,
          tag_ids: tagIds,
          tags: draft.tags,
        }
        await bookmarksService.updateBookmark(draft.bookmarkId, { tag_ids: tagIds })
        appliedBookmarks.push({
          bookmark_id: draft.bookmarkId,
          title: draft.title,
          tags: draft.tags,
        })
      }

      await queryClient.invalidateQueries({ queryKey: [BOOKMARKS_QUERY_KEY] })
      await queryClient.invalidateQueries({ queryKey: ['tags'] })

      await writeOperationLogEntries([
        {
          event_type: 'ai.bookmarks.batch_regenerate.apply_completed',
          payload: {
            count: appliedBookmarks.length,
            created_tags: createdTags,
            bookmarks: appliedBookmarks,
          },
        },
      ])

      setSuccessMessage(t('batch.ai.applySuccess', { count: drafts.length }))
      setShowSuccessAlert(true)
      setHasApplied(true)
      setStep(4)
    } catch (error) {
      await writeOperationLogEntries([
        {
          event_type: 'ai.bookmarks.batch_regenerate.apply_failed',
          payload: {
            count: drafts.length,
            created_tags: createdTags,
            applied_bookmarks: appliedBookmarks,
            failed_context: failedContext,
            error: getErrorMessage(error),
          },
        },
      ])
      setErrorMessage(error instanceof Error ? error.message : t('batch.ai.errors.applyFailed'))
      setShowErrorAlert(true)
    } finally {
      setIsApplying(false)
    }
  }

  if (!isOpen) return null

  const dialogContent = (
    <>
      <div
        className="fixed inset-0 flex items-center justify-center p-4 sm:p-6"
        style={{ zIndex: Z_INDEX.TAG_MANAGE_MODAL + 20 }}
      >
        <div className="absolute inset-0 bg-background/85 backdrop-blur-md" onClick={handleRequestClose} />

        <div
          className="relative w-full max-w-6xl h-[min(88vh,900px)] rounded-3xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="shrink-0 px-6 py-5 border-b border-border bg-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{t('batch.ai.title')}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('batch.ai.description', { count: bookmarks.length })}
                </p>
              </div>
              <button
                onClick={handleRequestClose}
                disabled={isGenerating || isApplying}
                className="w-10 h-10 rounded-xl hover:bg-muted flex items-center justify-center disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {steps.map((item) => {
                const active = step === item.id
                const completed = step > item.id

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border px-4 py-3 transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : completed
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-foreground'
                          : 'border-border bg-muted/20 text-muted-foreground'
                    }`}
                  >
                    <div className="text-xs opacity-70">{item.id}</div>
                    <div className="text-sm font-medium mt-1">{item.label}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 bg-card">
            {step === 1 && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="text-sm text-muted-foreground mb-3">
                    {t('batch.ai.selectedSummary', { count: bookmarks.length })}
                  </div>
                  <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                    {bookmarks.map((bookmark) => (
                      <div key={bookmark.id} className="rounded-xl border border-border bg-card px-4 py-3">
                        <div className="font-medium text-foreground truncate">{bookmark.title}</div>
                        <div className="text-xs text-muted-foreground truncate mt-1">{bookmark.url}</div>
                        {bookmark.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {bookmark.tags.slice(0, 6).map((tag) => (
                              <span key={tag.id} className="px-2 py-1 rounded-full text-xs bg-muted text-muted-foreground">
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
                  {isLoadingAiSettings ? t('batch.ai.loadingSettings') : t('batch.ai.overwriteHint')}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4 animate-pulse">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="text-lg font-semibold text-foreground">{t('batch.ai.generatingTitle')}</div>
                <div className="text-sm text-muted-foreground mt-2 max-w-lg">
                  {t('batch.ai.generatingDescription')}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                {drafts.map((draft) => {
                  const selectedTagSet = new Set(draft.tags.map((tag) => tag.toLowerCase()))
                  const aiGeneratedTags = aiGeneratedTagsByBookmark[draft.bookmarkId] || []

                  return (
                    <div key={draft.bookmarkId} className="rounded-2xl border border-border bg-card p-4">
                      <div className="font-medium text-foreground truncate">{draft.title}</div>
                      <div className="text-xs text-muted-foreground truncate mt-1">{draft.url}</div>
                      {draft.description && (
                        <div className="text-sm text-muted-foreground mt-3 line-clamp-2">{draft.description}</div>
                      )}

                      {draft.tags.length > 0 && (
                        <div className="mt-4 p-2 bg-primary/5 border border-primary/20 rounded-lg">
                          <div className="flex flex-wrap gap-1.5">
                            {draft.tags.map((tagName) => {
                              const isNewTag = !existingTagNameSet.has(tagName.toLowerCase())

                              return (
                                <button
                                  key={`${draft.bookmarkId}-selected-${tagName}`}
                                  type="button"
                                  onClick={() => toggleDraftTag(draft.bookmarkId, tagName)}
                                  className="text-xs px-2.5 py-1 rounded-full bg-primary text-primary-content hover:bg-primary/90 transition-colors shadow-sm"
                                  disabled={isGenerating || isApplying}
                                >
                                  {tagName}
                                  {isNewTag && (
                                    <span className="ml-1 text-[10px] italic uppercase tracking-widest text-primary-content/85">
                                      {t('form.ai.newBadge')}
                                    </span>
                                  )}{' '}
                                  ×
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent min-h-[124px]">
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-foreground">{t('form.ai.resultTitle')}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{t('form.ai.resultHint')}</p>
                            </div>
                            <span className="px-2 py-0.5 text-[11px] rounded-full bg-primary/20 text-primary font-medium">
                              {aiGeneratedTags.length}
                            </span>
                          </div>

                          {aiGeneratedTags.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-1">{t('form.ai.emptyHint')}</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {aiGeneratedTags.map((tagName) => {
                                const lowerTagName = tagName.toLowerCase()
                                const isSelected = selectedTagSet.has(lowerTagName)
                                const isNewTag = !existingTagNameSet.has(lowerTagName)

                                return (
                                  <button
                                    key={`${draft.bookmarkId}-ai-${tagName}`}
                                    type="button"
                                    onClick={() => toggleDraftTag(draft.bookmarkId, tagName)}
                                    className={`text-xs px-2.5 py-1 rounded-full transition-colors border ${
                                      isSelected
                                        ? 'bg-primary text-primary-content border-primary'
                                        : 'bg-card border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
                                    }`}
                                    disabled={isGenerating || isApplying}
                                  >
                                    {tagName}
                                    {isNewTag && (
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
                              {existingTags.length}
                            </span>
                          </div>

                          <div className="max-h-[140px] overflow-y-auto scrollbar-theme min-h-0 overscroll-contain pr-0.5">
                            <div className="flex flex-wrap gap-1.5">
                              {existingTags.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-1">{t('form.noTags')}</p>
                              ) : (
                                existingTags.map((tag) => {
                                  const isSelected = selectedTagSet.has(tag.name.toLowerCase())

                                  return (
                                    <button
                                      key={`${draft.bookmarkId}-lib-${tag.id}`}
                                      type="button"
                                      onClick={() => toggleDraftTag(draft.bookmarkId, tag.name)}
                                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                        isSelected
                                          ? 'bg-primary text-primary-content border-primary'
                                          : 'bg-card border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
                                      }`}
                                      disabled={isGenerating || isApplying}
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

                      <label className="block text-sm font-medium text-foreground mt-4 mb-2">
                        {t('batch.ai.tagsLabel')}
                      </label>
                      <input
                        value={draft.tags.join(', ')}
                        onChange={(event) => updateDraftTags(draft.bookmarkId, event.target.value)}
                        className="input input-bordered w-full"
                        placeholder={t('batch.ai.tagsPlaceholder')}
                      />
                    </div>
                  )
                })}
              </div>
            )}

            {step === 4 && (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="text-lg font-semibold text-foreground">{t('batch.ai.completedTitle')}</div>
                <div className="text-sm text-muted-foreground mt-2 max-w-lg">
                  {t('batch.ai.completedDescription', { count: drafts.length })}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">{t('batch.ai.footer', { count: bookmarks.length })}</div>
            <div className="flex items-center gap-2">
              {step !== 4 && (
                <button
                  type="button"
                  onClick={handleRequestClose}
                  className="btn btn-outline"
                  disabled={isGenerating || isApplying}
                >
                  {tc('button.cancel')}
                </button>
              )}

              {step === 1 && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="btn"
                  disabled={isGenerating || isLoadingAiSettings}
                >
                  {t('batch.ai.start')}
                </button>
              )}

              {step === 3 && (
                <>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="btn btn-outline"
                    disabled={isGenerating || isApplying}
                  >
                    {t('batch.ai.regenerate')}
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    className="btn"
                    disabled={isGenerating || isApplying}
                  >
                    {isApplying ? t('batch.ai.applying') : t('batch.ai.apply')}
                  </button>
                </>
              )}

              {step === 4 && (
                <button type="button" onClick={handleRequestClose} className="btn">
                  {t('batch.ai.done')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog
        isOpen={showErrorAlert}
        title={tc('dialog.errorTitle')}
        message={errorMessage}
        type="error"
        onConfirm={() => setShowErrorAlert(false)}
      />

      <AlertDialog
        isOpen={showSuccessAlert}
        title={tc('dialog.successTitle')}
        message={successMessage}
        type="success"
        onConfirm={() => setShowSuccessAlert(false)}
      />
    </>
  )

  return createPortal(dialogContent, document.body)
}
