import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, RouteParams, Tag } from '../../../lib/types'
import { badRequest, internalError, success } from '../../../lib/response'
import { requireAuth, type AuthContext } from '../../../middleware/auth'
import { sanitizeString } from '../../../lib/validation'

interface MergeTagsRequest {
  tag_ids: string[]
  name: string
}

interface MergeTagsResponse {
  success: boolean
  merged_tag: Tag
  affected_count: number
}

export const onRequestPost: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const body = (await context.request.json()) as MergeTagsRequest

      if (!body.name?.trim()) {
        return badRequest('name is required')
      }

      if (!body.tag_ids || !Array.isArray(body.tag_ids) || body.tag_ids.length < 2) {
        return badRequest('tag_ids must contain at least 2 tags')
      }

      const tagIds = [...new Set(body.tag_ids.map((id) => id?.trim()).filter(Boolean))]

      if (tagIds.length < 2) {
        return badRequest('tag_ids must contain at least 2 unique tags')
      }

      if (tagIds.length > 100) {
        return badRequest('Cannot process more than 100 tags at once')
      }

      const mergedName = sanitizeString(body.name, 50)
      const placeholders = tagIds.map(() => '?').join(',')

      const { results } = await context.env.DB.prepare(
        `SELECT *
         FROM tags
         WHERE id IN (${placeholders})
           AND user_id = ?
           AND deleted_at IS NULL`
      )
        .bind(...tagIds, userId)
        .all<Tag>()

      const availableTags = results || []
      if (availableTags.length < 2) {
        return badRequest('At least 2 valid tags are required')
      }

      const tagById = new Map(availableTags.map((tag) => [tag.id, tag]))
      const orderedTags = tagIds.map((id) => tagById.get(id)).filter(Boolean) as Tag[]

      const existingNamedTag = await context.env.DB.prepare(
        `SELECT *
         FROM tags
         WHERE user_id = ?
           AND LOWER(name) = LOWER(?)
           AND deleted_at IS NULL
         LIMIT 1`
      )
        .bind(userId, mergedName)
        .first<Tag>()

      const targetTag =
        existingNamedTag ??
        orderedTags[0]

      if (!targetTag) {
        return badRequest('No valid target tag found')
      }

      const sourceTagIds = orderedTags
        .map((tag) => tag.id)
        .filter((id) => id !== targetTag.id)

      const now = new Date().toISOString()

      if (!existingNamedTag) {
        await context.env.DB.prepare(
          `UPDATE tags
           SET name = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`
        )
          .bind(mergedName, now, targetTag.id, userId)
          .run()
      } else {
        await context.env.DB.prepare(
          `UPDATE tags
           SET updated_at = ?
           WHERE id = ? AND user_id = ?`
        )
          .bind(now, targetTag.id, userId)
          .run()
      }

      if (sourceTagIds.length > 0) {
        const sourcePlaceholders = sourceTagIds.map(() => '?').join(',')

        await context.env.DB.prepare(
          `INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id, user_id, created_at)
           SELECT bookmark_id, ?, user_id, ?
           FROM bookmark_tags
           WHERE tag_id IN (${sourcePlaceholders})
             AND user_id = ?`
        )
          .bind(targetTag.id, now, ...sourceTagIds, userId)
          .run()

        await context.env.DB.prepare(
          `DELETE FROM bookmark_tags
           WHERE tag_id IN (${sourcePlaceholders})
             AND user_id = ?`
        )
          .bind(...sourceTagIds, userId)
          .run()

        await context.env.DB.prepare(
          `UPDATE tags
           SET deleted_at = ?, updated_at = ?
           WHERE id IN (${sourcePlaceholders})
             AND user_id = ?
             AND deleted_at IS NULL`
        )
          .bind(now, now, ...sourceTagIds, userId)
          .run()
      }

      const mergedTag = await context.env.DB.prepare(
        `SELECT *
         FROM tags
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL`
      )
        .bind(targetTag.id, userId)
        .first<Tag>()

      if (!mergedTag) {
        return internalError('Failed to load merged tag')
      }

      const response: MergeTagsResponse = {
        success: true,
        merged_tag: mergedTag,
        affected_count: sourceTagIds.length,
      }

      return success(response)
    } catch (error) {
      console.error('Merge tags error:', error)
      return internalError('Failed to merge tags')
    }
  },
]
