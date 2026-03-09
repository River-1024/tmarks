/**
 * AI 服务常量配置
 */

// AI 服务商类型
export type AIProvider = 'openai' | 'claude' | 'deepseek' | 'zhipu' | 'modelscope' | 'siliconflow' | 'iflow' | 'custom'

// AI 服务默认 URL
export const AI_SERVICE_URLS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  modelscope: 'https://api-inference.modelscope.cn/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  iflow: 'https://apis.iflow.cn/v1',
  custom: ''
}

// AI 服务默认模型
export const AI_DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  claude: 'claude-3-haiku-20240307',
  deepseek: 'deepseek-chat',
  zhipu: 'glm-4-flash',
  modelscope: 'qwen-turbo',
  siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
  iflow: 'gpt-4o-mini',
  custom: 'gpt-4o-mini'
}

// AI 服务可用模型列表
export const AI_AVAILABLE_MODELS: Record<AIProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  claude: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
  deepseek: ['deepseek-chat', 'deepseek-coder'],
  zhipu: ['glm-4-flash', 'glm-4', 'glm-4-plus'],
  modelscope: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
  siliconflow: [
    // Qwen 系列
    'Qwen/Qwen2.5-7B-Instruct',
    'Qwen/Qwen2.5-14B-Instruct',
    'Qwen/Qwen2.5-32B-Instruct',
    'Qwen/Qwen2.5-72B-Instruct',
    'Qwen/Qwen2.5-Coder-7B-Instruct',
    'Qwen/Qwen2.5-Coder-32B-Instruct',
    // DeepSeek 系列
    'deepseek-ai/DeepSeek-V2.5',
    'deepseek-ai/DeepSeek-V3',
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
    // GLM 系列
    'THUDM/glm-4-9b-chat',
    // Yi 系列
    'Pro/01-ai/Yi-1.5-9B-Chat-16K',
    // InternLM 系列
    'internlm/internlm2_5-7b-chat',
    'internlm/internlm2_5-20b-chat',
  ],
  iflow: ['gpt-4o-mini', 'gpt-4o'],
  custom: []
}

// AI 服务文档链接
export const AI_SERVICE_DOCS: Record<AIProvider, string> = {
  openai: 'https://platform.openai.com/api-keys',
  claude: 'https://console.anthropic.com/',
  deepseek: 'https://platform.deepseek.com/api_keys',
  zhipu: 'https://open.bigmodel.cn/usercenter/apikeys',
  modelscope: 'https://www.modelscope.cn/my/myaccesstoken',
  siliconflow: 'https://cloud.siliconflow.cn/account/ak',
  iflow: 'https://console.xfyun.cn/services/iat',
  custom: ''
}

// AI 服务商显示名称
export const AI_PROVIDER_NAMES: Record<AIProvider, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  deepseek: 'DeepSeek',
  zhipu: '智谱 AI',
  modelscope: 'ModelScope',
  siliconflow: 'SiliconFlow',
  iflow: 'iFlow',
  custom: 'Custom'
}

// 超时配置
export const AI_TIMEOUT = 30000 // 30秒

// TMarks 标签自定义 Prompt 默认模板（网页端设置示例）
export const AI_TMARKS_CUSTOM_PROMPT_TEMPLATE = `你是一个专业的书签标签管理助手。

目标：
1. 结合网页标题、URL、描述与现有标签，推荐高质量标签。
2. 标签要兼顾“通用分类”与“具体细分”，便于检索和归档。
3. 优先复用用户已有标签，避免重复和同义词分裂。

规则：
1. 标签尽量简洁、可读、可复用，避免过长短语。
2. 同时覆盖主题、场景、技术/领域等关键维度。
3. 如果内容是外文，优先使用中文标签（必要时保留常见英文术语）。
4. 严格返回结构化 JSON，不输出多余文本。
5. 每个标签都需要给出 name、isNew、confidence(0-1)。

输出要求：
{"suggestedTags":[{"name":"标签名","isNew":false,"confidence":0.9}],"translatedTitle":"可选","translatedDescription":"可选"}`
