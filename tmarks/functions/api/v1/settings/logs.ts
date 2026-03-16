import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, RouteParams } from '../../../lib/types'
import { badRequest, internalError, noContent, success } from '../../../lib/response'
import { writeAuditLog } from '../../../lib/audit-log'
import { requireAuth, type AuthContext } from '../../../middleware/auth'

interface AuditLogRow {
  id: number
  event_type: string
  payload: string | null
  ip: string | null
  user_agent: string | null
  created_at: string
}

interface UserPreferenceRow {
  user_id: string
}

interface UserOperationLogPreferences {
  enable_operation_logging: number | null
  operation_log_retention_days: number | null
  operation_log_max_entries: number | null
}

interface WriteOperationLogEntryRequest {
  event_type: string
  payload?: unknown
}

interface WriteOperationLogsRequest {
  entries: WriteOperationLogEntryRequest[]
}

const API_VERSION = 'settings.logs.v1'
const DEFAULT_RETENTION_DAYS = 30
const DEFAULT_MAX_ENTRIES = 1000
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

class OperationLogInputError extends Error {}

function getPreferenceNumber(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parsePayload(payload: string | null): unknown {
  if (!payload) {
    return null
  }

  try {
    return JSON.parse(payload) as unknown
  } catch {
    return payload
  }
}

async function hasAuditLogsTable(db: D1Database): Promise<boolean> {
  try {
    await db.prepare('SELECT 1 FROM audit_logs LIMIT 1').first()
    return true
  } catch (error) {
    if (error instanceof Error && /no such table: audit_logs/i.test(error.message)) {
      return false
    }
    throw error
  }
}

async function hasOperationLogColumns(db: D1Database): Promise<boolean> {
  try {
    await db.prepare('SELECT enable_operation_logging FROM user_preferences LIMIT 1').first()
    return true
  } catch (error) {
    if (error instanceof Error && /no such column: enable_operation_logging/i.test(error.message)) {
      return false
    }
    throw error
  }
}

async function getOperationLogDebugInfo(db: D1Database, userId: string) {
  const operationLogColumnsSupported = await hasOperationLogColumns(db)

  let preferencesFound = false
  let effectiveLoggingEnabled = true
  let retentionDays = DEFAULT_RETENTION_DAYS
  let maxEntries = DEFAULT_MAX_ENTRIES

  if (operationLogColumnsSupported) {
    const preferences = await db
      .prepare(
        `SELECT enable_operation_logging, operation_log_retention_days, operation_log_max_entries
         FROM user_preferences
         WHERE user_id = ?`,
      )
      .bind(userId)
      .first<UserOperationLogPreferences>()

    preferencesFound = Boolean(preferences)

    if (preferences) {
      effectiveLoggingEnabled = preferences.enable_operation_logging !== 0
      retentionDays = getPreferenceNumber(preferences.operation_log_retention_days, DEFAULT_RETENTION_DAYS)
      maxEntries = getPreferenceNumber(preferences.operation_log_max_entries, DEFAULT_MAX_ENTRIES)
    }
  } else {
    const preferenceRow = await db
      .prepare('SELECT user_id FROM user_preferences WHERE user_id = ?')
      .bind(userId)
      .first<UserPreferenceRow>()

    preferencesFound = Boolean(preferenceRow)
  }

  return {
    operation_log_columns_supported: operationLogColumnsSupported,
    preferences_found: preferencesFound,
    effective_logging_enabled: effectiveLoggingEnabled,
    retention_days: retentionDays,
    max_entries: maxEntries,
  }
}

function getLimit(request: Request) {
  const url = new URL(request.url)
  const rawLimit = url.searchParams.get('limit')

  if (!rawLimit) {
    return DEFAULT_LIMIT
  }

  const limit = Number.parseInt(rawLimit, 10)
  if (!Number.isFinite(limit) || limit < 1 || limit > MAX_LIMIT) {
    return null
  }

  return limit
}

async function readJsonBody(request: Request): Promise<unknown | null> {
  const text = await request.text()
  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new OperationLogInputError('Invalid JSON body')
  }
}

function isValidEventType(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= 3 &&
    value.trim().length <= 120 &&
    /^[a-zA-Z0-9._:-]+$/.test(value.trim())
  )
}

function parseWriteEntries(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }

  const entries = (body as WriteOperationLogsRequest).entries
  if (!Array.isArray(entries)) {
    return null
  }

  if (entries.length === 0 || entries.length > 100) {
    throw new OperationLogInputError('entries must contain between 1 and 100 items')
  }

  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new OperationLogInputError(`entries[${index}] must be an object`)
    }

    if (!isValidEventType(entry.event_type)) {
      throw new OperationLogInputError(`entries[${index}].event_type is invalid`)
    }

    return {
      eventType: entry.event_type.trim(),
      payload: 'payload' in entry ? entry.payload : undefined,
    }
  })
}

// GET /api/v1/settings/logs - 获取当前用户的操作日志和调试信息
export const onRequestGet: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const limit = getLimit(context.request)

      if (limit === null) {
        return badRequest(`Limit must be between 1 and ${MAX_LIMIT}`)
      }

      const auditLogsTableAvailable = await hasAuditLogsTable(context.env.DB)
      if (!auditLogsTableAvailable) {
        return badRequest('Operation logs feature not available. Please run database migrations.')
      }

      const [debug, totalRow, logsResult] = await Promise.all([
        getOperationLogDebugInfo(context.env.DB, userId),
        context.env.DB
          .prepare(
            `SELECT COUNT(*) as total
             FROM audit_logs
             WHERE user_id = ?`,
          )
          .bind(userId)
          .first<{ total: number }>(),
        context.env.DB
          .prepare(
            `SELECT id, event_type, payload, ip, user_agent, created_at
             FROM audit_logs
             WHERE user_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?`,
          )
          .bind(userId, limit)
          .all<AuditLogRow>(),
      ])

      const logs = (logsResult.results ?? []).map((log) => ({
        id: log.id,
        event_type: log.event_type,
        payload: parsePayload(log.payload),
        payload_raw: log.payload,
        ip: log.ip,
        user_agent: log.user_agent,
        created_at: log.created_at,
      }))

      const latestLog = logs[0]

      return success({
        logs,
        total: Number(totalRow?.total ?? 0),
        api_version: API_VERSION,
        debug: {
          ...debug,
          latest_log: latestLog
            ? {
                id: latestLog.id,
                event_type: latestLog.event_type,
                created_at: latestLog.created_at,
              }
            : null,
        },
      })
    } catch (error) {
      console.error('Get operation logs error:', error)
      return internalError('Failed to get operation logs')
    }
  },
]

// POST /api/v1/settings/logs - 手动写入一条测试日志
export const onRequestPost: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const auditLogsTableAvailable = await hasAuditLogsTable(context.env.DB)

      if (!auditLogsTableAvailable) {
        return badRequest('Operation logs feature not available. Please run database migrations.')
      }

      const body = await readJsonBody(context.request)

      if (body !== null) {
        const entries = parseWriteEntries(body)
        if (!entries) {
          return badRequest('Body must include an entries array')
        }

        const ip = context.request.headers.get('CF-Connecting-IP')
        const userAgent = context.request.headers.get('User-Agent')

        for (const entry of entries) {
          await writeAuditLog(context.env.DB, {
            userId,
            eventType: entry.eventType,
            ip,
            userAgent,
            payload: entry.payload,
          })
        }

        return success({
          ok: true,
          written: entries.length,
        })
      }

      await writeAuditLog(context.env.DB, {
        userId,
        eventType: 'settings.logs.debug',
        ip: context.request.headers.get('CF-Connecting-IP'),
        userAgent: context.request.headers.get('User-Agent'),
        payload: {
          api_version: API_VERSION,
          source: 'settings-debug-panel',
          triggered_at: new Date().toISOString(),
        },
      })

      return success({
        ok: true,
      })
    } catch (error) {
      if (error instanceof OperationLogInputError) {
        return badRequest(error.message)
      }
      console.error('Write operation debug log error:', error)
      return internalError('Failed to write operation logs')
    }
  },
]

// DELETE /api/v1/settings/logs - 清空当前用户的操作日志
export const onRequestDelete: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const auditLogsTableAvailable = await hasAuditLogsTable(context.env.DB)

      if (!auditLogsTableAvailable) {
        return badRequest('Operation logs feature not available. Please run database migrations.')
      }

      await context.env.DB
        .prepare('DELETE FROM audit_logs WHERE user_id = ?')
        .bind(userId)
        .run()

      return noContent()
    } catch (error) {
      console.error('Clear operation logs error:', error)
      return internalError('Failed to clear operation logs')
    }
  },
]
