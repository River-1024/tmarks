import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, Tag, RouteParams } from '../../../lib/types'
import { success, badRequest, created, conflict, internalError } from '../../../lib/response'
import { requireAuth, AuthContext } from '../../../middleware/auth'
import { sanitizeString } from '../../../lib/validation'
import { generateUUID } from '../../../lib/crypto'
import { writeAuditLog } from '../../../lib/audit-log'

interface CreateTagRequest {
  name: string
  color?: string
}

interface ExistingTagRow {
  id: string
  deleted_at: string | null
}

interface TagWithCount extends Tag {
  bookmark_count: number
}

// GET /api/v1/tags - 获取标签列表
export const onRequestGet: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const url = new URL(context.request.url)

      const sortBy = url.searchParams.get('sort') || 'usage' // 'usage', 'name', or 'clicks'

      // 获取标签和使用计数
      let query = `
        SELECT
          t.*,
          COUNT(bt.bookmark_id) as bookmark_count
        FROM tags t
        LEFT JOIN bookmark_tags bt ON t.id = bt.tag_id
        WHERE t.user_id = ? AND t.deleted_at IS NULL
        GROUP BY t.id
      `

      if (sortBy === 'name') {
        query += ' ORDER BY LOWER(t.name) ASC'
      } else if (sortBy === 'clicks') {
        query += ' ORDER BY t.click_count DESC, LOWER(t.name) ASC'
      } else {
        // 默认按使用次数(bookmark_count)排序
        query += ' ORDER BY bookmark_count DESC, LOWER(t.name) ASC'
      }

      const { results } = await context.env.DB.prepare(query)
        .bind(userId)
        .all<TagWithCount>()

      return success({
        tags: results || [],
      })
    } catch (error) {
      console.error('Get tags error:', error)
      return internalError('Failed to get tags')
    }
  },
]

// POST /api/v1/tags - 创建标签
export const onRequestPost: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const body = await context.request.json() as CreateTagRequest
      const ip = context.request.headers.get('CF-Connecting-IP')
      const userAgent = context.request.headers.get('User-Agent')

      if (!body.name?.trim()) {
        return badRequest('Tag name is required')
      }

      const name = sanitizeString(body.name, 50)
      const color = body.color ? sanitizeString(body.color, 20) : null
      const now = new Date().toISOString()

      // 检查标签是否已存在（包含已软删除标签）
      const existing = await context.env.DB.prepare(
        'SELECT id, deleted_at FROM tags WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1'
      )
        .bind(userId, name)
        .first<ExistingTagRow>()

      if (existing && !existing.deleted_at) {
        return conflict('Tag with this name already exists')
      }

      const isRestored = Boolean(existing?.deleted_at)
      const tagUuid = existing?.id || generateUUID()

      if (isRestored) {
        // 唯一索引覆盖已软删除记录：恢复原记录，避免重新插入触发冲突
        await context.env.DB.prepare(
          `UPDATE tags
           SET deleted_at = NULL,
               updated_at = ?,
               name = ?,
               color = COALESCE(?, color)
           WHERE id = ? AND user_id = ?`
        )
          .bind(now, name, color, tagUuid, userId)
          .run()
      } else {
        await context.env.DB.prepare(
          `INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(tagUuid, userId, name, color, now, now)
          .run()
      }

      const tag = await context.env.DB.prepare('SELECT * FROM tags WHERE id = ?')
        .bind(tagUuid)
        .first<Tag>()

      await writeAuditLog(context.env.DB, {
        userId,
        eventType: isRestored ? 'tag.restored' : 'tag.created',
        ip,
        userAgent,
        payload: {
          tag_id: tagUuid,
          name,
          color,
          bookmark_count: 0,
          restored: isRestored,
        },
      })

      return created({ tag })
    } catch (error) {
      console.error('Create tag error:', error)
      return internalError('Failed to create tag')
    }
  },
]
