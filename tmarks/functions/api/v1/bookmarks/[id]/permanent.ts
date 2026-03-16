/**
 * 永久删除书签 API
 * 路径: /api/v1/bookmarks/:id/permanent
 * 认证: JWT Token (Bearer)
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, BookmarkRow, RouteParams } from '../../../../lib/types'
import { noContent, notFound, internalError } from '../../../../lib/response'
import { requireAuth, AuthContext } from '../../../../middleware/auth'
import { invalidatePublicShareCache } from '../../../shared/cache'
import { writeAuditLog } from '../../../../lib/audit-log'

// DELETE /api/v1/bookmarks/:id/permanent - 永久删除（从回收站彻底删除）
export const onRequestDelete: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    const userId = context.data.user_id
    const bookmarkId = context.params.id
    const ip = context.request.headers.get('CF-Connecting-IP')
    const userAgent = context.request.headers.get('User-Agent')

    try {
      // 检查书签是否存在且已在回收站中
      const existing = await context.env.DB.prepare(
        'SELECT * FROM bookmarks WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL'
      )
        .bind(bookmarkId, userId)
        .first<BookmarkRow>()

      if (!existing) {
        return notFound('Bookmark not found in trash')
      }

      // 删除标签关联
      await context.env.DB.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?')
        .bind(bookmarkId)
        .run()

      // 删除快照
      await context.env.DB.prepare('DELETE FROM bookmark_snapshots WHERE bookmark_id = ?')
        .bind(bookmarkId)
        .run()

      // 永久删除书签
      await context.env.DB.prepare('DELETE FROM bookmarks WHERE id = ?').bind(bookmarkId).run()

      await invalidatePublicShareCache(context.env, userId)

      await writeAuditLog(context.env.DB, {
        userId,
        eventType: 'bookmark.permanently_deleted',
        ip,
        userAgent,
        payload: {
          bookmark_id: bookmarkId,
          title: existing.title,
          url: existing.url,
          is_pinned: existing.is_pinned === 1,
          is_public: existing.is_public === 1,
        },
      })

      return noContent()
    } catch (error) {
      console.error('Permanent delete bookmark error:', error)
      return internalError('Failed to permanently delete bookmark')
    }
  },
]
