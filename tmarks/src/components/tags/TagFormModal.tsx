import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Z_INDEX } from '@/lib/constants/z-index'

interface TagFormModalProps {
  isOpen: boolean
  title: string
  initialName: string
  onConfirm: (name: string) => void
  onCancel: () => void
  confirmLabel?: string
  description?: string
  isSubmitting?: boolean
  onDelete?: () => void
  isDeleting?: boolean
  placeholder?: string
}

export function TagFormModal({
  isOpen,
  title,
  initialName,
  onConfirm,
  onCancel,
  confirmLabel,
  description,
  isSubmitting = false,
  onDelete,
  isDeleting = false,
  placeholder,
}: TagFormModalProps) {
  const { t } = useTranslation('tags')
  const { t: tc } = useTranslation('common')
  const [name, setName] = useState(initialName)

  const displayConfirmLabel = confirmLabel ?? t('action.save')

  useEffect(() => {
    if (isOpen) {
      setName(initialName)
    }
  }, [initialName, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: Z_INDEX.TAG_FORM_MODAL }}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm card p-5 space-y-4 animate-scale-in border border-border shadow-2xl rounded-xl" style={{ backgroundColor: 'var(--card)' }}>
        <div>
          <h3 className="text-base font-semibold mb-1">{title}</h3>
          <p className="text-xs text-muted-foreground">{description ?? t('form.editHint')}</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t('form.nameLabel')}</label>
          <input
            type="text"
            className="input w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder ?? t('form.namePlaceholder')}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSubmitting) onConfirm(name.trim())
              if (e.key === 'Escape') onCancel()
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          {onDelete ? (
            <button
              type="button"
              className="btn btn-sm btn-error"
              onClick={onDelete}
              disabled={isSubmitting || isDeleting}
            >
              {isDeleting ? t('action.deleting') : t('action.delete')}
            </button>
          ) : <span />}
          <div className="flex gap-3">
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={onCancel}
              disabled={isSubmitting || isDeleting}
            >
              {tc('button.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onConfirm(name.trim())}
              disabled={!name.trim() || isSubmitting || isDeleting}
            >
              {isSubmitting ? t('action.saving') : displayConfirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
