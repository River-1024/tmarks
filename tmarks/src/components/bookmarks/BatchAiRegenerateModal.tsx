import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertDialog } from '@/components/common/AlertDialog'
import { Z_INDEX } from '@/lib/constants/z-index'
import type { Bookmark } from '@/lib/types'
import { useAiSettings } from '@/hooks/useAiSettings'
import { useTags } from '@/hooks/useTags'
import { tagsService } from '@/services/tags'
import { bookmarksService } from '@/services/bookmarks'
import { callAI } from '@/lib/ai/client'
import { BOOKMARKS_QUERY_KEY } from '@/hooks/useBookmarks'

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

function extractJsonPayload(content: string): AIResultPayload {
  const trimmed = content.trim()

  try {
    return JSON.parse(trimmed) as AIResultPayload
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error('Invalid AI response')
    }
    return JSON.parse(match[0]) as AIResultPayload
  }
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 12)
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
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [hasApplied, setHasApplied] = useState(false)
  const [showErrorAlert, setShowErrorAlert] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showSuccessAlert, setShowSuccessAlert] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const existingTags = tagsData?.tags || []

  useEffect(() => {
    if (!isOpen) {
      setStep(1)
      setDrafts([])
      setIsGenerating(false)
      setIsApplying(false)
      setErrorMessage('')
      setShowErrorAlert(false)
      setShowSuccessAlert(false)
      setSuccessMessage('')
      setHasApplied(false)
      return
    }

    setDrafts(
      bookmarks.map((bookmark) => ({
        bookmarkId: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        description: bookmark.description || '',
        tags: bookmark.tags.map((tag) => tag.name),
      }))
    )
  }, [isOpen, bookmarks])

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
    const apiKey = aiSettings.api_keys?.[provider] || ''
    const apiUrl = aiSettings.api_urls?.[provider] || ''

    return {
      provider,
      apiKey,
      apiUrl,
      model: aiSettings.model || undefined,
      customPrompt:
        aiSettings.enable_custom_prompt && aiSettings.custom_prompt
          ? aiSettings.custom_prompt
          : undefined,
      enabled: aiSettings.enabled,
    }
  }, [aiSettings])

  const handleGenerate = async () => {
    if (!aiConfig?.enabled || !aiConfig.apiKey) {
      setErrorMessage(t('batch.ai.errors.notConfigured'))
      setShowErrorAlert(true)
      return
    }

    setStep(2)
    setIsGenerating(true)

    try {
      const prompt = `${t('batch.ai.prompt.intro')}

${bookmarks
  .map(
    (bookmark, index) =>
      `${index + 1}. id: ${bookmark.id}\ntitle: ${bookmark.title}\nurl: ${bookmark.url}\ndescription: ${bookmark.description || ''}\nexisting_tags: ${bookmark.tags.map((tag) => tag.name).join(', ')}`
  )
  .join('\n\n')}

${t('batch.ai.prompt.rules')}`

      const result = await callAI({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        apiUrl: aiConfig.apiUrl,
        model: aiConfig.model,
        prompt,
        systemPrompt: aiConfig.customPrompt,
        temperature: 0.3,
        maxTokens: 2400,
      })

      const parsed = extractJsonPayload(result.content)
      const items = parsed.items || []

      setDrafts(
        bookmarks.map((bookmark) => {
          const matched = items.find(
            (item) => item.bookmark_id === bookmark.id || item.url === bookmark.url
          )

          return {
            bookmarkId: bookmark.id,
            title: bookmark.title,
            url: bookmark.url,
            description: bookmark.description || '',
            tags: normalizeTags(matched?.tags || bookmark.tags.map((tag) => tag.name)),
          }
        })
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

  const handleApply = async () => {
    setIsApplying(true)

    try {
      const tagMap = new Map(existingTags.map((tag) => [tag.name.toLowerCase(), tag.id]))

      for (const draft of drafts) {
        for (const tagName of draft.tags) {
          const key = tagName.toLowerCase()
          if (tagMap.has(key)) continue

          try {
            const created = await tagsService.createTag({ name: tagName })
            tagMap.set(key, created.id)
          } catch {
            const latest = await tagsService.getTags({ sort: 'name' })
            const matched = latest.tags.find((tag) => tag.name.toLowerCase() === key)
            if (!matched) {
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

        await bookmarksService.updateBookmark(draft.bookmarkId, { tag_ids: tagIds })
      }

      await queryClient.invalidateQueries({ queryKey: [BOOKMARKS_QUERY_KEY] })
      await queryClient.invalidateQueries({ queryKey: ['tags'] })

      setSuccessMessage(t('batch.ai.applySuccess', { count: drafts.length }))
      setShowSuccessAlert(true)
      setStep(4)
      setHasApplied(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('batch.ai.errors.applyFailed'))
      setShowErrorAlert(true)
    } finally {
      setIsApplying(false)
    }
  }

  const handleRequestClose = () => {
    if (hasApplied) {
      onSuccess?.()
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      style={{ zIndex: Z_INDEX.TAG_MANAGE_MODAL + 2 }}
    >
      <div className="absolute inset-0" onClick={handleRequestClose} />

      <div className="relative w-full max-w-5xl max-h-[85vh] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">{t('batch.ai.title')}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t('batch.ai.description', { count: bookmarks.length })}
            </p>
          </div>
          <button onClick={handleRequestClose} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 border-b border-border bg-muted/20">
          <div className="grid grid-cols-4 gap-3">
            {steps.map((item) => {
              const active = step === item.id
              const done = step > item.id

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border px-3 py-3 text-sm ${
                    active
                      ? 'border-primary bg-primary/10 text-foreground'
                      : done
                        ? 'border-green-500/30 bg-green-500/10 text-foreground'
                        : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  <div className="text-xs opacity-70">{item.id}</div>
                  <div className="font-medium mt-1">{item.label}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="text-sm text-muted-foreground mb-3">
                  {t('batch.ai.selectedSummary', { count: bookmarks.length })}
                </div>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                  {bookmarks.map((bookmark) => (
                    <div key={bookmark.id} className="rounded-lg border border-border bg-card px-3 py-2">
                      <div className="font-medium text-sm text-foreground truncate">{bookmark.title}</div>
                      <div className="text-xs text-muted-foreground truncate mt-1">{bookmark.url}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
                {isLoadingAiSettings ? t('batch.ai.loadingSettings') : t('batch.ai.overwriteHint')}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4 animate-pulse">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="text-lg font-semibold text-foreground">{t('batch.ai.generatingTitle')}</div>
              <div className="text-sm text-muted-foreground mt-2">{t('batch.ai.generatingDescription')}</div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div key={draft.bookmarkId} className="rounded-xl border border-border bg-card p-4">
                  <div className="font-medium text-foreground truncate">{draft.title}</div>
                  <div className="text-xs text-muted-foreground truncate mt-1 mb-3">{draft.url}</div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {t('batch.ai.tagsLabel')}
                  </label>
                  <input
                    value={draft.tags.join(', ')}
                    onChange={(event) => updateDraftTags(draft.bookmarkId, event.target.value)}
                    className="input input-bordered w-full"
                    placeholder={t('batch.ai.tagsPlaceholder')}
                  />
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="py-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 text-green-600 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-lg font-semibold text-foreground">{t('batch.ai.completedTitle')}</div>
              <div className="text-sm text-muted-foreground mt-2">
                {t('batch.ai.completedDescription', { count: drafts.length })}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">{t('batch.ai.footer', { count: bookmarks.length })}</div>
          <div className="flex items-center gap-2">
            {step !== 4 && (
              <button type="button" onClick={handleRequestClose} className="btn btn-outline" disabled={isGenerating || isApplying}>
                {tc('button.cancel')}
              </button>
            )}

            {step === 1 && (
              <button type="button" onClick={handleGenerate} className="btn" disabled={isGenerating || isLoadingAiSettings}>
                {t('batch.ai.start')}
              </button>
            )}

            {step === 3 && (
              <>
                <button type="button" onClick={() => handleGenerate()} className="btn btn-outline" disabled={isGenerating || isApplying}>
                  {t('batch.ai.regenerate')}
                </button>
                <button type="button" onClick={handleApply} className="btn" disabled={isApplying || isGenerating}>
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
    </div>
  )
}
