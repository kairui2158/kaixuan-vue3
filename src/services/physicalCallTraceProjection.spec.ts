import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createAiService, type PhysicalCallEvent } from './aiService'
import { projectPhysicalCallEvent } from './physicalCallTraceProjection'
import { exportRunTraceToJson, exportRunTraceToText } from './runTraceExportService'
import { useRunTraceStore } from '../stores/runTrace'

const chatSource = readFileSync(
  fileURLToPath(new URL('../components/chat/ChatPanel.vue', import.meta.url)),
  'utf8'
)
const outlineSource = readFileSync(
  fileURLToPath(new URL('../components/common/OutlineWorkspace.vue', import.meta.url)),
  'utf8'
)
const pipelineSource = readFileSync(
  fileURLToPath(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url)),
  'utf8'
)

function makeEvent(): PhysicalCallEvent {
  return {
    physicalCallId: 'physical-1',
    phase: 'normal',
    status: 'failed',
    attempt: 1,
    requestMessages: [{ role: 'user', content: '生成正文' }],
    responseText: '',
    streamText: '',
    reasoningText: '',
    durationMs: 120,
    error: 'Unauthorized',
    toolsEnabled: false,
    toolsDowngraded: false,
    statusCode: 401,
    providerErrorSummary: 'Invalid API key sk-123456789012345678',
    finalUrl: 'https://api.example.com/v1/chat/completions?key=sk-123456789012345678',
    transport: 'renderer-fetch',
    maxTokens: 4096,
    temperature: 0.35,
    thinkingDisableParam: 'thinking',
    thinkingDisableValue: '{"type":"disabled"}',
  }
}

describe('physical call trace projection', () => {
  it('projects every physical-call trace field from the service event', () => {
    const projected = projectPhysicalCallEvent(makeEvent())

    expect(projected).toMatchObject({
      physicalCallId: 'physical-1',
      phase: 'normal',
      status: 'failed',
      requestMessages: [{ role: 'user', content: '生成正文' }],
      responseText: '',
      streamText: '',
      reasoningText: '',
      durationMs: 120,
      error: 'Unauthorized',
      statusCode: 401,
      providerErrorSummary: 'Invalid API key sk-123456789012345678',
      finalUrl: 'https://api.example.com/v1/chat/completions?key=sk-123456789012345678',
      transport: 'renderer-fetch',
      maxTokens: 4096,
      temperature: 0.35,
      thinkingDisableParam: 'thinking',
      thinkingDisableValue: '{"type":"disabled"}',
    })
  })

  it('keeps all direct production appendPhysicalCall entries on the shared projection', () => {
    const sources = [
      { name: 'ChatPanel', source: chatSource, expected: 1 },
      { name: 'OutlineWorkspace', source: outlineSource, expected: 2 },
      { name: 'PipelinePanel', source: pipelineSource, expected: 5 },
    ]

    for (const { name, source, expected } of sources) {
      const calls = source.match(/appendPhysicalCall\(/g) || []
      expect(calls, name).toHaveLength(expected)
      expect(source.match(/projectPhysicalCallEvent\(event\)/g), name).toHaveLength(expected)
      expect(source).not.toContain('cacheUsageSummary: event.cacheUsageSummary')
      expect(source).not.toContain('contextComposition: event.contextComposition')
    }
  })

  it('carries provider diagnostics from a renderer 401 through store and exports with masking', async () => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      error: { message: 'Invalid API key sk-123456789012345678' },
    }), { status: 401 })))
    const events: PhysicalCallEvent[] = []
    const service = createAiService({
      providers: [{
        id: 'runtime',
        name: 'Runtime',
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-123456789012345678',
        selectedModel: 'test-model',
        temperature: 0.2,
        maxTokens: 1024,
        providerType: 'openai-compatible',
        streamMode: false,
        systemPrompt: '',
        contextWindowTokens: 0,
      }],
      generateProvider: 'runtime',
      verifyProvider: 'runtime',
      detectProvider: null,
      getGenerateProvider() { return this.providers[0] },
      getVerifyProvider() { return this.providers[0] },
      getDetectProvider() { return undefined },
    } as any)
    await expect(service.callAi({
      purpose: 'generate',
      messages: [{ role: 'user', content: '生成正文' }],
      stream: false,
      retry: false,
      onPhysicalCall: event => events.push(event),
    })).rejects.toMatchObject({ kind: 'auth', statusCode: 401 })
    vi.unstubAllGlobals()

    const terminal = events.find(event => event.status === 'failed')
    expect(terminal).toMatchObject({
      statusCode: 401,
      providerErrorSummary: 'Invalid API key sk-123456789012345678',
      finalUrl: 'https://api.example.com/v1/chat/completions',
      transport: 'renderer-fetch',
    })

    const store = useRunTraceStore()
    const runId = store.startRun({ stepName: '正文层', mode: 'single', skillNames: [] })
    const callId = store.startApiCall(runId, {
      requestMessages: [{ role: 'user', content: '生成正文' }]
    })
    for (const event of events) {
      store.appendPhysicalCall(runId, callId, projectPhysicalCallEvent(event))
    }
    const run = store.getRun(runId)!
    const physical = run.apiCalls[0].physicalCalls![0]
    expect(physical).toMatchObject({
      statusCode: 401,
      providerErrorSummary: 'Invalid API key sk-123456789012345678',
      finalUrl: 'https://api.example.com/v1/chat/completions',
      transport: 'renderer-fetch',
      temperature: 0.2,
      maxTokens: 1024,
    })

    const json = JSON.stringify(exportRunTraceToJson(run))
    const text = exportRunTraceToText(run)
    expect(json).not.toContain('sk-123456789012345678')
    expect(text).toContain('HTTP状态：401')
    expect(text).toContain('供应商错误：Invalid API key ***MASKED***')
    expect(text).toContain('最终URL：https://api.example.com/v1/chat/completions')
    expect(text).toContain('传输通道：renderer-fetch')
  })
})
