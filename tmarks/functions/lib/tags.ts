import { generateUUID } from './crypto'

/**
 * 创建或链接标签到书签
 * 自动处理标签的创建、查找和链接
 * 
 * @param db - D1 数据库实例
 * @param bookmarkId - 书签 ID
 * @param tagNames - 标签名称数组
 * @param userId - 用户 ID
 */
export async function createOrLinkTags(
  db: D1Database,
  bookmarkId: string,
  tagNames: string[],
  userId: string
): Promise<void> {
  if (!tagNames || tagNames.length === 0) return

  const now = new Date().toISOString()

  // 去除空值并按大小写不敏感去重，避免批量输入重复触发冲突
  const seenNames = new Set<string>()
  const normalizedNames: string[] = []
  for (const name of tagNames) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const lower = trimmed.toLowerCase()
    if (seenNames.has(lower)) continue
    seenNames.add(lower)
    normalizedNames.push(trimmed)
  }
  if (normalizedNames.length === 0) return

  // 构建 IN 查询的占位符
  const placeholders = normalizedNames.map(() => '?').join(',')
  const { results: existingTags } = await db
    .prepare(`SELECT id, name, deleted_at FROM tags WHERE user_id = ? AND LOWER(name) IN (${placeholders})`)
    .bind(userId, ...normalizedNames.map(name => name.toLowerCase()))
    .all<{ id: string; name: string; deleted_at: string | null }>()

  // 创建标签名称到 ID 的映射（不区分大小写）
  const tagMap = new Map<string, string>()
  const restoreStatements: D1PreparedStatement[] = []
  for (const tag of existingTags || []) {
    const lower = tag.name.toLowerCase()
    if (tag.deleted_at) {
      // 恢复软删除标签，避免命中 UNIQUE(user_id, name) 冲突
      restoreStatements.push(
        db
          .prepare('UPDATE tags SET deleted_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?')
          .bind(now, tag.id, userId)
      )
    }
    tagMap.set(lower, tag.id)
  }

  if (restoreStatements.length > 0) {
    await db.batch(restoreStatements)
  }

  // 找出需要创建的新标签
  const tagsToCreate = normalizedNames.filter(name => !tagMap.has(name.toLowerCase()))

  // 批量创建新标签
  if (tagsToCreate.length > 0) {
    // 使用事务批量插入（D1 支持批量操作）
    const insertStatements = tagsToCreate.map(name => {
      const tagId = generateUUID()
      tagMap.set(name.toLowerCase(), tagId)
      return db
        .prepare('INSERT INTO tags (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(tagId, userId, name, now, now)
    })

    // 批量执行插入
    await db.batch(insertStatements)
  }

  // 批量链接标签到书签
  const linkStatements = normalizedNames.map(name => {
    const tagId = tagMap.get(name.toLowerCase())
    if (!tagId) {
      console.error(`[createOrLinkTags] Tag ID not found for: ${name}`)
      return null
    }
    return db
      .prepare('INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id, user_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(bookmarkId, tagId, userId, now)
  }).filter(stmt => stmt !== null) as D1PreparedStatement[]

  if (linkStatements.length > 0) {
    await db.batch(linkStatements)
  }
}
