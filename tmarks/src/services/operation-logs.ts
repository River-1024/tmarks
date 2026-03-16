import { apiClient } from '@/lib/api-client'
import type {
  OperationLogsResponse,
  OperationLogsWriteRequest,
  OperationLogWriteEntry,
} from '@/lib/types'

export const operationLogsService = {
  async getLogs(limit = 50): Promise<OperationLogsResponse> {
    const response = await apiClient.get<OperationLogsResponse>(`/settings/logs?limit=${limit}`)
    return response.data!
  },

  async writeDebugLog(): Promise<void> {
    await apiClient.post('/settings/logs')
  },

  async writeEntries(entries: OperationLogWriteEntry[]): Promise<void> {
    const payload: OperationLogsWriteRequest = { entries }
    await apiClient.post('/settings/logs', payload)
  },

  async clearLogs(): Promise<void> {
    await apiClient.delete('/settings/logs')
  },
}
