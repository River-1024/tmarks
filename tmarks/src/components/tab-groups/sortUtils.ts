/**
 * 排序工具函数
 */

export type SortOption = 'created' | 'title' | 'count'

export function sortTabGroups<T extends { title: string; created_at: string; item_count?: number }>(
  groups: T[],
  sortBy: SortOption
): T[] {
  const sorted = [...groups]

  switch (sortBy) {
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    case 'count':
      return sorted.sort((a, b) => (b.item_count || 0) - (a.item_count || 0))
    case 'created':
    default:
      return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
}
