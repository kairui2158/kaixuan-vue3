import { describe, expect, it } from 'vitest'
import { exportRunTraceToJson, exportRunTraceToText } from './runTraceExportService'
import type { RunTrace, RunTracePhysicalCall } from '../stores/runTrace'

function makeRun(overrides: Partial<RunTrace> = {}): RunTrace {
  return {
    id: 'run-1',
    source: 'outline',
    sourceName: '大纲工作台',
    stepName: '大纲共创',
    mode: 'chat',
    status: 'running',
    sessionKind: 'chat',
    startedAt: 1,
    skillNames: ['大纲技能'],
    skillMode: 'folder',
    events: [],
    turns: [],
    apiCalls: [],
    ...overrides
  } as RunTrace
}

describe('run trace export service', () => {
  it('exports JSON with masking, schema version, and no live-only fields', () => {
    const run = makeRun({
      currentTurnId: 'turn-1',
      dirName: 'disk-dir',
      providerId: 'provider-1',
      apiCalls: [{
        id: 'call-1',
        seq: 1,
        status: 'success',
        requestMessages: [{ role: 'user', content: 'api_key=sk-123456789012345678' }],
        responseText: 'Authorization: Bearer secret-token',
        streamText: '',
        reasoningText: ''
      } as RunTrace['apiCalls'][number]]
    })

    const exported = exportRunTraceToJson(run)
    const serialized = JSON.stringify(exported)

    expect(exported.schemaVersion).toBe(20)
    expect(exported.exportSchemaVersion).toBe(20)
    expect((exported as Record<string, unknown>).currentTurnId).toBeUndefined()
    expect((exported as Record<string, unknown>).dirName).toBeUndefined()
    expect(serialized).not.toContain('sk-123456789012345678')
    expect(serialized).toContain('***MASKED***')
  })

  it('exports completed live chat runs as session snapshots without mutating the live run', () => {
    const run = makeRun({
      currentTurnId: undefined,
      apiCalls: []
    })
    const exported = exportRunTraceToJson(run) as Partial<RunTrace>

    expect(run.sessionSnapshot).toBeUndefined()
    expect(exported.sessionSnapshot).toBe(true)
    expect(exported.status).toBe('running')
    expect(exportRunTraceToText(run)).toContain('会话快照：导出时会话仍在应用内继续')
  })

  it('keeps physical cache observations in JSON and text exports', () => {
    const run = makeRun({
      apiCalls: [{
        id: 'call-1',
        seq: 1,
        status: 'success',
        requestMessages: [{ role: 'user', content: '生成章节' }],
        responseText: '章节内容',
        streamText: '',
        reasoningText: '',
        physicalCalls: [{
          id: 'physical-1',
          seq: 1,
          phase: 'normal',
          status: 'success',
          requestMessages: [{ role: 'user', content: '生成章节' }],
          responseText: '章节内容',
          streamText: '',
          cacheUsageSummary: {
            status: 'reported',
            cacheReadInputTokens: 80,
            cacheReadInputRatio: 0.8
          },
          contextComposition: {
            layer: 'chapter',
            step: 3,
            cacheFamily: 'openai-compatible:provider-a:model-a:chapter:step-3',
            prefixFingerprint: 'prefix-a',
            stableRatio: 0.714
          }
        } as RunTracePhysicalCall]
      } as RunTrace['apiCalls'][number]]
    })

    const json = exportRunTraceToJson(run)
    const physical = (json.apiCalls as unknown as RunTrace['apiCalls'])[0]?.physicalCalls?.[0]
    expect(physical?.cacheUsageSummary).toEqual({
      status: 'reported',
      cacheReadInputTokens: 80,
      cacheReadInputRatio: 0.8
    })
    expect(physical?.contextComposition).toMatchObject({
      layer: 'chapter',
      step: 3,
      cacheFamily: 'openai-compatible:provider-a:model-a:chapter:step-3'
    })

    const text = exportRunTraceToText(run)
    expect(text).toContain('缓存命中：80 input tokens (80%)')
    expect(text).toContain('上下文组成：stable=0.714 family=openai-compatible:provider-a:model-a:chapter:step-3')
  })
})
