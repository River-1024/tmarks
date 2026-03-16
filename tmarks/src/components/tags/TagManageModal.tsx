import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@/lib/types'
import { useDeleteTags, useMergeTags, useUpdateTag } from '@/hooks/useTags'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { AlertDialog } from '@/components/common/AlertDialog'
import { TagFormModal } from './TagFormModal'
import { logger } from '@/lib/logger'
import { Z_INDEX } from '@/lib/constants/z-index'

interface TagManageModalProps {
  tags: Tag[]
  onClose: () => void
}

export function TagManageModal({ tags, onClose }: TagManageModalProps) {
  const { t } = useTranslation('tags')
  const { t: tc } = useTranslation('common')
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [editName, setEditName] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [showSuccessAlert, setShowSuccessAlert] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [showErrorAlert, setShowErrorAlert] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false)
  const [mergeName, setMergeName] = useState('')

  const deleteTags = useDeleteTags()
  const updateTag = useUpdateTag()
  const mergeTags = useMergeTags()

  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) => (b.bookmark_count || 0) - (a.bookmark_count || 0))
  }, [tags])

  const selectedTags = useMemo(
    () => sortedTags.filter((tag) => selectedTagIds.includes(tag.id)),
    [selectedTagIds, sortedTags]
  )

  const isAllSelected = sortedTags.length > 0 && selectedTagIds.length === sortedTags.length
  const isDeleting = deleteTags.isPending
  const isMerging = mergeTags.isPending

  useEffect(() => {
    const validIds = new Set(sortedTags.map((tag) => tag.id))
    setSelectedTagIds((prev) => prev.filter((id) => validIds.has(id)))
  }, [sortedTags])

  useEffect(() => {
    if (!isMergeModalOpen) return
    const defaultName = selectedTags[0]?.name ?? ''
    setMergeName(defaultName)
  }, [isMergeModalOpen, selectedTags])

  const handleEditClick = (tag: Tag) => {
    if (isDeleting || isMerging) return
    setEditingTag(tag)
    setEditName(tag.name)
    setIsEditModalOpen(true)
  }

  const handleSaveEdit = async (value?: string) => {
    if (!editingTag) return
    const nextName = value?.trim() ?? editName.trim()
    if (!nextName) return

    try {
      await updateTag.mutateAsync({
        id: editingTag.id,
        data: { name: nextName },
      })
      setEditingTag(null)
      setEditName('')
      setIsEditModalOpen(false)
      setSuccessMessage(t('message.updateSuccess'))
      setShowSuccessAlert(true)
    } catch (error) {
      logger.error('Failed to update tag:', error)
      setErrorMessage(t('message.updateFailed'))
      setShowErrorAlert(true)
    }
  }

  const handleCancelEdit = () => {
    setEditingTag(null)
    setEditName('')
    setIsEditModalOpen(false)
  }

  const toggleTagSelection = (tagId: string) => {
    if (isDeleting || isMerging) return
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  const handleToggleSelectAll = () => {
    if (isDeleting || isMerging) return
    setSelectedTagIds(isAllSelected ? [] : sortedTags.map((tag) => tag.id))
  }

  const clearSelection = () => {
    setSelectedTagIds([])
  }

  const openDeleteConfirm = (tag: Tag) => {
    setTagToDelete(tag)
    setShowDeleteConfirm(true)
  }

  const openBatchDeleteConfirm = () => {
    if (selectedTags.length === 0) return
    setTagToDelete(null)
    setShowDeleteConfirm(true)
  }

  const openMergeModal = () => {
    if (selectedTags.length < 2 || isDeleting || isMerging) return
    setMergeName(selectedTags[0]?.name ?? '')
    setIsMergeModalOpen(true)
  }

  const handleCancelMerge = () => {
    setIsMergeModalOpen(false)
    setMergeName('')
  }

  const handleConfirmMerge = async (value?: string) => {
    const nextName = value?.trim() ?? mergeName.trim()
    if (selectedTagIds.length < 2 || !nextName) return

    try {
      await mergeTags.mutateAsync({
        tag_ids: selectedTagIds,
        name: nextName,
      })
      if (editingTag && selectedTagIds.includes(editingTag.id)) {
        setEditingTag(null)
        setEditName('')
        setIsEditModalOpen(false)
      }
      setSuccessMessage(t('message.mergeSuccess', { count: selectedTagIds.length }))
      setShowSuccessAlert(true)
      clearSelection()
      handleCancelMerge()
    } catch (error) {
      logger.error('Failed to merge tags:', error)
      setErrorMessage(t('message.mergeFailed'))
      setShowErrorAlert(true)
    }
  }

  const handleConfirmDelete = async () => {
    const deleteIds = tagToDelete ? [tagToDelete.id] : selectedTagIds
    if (deleteIds.length === 0) return

    setShowDeleteConfirm(false)

    try {
      await deleteTags.mutateAsync(deleteIds)

      if (editingTag && deleteIds.includes(editingTag.id)) {
        setEditingTag(null)
        setIsEditModalOpen(false)
        setEditName('')
      }

      if (tagToDelete) {
        setSuccessMessage(t('message.deleteSuccess'))
      } else {
        setSuccessMessage(t('message.batchDeleteSuccess', { count: deleteIds.length }))
        clearSelection()
      }

      setShowSuccessAlert(true)
    } catch (error) {
      logger.error('Failed to delete tags:', error)
      setErrorMessage(tagToDelete ? t('message.deleteFailed') : t('message.batchDeleteFailed'))
      setShowErrorAlert(true)
    } finally {
      setTagToDelete(null)
    }
  }

  const deleteDialogTitle = tagToDelete ? t('confirm.deleteTitle') : t('confirm.batchDeleteTitle')
  const deleteDialogMessage = tagToDelete
    ? t('confirm.deleteMessage', { name: tagToDelete.name })
    : t('confirm.batchDeleteMessage', { count: selectedTagIds.length })

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 animate-fade-in bg-background/80 backdrop-blur-sm"
      style={{ zIndex: Z_INDEX.TAG_MANAGE_MODAL }}
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="relative card rounded-2xl shadow-2xl w-full max-h-[68vh] flex flex-col border border-border animate-scale-in"
        style={{ padding: 0, maxWidth: '1200px', backgroundColor: 'var(--card)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-md shrink-0">
              <svg className="w-5 h-5 text-primary-content" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground">{t('manage.title')}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t('manage.description')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {sortedTags.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="btn btn-sm btn-outline"
                  disabled={isDeleting || isMerging}
                >
                  {isAllSelected ? t('manage.clearSelection') : t('manage.selectAll')}
                </button>
                <button
                  type="button"
                  onClick={openMergeModal}
                  className="btn btn-sm btn-outline"
                  disabled={selectedTagIds.length < 2 || isDeleting || isMerging}
                >
                  {isMerging ? t('action.merging') : t('action.merge')}
                </button>
                <button
                  type="button"
                  onClick={openBatchDeleteConfirm}
                  className="btn btn-sm bg-error/10 hover:bg-error/20 border-none text-error"
                  disabled={selectedTagIds.length === 0 || isDeleting || isMerging}
                >
                  {isDeleting ? t('action.batchDeleting') : t('action.batchDelete')}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground/60 hover:text-foreground"
              title={tc('button.close')}
            >
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {t('manage.selectedCount', { count: selectedTagIds.length })}
          </span>
          {selectedTagIds.length > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              className="text-primary hover:underline disabled:opacity-60"
              disabled={isDeleting || isMerging}
            >
              {t('manage.clearSelection')}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {sortedTags.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground/60">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <p className="text-sm font-medium mb-1 text-foreground">{t('manage.noTags')}</p>
              <p className="text-xs text-muted-foreground/50">{t('manage.noTagsHint')}</p>
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-2.5 space-y-2.5">
              {sortedTags.map((tag, index) => {
                const isSelected = selectedTagIds.includes(tag.id)

                return (
                  <div
                    key={tag.id}
                    className="break-inside-avoid cursor-pointer group"
                    style={{ animationDelay: `${index * 30}ms` }}
                    onClick={() => handleEditClick(tag)}
                  >
                    <div
                      className={`relative rounded-xl border bg-card/95 shadow-sm transition-all duration-200 hover:shadow-md hover:shadow-primary/10 hover:-translate-y-0.5 ${
                        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                      }`}
                    >
                      <div className="absolute top-2 left-2 z-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleTagSelection(tag.id)}
                          className="checkbox checkbox-sm"
                          aria-label={tag.name}
                          disabled={isDeleting || isMerging}
                        />
                      </div>

                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          type="button"
                          className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center"
                          title={t('action.edit')}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleEditClick(tag)
                          }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>

                      <div className="p-3.5 pl-10 space-y-2">
                        <div className="space-y-0.5">
                          <h3 className="text-base font-semibold text-foreground truncate">{tag.name}</h3>
                          {tag.bookmark_count !== undefined && (
                            <p className="text-xs text-muted-foreground/70">
                              {tag.bookmark_count === 0
                                ? t('manage.noBookmarks')
                                : t('manage.bookmarkCount', { count: tag.bookmark_count })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border bg-muted/30">
          <button onClick={onClose} className="btn w-full">
            {t('action.done')}
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={deleteDialogTitle}
        message={deleteDialogMessage}
        type="warning"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false)
          setTagToDelete(null)
        }}
      />

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
        message={errorMessage}
        type="error"
        onConfirm={() => setShowErrorAlert(false)}
      />

      <TagFormModal
        isOpen={isEditModalOpen && Boolean(editingTag)}
        title={t('action.edit')}
        initialName={editingTag?.name ?? ''}
        onConfirm={(value) => handleSaveEdit(value)}
        onCancel={handleCancelEdit}
        confirmLabel={t('action.save')}
        isSubmitting={updateTag.isPending}
        onDelete={() => {
          if (editingTag) {
            openDeleteConfirm(editingTag)
          }
        }}
        isDeleting={isDeleting}
      />

      <TagFormModal
        isOpen={isMergeModalOpen}
        title={t('action.merge')}
        description={t('form.mergeHint', { count: selectedTagIds.length })}
        initialName={mergeName}
        placeholder={t('form.mergePlaceholder')}
        onConfirm={(value) => handleConfirmMerge(value)}
        onCancel={handleCancelMerge}
        confirmLabel={t('action.mergeConfirm')}
        isSubmitting={isMerging}
      />
    </div>
  )
}
