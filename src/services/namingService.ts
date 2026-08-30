/**
 * AI 命名服务
 * 统一入口：构建提示词 → 调用 aiService → 解析校验 JSON → 返回结构化结果
 * 支持取消、重试、部分成功
 */

import { getAiService } from './aiService'
import type { AiServiceError } from './aiService'
import type { NamingOptions, NamingResult, NamingType } from '../types/aiNaming'
import { NAMING_TYPE_PROMPT_LABELS, MAX_COUNT, MIN_COUNT } from '../types/aiNaming'

export interface NamingGenerateResult {
  results: NamingResult[]
  /** 完整生成数量，不含被过滤掉的无效项 */
  validCount: number
  /** 被过滤掉的无效项数量 */
  filteredCount: number
  /** 请求 ID */
  requestId: string
}

export type NamingGenerateError =
  | { kind: 'no_provider'; message: string }
  | { kind: 'canceled'; message: string }
  | { kind: 'timeout'; message: string }
  | { kind: 'auth'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'json'; message: string }
  | { kind: 'empty'; message: string }
  | { kind: 'http'; message: string; statusCode: number }

/**
 * 构建命名提示词
 */
export function buildNamingPrompt(options: NamingOptions): { system: string; user: string } {
  const typeLabel = options.type === 'custom' && options.customType
    ? options.customType
    : NAMING_TYPE_PROMPT_LABELS[options.type]

  const count = Math.max(MIN_COUNT, Math.min(MAX_COUNT, options.count))

  const parts: string[] = []
  parts.push(`请生成 ${count} 个${typeLabel}。`)
  parts.push('要求：独特、有记忆点、符合小说风格，每个名字附带含义说明和适用场景。')
  parts.push('返回纯 JSON 数组格式，不要包含任何其他文字：')
  parts.push('[{"name":"名字","meaning":"含义或构词解释","usage":"适用场景"}]')

  if (options.context && options.context.trim()) {
    parts.push(`\n背景信息：\n${options.context.trim()}`)
  }
  if (options.style && options.style.trim()) {
    parts.push(`命名风格：${options.style.trim()}`)
  }
  if (options.length && options.length.trim()) {
    parts.push(`名字字数：${options.length.trim()}`)
  }
  if (options.type === 'character') {
    if (options.gender) parts.push(`性别：${options.gender}`)
    if (options.species) parts.push(`种族：${options.species}`)
  }

  const system = '你是专业的小说命名专家，擅长为奇幻、武侠、仙侠、都市等题材创造独特且有意境的名字。只返回 JSON 数组，不要包含 markdown 代码块或任何说明文字。'
  const user = parts.join('\n')
  return { system, user }
}

/**
 * 修复 JSON 文本：去除 markdown fence、提取数组
 */
export function repairNamingJson(text: string): any[] | null {
  if (!text) return null
  let t = text.trim()
  // 直接解析
  try { const p = JSON.parse(t); return Array.isArray(p) ? p : null } catch { /* continue */ }
  // 去除 markdown fence
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    try { const p = JSON.parse(fence[1].trim()); return Array.isArray(p) ? p : null } catch { /* continue */ }
  }
  // 提取数组
  const arr = t.match(/\[[\s\S]*\]/)
  if (arr) {
    try { const p = JSON.parse(arr[0]); return Array.isArray(p) ? p : null } catch { /* continue */ }
  }
  return null
}

/**
 * 校验并规范化单条结果
 */
function normalizeResultItem(item: any, type: NamingType, requestId: string): NamingResult | null {
  if (!item || typeof item !== 'object') return null
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  if (!name) return null
  const meaning = typeof item.meaning === 'string' ? item.meaning.trim() : ''
  const usage = typeof item.usage === 'string' ? item.usage.trim() : ''
  return {
    id: 'nm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    name,
    meaning,
    usage: usage || undefined,
    type,
    createdAt: new Date().toISOString(),
    sourceRequestId: requestId,
  }
}

/**
 * 生成名字
 * @param options 命名参数
 * @param providerStore 可选，用于获取 provider/agent/model
 * @param signal 取消信号
 * @param onProgress 进度回调
 */
export async function generateNames(
  options: NamingOptions,
  deps: {
    providerStore: any
    agentStore: any
    skillStore?: any
  },
  signal?: AbortSignal,
  onProgress?: (label: string) => void
): Promise<NamingGenerateResult> {
  const { providerStore, agentStore } = deps
  const provider = providerStore.activeGenerateProvider
  if (!provider || !provider.apiKey) {
    throw { kind: 'no_provider', message: '未配置 API 提供方，请在设置中配置后重试。' } as NamingGenerateError
  }

  const agent = agentStore.activeAgent
  const model = agent?.model || provider.selectedModel || ''
  const temperature = agent?.temperature ?? 0.8
  const maxTokens = agent?.maxTokens || 4096

  const { system, user } = buildNamingPrompt(options)
  const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)

  onProgress?.('正在请求 AI 生成…')

  const aiService = await getAiService()
  let rawText: string
  try {
    const result = await aiService.callAi({
      purpose: 'generate',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      model,
      temperature,
      maxTokens,
      jsonMode: true,
      stream: false,
      retry: true,
      timeoutMs: 60_000,
      signal,
      meta: { source: 'namingService.generateNames' },
      onProgress: (pct, label) => onProgress?.(label),
    })
    rawText = result.text
  } catch (e: any) {
    const err = e as AiServiceError
    if (err?.kind === 'canceled') {
      throw { kind: 'canceled', message: '已取消' } as NamingGenerateError
    }
    if (err?.kind === 'timeout') {
      throw { kind: 'timeout', message: '请求超时，请检查网络或重试。' } as NamingGenerateError
    }
    if (err?.kind === 'auth') {
      throw { kind: 'auth', message: err.message || 'API Key 无效' } as NamingGenerateError
    }
    if (err?.kind === 'http') {
      throw { kind: 'http', message: err.message || 'HTTP ' + err.statusCode, statusCode: err.statusCode || 0 } as NamingGenerateError
    }
    if (err?.kind === 'json') {
      throw { kind: 'json', message: 'AI 返回格式错误，已尝试修复但无法解析。' } as NamingGenerateError
    }
    throw { kind: 'network', message: err?.message || '网络错误' } as NamingGenerateError
  }

  onProgress?.('正在解析结果…')

  const parsed = repairNamingJson(rawText)
  if (!parsed || parsed.length === 0) {
    throw { kind: 'empty', message: 'AI 未返回有效结果，请重试或调整参数。' } as NamingGenerateError
  }

  const count = Math.max(MIN_COUNT, Math.min(MAX_COUNT, options.count))
  const results: NamingResult[] = []
  let filtered = 0
  const seen = new Set<string>()

  for (const item of parsed) {
    if (results.length >= count) break
    const normalized = normalizeResultItem(item, options.type, requestId)
    if (!normalized) {
      filtered++
      continue
    }
    // 去重
    if (seen.has(normalized.name)) {
      filtered++
      continue
    }
    seen.add(normalized.name)
    results.push(normalized)
  }

  // 如果解析出的有效项多于请求量，截断
  if (results.length > count) {
    filtered += results.length - count
    results.length = count
  }

  if (results.length === 0) {
    throw { kind: 'empty', message: '所有结果均无效，请重试或调整参数。' } as NamingGenerateError
  }

  onProgress?.('')

  return {
    results,
    validCount: results.length,
    filteredCount: filtered,
    requestId,
  }
}

/**
 * 单项重新生成
 */
export async function regenerateSingleName(
  options: NamingOptions,
  deps: { providerStore: any; agentStore: any },
  signal?: AbortSignal,
  onProgress?: (label: string) => void
): Promise<NamingResult | null> {
  const singleOptions: NamingOptions = { ...options, count: 1 }
  const result = await generateNames(singleOptions, deps, signal, onProgress)
  return result.results[0] || null
}

/**
 * 判断是否为 NamingGenerateError
 */
export function isNamingError(e: any): e is NamingGenerateError {
  return e && typeof e.kind === 'string' && 'message' in e
}

/**
 * 判断是否为取消错误
 */
export function isCanceledError(e: any): boolean {
  return isNamingError(e) && e.kind === 'canceled'
}
