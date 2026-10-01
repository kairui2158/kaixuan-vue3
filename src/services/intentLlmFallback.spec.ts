import { describe, expect, it, vi } from 'vitest'
import { createIntentLlmFallback } from './intentLlmFallback'

interface IntentFallbackRequest {
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
}

function createService(text: string) {
  const callAi = vi.fn(async (_request: IntentFallbackRequest) => ({ text }))
  return {
    callAi: callAi as unknown as (request: IntentFallbackRequest) => Promise<{ text: string }>,
    callAiMock: callAi,
  }
}

describe('createIntentLlmFallback', () => {
  it('uses the verify provider when configured', async () => {
    const service = createService('{"intent":"discuss","confidence":0.9,"reason":"test"}')
    const classifier = createIntentLlmFallback({
      activeVerifyProvider: { selectedModel: 'verify-model', models: [] },
      activeGenerateProvider: { selectedModel: 'generate-model', models: [] },
      getAiService: async () => service,
    })

    await expect(classifier('这句语义很模糊')).resolves.toEqual({
      intent: 'discuss',
      confidence: 0.9,
      reason: 'test',
    })
    expect(service.callAi).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'verify',
      model: 'verify-model',
    }))
  })

  it('falls back to the generate provider and generate purpose when verify is absent', async () => {
    const service = createService('```json\n{"intent":"edit","confidence":0.82,"reason":"fenced"}\n```')
    const classifier = createIntentLlmFallback({
      activeGenerateProvider: { selectedModel: 'generate-model', models: [] },
      getAiService: async () => service,
    })

    await expect(classifier('开篇那个吸引点我不太满意')).resolves.toEqual({
      intent: 'edit',
      confidence: 0.82,
      reason: 'fenced',
    })
    expect(service.callAi).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'generate',
      model: 'generate-model',
    }))
  })

  it('returns a diagnostic reason when no provider is configured', async () => {
    const service = createService('{}')
    const classifier = createIntentLlmFallback({
      activeVerifyProvider: null,
      activeGenerateProvider: null,
      getAiService: async () => service,
    })

    await expect(classifier('任何输入')).resolves.toEqual({
      reason: 'llm-fallback-unavailable:no-provider',
    })
    expect(service.callAi).not.toHaveBeenCalled()
  })

  it('returns null when the model response contains no JSON object', async () => {
    const service = createService('这不是合法 JSON。')
    const classifier = createIntentLlmFallback({
      activeGenerateProvider: { selectedModel: 'generate-model', models: [] },
      getAiService: async () => service,
    })

    await expect(classifier('开篇那个吸引点我不太满意')).resolves.toBeNull()
  })

  it('emits trace events around the classifier API call', async () => {
    const events: string[] = []
    const service = createService('{"intent":"discuss","confidence":0.91,"reason":"ok"}')
    const classifier = createIntentLlmFallback({
      activeGenerateProvider: { selectedModel: 'generate-model', models: [] },
      getAiService: async () => service,
      onTraceEvent: event => events.push(event.type),
    })

    await classifier('这句语义很模糊')

    expect(events).toEqual([
      'intent-llm-fallback-start',
      'intent-llm-fallback-finish',
    ])
    expect(service.callAi).toHaveBeenCalledWith(expect.objectContaining({
      timeoutMs: 6000,
      cancelSignal: undefined,
    }))
  })

  it('does not turn the classifier deadline into user cancellation', async () => {
    const service = createService('{"intent":"discuss","confidence":0.91,"reason":"ok"}')
    const classifier = createIntentLlmFallback({
      activeGenerateProvider: { selectedModel: 'generate-model', models: [] },
      getAiService: async () => service,
    })
    const controller = new AbortController()

    await classifier('这句语义很模糊', { signal: controller.signal })

    expect(service.callAi).toHaveBeenCalledWith(expect.objectContaining({
      cancelSignal: undefined,
    }))
    expect(service.callAiMock.mock.calls[0]?.[0]).not.toHaveProperty('signal')
  })
})
