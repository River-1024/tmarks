import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BatchActionType, Bookmark } from '@/lib/types'
import { useBatchAction } from '@/hooks/useBookmarks'
import { useTags } from '@/hooks/useTags'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { AlertDialog } from '@/components/common/AlertDialog'
import { Z_INDEX } from '@/lib/constants/z-index'
import { BatchAiRegenerateModal } from './BatchAiRegenerateModal'

interface BatchActionBarProps {
  selectedIds: string[]
  bookmarks: Bookmark[]
  onClearSelection: () => void
  onSuccess?: () => void
}

export function BatchActionBar({
  selectedIds,
  bookmarks,
  onClearSelection,
  onSuccess,
}: BatchActionBarProps) {
  const { t } = useTranslation('bookmarks')
  const { t: tc } = useTranslation('common')
  const [showTagMenu, setShowTagMenu] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showErrorAlert, setShowErrorAlert] = useState(false)
  const [showSuccessAlert, setShowSuccessAlert] = useState(false)
  const [showAiModal, setShowAiModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [pendingAction, setPendingAction] = useState<BatchActionType | null>(null)
  const batchAction = useBatchAction()
  const { data: tagsData } = useTags({ sort: 'name' })

  const tags = tagsData?.tags || []
  const selectedBookmarks = useMemo(
    () => bookmarks.filter((bookmark) => selectedIds.includes(bookmark.id)),
    [bookmarks, selectedIds]
  )

  const handleAction = async (action: BatchActionType) => {
    if (selectedIds.length === 0) return

    if (action === 'delete' || action === 'pin' || action === 'archive') {
      setPendingAction(action)
      setShowConfirmDialog(true)
      return
    }

    await executeAction(action)
  }

  const getSuccessMessage = (action: BatchActionType) => {
    const count = selectedIds.length
    switch (action) {
      case 'delete':
        return t('batch.deleteSuccess', { count })
      case 'pin':
        return t('batch.pinSuccess', { count })
      case 'archive':
        return t('batch.archiveSuccess', { count })
      default:
        return tc('message.operationSuccess')
    }
  }

  const executeAction = async (action: BatchActionType) => {
    try {
      await batchAction.mutateAsync({
        action,
        bookmark_ids: selectedIds,
      })
      onClearSelection()
      onSuccess?.()
      setSuccessMessage(getSuccessMessage(action))
      setShowSuccessAlert(true)
    } catch (error) {
      console.error('Batch action failed:', error)
      setShowErrorAlert(true)
    }
  }

  const handleConfirm = async () => {
    setShowConfirmDialog(false)
    if (pendingAction) {
      await executeAction(pendingAction)
      setPendingAction(null)
    }
  }

  const handleCancel = () => {
    setShowConfirmDialog(false)
    setPendingAction(null)
  }

  const getConfirmDialogConfig = () => {
    const count = selectedIds.length
    switch (pendingAction) {
      case 'delete':
        return {
          title: t('batch.deleteTitle'),
          message: t('batch.deleteMessage', { count }),
          type: 'warning' as const,
        }
      case 'pin':
        return {
          title: t('batch.pinTitle'),
          message: t('batch.pinMessage', { count }),
          type: 'info' as const,
        }
      case 'archive':
        return {
          title: t('batch.archiveTitle'),
          message: t('batch.archiveMessage', { count }),
          type: 'info' as const,
        }
      default:
        return {
          title: t('batch.confirmAction'),
          message: t('batch.confirmMessage'),
          type: 'info' as const,
        }
    }
  }

  const handleUpdateTags = async (mode: 'add' | 'remove') => {
    if (selectedIds.length === 0 || selectedTagIds.length === 0) return

    try {
      await batchAction.mutateAsync({
        action: 'update_tags',
        bookmark_ids: selectedIds,
        add_tag_ids: mode === 'add' ? selectedTagIds : undefined,
        remove_tag_ids: mode === 'remove' ? selectedTagIds : undefined,
      })
      const message = mode === 'add'
        ? t('batch.addTagsSuccess', { count: selectedIds.length })
        : t('batch.removeTagsSuccess', { count: selectedIds.length })
      setSuccessMessage(message)
      setShowSuccessAlert(true)
      setSelectedTagIds([])
      setShowTagMenu(false)
      onClearSelection()
      onSuccess?.()
    } catch (error) {
      console.error('Batch update tags failed:', error)
      setShowErrorAlert(true)
    }
  }

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId))
    } else {
      setSelectedTagIds([...selectedTagIds, tagId])
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 animate-slide-up" style={{ zIndex: Z_INDEX.BATCH_ACTION_BAR }}>
      <div className="card bg-primary text-primary-content shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium">
            {t('batch.selected', { count: selectedIds.length })}
          </div>

          <div className="w-px h-6 bg-primary-content/20"></div>

          <div className="flex gap-2">
            <button
              onClick={() => handleAction('pin')}
              className="btn btn-sm bg-primary-content/10 hover:bg-primary-content/20 border-none text-primary-content"
              disabled={batchAction.isPending}
              title={t('batch.pin')}
            >
              {t('batch.pin')}
            </button>

            <button
              onClick={() => handleAction('archive')}
              className="btn btn-sm bg-primary-content/10 hover:bg-primary-content/20 border-none text-primary-content"
              disabled={batchAction.isPending}
              title={t('batch.archive')}
            >
              {t('batch.archive')}
            </button>

            <div className="relative">
              <button
                onClick={() => setShowTagMenu(!showTagMenu)}
                className="btn btn-sm bg-primary-content/10 hover:bg-primary-content/20 border-none text-primary-content"
                disabled={batchAction.isPending}
              >
                {t('batch.tags')}
              </button>

              {showTagMenu && (
                <div
                  className="absolute bottom-full mb-2 left-0 w-64 text-base-content rounded-lg shadow-xl p-3 border"
                  style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <div className="text-sm font-medium mb-2">{t('batch.selectTags')}</div>
                  <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
                    {tags.map((tag) => (
                      <label
                        key={tag.id}
                        className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTagIds.includes(tag.id)}
                          onChange={() => toggleTag(tag.id)}
                          className="checkbox checkbox-sm"
                        />
                        <span className="text-sm">{tag.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                    <button
                      onClick={() => handleUpdateTags('add')}
                      className="btn btn-sm flex-1"
                      disabled={selectedTagIds.length === 0 || batchAction.isPending}
                    >
                      {t('batch.addTags')}
                    </button>
                    <button
                      onClick={() => handleUpdateTags('remove')}
                      className="btn btn-sm btn-outline flex-1"
                      disabled={selectedTagIds.length === 0 || batchAction.isPending}
                    >
                      {t('batch.removeTags')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowAiModal(true)}
              className="btn btn-sm bg-primary-content/10 hover:bg-primary-content/20 border-none text-primary-content"
              disabled={batchAction.isPending || selectedBookmarks.length === 0}
              title={t('batch.ai.button')}
            >
              {t('batch.ai.button')}
            </button>

            <button
              onClick={() => handleAction('delete')}
              className="btn btn-sm bg-error/10 hover:bg-error/20 border-none text-primary-content"
              disabled={batchAction.isPending}
              title={t('batch.delete')}
            >
              {t('batch.delete')}
            </button>
          </div>

          <div className="w-px h-6 bg-primary-content/20"></div>

          <button
            onClick={onClearSelection}
            className="btn btn-sm btn-ghost text-primary-content"
            disabled={batchAction.isPending}
          >
            {t('batch.cancel')}
          </button>
        </div>
      </div>

      {pendingAction && (
        <ConfirmDialog
          isOpen={showConfirmDialog}
          title={getConfirmDialogConfig().title}
          message={getConfirmDialogConfig().message}
          type={getConfirmDialogConfig().type}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      <AlertDialog
        isOpen={showSuccessAlert}
        title={tc('dialog.successTitle')}
        message={successMessage}
        type="success"
        onConfirm={() => setShowSuccessAlert(false)}
      />

      <AlertDialog
        isOpen={showErrorAlert}
        title={tc('dialog.errorTitle')}
        message={t('action.failed')}
        type="error"
        onConfirm={() => setShowErrorAlert(false)}
      />

      <BatchAiRegenerateModal
        isOpen={showAiModal}
        bookmarks={selectedBookmarks}
        onClose={() => setShowAiModal(false)}
        onSuccess={() => {
          setShowAiModal(false)
          onClearSelection()
          onSuccess?.()
        }}
      />
    </div>
  )
}
