import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, RouteParams } from '../../../lib/types'
import { badRequest, internalError, notFound, success } from '../../../lib/response'
import { requireAuth, type AuthContext } from '../../../middleware/auth'

interface BatchDeleteTagsRequest {
  tag_ids: string[]
}

interface BatchDeleteTagsResponse {
  success: boolean
  affected_count: number
}

export const onRequestPost: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const body = (await context.request.json()) as BatchDeleteTagsRequest

      if (!body.tag_ids || !Array.isArray(body.tag_ids) || body.tag_ids.length === 0) {
        return badRequest('tag_ids is required and must be a non-empty array')
      }

      const tagIds = [...new Set(body.tag_ids.map((id) => id?.trim()).filter(Boolean))]

      if (tagIds.length === 0) {
        return badRequest('tag_ids is required and must be a non-empty array')
      }

      if (tagIds.length > 100) {
        return badRequest('Cannot process more than 100 tags at once')
      }

      const placeholders = tagIds.map(() => '?').join(',')

      const { results } = await context.env.DB.prepare(
        `SELECT id FROM tags
         WHERE id IN (${placeholders})
           AND user_id = ?
           AND deleted_at IS NULL`
      )
        .bind(...tagIds, userId)
        .all<{ id: string }>()

      const validTagIds = (results || []).map((row) => row.id)

      if (validTagIds.length === 0) {
        return notFound('No valid tags found')
      }

      const validPlaceholders = validTagIds.map(() => '?').join(',')
      const now = new Date().toISOString()

      const updateResult = await context.env.DB.prepare(
        `UPDATE tags
         SET deleted_at = ?, updated_at = ?
         WHERE id IN (${validPlaceholders})
           AND user_id = ?
           AND deleted_at IS NULL`
      )
        .bind(now, now, ...validTagIds, userId)
        .run()

      await context.env.DB.prepare(
        `DELETE FROM bookmark_tags
         WHERE tag_id IN (${validPlaceholders})
           AND user_id = ?`
      )
        .bind(...validTagIds, userId)
        .run()

      const response: BatchDeleteTagsResponse = {
        success: true,
        affected_count: updateResult.meta.changes || 0,
      }

      return success(response)
    } catch (error) {
      console.error('Batch delete tags error:', error)
      return internalError('Failed to batch delete tags')
    }
  },
]
