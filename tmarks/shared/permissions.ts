/**
 * 权限系统 - 前后端共享
 * 定义所有 API Key 权限常量和工具函数
 */

/**
 * 权限常量
 */
export const PERMISSIONS = {
  // 书签权限
  BOOKMARKS_CREATE: 'bookmarks.create',
  BOOKMARKS_READ: 'bookmarks.read',
  BOOKMARKS_UPDATE: 'bookmarks.update',
  BOOKMARKS_DELETE: 'bookmarks.delete',
  BOOKMARKS_ALL: 'bookmarks.*',

  // 标签权限
  TAGS_CREATE: 'tags.create',
  TAGS_READ: 'tags.read',
  TAGS_UPDATE: 'tags.update',
  TAGS_DELETE: 'tags.delete',
  TAGS_ASSIGN: 'tags.assign',
  TAGS_ALL: 'tags.*',

  // 收纳（标签页组）权限
  TAB_GROUPS_CREATE: 'tab_groups.create',
  TAB_GROUPS_READ: 'tab_groups.read',
  TAB_GROUPS_UPDATE: 'tab_groups.update',
  TAB_GROUPS_DELETE: 'tab_groups.delete',
  TAB_GROUPS_ALL: 'tab_groups.*',

  // AI 权限
  AI_SUGGEST: 'ai.suggest',

  // 用户权限
  USER_READ: 'user.read',
  USER_PREFERENCES_READ: 'user.preferences.read',
} as const

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS]

/**
 * 权限模板
 */
export const PERMISSION_TEMPLATES = {
  READ_ONLY: {
    name: '只读',
    description: '仅查看数据，不能修改',
    permissions: [
      PERMISSIONS.BOOKMARKS_READ,
      PERMISSIONS.TAGS_READ,
      PERMISSIONS.USER_READ,
    ] as string[],
  },

  BASIC: {
    name: '基础使用',
    description: '可以添加书签和标签，但不能删除',
    permissions: [
      PERMISSIONS.BOOKMARKS_CREATE,
      PERMISSIONS.BOOKMARKS_READ,
      PERMISSIONS.TAGS_CREATE,
      PERMISSIONS.TAGS_READ,
      PERMISSIONS.TAGS_ASSIGN,
      PERMISSIONS.USER_READ,
    ] as string[],
  },

  FULL: {
    name: '完整权限',
    description: '拥有所有操作权限',
    permissions: [
      PERMISSIONS.BOOKMARKS_ALL,
      PERMISSIONS.TAGS_ALL,
      PERMISSIONS.TAB_GROUPS_ALL,
      PERMISSIONS.AI_SUGGEST,
      PERMISSIONS.USER_READ,
    ] as string[],
  },
} as const

export type PermissionTemplate = keyof typeof PERMISSION_TEMPLATES

/**
 * 检查是否有权限
 * @param userPermissions 用户拥有的权限列表
 * @param requiredPermission 需要的权限
 * @returns 是否有权限
 */
export function hasPermission(
  userPermissions: string[],
  requiredPermission: string
): boolean {
  return userPermissions.some(p => {
    // 完全匹配
    if (p === requiredPermission) return true

    // 通配符匹配：bookmarks.* 匹配 bookmarks.create
    if (p.endsWith('.*')) {
      const prefix = p.slice(0, -2)
      return requiredPermission.startsWith(prefix + '.')
    }

    return false
  })
}

/**
 * 获取权限的中文显示名称
 * @param permission 权限字符串
 * @returns 中文名称
 */
export function getPermissionLabel(permission: string): string {
  const labels: Record<string, string> = {
    'bookmarks.create': '创建书签',
    'bookmarks.read': '读取书签',
    'bookmarks.update': '更新书签',
    'bookmarks.delete': '删除书签',
    'bookmarks.*': '所有书签权限',
    'tags.create': '创建标签',
    'tags.read': '读取标签',
    'tags.update': '更新标签',
    'tags.delete': '删除标签',
    'tags.assign': '分配标签',
    'tags.*': '所有标签权限',
    'tab_groups.create': '创建收纳',
    'tab_groups.read': '读取收纳',
    'tab_groups.update': '更新收纳',
    'tab_groups.delete': '删除收纳',
    'tab_groups.*': '所有收纳权限',
    'ai.suggest': 'AI 智能建议',
    'user.read': '读取用户信息',
    'user.preferences.read': '读取用户偏好',
  }

  return labels[permission] || permission
}

/**
 * 获取权限的分组
 */
export function getPermissionGroups(): Array<{
  name: string
  permissions: Array<{ value: string; label: string }>
}> {
  return [
    {
      name: '书签',
      permissions: [
        { value: PERMISSIONS.BOOKMARKS_CREATE, label: getPermissionLabel(PERMISSIONS.BOOKMARKS_CREATE) },
        { value: PERMISSIONS.BOOKMARKS_READ, label: getPermissionLabel(PERMISSIONS.BOOKMARKS_READ) },
        { value: PERMISSIONS.BOOKMARKS_UPDATE, label: getPermissionLabel(PERMISSIONS.BOOKMARKS_UPDATE) },
        { value: PERMISSIONS.BOOKMARKS_DELETE, label: getPermissionLabel(PERMISSIONS.BOOKMARKS_DELETE) },
      ],
    },
    {
      name: '标签',
      permissions: [
        { value: PERMISSIONS.TAGS_CREATE, label: getPermissionLabel(PERMISSIONS.TAGS_CREATE) },
        { value: PERMISSIONS.TAGS_READ, label: getPermissionLabel(PERMISSIONS.TAGS_READ) },
        { value: PERMISSIONS.TAGS_UPDATE, label: getPermissionLabel(PERMISSIONS.TAGS_UPDATE) },
        { value: PERMISSIONS.TAGS_DELETE, label: getPermissionLabel(PERMISSIONS.TAGS_DELETE) },
        { value: PERMISSIONS.TAGS_ASSIGN, label: getPermissionLabel(PERMISSIONS.TAGS_ASSIGN) },
      ],
    },
    {
      name: '收纳',
      permissions: [
        { value: PERMISSIONS.TAB_GROUPS_CREATE, label: getPermissionLabel(PERMISSIONS.TAB_GROUPS_CREATE) },
        { value: PERMISSIONS.TAB_GROUPS_READ, label: getPermissionLabel(PERMISSIONS.TAB_GROUPS_READ) },
        { value: PERMISSIONS.TAB_GROUPS_UPDATE, label: getPermissionLabel(PERMISSIONS.TAB_GROUPS_UPDATE) },
        { value: PERMISSIONS.TAB_GROUPS_DELETE, label: getPermissionLabel(PERMISSIONS.TAB_GROUPS_DELETE) },
      ],
    },
    {
      name: '其他',
      permissions: [
        { value: PERMISSIONS.AI_SUGGEST, label: getPermissionLabel(PERMISSIONS.AI_SUGGEST) },
        { value: PERMISSIONS.USER_READ, label: getPermissionLabel(PERMISSIONS.USER_READ) },
      ],
    },
  ]
}
