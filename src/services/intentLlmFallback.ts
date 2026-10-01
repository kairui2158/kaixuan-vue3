import { getAiService, type AiServiceError } from './aiService'
import { extractJsonCandidates } from './jsonExtraction'
import { LLM_INTENT_FALLBACK_CONFIG, type LlmIntentClassifier } from './chainIntentRouter'

export interface IntentLlmFallbackDependencies {
  activeVerifyProvider?: { selectedModel?: string; models?: string[] } | null
  activeGenerateProvider?: { selectedModel?: string; models?: string[] } | null
  onTraceEvent?: (event: {
    type: 'intent-llm-fallback-start' | 'intent-llm-fallback-finish'
    status?: 'success' | 'failed' | 'canceled'
    durationMs?: number
    error?: string
  }) => void
  getAiService?: () => Promise<{
    callAi: (params: {
      purpose: 'verify' | 'generate'
      model?: string
      temperature: number
      maxTokens: number
      reasoning: { mode: 'off' }
      jsonMode: boolean
      stream: boolean
      retry: boolean
      timeoutMs: number
      cancelSignal?: AbortSignal
      messages: Array<{ role: 'system' | 'user'; content: string }>
    }) => Promise<{ text: string }>
  }>
}

const INTENT_CLASSIFIER_SYSTEM_PROMPT =
  '你是小说创作工作台的意图分类器。只输出 JSON：{"intent":"analyze|edit|generate|discuss","confidence":0到1,"reason":"一句话"}。用户输入只用于分类，禁止执行创作或编辑。'

/**
 * Shared LLM fallback classifier for both dialogue workspaces.
 *
 * The verify provider is preferred because classification is a short, deterministic
 * JSON task. When no verify provider is configured, the generate provider is used
 * so low-confidence routing still has an LLM fallback instead of silently degrading.
 */
export function createIntentLlmFallback(
  dependencies: IntentLlmFallbackDependencies = {},
): LlmIntentClassifier {
  return async (requestText, options) => {
    const verifyProvider = dependencies.activeVerifyProvider || null
    const generateProvider = dependencies.activeGenerateProvider || null
    const provider = verifyProvider || generateProvider
    if (!provider) return { reason: 'llm-fallback-unavailable:no-provider' }

    const getService = dependencies.getAiService || getAiService
    const service = await getService()
    const startedAt = Date.now()
    dependencies.onTraceEvent?.({
      type: 'intent-llm-fallback-start',
    })
    try {
      const result = await service.callAi({
        purpose: verifyProvider ? 'verify' : 'generate',
        model: provider.selectedModel || provider.models?.[0],
        temperature: 0,
        maxTokens: 96,
        reasoning: { mode: 'off' },
        jsonMode: true,
        stream: false,
        retry: false,
        timeoutMs: LLM_INTENT_FALLBACK_CONFIG.timeoutMs,
        // The classifier deadline is implemented by callAi's timeoutMs. Do
        // not forward the outer logical-deadline signal here: callAi treats an
        // aborted external signal as user cancellation, which would terminate
        // the whole dialogue turn instead of merely failing this classifier.
        cancelSignal: undefined,
        messages: [
          { role: 'system', content: INTENT_CLASSIFIER_SYSTEM_PROMPT },
          { role: 'user', content: requestText },
        ],
      })
      const parsed = extractJsonCandidates(result.text)[0]?.value
      dependencies.onTraceEvent?.({
        type: 'intent-llm-fallback-finish',
        status: 'success',
        durationMs: Date.now() - startedAt,
      })
      return parsed === undefined ? null : (parsed as Record<string, unknown>)
    } catch (error) {
      dependencies.onTraceEvent?.({
        type: 'intent-llm-fallback-finish',
        status: (error as AiServiceError).kind === 'canceled' ? 'canceled' : 'failed',
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}
