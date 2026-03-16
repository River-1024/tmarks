import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Z_INDEX } from '@/lib/constants/z-index'

interface JsonViewerDialogProps {
  isOpen: boolean
  title: string
  description?: string
  value: string
  onClose: () => void
}

export function JsonViewerDialog({
  isOpen,
  title,
  description,
  value,
  onClose,
}: JsonViewerDialogProps) {
  const { t } = useTranslation('common')

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  const dialogContent = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      style={{ zIndex: Z_INDEX.ALERT_DIALOG }}
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative card rounded-2xl sm:rounded-3xl shadow-2xl border w-full max-w-5xl max-h-[85vh] overflow-hidden animate-scale-in flex flex-col"
        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="text-lg sm:text-xl font-semibold text-foreground break-words">{title}</h3>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm flex-shrink-0"
            aria-label={t('button.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 sm:p-6">
          <pre className="rounded-xl bg-muted/40 p-4 text-xs sm:text-sm leading-6 whitespace-pre-wrap break-all overflow-x-auto">
            <code>{value}</code>
          </pre>
        </div>

        <div className="border-t border-border px-5 py-4 sm:px-6 flex justify-end">
          <button type="button" onClick={onClose} className="btn">
            {t('button.close')}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(dialogContent, document.body)
}
