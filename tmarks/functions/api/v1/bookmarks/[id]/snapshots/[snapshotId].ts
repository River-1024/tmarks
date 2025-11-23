/**
 * 单个快照操作 API (V1 - JWT Auth)
 * 路径: /api/v1/bookmarks/:id/snapshots/:snapshotId
 * 认证: JWT Token
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env } from '../../../../../lib/types'
import { notFound, internalError } from '../../../../../lib/response'
import { requireAuth, AuthContext } from '../../../../../middleware/auth'

// GET /api/v1/bookmarks/:id/snapshots/:snapshotId - 获取快照
export const onRequestGet: PagesFunction<Env, 'id' | 'snapshotId', AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const bookmarkId = context.params.id as string
      const snapshotId = context.params.snapshotId as string
      const db = context.env.DB
      const bucket = context.env.SNAPSHOTS_BUCKET

      if (!bucket) {
        return internalError('Storage not configured')
      }

      // 获取快照信息
      const snapshot = await db
        .prepare(
          `SELECT s.*, b.url as bookmark_url
           FROM bookmark_snapshots s
           JOIN bookmarks b ON s.bookmark_id = b.id
           WHERE s.id = ? AND s.bookmark_id = ? AND s.user_id = ?`
        )
        .bind(snapshotId, bookmarkId, userId)
        .first()

      if (!snapshot) {
        return notFound('Snapshot not found')
      }

      // 从 R2 获取快照内容
      const r2Object = await bucket.get(snapshot.r2_key as string)

      if (!r2Object) {
        return notFound('Snapshot file not found')
      }

      // 直接读取 HTML 内容
      let htmlContent = await r2Object.text()
      
      // 统计 data URL 的数量（用于调试）
      const dataUrlCount = (htmlContent.match(/src="data:/g) || []).length
      const htmlSize = new Blob([htmlContent]).size
      console.log(`[Snapshot API V1] Retrieved from R2: ${(htmlSize / 1024).toFixed(1)}KB, data URLs: ${dataUrlCount}`)

      // 注入宽松的 CSP meta 标签到 HTML head 中（覆盖任何默认设置）
      const cspMetaTag = '<meta http-equiv="Content-Security-Policy" content="default-src * \'unsafe-inline\' \'unsafe-eval\' data: blob:; img-src * data: blob:; font-src * data:; style-src * \'unsafe-inline\'; script-src * \'unsafe-inline\' \'unsafe-eval\'; frame-src *; connect-src *;">';
      if (htmlContent.includes('<head>')) {
        htmlContent = htmlContent.replace('<head>', `<head>${cspMetaTag}`);
        console.log(`[Snapshot API V1] Injected CSP meta tag`);
      } else if (htmlContent.includes('<HEAD>')) {
        htmlContent = htmlContent.replace('<HEAD>', `<HEAD>${cspMetaTag}`);
        console.log(`[Snapshot API V1] Injected CSP meta tag`);
      }

      // 检查是否是 V2 格式（包含 /api/snapshot-images/ 路径）
      const isV2 = htmlContent.includes('/api/snapshot-images/')
      
      if (isV2) {
        const version = (snapshot as Record<string, unknown>).version as number || 1
        
        // 处理图片 URL：规范化所有图片 URL，确保参数正确
        let replacedCount = 0
        htmlContent = htmlContent.replace(
          /\/api\/snapshot-images\/([a-zA-Z0-9._-]+?)(?:\?[^"\s)]*)?(?=["\s)]|$)/g,
          (_match: string, hash: string) => {
            replacedCount++
            // 只替换路径部分，不包含域名（避免重复）
            return `/api/snapshot-images/${hash}?u=${userId}&b=${bookmarkId}&v=${version}`;
          }
        )
        console.log(`[Snapshot API V1] V2 format detected, normalized ${replacedCount} image URLs`)
      }

      return new Response(htmlContent, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
          // 放宽 CSP 以允许加载快照中的所有资源（用户自己保存的内容）
          'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob:; font-src * data:; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval'; frame-src *; connect-src *;",
        },
      })
    } catch (error) {
      console.error('[Snapshot API V1] Get snapshot error:', error)
      return internalError('Failed to get snapshot')
    }
  },
]

// DELETE /api/v1/bookmarks/:id/snapshots/:snapshotId - 删除快照
export const onRequestDelete: PagesFunction<Env, 'id' | 'snapshotId', AuthContext>[] = [
  requireAuth,
  async (context) => {
    const userId = context.data.user_id
    const bookmarkId = context.params.id as string
    const snapshotId = context.params.snapshotId as string

    try {
      const db = context.env.DB
      const bucket = context.env.SNAPSHOTS_BUCKET

      if (!bucket) {
        return internalError('Storage not configured')
      }

      // 获取快照信息
      const snapshot = await db
        .prepare(
          `SELECT id, r2_key, is_latest, version
           FROM bookmark_snapshots
           WHERE id = ? AND bookmark_id = ? AND user_id = ?`
        )
        .bind(snapshotId, bookmarkId, userId)
        .first()

      if (!snapshot) {
        return notFound('Snapshot not found')
      }

      const version = (snapshot as Record<string, unknown>).version as number || 1

      // 删除 R2 HTML 文件
      await bucket.delete(snapshot.r2_key as string)

      // 删除 V2 格式的图片（如果存在）
      try {
        // 列出该版本的所有图片
        const imagePrefix = `${userId}/${bookmarkId}/v${version}/images/`
        const imageList = await bucket.list({ prefix: imagePrefix })
        
        if (imageList.objects && imageList.objects.length > 0) {
          console.log(`[Snapshot API V1] Deleting ${imageList.objects.length} images for version ${version}`)
          
          // 删除所有图片
          for (const obj of imageList.objects) {
            await bucket.delete(obj.key)
          }
        }
      } catch (error) {
        console.warn('[Snapshot API V1] Failed to delete images:', error)
        // 继续执行，不影响主流程
      }

      // 删除数据库记录
      await db
        .prepare('DELETE FROM bookmark_snapshots WHERE id = ?')
        .bind(snapshotId)
        .run()

      // 更新书签的快照计数（减1）
      await db
        .prepare(
          `UPDATE bookmarks 
           SET snapshot_count = MAX(0, snapshot_count - 1)
           WHERE id = ?`
        )
        .bind(bookmarkId)
        .run()

      // 如果删除的是最新快照，更新下一个为最新
      if (snapshot.is_latest) {
        const nextLatest = await db
          .prepare(
            `SELECT id FROM bookmark_snapshots
             WHERE bookmark_id = ? AND user_id = ?
             ORDER BY version DESC
             LIMIT 1`
          )
          .bind(bookmarkId, userId)
          .first()

        if (nextLatest) {
          await db
            .prepare(
              `UPDATE bookmark_snapshots 
               SET is_latest = 1 
               WHERE id = ?`
            )
            .bind(nextLatest.id)
            .run()
        } else {
          // 没有快照了，更新书签表
          await db
            .prepare(
              `UPDATE bookmarks 
               SET has_snapshot = 0, 
                   latest_snapshot_at = NULL,
                   snapshot_count = 0
               WHERE id = ?`
            )
            .bind(bookmarkId)
            .run()
        }
      }

      return new Response(JSON.stringify({ 
        success: true,
        data: { message: 'Snapshot deleted successfully' }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('[Snapshot API V1] Delete snapshot error:', error)
      return internalError('Failed to delete snapshot')
    }
  },
]
