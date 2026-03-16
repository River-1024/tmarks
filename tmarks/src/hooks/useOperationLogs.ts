import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { operationLogsService } from '@/services/operation-logs'

const OPERATION_LOGS_QUERY_KEY = ['operation-logs']

export function useOperationLogs(limit = 50) {
  return useQuery({
    queryKey: [...OPERATION_LOGS_QUERY_KEY, limit],
    queryFn: () => operationLogsService.getLogs(limit),
  })
}

export function useClearOperationLogs() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => operationLogsService.clearLogs(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: OPERATION_LOGS_QUERY_KEY })
    },
  })
}

export function useWriteOperationDebugLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => operationLogsService.writeDebugLog(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: OPERATION_LOGS_QUERY_KEY })
    },
  })
}
