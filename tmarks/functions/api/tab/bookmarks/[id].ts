/**
 * 对外 API - 单个书签操作
 * 路径: /api/tab/bookmarks/:id
 * 认证: API Key (X-API-Key header)
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, BookmarkRow, RouteParams, SQLParam } from '../../../lib/types'
import { success, badRequest, notFound, noContent, internalError } from '../../../lib/response'
import { requireApiKeyAuth, ApiKeyAuthContext } from '../../../middleware/api-key-auth-pages'
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

// GET /api/bookmarks/:id - 获取单个书签详情
export const onRequestGet: PagesFunction<Env, RouteParams, ApiKeyAuthContext>[] = [
  requireApiKeyAuth('bookmarks.read'),
  async (context) => {
    const userId = context.data.user_id
    const bookmarkId = context.params.id

    try {
      const bookmarkRow = await context.env.DB.prepare(
        'SELECT * FROM bookmarks WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      )
        .bind(bookmarkId, userId)
        .first<BookmarkRow>()

      if (!bookmarkRow) {
        return notFound('Bookmark not found')
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

      // 获取快照数量
      const snapshotCountResult = await context.env.DB.prepare(
        `SELECT COUNT(*) as count FROM bookmark_snapshots WHERE bookmark_id = ? AND user_id = ?`
      )
        .bind(bookmarkId, userId)
        .first<{ count: number }>()

      const snapshotCount = snapshotCountResult?.count || 0

      await invalidatePublicShareCache(context.env, userId)

      return success({
        bookmark: {
          ...normalizeBookmark(bookmarkRow),
          tags: tags || [],
          snapshot_count: snapshotCount,
          has_snapshot: snapshotCount > 0,
        },
      })
    } catch (error) {
      console.error('Get bookmark error:', error)
      return internalError('Failed to get bookmark')
    }
  },
]

// PATCH /api/bookmarks/:id - 更新书签
export const onRequestPatch: PagesFunction<Env, RouteParams, ApiKeyAuthContext>[] = [
  requireApiKeyAuth('bookmarks.update'),
  async (context) => {
    const userId = context.data.user_id
    const bookmarkId = context.params.id

    try {
      // 检查书签是否存在
      const existing = await context.env.DB.prepare(
        'SELECT id FROM bookmarks WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      )
        .bind(bookmarkId, userId)
        .first()

      if (!existing) {
        return notFound('Bookmark not found')
      }

      const body = (await context.request.json()) as UpdateBookmarkRequest
      const updates: string[] = []
      const values: SQLParam[] = []

      // 标题
      if (body.title !== undefined) {
        if (!body.title.trim()) {
          return badRequest('Title cannot be empty')
        }
        updates.push('title = ?')
        values.push(sanitizeString(body.title, 500))
      }

      // URL
      if (body.url !== undefined) {
        if (!body.url.trim()) {
          return badRequest('URL cannot be empty')
        }
        if (!isValidUrl(body.url)) {
          return badRequest('Invalid URL format')
        }
        updates.push('url = ?')
        values.push(sanitizeString(body.url, 2000))
      }

      // 描述
      if (body.description !== undefined) {
        updates.push('description = ?')
        values.push(body.description ? sanitizeString(body.description, 1000) : null)
      }

      // 封面图
      if (body.cover_image !== undefined) {
        updates.push('cover_image = ?')
        values.push(body.cover_image ? sanitizeString(body.cover_image, 2000) : null)
      }

      // Favicon
      if (body.favicon !== undefined) {
        updates.push('favicon = ?')
        values.push(body.favicon ? sanitizeString(body.favicon, 2000) : null)
      }

      // 置顶
      if (body.is_pinned !== undefined) {
        updates.push('is_pinned = ?')
        values.push(body.is_pinned ? 1 : 0)
      }

      // 归档
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
        values.push(bookmarkId, userId)

        await context.env.DB.prepare(
          `UPDATE bookmarks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
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
        
        // 创建或链接新标签
        if (body.tags.length > 0) {
          await createOrLinkTags(context.env.DB, bookmarkId, body.tags, userId)
        }
      } else if (body.tag_ids !== undefined) {
        // 兼容旧版：传标签 ID
        // 删除旧的标签关联
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

      // 返回更新后的书签
      const bookmarkRow = await context.env.DB.prepare('SELECT * FROM bookmarks WHERE id = ?')
        .bind(bookmarkId)
        .first<BookmarkRow>()

      const { results: tags } = await context.env.DB.prepare(
        `SELECT t.id, t.name, t.color
         FROM tags t
         INNER JOIN bookmark_tags bt ON t.id = bt.tag_id
         WHERE bt.bookmark_id = ?`
      )
        .bind(bookmarkId)
        .all<{ id: string; name: string; color: string | null }>()

      if (!bookmarkRow) {
        return internalError('Failed to load bookmark after update')
      }

      return success({
        bookmark: {
          ...normalizeBookmark(bookmarkRow),
          tags: tags || [],
        },
      })
    } catch (error) {
      console.error('Update bookmark error:', error)
      return internalError('Failed to update bookmark')
    }
  },
]

// DELETE /api/bookmarks/:id - 删除书签
export const onRequestDelete: PagesFunction<Env, RouteParams, ApiKeyAuthContext>[] = [
  requireApiKeyAuth('bookmarks.delete'),
  async (context) => {
    const userId = context.data.user_id
    const bookmarkId = context.params.id

    try {
      const existing = await context.env.DB.prepare(
        'SELECT id FROM bookmarks WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      )
        .bind(bookmarkId, userId)
        .first()

      if (!existing) {
        return notFound('Bookmark not found')
      }

      const now = new Date().toISOString()

      // 软删除
      await context.env.DB.prepare(
        'UPDATE bookmarks SET deleted_at = ?, updated_at = ? WHERE id = ?'
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
