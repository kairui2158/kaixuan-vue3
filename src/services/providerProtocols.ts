export type ProviderType =
  | 'openai-compatible'
  | 'deepseek'
  | 'anthropic'
  | 'gemini'
  | 'azure-openai'

export type EndpointMode = 'auto' | 'base' | 'full'

export interface ProviderEndpointConfig {
  baseUrl: string
  providerType?: ProviderType
  endpointMode?: EndpointMode
  chatPath?: string
  modelsPath?: string
  deployment?: string
  apiVersion?: string
  model?: string
  stream?: boolean
}

export interface ProviderProtocol {
  type: ProviderType
  label: string
  buildChatUrl(config: ProviderEndpointConfig): string
  buildModelsUrl(config: ProviderEndpointConfig): string
  buildModelsHeaders?(config: { apiKey: string }): Record<string, string>
  buildHeaders(config: { apiKey: string }): Record<string, string>
  buildRequestBody(config: {
    model: string
    messages: Array<{ role: string; content: string }>
    stream: boolean
    temperature: number
    maxTokens: number
  }): Record<string, unknown>
  extractText(data: any): string
  extractReasoning(data: any): string
  extractUsage(data: any): any
  extractFinishReason(data: any): string | undefined
  extractModels(data: any): string[]
}

function trimBase(baseUrl: string): string {
  return String(baseUrl || '').trim().replace(/\/+$/, '')
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function appendPath(base: string, path: string): string {
  return base + (path.startsWith('/') ? path : '/' + path)
}

function normalizeOpenAIBase(baseUrl: string): string {
  return trimBase(baseUrl)
}

function isFullEndpoint(value: string, endpointMode: 'auto' | 'base' | 'full'): boolean {
  if (endpointMode === 'full') return true
  if (endpointMode === 'base') return false
  return /\/chat\/completions$/i.test(value) || /\/messages$/i.test(value)
}

function isModelsEndpoint(value: string, endpointMode: 'auto' | 'base' | 'full'): boolean {
  if (endpointMode === 'full') return true
  if (endpointMode === 'base') return false
  return /\/(?:v\d+\/)?models$/i.test(value)
}

function isFullChatEndpoint(value: string, endpointMode: 'auto' | 'base' | 'full'): boolean {
  return isFullEndpoint(value, endpointMode)
}

const openAICompatibleProtocol: ProviderProtocol = {
  type: 'openai-compatible',
  label: 'OpenAI 兼容',
  buildChatUrl(config) {
    const base = trimBase(config.baseUrl)
    if (!isHttpUrl(base)) throw new Error('接口地址必须是有效的 http 或 https URL')
    if (config.chatPath) return appendPath(base, config.chatPath)
    if (isFullEndpoint(base, config.endpointMode || 'auto')) return base
    let normalized = base
    if (!/\/v\d+$/i.test(normalized)) normalized += '/v1'
    return normalized + '/chat/completions'
  },
  buildModelsUrl(config) {
    const base = trimBase(config.baseUrl)
    if (!isHttpUrl(base)) throw new Error('接口地址必须是有效的 http 或 https URL')
    if (config.modelsPath) return appendPath(base, config.modelsPath)
    if (isModelsEndpoint(base, config.endpointMode || 'auto')) return base
    if (isFullChatEndpoint(base, config.endpointMode || 'auto')) {
      return base.replace(/\/chat\/completions$/i, '') + '/models'
    }
    let normalized = base
    if (!/\/v\d+$/i.test(normalized)) normalized += '/v1'
    return normalized + '/models'
  },
  buildHeaders({ apiKey }) {
    return {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    }
  },
  buildRequestBody(config) {
    return {
      model: config.model,
      messages: config.messages,
      stream: config.stream,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }
  },
  extractText(data) {
    return data?.choices?.[0]?.message?.content || ''
  },
  extractReasoning(data) {
    return data?.choices?.[0]?.message?.reasoning_content || ''
  },
  extractUsage(data) {
    return data?.usage
  },
  extractFinishReason(data) {
    return data?.choices?.[0]?.finish_reason
  },
  extractModels(data) {
    if (Array.isArray(data)) return data.map((m: any) => m?.id || m?.name).filter(Boolean)
    if (Array.isArray(data?.models)) return data.models.map((m: any) => typeof m === 'string' ? m : m?.id).filter(Boolean)
    if (Array.isArray(data?.data)) return data.data.map((m: any) => m?.id || m?.name).filter(Boolean)
    return []
  },
}

const deepSeekProtocol: ProviderProtocol = {
  ...openAICompatibleProtocol,
  type: 'deepseek',
  label: 'DeepSeek',
  buildChatUrl(config) {
    const base = trimBase(config.baseUrl)
    if (!isHttpUrl(base)) throw new Error('接口地址必须是有效的 http 或 https URL')
    if (config.chatPath) return appendPath(base, config.chatPath)
    if (isFullEndpoint(base, config.endpointMode || 'auto')) return base
    if (/\/v\d+$/i.test(base)) return base + '/chat/completions'
    return base + '/chat/completions'
  },
  buildModelsUrl(config) {
    const base = trimBase(config.baseUrl)
    if (!isHttpUrl(base)) throw new Error('接口地址必须是有效的 http 或 https URL')
    if (config.modelsPath) return appendPath(base, config.modelsPath)
    if (isModelsEndpoint(base, config.endpointMode || 'auto')) return base
    if (/\/v\d+$/i.test(base)) return base + '/models'
    return base + '/models'
  },
}

const anthropicProtocol: ProviderProtocol = {
  ...openAICompatibleProtocol,
  type: 'anthropic',
  label: 'Anthropic',
  buildChatUrl(config) {
    const base = trimBase(config.baseUrl)
    if (!isHttpUrl(base)) throw new Error('接口地址必须是有效的 http 或 https URL')
    if (config.chatPath) return appendPath(base, config.chatPath)
    if (isFullEndpoint(base, config.endpointMode || 'auto')) return base
    if (/\/v\d+$/i.test(base)) return base + '/messages'
    return base + '/v1/messages'
  },
  buildModelsUrl(config) {
    const base = trimBase(config.baseUrl)
    if (!isHttpUrl(base)) throw new Error('接口地址必须是有效的 http 或 https URL')
    if (config.modelsPath) return appendPath(base, config.modelsPath)
    if (isModelsEndpoint(base, config.endpointMode || 'auto')) return base
    if (/\/v\d+$/i.test(base)) return base + '/models'
    return base + '/v1/models'
  },
  buildHeaders({ apiKey }) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
  },
  buildRequestBody(config) {
    const system = config.messages.filter(m => m.role === 'system').map(m => m.content).join('\n')
    const messages = config.messages.filter(m => m.role !== 'system')
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      stream: config.stream,
      temperature: config.temperature,
      max_tokens: Math.max(1, config.maxTokens || 8192),
    }
    if (system) body.system = system
    return body
  },
  extractText(data) {
    if (!Array.isArray(data?.content)) return ''
    return data.content.filter((item: any) => item?.type === 'text').map((item: any) => item.text || '').join('')
  },
  extractReasoning(data) {
    if (!Array.isArray(data?.content)) return ''
    return data.content.filter((item: any) => item?.type === 'thinking').map((item: any) => item.thinking || '').join('')
  },
  extractFinishReason(data) {
    return data?.stop_reason
  },
  extractModels(data) {
    if (Array.isArray(data?.data)) return data.data.map((m: any) => m?.id).filter(Boolean)
    if (Array.isArray(data?.models)) return data.models.map((m: any) => m?.id || m?.name).filter(Boolean)
    return []
  },
}

const geminiProtocol: ProviderProtocol = {
  ...openAICompatibleProtocol,
  type: 'gemini',
  label: 'Google Gemini',
  buildChatUrl(config) {
    const base = trimBase(config.baseUrl)
    if (!isHttpUrl(base)) throw new Error('接口地址必须是有效的 http 或 https URL')
    const model = config.model || 'gemini-2.0-flash'
    if (config.chatPath) return appendPath(base, config.chatPath)
    if (/:generateContent$/i.test(base) || /:streamGenerateContent$/i.test(base)) return base
    if (/\/v\d+\w*$/i.test(base)) return base + '/models/' + model + (config.stream ? ':streamGenerateContent' : ':generateContent')
    return base + '/v1beta/models/' + model + (config.stream ? ':streamGenerateContent?alt=sse' : ':generateContent')
  },
  buildModelsUrl(config) {
    const base = trimBase(config.baseUrl)
    if (!isHttpUrl(base)) throw new Error('接口地址必须是有效的 http 或 https URL')
    if (config.modelsPath) return appendPath(base, config.modelsPath)
    if (/\/models$/i.test(base)) return base
    if (/\/v\d+\w*$/i.test(base)) return base + '/models'
    return base + '/v1beta/models'
  },
  buildHeaders() {
    return { 'Content-Type': 'application/json' }
  },
  buildModelsHeaders({ apiKey }) {
    return { 'x-goog-api-key': apiKey }
  },
  buildRequestBody(config) {
    const system = config.messages.filter(m => m.role === 'system').map(m => m.content).join('\n')
    const contents = config.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
      },
    }
    if (system) body.systemInstruction = { parts: [{ text: system }] }
    return body
  },
  extractText(data) {
    return (data?.candidates?.[0]?.content?.parts || [])
      .map((part: any) => part?.text || '')
      .join('')
  },
  extractReasoning() {
    return ''
  },
  extractUsage(data) {
    return data?.usageMetadata
  },
  extractFinishReason(data) {
    return data?.candidates?.[0]?.finishReason
  },
  extractModels(data) {
    return (data?.models || []).map((m: any) => String(m?.name || '').replace(/^models\//, '')).filter(Boolean)
  },
}

const azureProtocol: ProviderProtocol = {
  ...openAICompatibleProtocol,
  type: 'azure-openai',
  label: 'Azure OpenAI',
  buildChatUrl(config) {
    const base = trimBase(config.baseUrl)
    if (!isHttpUrl(base)) throw new Error('接口地址必须是有效的 http 或 https URL')
    if (config.chatPath) return appendPath(base, config.chatPath)
    if (/\/chat\/completions$/i.test(base)) return base
    if (!config.deployment) throw new Error('Azure 供应商必须填写部署名称')
    const version = config.apiVersion || '2024-02-01'
    const prefix = /\/openai\/deployments$/i.test(base) ? base : appendPath(base, '/openai/deployments')
    return prefix + '/' + config.deployment + '/chat/completions?api-version=' + encodeURIComponent(version)
  },
  buildModelsUrl(config) {
    const base = trimBase(config.baseUrl)
    if (!isHttpUrl(base)) throw new Error('接口地址必须是有效的 http 或 https URL')
    if (config.modelsPath) return appendPath(base, config.modelsPath)
    if (/\/models$/i.test(base)) return base
    return appendPath(base, '/openai/models')
  },
  buildHeaders({ apiKey }) {
    return {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    }
  },
}

const protocols: Record<ProviderType, ProviderProtocol> = {
  'openai-compatible': openAICompatibleProtocol,
  deepseek: deepSeekProtocol,
  anthropic: anthropicProtocol,
  gemini: geminiProtocol,
  'azure-openai': azureProtocol,
}

export function normalizeProviderType(value?: string): ProviderType {
  if (value && value in protocols) return value as ProviderType
  return 'openai-compatible'
}

export function getProviderProtocol(providerType?: string): ProviderProtocol {
  return protocols[normalizeProviderType(providerType)]
}

export function buildProviderChatUrl(config: ProviderEndpointConfig): string {
  return getProviderProtocol(config.providerType).buildChatUrl(config)
}

export function buildProviderModelsUrl(config: ProviderEndpointConfig): string {
  return getProviderProtocol(config.providerType).buildModelsUrl(config)
}

export function buildProviderHeaders(providerType: string | undefined, apiKey: string): Record<string, string> {
  return getProviderProtocol(providerType).buildHeaders({ apiKey })
}

export function buildProviderModelsHeaders(providerType: string | undefined, apiKey: string): Record<string, string> {
  const protocol = getProviderProtocol(providerType)
  if (protocol.buildModelsHeaders) return protocol.buildModelsHeaders({ apiKey })
  return protocol.buildHeaders({ apiKey })
}

export function redactProviderHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      /^(authorization|api-key|x-api-key)$/i.test(key)
        ? '[REDACTED]'
        : String(value).replace(/(Bearer\s+).+$/i, '$1[REDACTED]'),
    ])
  )
}

export function sanitizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete('key')
    parsed.searchParams.delete('api-key')
    parsed.searchParams.delete('access_token')
    parsed.searchParams.delete('token')
    return parsed.toString()
  } catch {
    return '[invalid-url]'
  }
}

export function extractProviderErrorSummary(raw: any): string {
  if (raw == null) return ''
  const candidates = [
    raw?.error?.message,
    raw?.error?.type,
    raw?.message,
    raw?.msg,
  ]
  const text = candidates.filter(Boolean).join(' | ')
  return String(text || '').slice(0, 500)
}

export async function readErrorBody(response: Response): Promise<any> {
  try {
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      return { message: text.slice(0, 500) }
    }
  } catch {
    return null
  }
}

export function httpErrorMessage(status: number, providerMessage = ''): string {
  const suffix = providerMessage ? '：' + providerMessage : ''
  if (status === 400) return '请求参数或模型不被当前供应商接受' + suffix
  if (status === 401) return 'API Key 无效或未授权' + suffix
  if (status === 402) return '余额不足或额度耗尽' + suffix
  if (status === 403) return '访问被禁止或模型未授权' + suffix
  if (status === 404) return '接口路径或模型不存在，请检查地址和协议' + suffix
  if (status === 408) return '供应商响应超时' + suffix
  if (status === 429) return '请求过于频繁，已被供应商限流' + suffix
  if (status >= 500) return '供应商服务异常' + suffix
  return '供应商返回 HTTP ' + status + suffix
}
