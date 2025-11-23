/**
 * 图片上传到 R2 的工具函数（支持哈希去重）
 */

import type { R2Bucket, D1Database } from '@cloudflare/workers-types'
import { generateUUID } from './crypto'

interface UploadImageResult {
  success: boolean
  imageId?: string
  r2Url?: string
  originalUrl: string
  imageHash?: string
  fileSize?: number
  mimeType?: string
  isReused?: boolean // 是否复用了已存在的图片
  error?: string
}

interface ExistingImage {
  id: string
  r2_key: string
  file_size: number
  mime_type: string
}

/**
 * 从 URL 下载图片并上传到 R2（支持哈希去重）
 * @param imageUrl 原始图片 URL
 * @param userId 用户 ID
 * @param bookmarkId 书签 ID
 * @param bucket R2 Bucket
 * @param db D1 Database
 * @returns 上传结果
 */
export async function uploadCoverImageToR2(
  imageUrl: string,
  userId: string,
  bookmarkId: string,
  bucket: R2Bucket,
  db: D1Database
): Promise<UploadImageResult> {
  try {
    // 1. 下载图片
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000), // 10秒超时
    })

    if (!response.ok) {
      return {
        success: false,
        originalUrl: imageUrl,
        error: `Failed to download image: ${response.status}`,
      }
    }

    // 2. 获取图片数据
    const imageData = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const fileSize = imageData.byteLength

    // 3. 验证文件大小（限制 10MB）
    if (fileSize > 10 * 1024 * 1024) {
      return {
        success: false,
        originalUrl: imageUrl,
        error: 'Image too large (max 10MB)',
      }
    }

    // 4. 验证是否为图片
    if (!contentType.startsWith('image/')) {
      return {
        success: false,
        originalUrl: imageUrl,
        error: 'Not a valid image',
      }
    }

    // 5. 计算图片哈希（SHA-256）
    const imageHash = await calculateHash(imageData)

    // 6. 检查是否已存在相同哈希的图片（去重）
    const existing = await db
      .prepare('SELECT id, r2_key, file_size, mime_type FROM bookmark_images WHERE image_hash = ? LIMIT 1')
      .bind(imageHash)
      .first<ExistingImage>()

    let imageId: string
    let r2Key: string

    if (existing) {
      // 复用已存在的图片
      imageId = existing.id
      r2Key = existing.r2_key

      const r2Url = `https://r2.tmarks.app/${r2Key}` // 替换为你的 R2 公开域名

      return {
        success: true,
        imageId: imageId,
        r2Url: r2Url,
        originalUrl: imageUrl,
        imageHash: imageHash,
        fileSize: existing.file_size,
        mimeType: existing.mime_type,
        isReused: true,
      }
    }

    // 7. 生成新的 R2 key（使用哈希作为文件名，避免冲突）
    const ext = getExtensionFromContentType(contentType)
    r2Key = `images/${imageHash}${ext}`

    // 8. 上传到 R2
    await bucket.put(r2Key, imageData, {
      httpMetadata: {
        contentType: contentType,
      },
      customMetadata: {
        imageHash: imageHash,
        originalUrl: imageUrl,
        uploadedAt: new Date().toISOString(),
      },
    })

    // 9. 保存到数据库
    imageId = generateUUID()
    const now = new Date().toISOString()

    await db
      .prepare(
        `INSERT INTO bookmark_images 
         (id, bookmark_id, user_id, image_hash, r2_key, r2_bucket, file_size, mime_type, original_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'tmarks-snapshots', ?, ?, ?, ?, ?)`
      )
      .bind(imageId, bookmarkId, userId, imageHash, r2Key, fileSize, contentType, imageUrl, now, now)
      .run()

    // 10. 生成公开访问 URL
    const r2Url = `https://r2.tmarks.app/${r2Key}` // 替换为你的 R2 公开域名

    return {
      success: true,
      imageId: imageId,
      r2Url: r2Url,
      originalUrl: imageUrl,
      imageHash: imageHash,
      fileSize: fileSize,
      mimeType: contentType,
      isReused: false,
    }
  } catch (error) {
    return {
      success: false,
      originalUrl: imageUrl,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * 计算数据的 SHA-256 哈希
 */
async function calculateHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

/**
 * 从 Content-Type 获取文件扩展名
 */
function getExtensionFromContentType(contentType: string): string {
  const typeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
  }

  return typeMap[contentType.toLowerCase()] || '.jpg'
}

/**
 * 删除书签的封面图（从数据库和 R2）
 * 注意：只删除数据库记录，R2 文件可能被其他书签复用
 */
export async function deleteBookmarkImage(
  bookmarkId: string,
  db: D1Database,
  bucket: R2Bucket
): Promise<void> {
  try {
    // 1. 获取图片信息
    const image = await db
      .prepare('SELECT id, r2_key, image_hash FROM bookmark_images WHERE bookmark_id = ?')
      .bind(bookmarkId)
      .first<{ id: string; r2_key: string; image_hash: string }>()

    if (!image) {
      return
    }

    // 2. 检查是否有其他书签使用相同的图片（通过哈希）
    const { count } = await db
      .prepare('SELECT COUNT(*) as count FROM bookmark_images WHERE image_hash = ?')
      .bind(image.image_hash)
      .first<{ count: number }>() || { count: 0 }

    // 3. 删除数据库记录
    await db.prepare('DELETE FROM bookmark_images WHERE id = ?').bind(image.id).run()

    // 4. 如果没有其他书签使用这个图片，删除 R2 文件
    if (count <= 1) {
      await bucket.delete(image.r2_key)
    }
  } catch (error) {
    console.error('Failed to delete bookmark image:', error)
  }
}

/**
 * 清理孤立的图片（没有关联书签的图片）
 */
export async function cleanupOrphanedImages(db: D1Database, bucket: R2Bucket): Promise<number> {
  try {
    // 查找孤立的图片（bookmark_id 对应的书签不存在）
    const { results: orphaned } = await db
      .prepare(
        `SELECT bi.id, bi.r2_key, bi.image_hash
         FROM bookmark_images bi
         LEFT JOIN bookmarks b ON bi.bookmark_id = b.id
         WHERE b.id IS NULL`
      )
      .all<{ id: string; r2_key: string; image_hash: string }>()

    if (!orphaned || orphaned.length === 0) {
      return 0
    }

    let deletedCount = 0

    for (const image of orphaned) {
      // 检查是否有其他书签使用相同的图片
      const { count } = await db
        .prepare('SELECT COUNT(*) as count FROM bookmark_images WHERE image_hash = ?')
        .bind(image.image_hash)
        .first<{ count: number }>() || { count: 0 }

      // 删除数据库记录
      await db.prepare('DELETE FROM bookmark_images WHERE id = ?').bind(image.id).run()

      // 如果没有其他书签使用这个图片，删除 R2 文件
      if (count <= 1) {
        await bucket.delete(image.r2_key)
      }

      deletedCount++
    }

    return deletedCount
  } catch (error) {
    console.error('Failed to cleanup orphaned images:', error)
    return 0
  }
}
