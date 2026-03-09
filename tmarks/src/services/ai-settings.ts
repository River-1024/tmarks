/**
 * AI 设置服务
 */

import { apiClient } from '@/lib/api-client'
import type { AIProvider } from '@/lib/ai/constants'

// AI 设置类型
export interface AISettings {
  provider: AIProvider
  api_keys: Record<string, string>
  api_urls: Record<string, string>
  model: string | null
  custom_prompt: string | null
  enable_custom_prompt: boolean
  enabled: boolean
}

// 更新请求类型
export interface UpdateAISettingsRequest {
  provider?: AIProvider
  api_keys?: Record<string, string>
  api_urls?: Record<string, string>
  model?: string
  custom_prompt?: string
  enable_custom_prompt?: boolean
  enabled?: boolean
}

// 测试连接请求类型
export interface TestAIConnectionRequest {
  provider: AIProvider
  api_key: string
  api_url?: string
  model?: string
}

// 测试连接响应类型
export interface TestAIConnectionResponse {
  success: boolean
  provider: AIProvider
  model: string
  latency_ms: number
  error?: string
}

// API 响应类型
interface AISettingsResponse {
  ai_settings: AISettings
}

export const aiSettingsService = {
  /**
   * 获取 AI 设置
   */
  async getSettings(): Promise<AISettings> {
    const response = await apiClient.get<AISettingsResponse>('/settings/ai')
    return response.data!.ai_settings
  },

  /**
   * 更新 AI 设置
   */
  async updateSettings(data: UpdateAISettingsRequest): Promise<void> {
    await apiClient.put('/settings/ai', data)
  },

  /**
   * 测试 AI 连接
   */
  async testConnection(data: TestAIConnectionRequest): Promise<TestAIConnectionResponse> {
    const response = await apiClient.post<TestAIConnectionResponse>('/settings/ai/test', data)
    return response.data!
  }
}
