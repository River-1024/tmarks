import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, Tag, RouteParams, SQLParam } from '../../../lib/types'
import { success, badRequest, notFound, noContent, conflict, internalError } from '../../../lib/response'
import { requireAuth, AuthContext } from '../../../middleware/auth'
import { sanitizeString } from '../../../lib/validation'
import { writeAuditLog } from '../../../lib/audit-log'

interface UpdateTagRequest {
  name?: string
  color?: string
}

interface TagAuditSnapshot {
  name: string
  color: string | null
}

function buildTagAuditChanges(before: TagAuditSnapshot, after: TagAuditSnapshot) {
  const fields: Array<keyof TagAuditSnapshot> = ['name', 'color']

  return fields
    .filter((field) => before[field] !== after[field])
    .map((field) => ({
      field,
      before: before[field],
      after: after[field],
    }))
}

// PATCH /api/v1/tags/:id - 更新标签
export const onRequestPatch: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const tagId = context.params.id
      const body = await context.request.json() as UpdateTagRequest
      const ip = context.request.headers.get('CF-Connecting-IP')
      const userAgent = context.request.headers.get('User-Agent')

      // 检查标签是否存在且属于当前用户
      const tag = await context.env.DB.prepare(
        'SELECT * FROM tags WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      )
        .bind(tagId, userId)
        .first<Tag>()

      if (!tag) {
        return notFound('Tag not found')
      }

      const beforeSnapshot: TagAuditSnapshot = {
        name: tag.name,
        color: tag.color ?? null,
      }

      const updates: string[] = []
      const values: SQLParam[] = []

      if (body.name !== undefined) {
        const name = sanitizeString(body.name, 50)

        // 检查新名称是否与其他标签冲突
        const existing = await context.env.DB.prepare(
          'SELECT id FROM tags WHERE user_id = ? AND LOWER(name) = LOWER(?) AND id != ? AND deleted_at IS NULL'
        )
          .bind(userId, name, tagId)
          .first()

        if (existing) {
          return conflict('Tag with this name already exists')
        }

        updates.push('name = ?')
        values.push(name)
      }

      if (body.color !== undefined) {
        updates.push('color = ?')
        values.push(body.color ? sanitizeString(body.color, 20) : null)
      }

      if (updates.length === 0) {
        return badRequest('No valid fields to update')
      }

      const now = new Date().toISOString()
      updates.push('updated_at = ?')
      values.push(now)
      values.push(tagId)

      await context.env.DB.prepare(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run()

      // 获取更新后的标签
      const updatedTag = await context.env.DB.prepare('SELECT * FROM tags WHERE id = ?')
        .bind(tagId)
        .first<Tag>()

      if (updatedTag) {
        const afterSnapshot: TagAuditSnapshot = {
          name: updatedTag.name,
          color: updatedTag.color ?? null,
        }

        await writeAuditLog(context.env.DB, {
          userId,
          eventType: 'tag.updated',
          ip,
          userAgent,
          payload: {
            tag_id: tagId,
            before: beforeSnapshot,
            after: afterSnapshot,
            changes: buildTagAuditChanges(beforeSnapshot, afterSnapshot),
          },
        })
      }

      return success({ tag: updatedTag })
    } catch (error) {
      console.error('Update tag error:', error)
      return internalError('Failed to update tag')
    }
  },
]

// DELETE /api/v1/tags/:id - 删除标签（级联删除关联）
export const onRequestDelete: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const tagId = context.params.id
      const ip = context.request.headers.get('CF-Connecting-IP')
      const userAgent = context.request.headers.get('User-Agent')

      // 检查标签是否存在且属于当前用户
      const tag = await context.env.DB.prepare(
        'SELECT * FROM tags WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      )
        .bind(tagId, userId)
        .first<Tag>()

      if (!tag) {
        return notFound('Tag not found')
      }

      const bookmarkCountRow = await context.env.DB.prepare(
        'SELECT COUNT(*) as count FROM bookmark_tags WHERE tag_id = ? AND user_id = ?'
      )
        .bind(tagId, userId)
        .first<{ count: number }>()

      const now = new Date().toISOString()

      // 软删除标签
      await context.env.DB.prepare('UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?')
        .bind(now, now, tagId)
        .run()

      // 删除所有书签-标签关联
      await context.env.DB.prepare('DELETE FROM bookmark_tags WHERE tag_id = ?')
        .bind(tagId)
        .run()

      await writeAuditLog(context.env.DB, {
        userId,
        eventType: 'tag.deleted',
        ip,
        userAgent,
        payload: {
          tag_id: tagId,
          name: tag.name,
          color: tag.color ?? null,
          bookmark_count: Number(bookmarkCountRow?.count ?? 0),
        },
      })

      return noContent()
    } catch (error) {
      console.error('Delete tag error:', error)
      return internalError('Failed to delete tag')
    }
  },
]
