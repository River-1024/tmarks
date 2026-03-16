import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Trash2, Info, RefreshCw, Bug } from 'lucide-react'
import { Toggle } from '@/components/common/Toggle'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { JsonViewerDialog } from '@/components/common/JsonViewerDialog'
import {
  useClearOperationLogs,
  useOperationLogs,
  useWriteOperationDebugLog,
} from '@/hooks/useOperationLogs'
import { useToastStore } from '@/stores/toastStore'
import type { OperationLogEntry, UserPreferences } from '@/lib/types'
import { getOperationLogViewModel, type OperationLogTone } from '@/lib/operation-log-utils'
import { SettingsSection, SettingsItem, SettingsDivider } from '../SettingsSection'
import { InfoBox } from '../InfoBox'
import { ApiError } from '@/lib/api-client'

interface LogsSettingsTabProps {
  preferences: UserPreferences
  onUpdate: (updates: Partial<UserPreferences>) => void
}

export function LogsSettingsTab({ preferences, onUpdate }: LogsSettingsTabProps) {
  const { t, i18n } = useTranslation('settings')
  const { addToast } = useToastStore()
  const clearLogs = useClearOperationLogs()
  const writeDebugLog = useWriteOperationDebugLog()
  const { data, isLoading, refetch, isRefetching, error } = useOperationLogs(50)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [lastDebugError, setLastDebugError] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<OperationLogEntry | null>(null)
  const selectedLogViewModel = selectedLog
    ? getOperationLogViewModel(selectedLog, i18n.language)
    : null

  const handleClearLogs = async () => {
    try {
      await clearLogs.mutateAsync()
      addToast('success', t('logs.clearSuccess'))
      setShowClearConfirm(false)
    } catch {
      addToast('error', t('logs.clearFailed'))
    }
  }

  const handleWriteDebugLog = async () => {
    try {
      await writeDebugLog.mutateAsync()
      setLastDebugError(null)
      addToast('success', t('logs.debug.writeSuccess'))
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.message} (status=${err.status}, code=${err.code})`
          : err instanceof Error
            ? err.message
            : t('logs.debug.writeFailed')
      setLastDebugError(message)
      addToast('error', `${t('logs.debug.writeFailed')}: ${message}`)
    }
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={showClearConfirm}
        title={t('logs.clearTitle')}
        message={t('logs.clearMessage')}
        type="warning"
        onConfirm={handleClearLogs}
        onCancel={() => setShowClearConfirm(false)}
      />

      <JsonViewerDialog
        isOpen={Boolean(selectedLog && selectedLogViewModel)}
        title={
          selectedLog && selectedLogViewModel
            ? t('logs.rawTitle', { event: selectedLogViewModel.eventLabel, id: selectedLog.id })
            : t('logs.rawTitle', { event: '-', id: '-' })
        }
        description={t('logs.rawDescription')}
        value={selectedLogViewModel?.rawText || t('logs.rawEmpty')}
        onClose={() => setSelectedLog(null)}
      />

      <SettingsSection icon={History} title={t('logs.title')} description={t('logs.description')}>
        <div className="space-y-4">
          <SettingsItem
            title={t('logs.enable')}
            description={t('logs.enableHint')}
            action={
              <Toggle
                checked={preferences.enable_operation_logging}
                onChange={(checked) => onUpdate({ enable_operation_logging: checked })}
              />
            }
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 rounded-lg bg-card border border-border space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t('logs.retentionDays')}
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={preferences.operation_log_retention_days}
                onChange={(e) =>
                  onUpdate({
                    operation_log_retention_days: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="input w-full"
              />
              <p className="text-xs text-muted-foreground">{t('logs.retentionHint')}</p>
            </div>

            <div className="p-4 rounded-lg bg-card border border-border space-y-2">
              <label className="text-sm font-medium text-foreground">{t('logs.maxEntries')}</label>
              <input
                type="number"
                min="100"
                max="10000"
                step="100"
                value={preferences.operation_log_max_entries}
                onChange={(e) =>
                  onUpdate({
                    operation_log_max_entries: Math.max(100, Number(e.target.value) || 100),
                  })
                }
                className="input w-full"
              />
              <p className="text-xs text-muted-foreground">{t('logs.maxEntriesHint')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg bg-card border border-border">
            <div className="text-sm text-muted-foreground">
              {t('logs.currentCount', { count: data?.total ?? 0 })}
            </div>
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="btn btn-ghost btn-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
              {t('logs.refresh')}
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={clearLogs.isPending}
              className="btn btn-warning btn-sm"
            >
              <Trash2 className="w-4 h-4" />
              {t('logs.clear')}
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        icon={Bug}
        title={t('logs.debug.title')}
        description={t('logs.debug.description')}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DebugItem
              label={t('logs.debug.columnsSupported')}
              value={String(data?.debug?.operation_log_columns_supported ?? false)}
            />
            <DebugItem
              label={t('logs.debug.preferencesFound')}
              value={String(data?.debug?.preferences_found ?? false)}
            />
            <DebugItem
              label={t('logs.debug.loggingEnabled')}
              value={String(data?.debug?.effective_logging_enabled ?? false)}
            />
            <DebugItem label={t('logs.debug.apiVersion')} value={data?.api_version || '-'} />
            <DebugItem
              label={t('logs.debug.retentionDays')}
              value={String(data?.debug?.retention_days ?? '-')}
            />
            <DebugItem
              label={t('logs.debug.maxEntries')}
              value={String(data?.debug?.max_entries ?? '-')}
            />
            <DebugItem
              label={t('logs.debug.latestLog')}
              value={
                data?.debug?.latest_log
                  ? `${data.debug.latest_log.event_type} @ ${formatLogDateTime(data.debug.latest_log.created_at, i18n.language)}`
                  : t('logs.debug.none')
              }
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleWriteDebugLog}
              disabled={writeDebugLog.isPending}
              className="btn btn-primary btn-sm"
            >
              <Bug className="w-4 h-4" />
              {t('logs.debug.writeTest')}
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="btn btn-ghost btn-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
              {t('logs.debug.refreshDiagnostics')}
            </button>
          </div>

          {!data?.debug && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-xs text-warning">
              {t('logs.debug.backendMissing')}
            </div>
          )}

          {error instanceof Error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-xs text-destructive break-all">
              {t('logs.debug.fetchError')}: {error.message}
            </div>
          )}

          {lastDebugError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-xs text-destructive break-all">
              {t('logs.debug.lastWriteError')}: {lastDebugError}
            </div>
          )}

          <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
            <div>{t('logs.timezoneNote')}</div>
            <div className="mt-2">{t('logs.debug.hint')}</div>
          </div>
        </div>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection title={t('logs.recordsTitle')} description={t('logs.recordsDescription')}>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">{t('logs.summaryHint')}</div>
          {isLoading ? (
            <div className="p-6 rounded-lg bg-card border border-border text-sm text-muted-foreground">
              {t('logs.loading')}
            </div>
          ) : data?.logs.length ? (
            data.logs.map((log) => {
              const viewModel = getOperationLogViewModel(log, i18n.language)

              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedLog(log)}
                  className={`w-full text-left rounded-lg border p-4 space-y-3 transition-colors ${getLogToneClasses(viewModel.tone)}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-foreground">{viewModel.eventLabel}</div>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                          {log.event_type}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-sm text-foreground">
                        {viewModel.summary.map((line, index) => (
                          <div key={`${log.id}-${index}`} className="leading-6 break-words">
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatLogDateTime(log.created_at, i18n.language)}
                    </div>
                  </div>

                  {(log.ip || log.user_agent) && (
                    <div className="text-xs text-muted-foreground break-all">
                      {log.ip ? `${t('logs.ip')}: ${log.ip}` : ''}
                      {log.ip && log.user_agent ? ' · ' : ''}
                      {log.user_agent ? `${t('logs.userAgent')}: ${log.user_agent}` : ''}
                    </div>
                  )}

                  <div className="text-xs text-primary">{t('logs.viewRaw')}</div>
                </button>
              )
            })
          ) : (
            <div className="p-6 rounded-lg bg-card border border-border text-sm text-muted-foreground">
              {t('logs.empty')}
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsDivider />

      <InfoBox icon={Info} title={t('logs.infoBox.title')} variant="info">
        <ul className="space-y-1 text-xs">
          <li>• {t('logs.infoBox.tip1')}</li>
          <li>• {t('logs.infoBox.tip2')}</li>
          <li>• {t('logs.infoBox.tip3')}</li>
        </ul>
      </InfoBox>
    </div>
  )
}

function DebugItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground break-all">{value}</div>
    </div>
  )
}

function getLogToneClasses(tone: OperationLogTone) {
  switch (tone) {
    case 'success':
      return 'border-success/30 bg-success/5 hover:bg-success/10'
    case 'warning':
      return 'border-warning/30 bg-warning/5 hover:bg-warning/10'
    case 'error':
      return 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10'
    default:
      return 'border-border bg-card hover:bg-muted/30'
  }
}

const BEIJING_TIME_ZONE = 'Asia/Shanghai'

function formatLogDateTime(value: string, locale: string) {
  const date = parseLogDateTime(value)
  if (!date) {
    return value
  }

  const formatter = new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-CA', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  )

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`
}

function parseLogDateTime(value: string) {
  if (!value) {
    return null
  }

  const normalized = /^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : hasTimezoneOffset(value)
      ? value
      : `${value}Z`

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function hasTimezoneOffset(value: string) {
  return /[zZ]$|[+-][0-9]{2}:[0-9]{2}$/.test(value)
}
