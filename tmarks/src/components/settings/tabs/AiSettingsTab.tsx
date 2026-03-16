/**
 * AI 设置标签页
 * 配置 AI 服务用于标签推荐、智能分类等功能
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Key, Eye, EyeOff, ExternalLink, Check, X, Loader2, Info, RefreshCw, ChevronDown } from 'lucide-react'
import { useAiSettings, useUpdateAiSettings, useTestAiConnection } from '@/hooks/useAiSettings'
import { useToastStore } from '@/stores/toastStore'
import { InfoBox } from '../InfoBox'
import {
  type AIProvider,
  AI_PROVIDER_NAMES,
  AI_SERVICE_DOCS,
  AI_DEFAULT_MODELS,
  AI_AVAILABLE_MODELS,
  AI_SERVICE_URLS,
  AI_TMARKS_CUSTOM_PROMPT_TEMPLATE
} from '@/lib/ai/constants'
import { canFetchModels, fetchAvailableModels } from '@/lib/ai/models'

const PROVIDERS: AIProvider[] = ['openai', 'claude', 'deepseek', 'zhipu', 'siliconflow', 'custom']

interface AiSettingsTabActions {
  save: () => Promise<void>
  reset: () => void
  hasChanges: boolean
  isSaving: boolean
}

interface AiSettingsTabProps {
  onRegisterActions?: (actions: AiSettingsTabActions | null) => void
}

export function AiSettingsTab({ onRegisterActions }: AiSettingsTabProps) {
  const { t } = useTranslation('settings')
  const { data: settings, isLoading } = useAiSettings()
  const updateSettings = useUpdateAiSettings()
  const testConnection = useTestAiConnection()
  const { addToast } = useToastStore()

  const [provider, setProvider] = useState<AIProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [model, setModel] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [enableCustomPrompt, setEnableCustomPrompt] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const [testResult, setTestResult] = useState<{
    success: boolean
    latency?: number
    error?: string
  } | null>(null)

  const [fetchedModels, setFetchedModels] = useState<string[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [modelFetchError, setModelFetchError] = useState<string | null>(null)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const lastFetchSignature = useRef<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const applySettings = useCallback(() => {
    if (!settings) {
      return
    }

    setProvider(settings.provider)
    setModel(settings.model || AI_DEFAULT_MODELS[settings.provider])
    setEnabled(settings.enabled)
    setEnableCustomPrompt(settings.enable_custom_prompt)
    setCustomPrompt(settings.custom_prompt || '')
    setApiKey(settings.api_keys[settings.provider] || '')
    setApiUrl(settings.api_urls[settings.provider] || '')
    setHasChanges(false)
    setTestResult(null)
    setFetchedModels([])
    setModelFetchError(null)
    setShowModelDropdown(false)
    lastFetchSignature.current = null
  }, [settings])

  useEffect(() => {
    if (!showModelDropdown) return
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showModelDropdown])

  useEffect(() => {
    applySettings()
  }, [applySettings])

  const handleProviderChange = (newProvider: AIProvider) => {
    setProvider(newProvider)
    setModel(AI_DEFAULT_MODELS[newProvider])
    setApiKey(settings?.api_keys[newProvider] || '')
    setApiUrl(settings?.api_urls[newProvider] || '')
    setTestResult(null)
    setHasChanges(true)
    setFetchedModels([])
    setModelFetchError(null)
    lastFetchSignature.current = null
  }

  const fetchModels = useCallback(async () => {
    const trimmedKey = apiKey.trim()
    const supported = canFetchModels(provider, apiUrl)
    
    if (!supported || !trimmedKey) {
      return
    }

    const signature = `${provider}:${trimmedKey}:${apiUrl}`
    if (signature === lastFetchSignature.current) {
      return
    }

    setIsFetchingModels(true)
    setModelFetchError(null)

    try {
      const models = await fetchAvailableModels(provider, trimmedKey, apiUrl)
      setFetchedModels(models)
      lastFetchSignature.current = signature
      
      if (models.length > 0 && !models.includes(model)) {
        setModel(models[0] || AI_DEFAULT_MODELS[provider])
        setHasChanges(true)
      }
    } catch (error) {
      setFetchedModels([])
      setModelFetchError(error instanceof Error ? error.message : String(error))
      lastFetchSignature.current = signature
    } finally {
      setIsFetchingModels(false)
    }
  }, [provider, apiKey, apiUrl, model])

  useEffect(() => {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      return
    }

    const supported = canFetchModels(provider, apiUrl)
    if (!supported) {
      setFetchedModels([])
      setModelFetchError(null)
      return
    }

    const timer = setTimeout(() => {
      fetchModels()
    }, 500)

    return () => clearTimeout(timer)
  }, [provider, apiKey, apiUrl, fetchModels])

  const handleRefreshModels = () => {
    lastFetchSignature.current = null
    fetchModels()
  }

  const modelFetchSupported = canFetchModels(provider, apiUrl)
  
  const allModels = fetchedModels.length > 0 
    ? fetchedModels 
    : AI_AVAILABLE_MODELS[provider]

  const handleSave = useCallback(async () => {
    try {
      const normalizedApiKey = apiKey.trim()
      const updateData: Record<string, unknown> = {
        provider,
        model,
        enabled,
        enable_custom_prompt: enableCustomPrompt,
        custom_prompt: customPrompt,
        api_keys: { [provider]: normalizedApiKey }
      }

      if (apiUrl.trim()) {
        updateData.api_urls = { [provider]: apiUrl.trim() }
      } else if ((settings?.api_urls[provider] || '').trim()) {
        // 显式清空该 provider 的自定义地址
        updateData.api_urls = { [provider]: '' }
      }

      await updateSettings.mutateAsync(updateData)
      addToast('success', t('ai.saveSuccess'))
      setApiKey(normalizedApiKey)
      setHasChanges(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('message.saveFailed')
      addToast('error', message)
    }
  }, [addToast, apiKey, apiUrl, customPrompt, enableCustomPrompt, enabled, model, provider, settings, t, updateSettings])

  const handleReset = useCallback(() => {
    applySettings()
    addToast('info', t('message.resetSuccess'))
  }, [addToast, applySettings, t])

  useEffect(() => {
    if (!onRegisterActions) {
      return
    }

    onRegisterActions({
      save: handleSave,
      reset: handleReset,
      hasChanges,
      isSaving: updateSettings.isPending,
    })

    return () => onRegisterActions(null)
  }, [handleReset, handleSave, hasChanges, onRegisterActions, updateSettings.isPending])

  const handleTest = async () => {
    if (!apiKey.trim()) {
      addToast('error', t('ai.enterApiKeyFirst'))
      return
    }

    setTestResult(null)

    try {
      const result = await testConnection.mutateAsync({
        provider,
        api_key: apiKey,
        api_url: apiUrl || undefined,
        model: model || undefined
      })

      setTestResult({
        success: result.success,
        latency: result.latency_ms,
        error: result.error
      })

      if (result.success) {
        addToast('success', t('ai.testSuccess', { latency: result.latency_ms }))
      } else {
        addToast('error', result.error || t('ai.testFailed'))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('ai.testFailed')
      setTestResult({ success: false, error: message })
      addToast('error', message)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t('ai.title')}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t('ai.description')}
        </p>
      </div>

      <div className={`flex items-center justify-between p-4 rounded-lg bg-card border-2 transition-colors ${
        enabled ? 'border-primary bg-primary/5' : 'border-border'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            enabled ? 'bg-primary/20' : 'bg-primary/10'
          }`}>
            <Bot className={`w-5 h-5 ${enabled ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <div className="text-sm font-medium text-foreground flex items-center gap-2">
              {t('ai.enable')}
              {enabled && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">{t('ai.enabled')}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{t('ai.enableHint')}</div>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked)
              setHasChanges(true)
            }}
            className="sr-only peer"
          />
          <div className={`w-11 h-6 rounded-full transition-colors duration-200 ease-in-out relative ${
            enabled ? 'bg-primary' : 'bg-muted-foreground/30'
          } peer-focus:ring-2 peer-focus:ring-primary/20`}>
            <div className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </div>
        </label>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">{t('ai.provider')}</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handleProviderChange(p)}
              className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                provider === p
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-card text-foreground hover:border-muted-foreground/30'
              }`}
            >
              {AI_PROVIDER_NAMES[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">{t('ai.apiKey')}</label>
          {AI_SERVICE_DOCS[provider] && (
            <a
              href={AI_SERVICE_DOCS[provider]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              {t('ai.getApiKey')}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Key className="w-4 h-4 text-muted-foreground" />
          </div>
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              setHasChanges(true)
              setTestResult(null)
              lastFetchSignature.current = null
            }}
            placeholder={t('ai.apiKeyPlaceholder', { provider: AI_PROVIDER_NAMES[provider] })}
            className="input w-full pl-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">{t('ai.model')}</label>
          {modelFetchSupported && (
            <button
              type="button"
              onClick={handleRefreshModels}
              disabled={isFetchingModels || !apiKey.trim()}
              className={`text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                isFetchingModels || !apiKey.trim()
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
              {isFetchingModels ? t('ai.refreshingModels') : t('ai.refreshModels')}
            </button>
          )}
        </div>
        
        <div className="relative" ref={dropdownRef}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={model}
              onChange={(e) => {
                setModel(e.target.value)
                setHasChanges(true)
              }}
              placeholder={AI_DEFAULT_MODELS[provider]}
              className="input flex-1"
            />
            {allModels.length > 0 && (
              <button
                type="button"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="btn btn-ghost px-3 flex items-center gap-1"
              >
                {t('ai.selectModel')}
                <ChevronDown className={`w-4 h-4 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          
          {showModelDropdown && allModels.length > 0 && (
            <div className="absolute top-full left-0 z-20 mt-2 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
              {allModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setModel(m)
                    setHasChanges(true)
                    setShowModelDropdown(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    model === m
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted/50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {fetchedModels.length > 0 && (
          <p className="text-xs text-primary">
            {t('ai.modelsFetched', { count: fetchedModels.length })}
          </p>
        )}
        {modelFetchError && (
          <p className="text-xs text-destructive">
            {t('ai.modelsFetchError', { error: modelFetchError })}
          </p>
        )}
        {!fetchedModels.length && modelFetchSupported && !modelFetchError && !isFetchingModels && (
          <p className="text-xs text-muted-foreground">
            {t('ai.modelsHint', { model: AI_DEFAULT_MODELS[provider] })}
          </p>
        )}
        {!modelFetchSupported && (
          <p className="text-xs text-muted-foreground">
            {t('ai.modelsRecommend', { model: AI_DEFAULT_MODELS[provider] })}
          </p>
        )}
      </div>

      {(provider === 'custom' || apiUrl) && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {provider !== 'custom' ? t('ai.apiUrlOptional') : t('ai.apiUrl')}
          </label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => {
              setApiUrl(e.target.value)
              setHasChanges(true)
            }}
            placeholder={AI_SERVICE_URLS[provider] || 'https://api.example.com/v1'}
            className="input w-full"
          />
          <p className="text-xs text-muted-foreground">
            {t('ai.apiUrlHint')}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-foreground">{t('ai.customPromptTitle')}</label>
            <p className="text-xs text-muted-foreground mt-1">{t('ai.customPromptDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEnableCustomPrompt(!enableCustomPrompt)
              setHasChanges(true)
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              enableCustomPrompt
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {enableCustomPrompt ? t('ai.enabled') : t('ai.disabled')}
          </button>
        </div>

        {enableCustomPrompt && (
          <div className="space-y-3">
            <textarea
              value={customPrompt}
              onChange={(e) => {
                setCustomPrompt(e.target.value)
                setHasChanges(true)
              }}
              rows={10}
              placeholder={t('ai.customPromptPlaceholder')}
              className="input w-full min-h-40 font-mono text-xs leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              {t('ai.customPromptVariables')}
            </p>

            <div className="p-3 rounded-lg border border-border bg-muted/20">
              <p className="text-xs font-medium text-foreground mb-2">{t('ai.customPromptExample')}</p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
                {AI_TMARKS_CUSTOM_PROMPT_TEMPLATE}
              </pre>
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setCustomPrompt(AI_TMARKS_CUSTOM_PROMPT_TEMPLATE)
                    setHasChanges(true)
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  {t('ai.useExample')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(AI_TMARKS_CUSTOM_PROMPT_TEMPLATE)
                      addToast('success', t('ai.copyExampleSuccess'))
                    } catch {
                      addToast('error', t('ai.copyExampleFailed'))
                    }
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  {t('ai.copyExample')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testConnection.isPending || !apiKey.trim()}
          className="btn btn-ghost flex items-center gap-2"
        >
          {testConnection.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Bot className="w-4 h-4" />
          )}
          {t('ai.testConnection')}
        </button>

        {testResult && (
          <div className={`flex items-center gap-2 text-sm ${
            testResult.success ? 'text-success' : 'text-destructive'
          }`}>
            {testResult.success ? (
              <>
                <Check className="w-4 h-4" />
                {t('ai.testSuccess', { latency: testResult.latency })}
              </>
            ) : (
              <>
                <X className="w-4 h-4" />
                {testResult.error || t('ai.testFailed')}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-border">
        <button
          type="button"
          onClick={handleSave}
          disabled={updateSettings.isPending || !hasChanges}
          className="btn btn-primary flex items-center gap-2"
        >
          {updateSettings.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {t('action.save')}
        </button>
      </div>

      <InfoBox icon={Info} title={t('ai.infoBox.title')} variant="info">
        <ul className="space-y-1 text-sm">
          <li>• {t('ai.infoBox.tip1')}</li>
          <li>• {t('ai.infoBox.tip2')}</li>
          <li>• {t('ai.infoBox.tip3')}</li>
          <li>• {t('ai.infoBox.tip4')}</li>
        </ul>
      </InfoBox>
    </div>
  )
}
