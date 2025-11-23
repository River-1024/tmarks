import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { preferencesService } from '@/services/preferences'
import type { UpdatePreferencesRequest, UserPreferences } from '@/lib/types'
import { ApiError } from '@/lib/api-client'

export const PREFERENCES_QUERY_KEY = 'preferences'

// 从 localStorage 获取视图模式
function getStoredViewMode(): 'list' | 'card' | 'minimal' | 'title' | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem('tmarks:view_mode')
  const validModes: string[] = ['list', 'card', 'minimal', 'title']
  return stored && validModes.includes(stored) ? (stored as 'list' | 'card' | 'minimal' | 'title') : null
}

// 默认偏好设置
function getDefaultPreferences(): UserPreferences {
  // 优先使用 localStorage 中的视图模式
  const storedViewMode = getStoredViewMode()

  return {
    user_id: '',
    theme: 'light',
    page_size: 30,
    view_mode: storedViewMode || 'list',
    density: 'normal',
    tag_layout: 'grid',
    sort_by: 'popular',
    search_auto_clear_seconds: 15,
    tag_selection_auto_clear_seconds: 30,
    enable_search_auto_clear: true,
    enable_tag_selection_auto_clear: false,
    default_bookmark_icon: 'orbital-spinner',
    snapshot_retention_count: 5,
    snapshot_auto_create: false,
    snapshot_auto_dedupe: true,
    snapshot_auto_cleanup_days: 0,
    updated_at: new Date().toISOString(),
  }
}

/**
 * 获取用户偏好设置
 */
export function usePreferences() {
  return useQuery({
    queryKey: [PREFERENCES_QUERY_KEY],
    queryFn: async () => {
      try {
        return await preferencesService.getPreferences()
      } catch (error) {
        // 如果接口返回 404,使用默认偏好设置(包含 localStorage 中的视图模式)
        if (error instanceof ApiError && error.status === 404) {
          console.warn('Preferences API not found, using default preferences with localStorage view mode')
          return getDefaultPreferences()
        }
        throw error
      }
    },
    // 减少重试次数,避免频繁请求不存在的接口
    retry: (failureCount, error) => {
      // 404 错误不重试
      if (error instanceof ApiError && error.status === 404) {
        return false
      }
      // 其他错误最多重试 2 次
      return failureCount < 2
    },
    // 增加缓存时间,减少请求频率
    staleTime: 24 * 60 * 60 * 1000, // 24小时 (偏好很少变化)
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7天
  })
}

/**
 * 更新用户偏好设置
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdatePreferencesRequest) => preferencesService.updatePreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PREFERENCES_QUERY_KEY] })
    },
    onError: (error) => {
      // 静默处理错误,不影响用户体验
      // 偏好设置已经保存到 localStorage,即使服务器更新失败也不影响使用
      console.warn('Failed to update preferences on server, but local changes are saved:', error)
    },
    // 失败时不重试,避免频繁请求
    retry: false,
  })
}
