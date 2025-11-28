import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, Bookmark, BookmarkRow, RouteParams, SQLParam } from '../../../lib/types'
import { success, badRequest, notFound, noContent, internalError } from '../../../lib/response'
import { requireAuth, AuthContext } from '../../../middleware/auth'
import { isValidUrl, sanitizeString } from '../../../lib/validation'
import { normalizeBookmark } from '../../../lib/bookmark-utils'
import { invalidatePublicShareCache } from '../../shared/cache'

interface UpdateBookmarkRequest {
  title?: string
  url?: string
  description?: string
  cover_image?: string
  favicon?: string
  tag_ids?: string[]  // 兼容旧版：标签 ID 数组
  tags?: string[]     // 新版：标签名称数组（推荐）
  is_pinned?: boolean
  is_archived?: boolean
  is_public?: boolean
}

// PATCH /api/v1/bookmarks/:id - 更新书签
export const onRequestPatch: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const bookmarkId = context.params.id
      const body = await context.request.json() as UpdateBookmarkRequest

      // 检查书签是否存在且属于当前用户
      const bookmarkRow = await context.env.DB.prepare(
        'SELECT * FROM bookmarks WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      )
        .bind(bookmarkId, userId)
        .first<BookmarkRow>()

      if (!bookmarkRow) {
        return notFound('Bookmark not found')
      }

      // 验证输入
      if (body.url && !isValidUrl(body.url)) {
        return badRequest('Invalid URL format')
      }

      // 构建更新语句
      const updates: string[] = []
      const values: SQLParam[] = []

      if (body.title !== undefined) {
        updates.push('title = ?')
        values.push(sanitizeString(body.title, 500))
      }

      if (body.url !== undefined) {
        updates.push('url = ?')
        values.push(sanitizeString(body.url, 2000))
      }

      if (body.description !== undefined) {
        updates.push('description = ?')
        values.push(body.description ? sanitizeString(body.description, 1000) : null)
      }

      if (body.cover_image !== undefined) {
        updates.push('cover_image = ?')
        values.push(body.cover_image ? sanitizeString(body.cover_image, 2000) : null)
      }

      if (body.favicon !== undefined) {
        updates.push('favicon = ?')
        values.push(body.favicon ? sanitizeString(body.favicon, 2000) : null)
      }

      if (body.is_pinned !== undefined) {
        updates.push('is_pinned = ?')
        values.push(body.is_pinned ? 1 : 0)
      }

      if (body.is_archived !== undefined) {
        updates.push('is_archived = ?')
        values.push(body.is_archived ? 1 : 0)
      }

      if (body.is_public !== undefined) {
        updates.push('is_public = ?')
        values.push(body.is_public ? 1 : 0)
      }

      const now = new Date().toISOString()

      if (updates.length > 0) {
        updates.push('updated_at = ?')
        values.push(now)
        values.push(bookmarkId)

        await context.env.DB.prepare(
          `UPDATE bookmarks SET ${updates.join(', ')} WHERE id = ?`
        )
          .bind(...values)
          .run()
      }

      // 更新标签关联
      if (body.tags !== undefined) {
        // 新版：直接传标签名称，后端自动创建或链接
        const { createOrLinkTags } = await import('../../../lib/tags')
        
        // 删除现有标签关联
        await context.env.DB.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?')
          .bind(bookmarkId)
          .run()
        
        // 使用批量处理函数
        if (body.tags.length > 0) {
          await createOrLinkTags(context.env.DB, bookmarkId, body.tags, userId)
        }
      } else if (body.tag_ids !== undefined) {
        // 兼容旧版：传标签 ID
        // 删除现有标签关联
        await context.env.DB.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?')
          .bind(bookmarkId)
          .run()

        // 添加新的标签关联
        if (body.tag_ids.length > 0) {
          for (const tagId of body.tag_ids) {
            await context.env.DB.prepare(
              'INSERT INTO bookmark_tags (bookmark_id, tag_id, user_id, created_at) VALUES (?, ?, ?, ?)'
            )
              .bind(bookmarkId, tagId, userId, now)
              .run()
          }
        }
      }

      // 获取更新后的书签
      const updatedBookmarkRow = await context.env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?')
        .bind(bookmarkId)
        .first<BookmarkRow>()

      const { results: tags } = await context.env.DB.prepare(
        `SELECT t.id, t.name, t.color
         FROM tags t
         INNER JOIN bookmark_tags bt ON t.id = bt.tag_id
         WHERE bt.bookmark_id = ? AND t.deleted_at IS NULL`
      )
        .bind(bookmarkId)
        .all<{ id: string; name: string; color: string | null }>()

      if (!updatedBookmarkRow) {
        return internalError('Failed to load bookmark after update')
      }

      await invalidatePublicShareCache(context.env, userId)

      return success({
        bookmark: {
          ...normalizeBookmark(updatedBookmarkRow),
          tags: tags || [],
        },
      })
    } catch (error) {
      console.error('Update bookmark error:', error)
      return internalError('Failed to update bookmark')
    }
  },
]

// DELETE /api/v1/bookmarks/:id - 软删除书签
export const onRequestDelete: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const bookmarkId = context.params.id

      // 检查书签是否存在且属于当前用户
      const bookmark = await context.env.DB.prepare(
        'SELECT id FROM bookmarks WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      )
        .bind(bookmarkId, userId)
        .first()

      if (!bookmark) {
        return notFound('Bookmark not found')
      }

      // 软删除，同时清除点击统计
      const now = new Date().toISOString()
      await context.env.DB.prepare(
        'UPDATE bookmarks SET deleted_at = ?, updated_at = ?, click_count = 0, last_clicked_at = NULL WHERE id = ?'
      )
        .bind(now, now, bookmarkId)
        .run()

      // 删除标签关联
      await context.env.DB.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?')
        .bind(bookmarkId)
        .run()

      await invalidatePublicShareCache(context.env, userId)

      return noContent()
    } catch (error) {
      console.error('Delete bookmark error:', error)
      return internalError('Failed to delete bookmark')
    }
  },
]

// PUT /api/v1/bookmarks/:id - 恢复已删除的书签
export const onRequestPut: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const bookmarkId = context.params.id

      // 检查书签是否存在、属于当前用户且已被软删除
      const bookmark = await context.env.DB.prepare(
        'SELECT * FROM bookmarks WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL'
      )
        .bind(bookmarkId, userId)
        .first<Bookmark>()

      if (!bookmark) {
        return notFound('Deleted bookmark not found')
      }

      // 恢复书签
      const now = new Date().toISOString()
      await context.env.DB.prepare(
        'UPDATE bookmarks SET deleted_at = NULL, updated_at = ? WHERE id = ?'
      )
        .bind(now, bookmarkId)
        .run()

      // 获取恢复后的书签
      const restoredBookmarkRow = await context.env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?')
        .bind(bookmarkId)
        .first<BookmarkRow>()

      const { results: tags } = await context.env.DB.prepare(
        `SELECT t.id, t.name, t.color
         FROM tags t
         INNER JOIN bookmark_tags bt ON t.id = bt.tag_id
         WHERE bt.bookmark_id = ? AND t.deleted_at IS NULL`
      )
        .bind(bookmarkId)
        .all<{ id: string; name: string; color: string | null }>()

      if (!restoredBookmarkRow) {
        return internalError('Failed to load bookmark after restore')
      }

      await invalidatePublicShareCache(context.env, userId)

      return success({
        bookmark: {
          ...normalizeBookmark(restoredBookmarkRow),
          tags: tags || [],
        },
      })
    } catch (error) {
      console.error('Restore bookmark error:', error)
      return internalError('Failed to restore bookmark')
    }
  },
]
