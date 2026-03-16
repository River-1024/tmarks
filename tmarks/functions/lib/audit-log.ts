import type { D1Database } from '@cloudflare/workers-types'

interface UserLogPreferences {
  enable_operation_logging: number | null
  operation_log_retention_days: number | null
  operation_log_max_entries: number | null
}

interface WriteAuditLogOptions {
  userId?: string | null
  eventType: string
  payload?: unknown
  ip?: string | null
  userAgent?: string | null
}

const DEFAULT_RETENTION_DAYS = 30
const DEFAULT_MAX_ENTRIES = 1000

function getPreferenceNumber(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export async function writeAuditLog(
  db: D1Database,
  { userId, eventType, payload, ip, userAgent }: WriteAuditLogOptions,
) {
  try {
    let loggingEnabled = true
    let retentionDays = DEFAULT_RETENTION_DAYS
    let maxEntries = DEFAULT_MAX_ENTRIES

    if (userId) {
      const preferences = await db
        .prepare(
          `SELECT enable_operation_logging, operation_log_retention_days, operation_log_max_entries
           FROM user_preferences
           WHERE user_id = ?`,
        )
        .bind(userId)
        .first<UserLogPreferences>()

      if (preferences) {
        loggingEnabled = preferences.enable_operation_logging !== 0
        retentionDays = getPreferenceNumber(preferences.operation_log_retention_days, DEFAULT_RETENTION_DAYS)
        maxEntries = getPreferenceNumber(preferences.operation_log_max_entries, DEFAULT_MAX_ENTRIES)
      }
    }

    if (!loggingEnabled) {
      return
    }

    await db
      .prepare(
        `INSERT INTO audit_logs (user_id, event_type, payload, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        userId ?? null,
        eventType,
        payload === undefined ? null : JSON.stringify(payload),
        ip ?? null,
        userAgent ?? null,
      )
      .run()

    if (userId) {
      await db
        .prepare(
          `DELETE FROM audit_logs
           WHERE user_id = ?
             AND created_at < datetime('now', '-' || ? || ' days')`,
        )
        .bind(userId, retentionDays)
        .run()

      await db
        .prepare(
          `DELETE FROM audit_logs
           WHERE user_id = ?
             AND id NOT IN (
               SELECT id FROM audit_logs
               WHERE user_id = ?
               ORDER BY created_at DESC, id DESC
               LIMIT ?
             )`,
        )
        .bind(userId, userId, maxEntries)
        .run()
    }
  } catch (error) {
    console.error('Write audit log error:', error)
  }
}
