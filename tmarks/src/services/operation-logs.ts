import { apiClient } from '@/lib/api-client'
import type { OperationLogsResponse } from '@/lib/types'

export const operationLogsService = {
  async getLogs(limit = 50): Promise<OperationLogsResponse> {
    const response = await apiClient.get<OperationLogsResponse>(`/settings/logs?limit=${limit}`)
    return response.data!
  },

  async writeDebugLog(): Promise<void> {
    await apiClient.post('/settings/logs')
  },

  async clearLogs(): Promise<void> {
    await apiClient.delete('/settings/logs')
  },
}
