import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, Bookmark, BookmarkRow, RouteParams, SQLParam } from '../../../lib/types'
import { success, badRequest, notFound, noContent, internalError } from '../../../lib/response'
import { requireAuth, AuthContext } from '../../../middleware/auth'
import { isValidUrl, sanitizeString } from '../../../lib/validation'
import { normalizeBookmark } from '../../../lib/bookmark-utils'
import { invalidatePublicShareCache } from '../../shared/cache'
import { writeAuditLog } from '../../../lib/audit-log'

interface UpdateBookmarkRequest {
  title?: string
  url?: string
  description?: string
  cover_image?: string
  favicon?: string
  tag_ids?: string[] // 兼容旧版：标签 ID 数组
  tags?: string[] // 新版：标签名称数组（推荐）
  is_pinned?: boolean
  is_public?: boolean
}

interface BookmarkAuditSnapshot {
  title: string
  url: string
  description: string | null
  cover_image: string | null
  favicon: string | null
  is_pinned: boolean
  is_public: boolean
  tags: string[]
}

function normalizeAuditTags(tags: string[]) {
  return [...tags].sort((a, b) => a.localeCompare(b))
}

function buildBookmarkAuditChanges(before: BookmarkAuditSnapshot, after: BookmarkAuditSnapshot) {
  const fields: Array<keyof BookmarkAuditSnapshot> = [
    'title',
    'url',
    'description',
    'cover_image',
    'favicon',
    'is_pinned',
    'is_public',
    'tags',
  ]

  return fields
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({
      field,
      before: before[field],
      after: after[field],
    }))
}

// PATCH /api/v1/bookmarks/:id - 更新书签
export const onRequestPatch: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const bookmarkId = context.params.id
      const body = (await context.request.json()) as UpdateBookmarkRequest
      const ip = context.request.headers.get('CF-Connecting-IP')
      const userAgent = context.request.headers.get('User-Agent')

      // 检查书签是否存在且属于当前用户
      const bookmarkRow = await context.env.DB.prepare(
        'SELECT * FROM bookmarks WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      )
        .bind(bookmarkId, userId)
        .first<BookmarkRow>()

      if (!bookmarkRow) {
        return notFound('Bookmark not found')
      }

      const { results: previousTags } = await context.env.DB.prepare(
        `SELECT t.name
         FROM tags t
         INNER JOIN bookmark_tags bt ON t.id = bt.tag_id
         WHERE bt.bookmark_id = ? AND t.deleted_at IS NULL`
      )
        .bind(bookmarkId)
        .all<{ name: string }>()

      const beforeSnapshot: BookmarkAuditSnapshot = {
        title: bookmarkRow.title,
        url: bookmarkRow.url,
        description: bookmarkRow.description ?? null,
        cover_image: bookmarkRow.cover_image ?? null,
        favicon: bookmarkRow.favicon ?? null,
        is_pinned: bookmarkRow.is_pinned === 1,
        is_public: bookmarkRow.is_public === 1,
        tags: normalizeAuditTags((previousTags ?? []).map((tag) => tag.name)),
      }

      // 验证输入
      if (body.url && !isValidUrl(body.url)) {
        return badRequest('Invalid URL format')
      }

      // 构建更新语句
      const updates: string[] = []
      const values: SQLParam[] = []
      const changedFields: string[] = []

      if (body.title !== undefined) {
        updates.push('title = ?')
        values.push(sanitizeString(body.title, 500))
        changedFields.push('title')
      }

      if (body.url !== undefined) {
        updates.push('url = ?')
        values.push(sanitizeString(body.url, 2000))
        changedFields.push('url')
      }

      if (body.description !== undefined) {
        updates.push('description = ?')
        values.push(body.description ? sanitizeString(body.description, 1000) : null)
        changedFields.push('description')
      }

      if (body.cover_image !== undefined) {
        updates.push('cover_image = ?')
        values.push(body.cover_image ? sanitizeString(body.cover_image, 2000) : null)
        changedFields.push('cover_image')
      }

      if (body.favicon !== undefined) {
        updates.push('favicon = ?')
        values.push(body.favicon ? sanitizeString(body.favicon, 2000) : null)
        changedFields.push('favicon')
      }

      if (body.is_pinned !== undefined) {
        updates.push('is_pinned = ?')
        values.push(body.is_pinned ? 1 : 0)
        changedFields.push('is_pinned')
      }

      if (body.is_public !== undefined) {
        updates.push('is_public = ?')
        values.push(body.is_public ? 1 : 0)
        changedFields.push('is_public')
      }

      const now = new Date().toISOString()

      if (updates.length > 0) {
        updates.push('updated_at = ?')
        values.push(now)
        values.push(bookmarkId)

        await context.env.DB.prepare(`UPDATE bookmarks SET ${updates.join(', ')} WHERE id = ?`)
          .bind(...values)
          .run()
      }

      // 更新标签关联
      if (body.tags !== undefined) {
        changedFields.push('tags')
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
        changedFields.push('tags')
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
      const updatedBookmarkRow = await context.env.DB.prepare(
        'SELECT * FROM bookmarks WHERE id = ?'
      )
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

      if (changedFields.length > 0) {
        const afterSnapshot: BookmarkAuditSnapshot = {
          title: updatedBookmarkRow.title,
          url: updatedBookmarkRow.url,
          description: updatedBookmarkRow.description ?? null,
          cover_image: updatedBookmarkRow.cover_image ?? null,
          favicon: updatedBookmarkRow.favicon ?? null,
          is_pinned: updatedBookmarkRow.is_pinned === 1,
          is_public: updatedBookmarkRow.is_public === 1,
          tags: normalizeAuditTags((tags ?? []).map((tag) => tag.name)),
        }

        await writeAuditLog(context.env.DB, {
          userId,
          eventType: 'bookmark.updated',
          ip,
          userAgent,
          payload: {
            bookmark_id: bookmarkId,
            title: updatedBookmarkRow.title,
            url: updatedBookmarkRow.url,
            changed_fields: changedFields,
            changes: buildBookmarkAuditChanges(beforeSnapshot, afterSnapshot),
            before: beforeSnapshot,
            after: afterSnapshot,
            is_pinned: updatedBookmarkRow.is_pinned === 1,
            is_public: updatedBookmarkRow.is_public === 1,
            tag_count: tags?.length ?? 0,
          },
        })
      }

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
      const ip = context.request.headers.get('CF-Connecting-IP')
      const userAgent = context.request.headers.get('User-Agent')

      // 检查书签是否存在且属于当前用户
      const bookmark = await context.env.DB.prepare(
        'SELECT * FROM bookmarks WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      )
        .bind(bookmarkId, userId)
        .first<BookmarkRow>()

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

      await writeAuditLog(context.env.DB, {
        userId,
        eventType: 'bookmark.deleted',
        ip,
        userAgent,
        payload: {
          bookmark_id: bookmarkId,
          title: bookmark.title,
          url: bookmark.url,
          is_pinned: bookmark.is_pinned === 1,
          is_public: bookmark.is_public === 1,
        },
      })

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
      const ip = context.request.headers.get('CF-Connecting-IP')
      const userAgent = context.request.headers.get('User-Agent')

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
      const restoredBookmarkRow = await context.env.DB.prepare(
        'SELECT * FROM bookmarks WHERE id = ?'
      )
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

      await writeAuditLog(context.env.DB, {
        userId,
        eventType: 'bookmark.restored',
        ip,
        userAgent,
        payload: {
          bookmark_id: bookmarkId,
          title: restoredBookmarkRow.title,
          url: restoredBookmarkRow.url,
          is_pinned: restoredBookmarkRow.is_pinned === 1,
          is_public: restoredBookmarkRow.is_public === 1,
          tag_count: tags?.length ?? 0,
        },
      })

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
