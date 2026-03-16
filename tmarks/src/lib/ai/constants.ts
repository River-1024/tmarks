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
export const AI_TMARKS_CUSTOM_PROMPT_TEMPLATE = `你是 TMarks 的书签标签整理助手。请根据输入的书签信息生成可复用的中文标签。

网页信息：
- 标题：{title}
- 网址：{url}
- 描述：{description}
- 内容摘要：{content}

用户已有的标签库：
{existingTags}

最近收藏的书签参考：
{recentBookmarks}

任务：
请分析当前批次书签内容，并为每个书签生成 2-{maxTags} 个最相关的标签。

推荐规则：
1. 优先复用已有标签库中的完全匹配标签，避免重复或近义标签
2. 标签要简洁明了，一般为 2-6 个汉字
3. 覆盖网页的核心主题、用途和分类
4. 优先输出通用、可检索、可复用的标签
5. 避免“网站”“网页”“书签”这类过于宽泛的词
6. 不需要返回解释、置信度、是否新标签、翻译标题或翻译描述
7. 如果无法判断，也必须保留对应 bookmark_id，并返回空数组 tags: []

返回格式（严格遵循）：
{"items":[{"bookmark_id":"书签ID","tags":["标签1","标签2"]}]}

JSON 输出要求：
* 必须输出且仅输出一个合法 JSON 对象，不允许附加任何解释、reasoning 内容或额外键
* 顶层只能包含 items，一个书签对应一个 item
* 每个 item 只能包含 bookmark_id 和 tags 两个字段
* tags 必须是字符串数组，不允许返回对象数组
* 禁止输出 Markdown、代码块、警告、注释或其他文本
* 禁止返回 suggestedTags、translatedTitle、translatedDescription 等旧格式字段
* 如无法生成有效结果，请返回 {"items":[]}`
