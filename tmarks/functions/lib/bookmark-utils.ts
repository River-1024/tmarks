import type { Bookmark, BookmarkRow } from './types'

/**
 * 将数据库行转换为标准 Bookmark 对象
 * 处理 SQLite 的 0/1 到 boolean 的转换
 */
export function normalizeBookmark(row: BookmarkRow): Bookmark {
  return {
    ...row,
    is_pinned: Boolean(row.is_pinned),
    is_archived: Boolean(row.is_archived),
    is_public: Boolean(row.is_public),
    click_count: Number(row.click_count || 0),
    has_snapshot: Boolean(row.has_snapshot),
    snapshot_count: Number(row.snapshot_count || 0),
  }
}
