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
export const AI_TMARKS_CUSTOM_PROMPT_TEMPLATE = `你是一个专业的书签管理助手。请根据网页信息为用户推荐最合适的标签。

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
请分析网页内容，并推荐 {maxTags} 个最相关的标签。

推荐规则：
1. 当标签数大于一百时，匹配已有的标签库，避免生成重复或近义标签
2. **层级化标签策略**：
   - 至少包含 1-2 个通用大分类标签（如：邮箱、GitHub）
   - 再包含具体的细分标签（如：Gmail、谷歌邮箱、企业邮箱）
   - 示例：Gmail → 推荐 ["邮箱", "Gmail", "谷歌服务"]
   - 示例：GitHub 仓库链接 → 推荐 ["GitHub", "开源", "代码托管"]
3. 标签要简洁明了，一般为 2-4 个汉字
4. 覆盖网页的核心主题、内容类型与关键信息
5. 结合用户的收藏目的和使用场景，避免过于冷僻的标签
6. 确保标签具有通用性和可检索性，便于分类与查找
7. 如果描述为外文，请翻译成中文，并在返回结果中包含翻译后的描述
8. 每个推荐标签需要包含：name（标签名）、isNew（是否为新标签）、confidence（相关性置信度 0-1）
8. **极其重要 - 必须严格执行**：标注每个标签是否为新标签
   * 仔细检查推荐的标签名是否**完全匹配**上面"已有标签库"中的任意一个标签
   * 如果标签名在已有标签库中找到了**完全相同**的匹配，设置 isNew: false
   * 如果标签名在已有标签库中**找不到完全相同**的匹配，设置 isNew: true
   * 必须逐个检查，不要猜测
9. 每个标签还需标注相关性置信度 confidence（范围 0-1）

返回格式（严格遵循）：
{"suggestedTags": [{"name": "标签名", "isNew": false, "confidence": 0.9}], "translatedTitle": "翻译后的标题（如有）", "translatedDescription": "翻译后的描述（如有）"}

JSON 输出要求：
* 必须输出且仅输出一个合法 JSON 对象，不允许附加任何解释、reasoning 内容或额外键
* 禁止输出 Markdown、换行提示、警告或其他文本
* 如无法生成有效结果，请返回 {"suggestedTags": [], "translatedTitle": null, "translatedDescription": null}
* 标签语言不限，在没有合适标签时，可推荐更为合适的新标签`
