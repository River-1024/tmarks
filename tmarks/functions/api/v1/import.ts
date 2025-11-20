/**
 * 导入 API 端点
 * 支持多种格式的书签数据导入
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, RouteParams } from '../../lib/types'
import { requireAuth, type AuthContext } from '../../middleware/auth'
import type {
  ImportFormat,
  ImportOptions,
  ImportResult,
  ParsedBookmark,
  ParsedTag
} from '../../../shared/import-export-types'

import { createHtmlParser } from '../../lib/import-export/parsers/html-parser'
import { createJsonParser } from '../../lib/import-export/parsers/json-parser'
import { DEFAULT_IMPORT_OPTIONS } from '../../../shared/import-export-types'

interface ImportRequest {
  format: ImportFormat
  content: string
  options?: Partial<ImportOptions>
}

export const onRequestPost: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id

      const { format, content, options: userOptions } = await context.request.json() as ImportRequest

      if (!content || !format) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: format and content' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // 合并导入选项
      const options: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS, ...userOptions }

      // 解析导入数据
      const importData = await parseImportData(format, content)

      // 验证数据
      const validation = await validateImportData(format, importData)
      if (!validation.valid) {
        return new Response(
          JSON.stringify({
            error: 'Validation failed',
            errors: validation.errors,
            warnings: validation.warnings
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // 执行导入
      const result = await performImport(
        context.env.DB,
        userId,
        importData,
        options
      )

      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

    } catch (error) {
      console.error('Import error:', error)
      return new Response(
        JSON.stringify({
          error: 'Import failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
]

/**
 * 解析导入数据
 */
async function parseImportData(format: ImportFormat, content: string) {
  switch (format) {
    case 'html': {
      const htmlParser = createHtmlParser()
      return await htmlParser.parse(content)
    }

    case 'json':
    case 'tmarks': {
      const jsonParser = createJsonParser()
      return await jsonParser.parse(content)
    }

    default:
      throw new Error(`Unsupported import format: ${format}`)
  }
}

/**
 * 验证导入数据
 */
async function validateImportData(format: ImportFormat, data: ImportData) {
  switch (format) {
    case 'html': {
      const htmlParser = createHtmlParser()
      return await htmlParser.validate(data)
    }

    case 'json':
    case 'tmarks': {
      const jsonParser = createJsonParser()
      return await jsonParser.validate(data)
    }

    default:
      return { valid: false, errors: [{ field: 'format', message: 'Unsupported format' }], warnings: [] }
  }
}

/**
 * 执行导入操作
 */
async function performImport(
  db: D1Database, 
  userId: string, 
  importData: ImportData, 
  options: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    total: importData.bookmarks.length,
    errors: [],
    created_bookmarks: [],
    created_tags: []
  }

  try {
    // 1. 创建标签
    if (options.create_missing_tags) {
      await createTags(db, userId, importData.tags, result, options)
    }

    // 2. 获取现有书签URL（用于去重）
    const existingUrls = options.skip_duplicates 
      ? await getExistingUrls(db, userId)
      : new Set<string>()

    // 3. 分批处理书签
    const batches = chunkArray(importData.bookmarks, options.batch_size)
    
    for (const batch of batches) {
      await processBatch(db, userId, batch, existingUrls, result, options)
    }

    return result

  } catch (error) {
    console.error('Import execution error:', error)
    throw error
  }
}

/**
 * 创建标签
 */
async function createTags(
  db: D1Database, 
  userId: string, 
  tags: ParsedTag[], 
  result: ImportResult,
  options: ImportOptions
) {
  // 获取现有标签
  const { results: existingTags } = await db.prepare(
    'SELECT name FROM tags WHERE user_id = ? AND deleted_at IS NULL'
  ).bind(userId).all()

  const existingTagNames = new Set((existingTags || []).map((tag: Record<string, unknown>) => String(tag.name)))

  // 创建新标签
  for (const tag of tags) {
    if (!existingTagNames.has(tag.name)) {
      try {
        const tagId = crypto.randomUUID()
        await db.prepare(`
          INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          tagId,
          userId,
          tag.name,
          tag.color || options.default_tag_color
        ).run()

        result.created_tags.push(tagId)
      } catch (error) {
        console.error(`Failed to create tag: ${tag.name}`, error)
      }
    }
  }
}

/**
 * 获取现有书签URL
 */
async function getExistingUrls(db: D1Database, userId: string): Promise<Set<string>> {
  const { results: bookmarks } = await db.prepare(
    'SELECT url FROM bookmarks WHERE user_id = ? AND deleted_at IS NULL'
  ).bind(userId).all()

  return new Set((bookmarks || []).map((bookmark: Record<string, unknown>) => String(bookmark.url)))
}

/**
 * 分批处理书签
 */
async function processBatch(
  db: D1Database,
  userId: string,
  bookmarks: ParsedBookmark[],
  existingUrls: Set<string>,
  result: ImportResult,
  options: ImportOptions
) {
  for (let i = 0; i < bookmarks.length; i++) {
    const bookmark = bookmarks[i]

    try {
      // 检查重复（这里的检查可能不够准确，让createBookmark函数处理）
      // if (options.skip_duplicates && existingUrls.has(bookmark.url)) {
      //   result.skipped++
      //   continue
      // }

      // 创建书签
      const bookmarkId = await createBookmark(db, userId, bookmark, options)

      if (bookmarkId) {
        result.created_bookmarks.push(bookmarkId)

        // 关联标签 - 如果没有标签,自动添加"未分类"标签
        if (bookmark.tags.length > 0) {
          await associateBookmarkTags(db, userId, bookmarkId, bookmark.tags)
        } else {
          // 无标签书签自动添加"未分类"标签
          await ensureUncategorizedTag(db, userId, bookmarkId)
        }

        result.success++
      } else {
        // bookmarkId为null表示跳过（重复等）
        result.skipped++
      }

    } catch (error) {
      result.failed++
      result.errors.push({
        index: i,
        item: bookmark,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'BOOKMARK_CREATION_FAILED'
      })
    }
  }
}

/**
 * 创建单个书签
 */
async function createBookmark(
  db: D1Database,
  userId: string,
  bookmark: ParsedBookmark,
  options: ImportOptions
): Promise<string | null> {
  try {
    // 检查URL是否已存在（包括已删除的）
    const existing = await db.prepare(
      'SELECT id, deleted_at FROM bookmarks WHERE user_id = ? AND url = ?'
    )
      .bind(userId, bookmark.url)
      .first<{ id: string; deleted_at: string | null }>()

    const now = new Date().toISOString()
    const createdAt = options.preserve_timestamps && bookmark.created_at
      ? bookmark.created_at
      : now

    if (existing) {
      if (!existing.deleted_at) {
        // URL已存在且未删除，跳过或抛出错误
        if (options.skip_duplicates) {
          console.log('Skipping duplicate URL:', bookmark.url)
          return null
        } else {
          throw new Error(`Bookmark with URL already exists: ${bookmark.url}`)
        }
      }

      // 恢复已删除的书签
      await db.prepare(
        `UPDATE bookmarks
         SET title = ?, description = ?, cover_image = ?,
             is_archived = 0,
             deleted_at = NULL, updated_at = ?
         WHERE id = ?`
      )
        .bind(
          bookmark.title,
          bookmark.description || null,
          bookmark.cover_image || null,
          now,
          existing.id
        )
        .run()

      return existing.id
    } else {
      // 创建新书签
      const bookmarkId = crypto.randomUUID()

      await db.prepare(`
        INSERT INTO bookmarks (
          id, user_id, title, url, description, cover_image,
          is_pinned, is_archived, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        bookmarkId,
        userId,
        bookmark.title,
        bookmark.url,
        bookmark.description || null,
        bookmark.cover_image || null,
        false, // 导入的书签默认不置顶
        false, // 导入的书签默认不归档
        createdAt,
        now
      ).run()

      return bookmarkId
    }

  } catch (error) {
    console.error('Failed to create bookmark:', bookmark.url, error)

    // 检查是否是UNIQUE约束错误
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      console.log('Duplicate URL detected via constraint:', bookmark.url)
      if (options.skip_duplicates) {
        return null // 跳过重复项
      }
    }

    throw error // 重新抛出错误让上层处理
  }
}

/**
 * 关联书签和标签
 */
async function associateBookmarkTags(
  db: D1Database,
  userId: string,
  bookmarkId: string,
  tagNames: string[]
) {
  // 获取标签ID
  interface TagRow {
    id: string
    name: string
  }
  
  const placeholders = tagNames.map(() => '?').join(',')
  const { results: tags } = await db.prepare(`
    SELECT id, name FROM tags 
    WHERE user_id = ? AND name IN (${placeholders}) AND deleted_at IS NULL
  `).bind(userId, ...tagNames).all<TagRow>()

  // 创建关联
  for (const tag of tags || []) {
    try {
      await db.prepare(`
        INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id, user_id, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(bookmarkId, tag.id, userId).run()
    } catch (error) {
      console.error('Failed to associate tag:', tag.name, error)
    }
  }
}

/**
 * 确保无标签书签有"未分类"标签
 */
async function ensureUncategorizedTag(
  db: D1Database,
  userId: string,
  bookmarkId: string
) {
  const UNCATEGORIZED_TAG_NAME = '未分类'

  try {
    // 检查"未分类"标签是否存在
    let uncategorizedTag = await db.prepare(
      'SELECT id FROM tags WHERE user_id = ? AND name = ? AND deleted_at IS NULL'
    ).bind(userId, UNCATEGORIZED_TAG_NAME).first<{ id: string }>()

    // 如果不存在,创建"未分类"标签
    if (!uncategorizedTag) {
      const tagId = crypto.randomUUID()
      await db.prepare(
        `INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).bind(tagId, userId, UNCATEGORIZED_TAG_NAME, '#9ca3af').run()

      uncategorizedTag = { id: tagId }
    }

    // 关联书签和"未分类"标签
    await db.prepare(
      `INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id, user_id, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).bind(bookmarkId, uncategorizedTag.id, userId).run()

  } catch (error) {
    console.error('Failed to add uncategorized tag:', error)
    // 不抛出错误,允许书签创建成功
  }
}

/**
 * 数组分块工具函数
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

/**
 * 获取导入预览
 */
export const onRequestGet: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const { searchParams } = new URL(context.request.url)
      const format = searchParams.get('format') as ImportFormat
      // const preview = searchParams.get('preview') === 'true' // 预留用于未来实现预览功能

      if (!format) {
        return new Response(
          JSON.stringify({ error: 'Missing format parameter' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // 返回支持的格式信息
      const formatInfo = {
        format,
        supported: ['html', 'json', 'tmarks'].includes(format),
        description: getFormatDescription(format),
        file_extensions: getFormatExtensions(format)
      }

      return new Response(
        JSON.stringify(formatInfo),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

    } catch (error) {
      console.error('Import preview error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to get import preview' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
]

function getFormatDescription(format: ImportFormat): string {
  switch (format) {
    case 'html':
      return 'Netscape bookmark format (exported from browsers)'
    case 'json':
      return 'Generic JSON bookmark format'
    case 'tmarks':
      return 'TMarks native export format'
    default:
      return 'Unknown format'
  }
}

function getFormatExtensions(format: ImportFormat): string[] {
  switch (format) {
    case 'html':
      return ['.html', '.htm']
    case 'json':
    case 'tmarks':
      return ['.json']
    default:
      return []
  }
}
