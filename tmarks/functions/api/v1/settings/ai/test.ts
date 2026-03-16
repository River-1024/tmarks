/**
 * AI 连接测试 API
 * 测试 AI 服务配置是否正确
 */

import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env, RouteParams } from '../../../../lib/types'
import { success, badRequest, internalError } from '../../../../lib/response'
import { requireAuth, AuthContext } from '../../../../middleware/auth'
import { writeAuditLog } from '../../../../lib/audit-log'

// AI 服务商类型
type AIProvider = 'openai' | 'claude' | 'deepseek' | 'zhipu' | 'modelscope' | 'siliconflow' | 'iflow' | 'custom'

// 请求类型
interface TestAIRequest {
  provider: AIProvider
  api_key: string
  api_url?: string
  model?: string
}

// 默认 API URLs
const DEFAULT_API_URLS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  modelscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  iflow: 'https://api.iflow.cn/v1',
  custom: ''
}

// 默认模型
const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  claude: 'claude-3-haiku-20240307',
  deepseek: 'deepseek-chat',
  zhipu: 'glm-4-flash',
  modelscope: 'qwen-turbo',
  siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
  iflow: 'gpt-4o-mini',
  custom: 'gpt-4o-mini'
}

/**
 * 测试 OpenAI 兼容 API
 */
async function testOpenAICompatible(
  apiUrl: string,
  apiKey: string,
  model: string
): Promise<{ success: boolean; latency: number; error?: string }> {
  const startTime = Date.now()
  
  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: 'Hi' }
        ],
        max_tokens: 5
      })
    })
    
    const latency = Date.now() - startTime
    
    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        latency,
        error: `API error (${response.status}): ${errorText.substring(0, 200)}`
      }
    }
    
    return { success: true, latency }
  } catch (error) {
    return {
      success: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * 测试 Claude API
 */
async function testClaude(
  apiUrl: string,
  apiKey: string,
  model: string
): Promise<{ success: boolean; latency: number; error?: string }> {
  const startTime = Date.now()
  
  try {
    const response = await fetch(`${apiUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 5,
        messages: [
          { role: 'user', content: 'Hi' }
        ]
      })
    })
    
    const latency = Date.now() - startTime
    
    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        latency,
        error: `API error (${response.status}): ${errorText.substring(0, 200)}`
      }
    }
    
    return { success: true, latency }
  } catch (error) {
    return {
      success: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// POST /api/v1/settings/ai/test - 测试 AI 连接
export const onRequestPost: PagesFunction<Env, RouteParams, AuthContext>[] = [
  requireAuth,
  async (context) => {
    try {
      const userId = context.data.user_id
      const body = await context.request.json() as TestAIRequest
      const ip = context.request.headers.get('CF-Connecting-IP')
      const userAgent = context.request.headers.get('User-Agent')
      
      // 验证必填字段
      if (!body.provider) {
        return badRequest('Provider is required')
      }
      
      if (!body.api_key) {
        return badRequest('API key is required')
      }
      
      const provider = body.provider
      const apiKey = body.api_key
      const apiUrl = body.api_url || DEFAULT_API_URLS[provider]
      const model = body.model || DEFAULT_MODELS[provider]
      
      if (!apiUrl) {
        return badRequest('API URL is required for custom provider')
      }
      
      // 根据服务商选择测试方法
      let result: { success: boolean; latency: number; error?: string }
      
      if (provider === 'claude') {
        result = await testClaude(apiUrl, apiKey, model)
      } else {
        result = await testOpenAICompatible(apiUrl, apiKey, model)
      }
      
      if (result.success) {
        await writeAuditLog(context.env.DB, {
          userId,
          eventType: 'settings.ai.test_connection',
          ip,
          userAgent,
          payload: {
            request: {
              provider,
              api_url: apiUrl,
              model,
              has_api_key: Boolean(apiKey),
            },
            response: {
              success: true,
              latency_ms: result.latency,
            },
          },
        })

        return success({
          success: true,
          provider,
          model,
          latency_ms: result.latency
        })
      } else {
        await writeAuditLog(context.env.DB, {
          userId,
          eventType: 'settings.ai.test_connection',
          ip,
          userAgent,
          payload: {
            request: {
              provider,
              api_url: apiUrl,
              model,
              has_api_key: Boolean(apiKey),
            },
            response: {
              success: false,
              latency_ms: result.latency,
              error: result.error,
            },
          },
        })

        return success({
          success: false,
          provider,
          model,
          latency_ms: result.latency,
          error: result.error
        })
      }
    } catch (error) {
      console.error('Test AI connection error:', error)
      return internalError('Failed to test AI connection')
    }
  }
]
