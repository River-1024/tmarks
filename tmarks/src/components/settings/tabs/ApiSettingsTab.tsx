import { useState } from 'react'
import { Key, Copy, Trash2, Plus, Eye, Ban, Info, AlertTriangle } from 'lucide-react'
import { useApiKeys, useRevokeApiKey, useDeleteApiKey } from '@/hooks/useApiKeys'
import { useToastStore } from '@/stores/toastStore'
import { CreateApiKeyModal } from '@/components/api-keys/CreateApiKeyModal'
import { ApiKeyDetailModal } from '@/components/api-keys/ApiKeyDetailModal'
import type { ApiKey } from '@/services/api-keys'
import { InfoBox } from '../InfoBox'

export function ApiSettingsTab() {
  const { data, isLoading } = useApiKeys()
  const revokeApiKey = useRevokeApiKey()
  const deleteApiKey = useDeleteApiKey()
  const { addToast } = useToastStore()
  
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null)

  const handleRevoke = async (id: string) => {
    if (!confirm('确定要撤销此 API Key 吗？撤销后无法恢复。')) return

    try {
      await revokeApiKey.mutateAsync(id)
      addToast('success', 'API Key 已撤销')
    } catch {
      addToast('error', '撤销失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要彻底删除此 API Key 吗？该操作不可恢复，并会清除所有使用记录。')) return

    try {
      await deleteApiKey.mutateAsync(id)
      addToast('success', 'API Key 已永久删除')
    } catch {
      addToast('error', '删除失败')
    }
  }

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key)
    addToast('success', '已复制到剪贴板')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const keys = data?.keys || []
  const quota = data?.quota || { used: 0, limit: 3 }

  return (
    <div className="space-y-6">
      {/* API Keys 管理 */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1">
            <h3 className="text-base sm:text-lg font-semibold text-foreground">API Keys 管理</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              创建和管理 API 密钥，用于第三方应用访问
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={quota.used >= quota.limit}
            className="btn btn-primary btn-sm sm:btn flex items-center gap-2 justify-center"
          >
            <Plus className="w-4 h-4" />
            创建
          </button>
        </div>

        {/* 配额信息 */}
        <div className="p-3 bg-muted/30 border border-border rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">当前使用</span>
            <span className="font-medium">
              {quota.used} / {quota.limit >= 999 ? '无限制' : quota.limit}
            </span>
          </div>
        </div>

        {/* Keys 列表 */}
        <div className="space-y-3">
          {keys.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm mb-4">还没有创建任何 API Key</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
              >
                创建第一个 API Key
              </button>
            </div>
          ) : (
            keys.map((key: ApiKey) => (
              <div
                key={key.id}
                className={`p-4 rounded-lg border ${
                  key.status === 'revoked'
                    ? 'border-error/30 bg-error/5'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Key className={`w-4 h-4 flex-shrink-0 ${
                        key.status === 'revoked' ? 'text-error' : 'text-primary'
                      }`} />
                      <span className="font-medium">{key.name}</span>
                      {key.status === 'revoked' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-error/20 text-error">
                          已撤销
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 truncate">
                        {key.key_prefix}••••••••••••••••
                      </code>
                      <button
                        onClick={() => handleCopy(key.key_prefix)}
                        className="p-1 hover:bg-muted rounded"
                        title="复制密钥前缀"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>创建于 {new Date(key.created_at).toLocaleString()}</span>
                      {key.last_used_at && (
                        <span>最后使用 {new Date(key.last_used_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedKey(key)}
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                      title="查看详情"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {key.status === 'active' && (
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="p-2 text-warning hover:bg-warning/10 rounded-lg transition-colors"
                        title="撤销"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(key.id)}
                      className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-border"></div>

      {/* 使用说明 */}
      <div className="space-y-3">
        <InfoBox icon={Info} title="使用说明" variant="info">
          <ul className="space-y-1">
            <li>• API Keys 用于第三方应用（如浏览器插件）安全访问您的数据</li>
            <li>• 每个账户最多创建 {quota.limit >= 999 ? '无限制' : `${quota.limit} 个`} API Key</li>
            <li>• 创建后仅显示一次完整密钥，请妥善保存</li>
          </ul>
        </InfoBox>

        <InfoBox icon={AlertTriangle} title="安全提示" variant="warning">
          <ul className="space-y-1">
            <li>• 不要在公开场合分享你的 API Key</li>
            <li>• 如果 API Key 泄露，请立即撤销并创建新的</li>
            <li>• 撤销后的 Key 无法恢复，但可以删除以清理记录</li>
          </ul>
        </InfoBox>
      </div>

      {/* 创建 API Key 模态框 */}
      {showCreateModal && (
        <CreateApiKeyModal onClose={() => setShowCreateModal(false)} />
      )}

      {/* API Key 详情模态框 */}
      {selectedKey && (
        <ApiKeyDetailModal
          apiKey={selectedKey}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </div>
  )
}
