/**
 * 从回收站恢复书签 API
 * 路径: /api/v1/bookmarks/:id/restore
 * 认证: JWT Token (Bearer)
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, BookmarkRow, RouteParams } from '../../../../lib/types'
import { success, notFound, internalError } from '../../../../lib/response'
import { requireAuth, AuthContext } from '../../../../middleware/auth'
import { normalizeBookmark } from '../../../../lib/bookmark-utils'
import { invalidatePublicShareCache } from '../../../shared/cache'
import { writeAuditLog } from '../../../../lib/audit-log'

// PATCH /api/v1/bookmarks/:id/restore - 从回收站恢复
export const onRequestPatch: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    const userId = context.data.user_id
    const bookmarkId = context.params.id
    const ip = context.request.headers.get('CF-Connecting-IP')
    const userAgent = context.request.headers.get('User-Agent')

    try {
      // 检查书签是否存在且已被软删除
      const existing = await context.env.DB.prepare(
        'SELECT id FROM bookmarks WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL'
      )
        .bind(bookmarkId, userId)
        .first()

      if (!existing) {
        return notFound('Bookmark not found in trash')
      }

      const now = new Date().toISOString()

      // 恢复：清除 deleted_at
      await context.env.DB.prepare(
        'UPDATE bookmarks SET deleted_at = NULL, updated_at = ? WHERE id = ?'
      )
        .bind(now, bookmarkId)
        .run()

      // 返回恢复后的书签
      const bookmarkRow = await context.env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?')
        .bind(bookmarkId)
        .first<BookmarkRow>()

      if (!bookmarkRow) {
        return internalError('Failed to load bookmark after restore')
      }

      // 获取标签
      const { results: tags } = await context.env.DB.prepare(
        `SELECT t.id, t.name, t.color
         FROM tags t
         INNER JOIN bookmark_tags bt ON t.id = bt.tag_id
         WHERE bt.bookmark_id = ? AND t.deleted_at IS NULL`
      )
        .bind(bookmarkId)
        .all<{ id: string; name: string; color: string | null }>()

      await invalidatePublicShareCache(context.env, userId)

      await writeAuditLog(context.env.DB, {
        userId,
        eventType: 'bookmark.restored',
        ip,
        userAgent,
        payload: {
          bookmark_id: bookmarkId,
          title: bookmarkRow.title,
          url: bookmarkRow.url,
          is_pinned: bookmarkRow.is_pinned === 1,
          is_public: bookmarkRow.is_public === 1,
          tag_count: tags?.length ?? 0,
        },
      })

      return success({
        bookmark: {
          ...normalizeBookmark(bookmarkRow),
          tags: tags || [],
        },
      })
    } catch (error) {
      console.error('Restore bookmark error:', error)
      return internalError('Failed to restore bookmark')
    }
  },
]
