/**
 * 快照查看 API - 使用签名 URL
 * 路径: /api/v1/bookmarks/:id/snapshots/:snapshotId/view
 * 认证: 签名 URL（无需 JWT Token）
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env } from '../../../../../../lib/types'
import { unauthorized, notFound, internalError } from '../../../../../../lib/response'
import { verifySignedUrl, extractSignedParams } from '../../../../../../lib/signed-url'

// GET /api/v1/bookmarks/:id/snapshots/:snapshotId/view - 使用签名 URL 查看快照
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const bookmarkId = context.params.id as string
    const snapshotId = context.params.snapshotId as string
    const db = context.env.DB
    const bucket = context.env.SNAPSHOTS_BUCKET

    if (!bucket) {
      return internalError('Storage not configured')
    }

    // 提取签名参数
    const { signature, expires, userId, action } = extractSignedParams(context.request as unknown as Request)

    if (!signature || !expires || !userId) {
      return unauthorized('Missing signature parameters')
    }

    // 验证签名
    const verification = await verifySignedUrl(
      signature,
      expires,
      userId,
      snapshotId,
      context.env.JWT_SECRET,
      action || undefined
    )

    if (!verification.valid) {
      return unauthorized(verification.error || 'Invalid signature')
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

    // 读取 HTML 内容
    let htmlContent = await r2Object.text()
    
    const htmlSize = new Blob([htmlContent]).size
    console.log(`[Snapshot View API] Retrieved from R2: ${(htmlSize / 1024).toFixed(1)}KB`)

    // 注入宽松的 CSP meta 标签到 HTML head 中（覆盖任何默认设置）
    const cspMetaTag = '<meta http-equiv="Content-Security-Policy" content="default-src * \'unsafe-inline\' \'unsafe-eval\' data: blob:; img-src * data: blob:; font-src * data:; style-src * \'unsafe-inline\'; script-src * \'unsafe-inline\' \'unsafe-eval\'; frame-src *; connect-src *;">';
    if (htmlContent.includes('<head>')) {
      htmlContent = htmlContent.replace('<head>', `<head>${cspMetaTag}`);
      console.log(`[Snapshot View API] Injected CSP meta tag`);
    } else if (htmlContent.includes('<HEAD>')) {
      htmlContent = htmlContent.replace('<HEAD>', `<HEAD>${cspMetaTag}`);
      console.log(`[Snapshot View API] Injected CSP meta tag`);
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
      console.log(`[Snapshot View API] V2 format detected, normalized ${replacedCount} image URLs`)
    }

    return new Response(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        // 放宽 CSP 以允许加载快照中的所有资源（用户自己保存的内容）
        'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob:; font-src * data:; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval'; frame-src *; connect-src *;",
        // 添加 CORS 头，允许跨域加载资源
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    console.error('[Snapshot View API] Error:', error)
    return internalError('Failed to get snapshot')
  }
}
