import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Trash2, Info, RefreshCw, Bug } from 'lucide-react'
import { Toggle } from '@/components/common/Toggle'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useClearOperationLogs, useOperationLogs, useWriteOperationDebugLog } from '@/hooks/useOperationLogs'
import { useToastStore } from '@/stores/toastStore'
import type { UserPreferences } from '@/lib/types'
import { SettingsSection, SettingsItem, SettingsDivider } from '../SettingsSection'
import { InfoBox } from '../InfoBox'

interface LogsSettingsTabProps {
  preferences: UserPreferences
  onUpdate: (updates: Partial<UserPreferences>) => void
}

export function LogsSettingsTab({ preferences, onUpdate }: LogsSettingsTabProps) {
  const { t } = useTranslation('settings')
  const { addToast } = useToastStore()
  const clearLogs = useClearOperationLogs()
  const writeDebugLog = useWriteOperationDebugLog()
  const { data, isLoading, refetch, isRefetching, error } = useOperationLogs(50)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [lastDebugError, setLastDebugError] = useState<string | null>(null)

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
      const message = err instanceof Error ? err.message : t('logs.debug.writeFailed')
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
              <label className="text-sm font-medium text-foreground">{t('logs.retentionDays')}</label>
              <input
                type="number"
                min="1"
                max="365"
                value={preferences.operation_log_retention_days}
                onChange={(e) =>
                  onUpdate({ operation_log_retention_days: Math.max(1, Number(e.target.value) || 1) })
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
                  onUpdate({ operation_log_max_entries: Math.max(100, Number(e.target.value) || 100) })
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
            <button onClick={() => refetch()} disabled={isRefetching} className="btn btn-ghost btn-sm">
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

      <SettingsSection icon={Bug} title={t('logs.debug.title')} description={t('logs.debug.description')}>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DebugItem label={t('logs.debug.columnsSupported')} value={String(data?.debug?.operation_log_columns_supported ?? false)} />
            <DebugItem label={t('logs.debug.preferencesFound')} value={String(data?.debug?.preferences_found ?? false)} />
            <DebugItem label={t('logs.debug.loggingEnabled')} value={String(data?.debug?.effective_logging_enabled ?? false)} />
            <DebugItem label={t('logs.debug.retentionDays')} value={String(data?.debug?.retention_days ?? '-')} />
            <DebugItem label={t('logs.debug.maxEntries')} value={String(data?.debug?.max_entries ?? '-')} />
            <DebugItem
              label={t('logs.debug.latestLog')}
              value={
                data?.debug?.latest_log
                  ? `${data.debug.latest_log.event_type} @ ${data.debug.latest_log.created_at}`
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
            {t('logs.debug.hint')}
          </div>
        </div>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection title={t('logs.recordsTitle')} description={t('logs.recordsDescription')}>
        <div className="space-y-3">
          {isLoading ? (
            <div className="p-6 rounded-lg bg-card border border-border text-sm text-muted-foreground">
              {t('logs.loading')}
            </div>
          ) : data?.logs.length ? (
            data.logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-medium text-foreground">{log.event_type}</div>
                  <div className="text-xs text-muted-foreground">{log.created_at}</div>
                </div>
                {(log.ip || log.user_agent) && (
                  <div className="text-xs text-muted-foreground break-all">
                    {log.ip ? `${t('logs.ip')}: ${log.ip}` : ''}
                    {log.ip && log.user_agent ? ' · ' : ''}
                    {log.user_agent ? `${t('logs.userAgent')}: ${log.user_agent}` : ''}
                  </div>
                )}
                <pre className="text-xs leading-6 whitespace-pre-wrap break-all rounded-md bg-muted/40 p-3 overflow-x-auto">
                  {formatPayload(log.payload)}
                </pre>
              </div>
            ))
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

function formatPayload(payload: unknown) {
  if (payload == null) {
    return '{}'
  }

  if (typeof payload === 'string') {
    return payload
  }

  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}
