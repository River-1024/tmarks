/**
 * 安全中间件
 * 提供安全头、CSP策略、输入验证等安全功能
 */

import type { PagesFunction } from '@cloudflare/workers-types'

/**
 * 安全头中间件
 */
export const securityHeaders: PagesFunction = async (context) => {
  const response = await context.next()
  
  // 创建新的响应头
  const newHeaders = new Headers(response.headers)
  
  // 检查是否是快照查看路径（这些路径需要宽松的 CSP）
  const url = new URL(context.request.url)
  const isSnapshotView = url.pathname.includes('/snapshots/') && 
                         (url.pathname.includes('/view') || url.searchParams.has('sig'))
  
  // 安全头配置
  const securityHeaders = {
    // 防止点击劫持（快照查看除外）
    ...(!isSnapshotView && { 'X-Frame-Options': 'DENY' }),
    
    // 防止 MIME 类型嗅探
    'X-Content-Type-Options': 'nosniff',
    
    // XSS 保护
    'X-XSS-Protection': '1; mode=block',
    
    // 引用者策略
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // 权限策略
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    
    // 内容安全策略（快照查看使用宽松策略）
    ...(!isSnapshotView && {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // React 需要 unsafe-inline
        "style-src 'self' 'unsafe-inline'", // Tailwind 需要 unsafe-inline
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ')
    }),
    
    // HSTS (仅在 HTTPS 环境下)
    ...(context.request.url.startsWith('https://') && {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
    })
  }
  
  // 添加安全头（跳过 undefined 值）
  Object.entries(securityHeaders).forEach(([key, value]) => {
    if (value) {
      newHeaders.set(key, value)
    }
  })
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}

/**
 * CORS 配置中间件
 */
export const corsHeaders: PagesFunction = async (context) => {
  // 从环境变量获取允许的源
  const allowedOriginsEnv = (context.env as { CORS_ALLOWED_ORIGINS?: string })?.CORS_ALLOWED_ORIGINS

  // 处理预检请求
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': getAllowedOrigin(context.request, allowedOriginsEnv),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  const response = await context.next()
  const newHeaders = new Headers(response.headers)

  // 添加 CORS 头
  newHeaders.set('Access-Control-Allow-Origin', getAllowedOrigin(context.request, allowedOriginsEnv))
  newHeaders.set('Access-Control-Allow-Credentials', 'true')
  newHeaders.set('Vary', 'Origin')
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}

/**
 * 获取允许的源
 * @param request 请求对象
 * @param allowedOriginsEnv 环境变量中的允许源列表（逗号分隔）
 */
function getAllowedOrigin(request: Request, allowedOriginsEnv?: string): string {
  const origin = request.headers.get('Origin')

  // 默认允许的源列表（开发环境）
  const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
  ]

  // 从环境变量解析允许的源（生产环境配置）
  const envOrigins = allowedOriginsEnv
    ? allowedOriginsEnv.split(',').map(o => o.trim()).filter(Boolean)
    : []

  // 合并默认和环境变量中的源
  const allowedOrigins = [...defaultOrigins, ...envOrigins]

  // 如果是 Chrome 扩展的请求，允许所有 chrome-extension:// 来源
  if (origin && origin.startsWith('chrome-extension://')) {
    return origin
  }

  // 如果是 Edge 扩展的请求，允许所有 extension:// 来源
  if (origin && origin.startsWith('extension://')) {
    return origin
  }

  // 如果是 Firefox 扩展的请求，允许所有 moz-extension:// 来源
  if (origin && origin.startsWith('moz-extension://')) {
    return origin
  }

  if (origin && allowedOrigins.includes(origin)) {
    return origin
  }

  // 如果没有 Origin 头（可能是服务器端请求或扩展请求），返回 *
  if (!origin) {
    return '*'
  }

  // 默认返回第一个允许的源
  return allowedOrigins[0] || '*'
}

/**
 * 输入验证中间件
 */
export function validateInput<T>(validator: (data: unknown) => data is T) {
  return async (context: { request: Request; next: () => Promise<Response>; validatedData?: T }) => {
    if (context.request.method === 'POST' || context.request.method === 'PUT' || context.request.method === 'PATCH') {
      try {
        const body = await context.request.json()

        if (!validator(body)) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'INVALID_INPUT',
                message: 'Invalid request body format'
              }
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }
          )
        }

        // 将验证后的数据附加到 context
        context.validatedData = body
      } catch {
        return new Response(
          JSON.stringify({
            error: {
              code: 'INVALID_JSON',
              message: 'Invalid JSON format'
            }
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
    }

    return context.next()
  }
}

/**
 * 速率限制中间件（基于 IP）
 * 注意：此函数当前仅作为占位符，实际速率限制逻辑在 rate-limit.ts 中实现
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function rateLimitByIP(_limit: number, _windowSeconds: number) {
  return async (context: { request: Request; next: () => Promise<Response> }) => {
    // 获取 IP 地址用于将来的速率限制实现
    // const ip = context.request.headers.get('CF-Connecting-IP') ||
    //            context.request.headers.get('X-Forwarded-For') ||
    //            'unknown'

    // 这里可以集成到现有的速率限制系统
    // 暂时返回继续执行
    return context.next()
  }
}

/**
 * 日志记录中间件
 */
export const requestLogger: PagesFunction = async (context) => {
  const start = Date.now()
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown'
  const userAgent = context.request.headers.get('User-Agent') || 'unknown'
  
  try {
    const response = await context.next()
    const duration = Date.now() - start
    
    // 记录请求日志
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: context.request.method,
      url: context.request.url,
      status: response.status,
      duration,
      ip,
      userAgent: userAgent.substring(0, 100), // 限制长度
    }))
    
    return response
  } catch (error) {
    const duration = Date.now() - start
    
    // 记录错误日志
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: context.request.method,
      url: context.request.url,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
      ip,
      userAgent: userAgent.substring(0, 100),
    }))
    
    throw error
  }
}

/**
 * 组合安全中间件
 */
export const securityMiddleware: PagesFunction = async (context) => {
  // 依次应用安全中间件
  return securityHeaders(context)
}
