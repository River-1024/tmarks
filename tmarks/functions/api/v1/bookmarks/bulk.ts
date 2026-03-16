import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, RouteParams } from '../../../lib/types'
import { requireAuth, type AuthContext } from '../../../middleware/auth'
import { invalidatePublicShareCache } from '../../shared/cache'
import { CacheService } from '../../../lib/cache'
import { createBookmarkCacheManager } from '../../../lib/cache/bookmark-cache'
import { writeAuditLog } from '../../../lib/audit-log'

// Batch action types
type BatchActionType = 'delete' | 'update_tags' | 'pin' | 'unpin' | 'archive' | 'unarchive'

interface BatchActionRequest {
  action: BatchActionType
  bookmark_ids: string[]
  // For update_tags action
  add_tag_ids?: string[]
  remove_tag_ids?: string[]
}

interface BatchActionResponse {
  success: boolean
  affected_count: number
  errors?: Array<{ bookmark_id: string; message: string }>
}

/**
 * PATCH /api/v1/bookmarks/bulk
 * Batch operations on bookmarks
 */
export const onRequestPatch: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    const userId = context.data.user_id
    const ip = context.request.headers.get('CF-Connecting-IP')
    const userAgent = context.request.headers.get('User-Agent')

    let body: BatchActionRequest | null = null
    try {
    body = (await context.request.json()) as BatchActionRequest
    const { action, bookmark_ids, add_tag_ids, remove_tag_ids } = body

    // Validation
    if (!action || !bookmark_ids || !Array.isArray(bookmark_ids) || bookmark_ids.length === 0) {
      return new Response(
        JSON.stringify({
          code: 'INVALID_REQUEST',
          message: 'action and bookmark_ids are required',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (bookmark_ids.length > 100) {
      return new Response(
        JSON.stringify({
          code: 'TOO_MANY_ITEMS',
          message: 'Cannot process more than 100 bookmarks at once',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const db = context.env.DB
    const placeholders = bookmark_ids.map(() => '?').join(',')
    let affectedCount = 0
    const errors: Array<{ bookmark_id: string; message: string }> = []

    switch (action) {
      case 'delete': {
        // Soft delete bookmarks,同时清除点击统计
        const result = await db
          .prepare(
            `UPDATE bookmarks
             SET deleted_at = datetime('now'), click_count = 0, last_clicked_at = NULL
             WHERE id IN (${placeholders})
               AND user_id = ?
               AND deleted_at IS NULL`
          )
          .bind(...bookmark_ids, userId)
          .run()

        affectedCount = result.meta.changes || 0

        // Audit log
        await writeAuditLog(db, {
          userId,
          eventType: 'batch_delete_bookmarks',
          ip,
          userAgent,
          payload: { bookmark_ids, count: affectedCount },
        })

        break
      }

      case 'pin': {
        const result = await db
          .prepare(
            `UPDATE bookmarks
             SET is_pinned = 1, updated_at = datetime('now')
             WHERE id IN (${placeholders})
               AND user_id = ?
               AND deleted_at IS NULL`
          )
          .bind(...bookmark_ids, userId)
          .run()

        affectedCount = result.meta.changes || 0
        break
      }

      case 'unpin': {
        const result = await db
          .prepare(
            `UPDATE bookmarks
             SET is_pinned = 0, updated_at = datetime('now')
             WHERE id IN (${placeholders})
               AND user_id = ?
               AND deleted_at IS NULL`
          )
          .bind(...bookmark_ids, userId)
          .run()

        affectedCount = result.meta.changes || 0
        break
      }

      case 'update_tags': {
        // Verify all bookmarks belong to the user
        const verifyResult = await db
          .prepare(
            `SELECT id FROM bookmarks
             WHERE id IN (${placeholders})
               AND user_id = ?
               AND deleted_at IS NULL`
          )
          .bind(...bookmark_ids, userId)
          .all<{ id: string }>()

        const validBookmarkIds = verifyResult.results.map((row: { id: string }) => row.id)

        if (validBookmarkIds.length === 0) {
          return new Response(
            JSON.stringify({
              code: 'NO_VALID_BOOKMARKS',
              message: 'No valid bookmarks found',
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          )
        }

        // Remove tags
        if (remove_tag_ids && remove_tag_ids.length > 0) {
          const tagPlaceholders = remove_tag_ids.map(() => '?').join(',')
          const bookmarkPlaceholders = validBookmarkIds.map(() => '?').join(',')

          await db
            .prepare(
              `DELETE FROM bookmark_tags
               WHERE bookmark_id IN (${bookmarkPlaceholders})
                 AND tag_id IN (${tagPlaceholders})
                 AND user_id = ?`
            )
            .bind(...validBookmarkIds, ...remove_tag_ids, userId)
            .run()
        }

        // Add tags
        if (add_tag_ids && add_tag_ids.length > 0) {
          // Verify tags exist and belong to user
          const tagPlaceholders = add_tag_ids.map(() => '?').join(',')
          const tagsResult = await db
            .prepare(
              `SELECT id FROM tags
               WHERE id IN (${tagPlaceholders})
                 AND user_id = ?
                 AND deleted_at IS NULL`
            )
            .bind(...add_tag_ids, userId)
            .all<{ id: string }>()

          const validTagIds = tagsResult.results.map((row: { id: string }) => row.id)

          if (validTagIds.length > 0) {
            // Insert bookmark_tags (ignore duplicates)
            for (const bookmarkId of validBookmarkIds) {
              for (const tagId of validTagIds) {
                try {
                  await db
                    .prepare(
                      `INSERT OR IGNORE INTO bookmark_tags
                       (bookmark_id, tag_id, user_id, created_at)
                       VALUES (?, ?, ?, datetime('now'))`
                    )
                    .bind(bookmarkId, tagId, userId)
                    .run()
                } catch (e) {
                  console.error(`Failed to add tag ${tagId} to bookmark ${bookmarkId}:`, e)
                  errors.push({
                    bookmark_id: bookmarkId,
                    message: `Failed to add tag ${tagId}`,
                  })
                }
              }
            }

            // Update tag usage count
            for (const tagId of validTagIds) {
              try {
                await db
                  .prepare(
                    `UPDATE tags
                     SET usage_count = (
                       SELECT COUNT(*) FROM bookmark_tags
                       WHERE tag_id = ? AND user_id = ?
                     )
                     WHERE id = ? AND user_id = ?`
                  )
                  .bind(tagId, userId, tagId, userId)
                  .run()
              } catch (e) {
                console.error(`Failed to update usage count for tag ${tagId}:`, e)
              }
            }
          }
        }

        // Update bookmarks timestamp
        const bookmarkPlaceholders = validBookmarkIds.map(() => '?').join(',')
        await db
          .prepare(
            `UPDATE bookmarks
             SET updated_at = datetime('now')
             WHERE id IN (${bookmarkPlaceholders}) AND user_id = ?`
          )
          .bind(...validBookmarkIds, userId)
          .run()

        affectedCount = validBookmarkIds.length

        // Audit log
        await writeAuditLog(db, {
          userId,
          eventType: 'batch_update_tags',
          ip,
          userAgent,
          payload: { bookmark_ids: validBookmarkIds, add_tag_ids, remove_tag_ids },
        })

        break
      }

      default:
        return new Response(
          JSON.stringify({
            code: 'INVALID_ACTION',
            message: `Invalid action: ${action}`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
    }

    const response: BatchActionResponse = {
      success: true,
      affected_count: affectedCount,
    }

    if (errors.length > 0) {
      response.errors = errors
    }

    // 使用缓存管理器处理批量操作后的缓存
    const cache = new CacheService(context.env)
    const bookmarkCache = createBookmarkCacheManager(cache)
    await bookmarkCache.handleBatchOperation(userId)

    await invalidatePublicShareCache(context.env, userId)

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : ''
    console.error('Batch operation error:', {
      message: errorMessage,
      stack: errorStack,
      action: body?.action,
      bookmarkCount: body?.bookmark_ids?.length,
    })
    return new Response(
      JSON.stringify({
        code: 'INTERNAL_ERROR',
        message: 'Failed to perform batch operation',
        details: errorMessage,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
},
]
