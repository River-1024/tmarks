/**
 * 输入清理和验证工具
 * 防止 XSS、SQL 注入等安全问题
 */

/**
 * HTML 实体编码
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  }
  
  return text.replace(/[&<>"'/]/g, (s) => map[s])
}

/**
 * 清理用户输入的字符串
 */
export function sanitizeString(input: string, options: {
  maxLength?: number
  allowHtml?: boolean
  trimWhitespace?: boolean
} = {}): string {
  const {
    maxLength = 1000,
    allowHtml = false,
    trimWhitespace = true
  } = options
  
  let result = input
  
  // 去除首尾空白
  if (trimWhitespace) {
    result = result.trim()
  }
  
  // 限制长度
  if (result.length > maxLength) {
    result = result.substring(0, maxLength)
  }
  
  // HTML 编码（如果不允许 HTML）
  if (!allowHtml) {
    result = escapeHtml(result)
  }
  
  return result
}

/**
 * 验证和清理 URL
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim())
    
    // 只允许 HTTP 和 HTTPS 协议
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null
    }
    
    // 防止 JavaScript 协议
    if (parsed.protocol === 'javascript:') {
      return null
    }
    
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * 验证和清理邮箱地址
 */
export function sanitizeEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase()
  
  // 基本邮箱格式验证
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(trimmed)) {
    return null
  }
  
  // 长度限制
  if (trimmed.length > 254) {
    return null
  }
  
  return trimmed
}

/**
 * 验证和清理用户名
 */
export function sanitizeUsername(username: string): string | null {
  const trimmed = username.trim()
  
  // 用户名规则：3-20个字符，只允许字母、数字、下划线
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
  if (!usernameRegex.test(trimmed)) {
    return null
  }
  
  return trimmed
}

/**
 * 清理标签名称
 */
export function sanitizeTagName(tagName: string): string | null {
  const trimmed = tagName.trim()
  
  // 标签名称限制：1-50个字符，不允许特殊字符
  if (trimmed.length === 0 || trimmed.length > 50) {
    return null
  }
  
  // 移除危险字符
  const cleaned = trimmed.replace(/[<>"'&]/g, '')
  
  if (cleaned.length === 0) {
    return null
  }
  
  return cleaned
}

/**
 * 清理文件名
 */
export function sanitizeFileName(fileName: string): string {
  // 移除路径分隔符和危险字符
  return fileName
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .trim()
    .substring(0, 255)
}

/**
 * 验证颜色值
 */
export function sanitizeColor(color: string): string | null {
  const trimmed = color.trim()
  
  // 支持 hex 颜色格式
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  if (hexRegex.test(trimmed)) {
    return trimmed.toLowerCase()
  }
  
  // 支持预定义颜色名称
  const allowedColors = [
    'red', 'blue', 'green', 'yellow', 'orange', 'purple', 
    'pink', 'cyan', 'gray', 'black', 'white'
  ]
  
  if (allowedColors.includes(trimmed.toLowerCase())) {
    return trimmed.toLowerCase()
  }
  
  return null
}

/**
 * 清理搜索查询
 */
export function sanitizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/[<>"'&]/g, '') // 移除危险字符
    .substring(0, 100) // 限制长度
}

/**
 * 验证分页参数
 */
export function sanitizePaginationParams(params: {
  page?: string | number
  pageSize?: string | number
  cursor?: string
}): {
  page: number
  pageSize: number
  cursor?: string
} {
  const page = Math.max(1, parseInt(String(params.page || 1)))
  const pageSize = Math.min(100, Math.max(1, parseInt(String(params.pageSize || 30))))
  
  const result: { page: number; pageSize: number; cursor?: string } = { page, pageSize }
  
  if (params.cursor && typeof params.cursor === 'string') {
    // 简单验证游标格式（这里假设是 UUID 或数字）
    if (/^[a-zA-Z0-9-]+$/.test(params.cursor)) {
      result.cursor = params.cursor
    }
  }
  
  return result
}

/**
 * 批量清理对象属性
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  rules: Partial<Record<keyof T, (value: unknown) => unknown>>
): Partial<T> {
  const result: Partial<T> = {}

  for (const [key, value] of Object.entries(obj)) {
    const rule = rules[key as keyof T]
    if (rule && value !== undefined && value !== null) {
      const sanitized = rule(value)
      if (sanitized !== null && sanitized !== undefined) {
        result[key as keyof T] = sanitized
      }
    }
  }

  return result
}

/**
 * 验证 JSON 结构
 */
export function validateJsonStructure(
  data: unknown,
  schema: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>
): boolean {
  if (typeof data !== 'object' || data === null) {
    return false
  }
  
  const obj = data as Record<string, unknown>
  
  for (const [key, expectedType] of Object.entries(schema)) {
    const value = obj[key]
    
    switch (expectedType) {
      case 'string':
        if (typeof value !== 'string') return false
        break
      case 'number':
        if (typeof value !== 'number') return false
        break
      case 'boolean':
        if (typeof value !== 'boolean') return false
        break
      case 'array':
        if (!Array.isArray(value)) return false
        break
      case 'object':
        if (typeof value !== 'object' || value === null) return false
        break
    }
  }
  
  return true
}
