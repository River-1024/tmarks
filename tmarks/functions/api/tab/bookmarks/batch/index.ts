/**
 * 批量书签操作 API
 * 路径: /api/tab/bookmarks/batch
 * 认证: API Key (X-API-Key header)
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, RouteParams } from '../../../../lib/types'
import { success, badRequest, internalError } from '../../../../lib/response'
import { requireApiKeyAuth, ApiKeyAuthContext } from '../../../../middleware/api-key-auth-pages'
import { isValidUrl, sanitizeString } from '../../../../lib/validation'
import { generateUUID } from '../../../../lib/crypto'
import { invalidatePublicShareCache } from '../../../shared/cache'
import { writeAuditLog } from '../../../../lib/audit-log'

interface BatchCreateBookmarkItem {
  title: string
  url: string
  description?: string
  cover_image?: string
  favicon?: string
  tags?: string[]
  is_pinned?: boolean
  is_archived?: boolean
  is_public?: boolean
}

interface BatchCreateRequest {
  bookmarks: BatchCreateBookmarkItem[]
}

interface BatchCreateResult {
  success: number
  failed: number
  skipped: number
  total: number
  errors?: Array<{
    index: number
    url: string
    error: string
  }>
  created_bookmarks: Array<{
    id: string
    url: string
    title: string
  }>
}

/**
 * GET /api/tab/bookmarks/batch
 * 不支持 GET 方法
 */
export const onRequestGet: PagesFunction<Env, RouteParams>[] = [
  async () => {
    return new Response(JSON.stringify({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'GET method is not supported for batch operations. Use POST instead.'
      }
    }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Allow': 'POST'
      }
    })
  }
]

/**
 * POST /api/tab/bookmarks/batch
 * 批量创建书签
 */
export const onRequestPost: PagesFunction<Env, RouteParams, ApiKeyAuthContext>[] = [
  requireApiKeyAuth('bookmarks.create'),
  async (context) => {
    const userId = context.data.user_id
    const ip = context.request.headers.get('CF-Connecting-IP')
    const userAgent = context.request.headers.get('User-Agent')

    try {
      const body = (await context.request.json()) as BatchCreateRequest

      if (!body.bookmarks || !Array.isArray(body.bookmarks) || body.bookmarks.length === 0) {
        return badRequest('bookmarks array is required and cannot be empty')
      }

      // 限制批量大小
      if (body.bookmarks.length > 100) {
        return badRequest('Cannot create more than 100 bookmarks at once')
      }

      const result: BatchCreateResult = {
        success: 0,
        failed: 0,
        skipped: 0,
        total: body.bookmarks.length,
        errors: [],
        created_bookmarks: []
      }

      const now = new Date().toISOString()

      // 批量处理书签
      for (let i = 0; i < body.bookmarks.length; i++) {
        const item = body.bookmarks[i]

        try {
          // 验证必填字段
          if (!item.title || !item.url) {
            result.failed++
            result.errors!.push({
              index: i,
              url: item.url || '',
              error: 'Title and URL are required'
            })
            continue
          }

          // 验证 URL 格式
          if (!isValidUrl(item.url)) {
            result.failed++
            result.errors!.push({
              index: i,
              url: item.url,
              error: 'Invalid URL format'
            })
            continue
          }

          const title = sanitizeString(item.title, 500)
          const url = sanitizeString(item.url, 2000)
          const description = item.description ? sanitizeString(item.description, 1000) : null
          const coverImage = item.cover_image ? sanitizeString(item.cover_image, 2000) : null
          const favicon = item.favicon ? sanitizeString(item.favicon, 2000) : null
          const isPinned = item.is_pinned ? 1 : 0
          const isArchived = item.is_archived ? 1 : 0
          const isPublic = item.is_public ? 1 : 0

          // 检查 URL 是否已存在
          const existing = await context.env.DB.prepare(
            'SELECT id, deleted_at FROM bookmarks WHERE user_id = ? AND url = ?'
          )
            .bind(userId, url)
            .first<{ id: string; deleted_at: string | null }>()

          let bookmarkId: string

          if (existing) {
            if (!existing.deleted_at) {
              // 书签已存在，跳过
              result.skipped++
              continue
            }

            // 恢复已删除的书签
            bookmarkId = existing.id
            await context.env.DB.prepare(
              `UPDATE bookmarks
               SET title = ?, description = ?, cover_image = ?, favicon = ?,
                   is_pinned = ?, is_archived = ?, is_public = ?,
                   deleted_at = NULL, updated_at = ?
               WHERE id = ?`
            )
              .bind(
                title,
                description,
                coverImage,
                favicon,
                isPinned,
                isArchived,
                isPublic,
                now,
                bookmarkId
              )
              .run()

            // 清除旧标签关联
            await context.env.DB.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?')
              .bind(bookmarkId)
              .run()
          } else {
            // 创建新书签
            bookmarkId = generateUUID()
            await context.env.DB.prepare(
              `INSERT INTO bookmarks (id, user_id, title, url, description, cover_image, cover_image_id, favicon, is_pinned, is_archived, is_public, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
              .bind(
                bookmarkId,
                userId,
                title,
                url,
                description,
                coverImage,
                null, // cover_image_id (批量导入不上传到 R2)
                favicon,
                isPinned,
                isArchived,
                isPublic,
                now,
                now
              )
              .run()
          }

          // 处理标签
          if (item.tags && item.tags.length > 0) {
            const { createOrLinkTags } = await import('../../../../lib/tags')
            await createOrLinkTags(context.env.DB, bookmarkId, item.tags, userId)
          }

          result.success++
          result.created_bookmarks.push({
            id: bookmarkId,
            url,
            title
          })

        } catch (error) {
          result.failed++
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          result.errors!.push({
            index: i,
            url: item.url || '',
            error: errorMessage
          })
          console.error(`[Batch Create] Failed to create bookmark ${i}:`, error)
        }
      }

      // 清理空错误数组
      if (result.errors!.length === 0) {
        delete result.errors
      }

      // 更新所有标签的 usage_count
      if (result.success > 0) {
        await context.env.DB.prepare(
          `UPDATE tags
           SET usage_count = (
             SELECT COUNT(*) FROM bookmark_tags
             WHERE tag_id = tags.id AND user_id = ?
           )
           WHERE user_id = ? AND deleted_at IS NULL`
        )
          .bind(userId, userId)
          .run()
      }

      // 审计日志
      await writeAuditLog(context.env.DB, {
        userId,
        eventType: 'batch_create_bookmarks',
        ip,
        userAgent,
        payload: {
          request: {
            total: body.bookmarks.length,
            bookmarks: body.bookmarks.map((item) => ({
              title: item.title,
              url: item.url,
              description: item.description || null,
              tags: item.tags || [],
              is_pinned: Boolean(item.is_pinned),
              is_archived: Boolean(item.is_archived),
              is_public: Boolean(item.is_public),
            })),
          },
          response: {
          total: result.total,
          success: result.success,
          failed: result.failed,
            skipped: result.skipped,
            errors: result.errors || [],
          },
        },
      })

      // 清除缓存
      await invalidatePublicShareCache(context.env, userId)

      return success(result)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : ''
      console.error('Batch create bookmarks error:', {
        message: errorMessage,
        stack: errorStack
      })
      return internalError(`Failed to batch create bookmarks: ${errorMessage}`)
    }
  }
]
