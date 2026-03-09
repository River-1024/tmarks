/**
 * AI 设置 API
 * 管理用户的 AI 服务配置
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, RouteParams } from '../../../../lib/types'
import { success, badRequest, internalError } from '../../../../lib/response'
import { requireAuth, AuthContext } from '../../../../middleware/auth'

// AI 服务商类型
type AIProvider = 'openai' | 'claude' | 'deepseek' | 'zhipu' | 'modelscope' | 'siliconflow' | 'iflow' | 'custom'

// 数据库行类型
interface AISettingsRow {
  id: string
  user_id: string
  provider: AIProvider
  // 保留历史字段名，当前保存的是明文 JSON
  api_keys_encrypted: string | null
  api_urls: string | null
  model: string | null
  custom_prompt: string | null
  enable_custom_prompt: number
  enabled: number
  created_at: string
  updated_at: string
}

// API 请求类型
interface UpdateAISettingsRequest {
  provider?: AIProvider
  api_keys?: Record<string, string>
  api_urls?: Record<string, string>
  model?: string
  custom_prompt?: string
  enable_custom_prompt?: boolean
  enabled?: boolean
}

// 有效的服务商列表
const VALID_PROVIDERS: AIProvider[] = ['openai', 'claude', 'deepseek', 'zhipu', 'modelscope', 'siliconflow', 'iflow', 'custom']

function parseStoredApiKeys(raw: string | null): Record<string, string> {
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const result: Record<string, string> = {}
    for (const [provider, key] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key === 'string') {
        result[provider] = key
      }
    }
    return result
  } catch {
    return {}
  }
}

function parseApiUrls(raw: string | null): Record<string, string> {
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const result: Record<string, string> = {}
    for (const [provider, url] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof url === 'string') {
        result[provider] = url
      }
    }
    return result
  } catch {
    return {}
  }
}

/**
 * 检查 ai_settings 表是否存在
 */
async function hasAISettingsTable(db: D1Database): Promise<boolean> {
  try {
    await db.prepare('SELECT 1 FROM ai_settings LIMIT 1').first()
    return true
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) {
      return false
    }
    throw error
  }
}

// GET /api/v1/settings/ai - 获取 AI 设置
export const onRequestGet: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id

      const tableExists = await hasAISettingsTable(context.env.DB)
      if (!tableExists) {
        return success({
          ai_settings: {
            provider: 'openai',
            api_keys: {},
            api_urls: {},
            model: null,
            custom_prompt: null,
            enable_custom_prompt: false,
            enabled: false
          }
        })
      }

      const settings = await context.env.DB.prepare(
        'SELECT * FROM ai_settings WHERE user_id = ?'
      )
        .bind(userId)
        .first<AISettingsRow>()

      if (!settings) {
        return success({
          ai_settings: {
            provider: 'openai',
            api_keys: {},
            api_urls: {},
            model: null,
            custom_prompt: null,
            enable_custom_prompt: false,
            enabled: false
          }
        })
      }

      return success({
        ai_settings: {
          provider: settings.provider,
          api_keys: parseStoredApiKeys(settings.api_keys_encrypted),
          api_urls: parseApiUrls(settings.api_urls),
          model: settings.model,
          custom_prompt: settings.custom_prompt,
          enable_custom_prompt: settings.enable_custom_prompt === 1,
          enabled: settings.enabled === 1
        }
      })
    } catch (error) {
      console.error('Get AI settings error:', error)
      return internalError('Failed to get AI settings')
    }
  }
]

// PUT /api/v1/settings/ai - 更新 AI 设置
export const onRequestPut: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const body = await context.request.json() as UpdateAISettingsRequest

      const tableExists = await hasAISettingsTable(context.env.DB)
      if (!tableExists) {
        return badRequest('AI settings feature not available. Please run database migrations.')
      }

      if (body.provider && !VALID_PROVIDERS.includes(body.provider)) {
        return badRequest(`Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}`)
      }

      if (body.api_keys) {
        for (const [provider, key] of Object.entries(body.api_keys)) {
          if (!VALID_PROVIDERS.includes(provider as AIProvider)) {
            return badRequest(`Invalid provider in api_keys: ${provider}`)
          }
          if (typeof key !== 'string') {
            return badRequest(`Invalid API key for provider: ${provider}`)
          }
        }
      }

      if (body.api_urls) {
        for (const [provider, url] of Object.entries(body.api_urls)) {
          if (!VALID_PROVIDERS.includes(provider as AIProvider)) {
            return badRequest(`Invalid provider in api_urls: ${provider}`)
          }
          if (typeof url !== 'string') {
            return badRequest(`Invalid API URL for provider: ${provider}`)
          }
        }
      }

      const existing = await context.env.DB.prepare(
        'SELECT * FROM ai_settings WHERE user_id = ?'
      )
        .bind(userId)
        .first<AISettingsRow>()

      const now = new Date().toISOString()

      let apiKeysStored: string | null = existing?.api_keys_encrypted || null
      if (body.api_keys) {
        const existingKeys = parseStoredApiKeys(existing?.api_keys_encrypted || null)

        for (const [provider, key] of Object.entries(body.api_keys)) {
          const normalizedKey = key.trim()
          if (normalizedKey === '') {
            delete existingKeys[provider]
          } else {
            existingKeys[provider] = normalizedKey
          }
        }

        apiKeysStored = Object.keys(existingKeys).length > 0 ? JSON.stringify(existingKeys) : null
      }

      let apiUrlsJson: string | null = existing?.api_urls || null
      if (body.api_urls) {
        const existingUrls = parseApiUrls(existing?.api_urls || null)

        for (const [provider, url] of Object.entries(body.api_urls)) {
          const normalizedUrl = url.trim()
          if (!normalizedUrl) {
            delete existingUrls[provider]
          } else {
            existingUrls[provider] = normalizedUrl
          }
        }

        apiUrlsJson = Object.keys(existingUrls).length > 0 ? JSON.stringify(existingUrls) : null
      }

      if (existing) {
        await context.env.DB.prepare(`
          UPDATE ai_settings SET
            provider = ?,
            api_keys_encrypted = ?,
            api_urls = ?,
            model = ?,
            custom_prompt = ?,
            enable_custom_prompt = ?,
            enabled = ?,
            updated_at = ?
          WHERE user_id = ?
        `).bind(
          body.provider ?? existing.provider,
          apiKeysStored,
          apiUrlsJson,
          body.model !== undefined ? body.model : existing.model,
          body.custom_prompt !== undefined ? body.custom_prompt : existing.custom_prompt,
          body.enable_custom_prompt !== undefined ? (body.enable_custom_prompt ? 1 : 0) : existing.enable_custom_prompt,
          body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
          now,
          userId
        ).run()
      } else {
        const id = crypto.randomUUID()
        await context.env.DB.prepare(`
          INSERT INTO ai_settings (
            id, user_id, provider, api_keys_encrypted, api_urls, model,
            custom_prompt, enable_custom_prompt, enabled, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          userId,
          body.provider ?? 'openai',
          apiKeysStored,
          apiUrlsJson,
          body.model ?? null,
          body.custom_prompt ?? null,
          body.enable_custom_prompt ? 1 : 0,
          body.enabled ? 1 : 0,
          now,
          now
        ).run()
      }

      return success({
        message: 'AI settings updated successfully'
      })
    } catch (error) {
      console.error('Update AI settings error:', error)
      return internalError('Failed to update AI settings')
    }
  }
]
