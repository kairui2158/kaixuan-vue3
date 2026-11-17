import { describe, expect, it } from 'vitest'
import { exportRunTraceToJson, exportRunTraceToText } from './runTraceExportService'
import type { RunTrace, RunTracePhysicalCall } from '../stores/runTrace'
import type { RunTracePromptSnapshot } from '../stores/runTrace'

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

    expect(exported.schemaVersion).toBe(23)
    expect(exported.exportSchemaVersion).toBe(23)
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

  it('keeps provider diagnostics in JSON and text exports with masking', () => {
    const run = makeRun({
      apiCalls: [{
        id: 'call-1',
        seq: 1,
        status: 'failed',
        requestMessages: [{ role: 'user', content: '生成正文' }],
        responseText: '',
        streamText: '',
        reasoningText: '',
        physicalCalls: [{
          id: 'physical-1',
          seq: 1,
          phase: 'normal',
          status: 'failed',
          requestMessages: [{ role: 'user', content: '生成正文' }],
          responseText: '',
          streamText: '',
          reasoningText: '',
          statusCode: 401,
          providerErrorSummary: 'Invalid API key sk-123456789012345678',
          finalUrl: 'https://api.example.com/v1/chat/completions?key=sk-123456789012345678',
          transport: 'renderer-fetch',
          temperature: 0.35,
          maxTokens: 4096,
          thinkingDisableParam: 'thinking',
          thinkingDisableValue: '{"type":"disabled"}'
        } as RunTracePhysicalCall]
      } as RunTrace['apiCalls'][number]]
    })

    const json = exportRunTraceToJson(run)
    const serialized = JSON.stringify(json)
    const physical = (json.apiCalls as unknown as RunTrace['apiCalls'])[0]?.physicalCalls?.[0]
    const text = exportRunTraceToText(run)

    expect(physical).toMatchObject({
      statusCode: 401,
      providerErrorSummary: 'Invalid API key ***MASKED***',
      finalUrl: 'https://api.example.com/v1/chat/completions?key=***MASKED***',
      transport: 'renderer-fetch'
    })
    expect(physical?.temperature).toBe(0.35)
    expect(physical?.maxTokens).toBe(4096)
    expect(physical?.thinkingDisableParam).toBe('thinking')
    expect(physical?.thinkingDisableValue).toBe('{"type":"disabled"}')
    expect(serialized).not.toContain('sk-123456789012345678')
    expect(text).toContain('HTTP状态：401')
    expect(text).toContain('供应商错误：Invalid API key ***MASKED***')
    expect(text).toContain('最终URL：https://api.example.com/v1/chat/completions?key=***MASKED***')
    expect(text).toContain('传输通道：renderer-fetch')
    expect(text).toContain('请求参数：temperature=0.35 / maxTokens=4096 / thinkingDisable=thinking={"type":"disabled"}')
  })

  it('exports folder fingerprint in prompt snapshot text output', () => {
    const run = makeRun({
      promptSnapshots: [{
        id: 'snapshot-1',
        apiCallId: 'call-1',
        skillId: 'kaixuan-s2',
        skillName: '正文 S2',
        mode: 'folder-fingerprint',
        builtAt: 1,
        folderFingerprint: [{ file: 'kaixuan-s2/script.js', hash: 'abc123', mtime: 1, bytes: 128 }],
        contextBlocks: [],
        finalMessages: [{ role: 'user', content: '生成正文' }]
      } as unknown as RunTracePromptSnapshot]
    })

    const text = exportRunTraceToText(run)

    expect(text).toContain('===== 提示词快照 =====')
    expect(text).toContain('模式：folder-fingerprint')
    expect(text).toContain('目录指纹：kaixuan-s2/script.js:abc123')
  })

  it('projects postProcess and processing warnings into text exports', () => {
    const run = makeRun({
      folderDiagnostics: [{
        postProcessReport: {
          warnings: ['S1 输出接近预警上限']
        }
      }],
      processingReports: [{
        id: 'report-1',
        processor: 'postProcess',
        stage: 'post',
        status: 'success',
        warnings: ['本地处理观测：候选重试'],
        issues: [],
        startedAt: 1,
        endedAt: 2,
        durationMs: 1
      } as unknown as NonNullable<RunTrace['processingReports']>[number]]
    })

    const text = exportRunTraceToText(run)

    expect(text).toContain('S1 输出接近预警上限')
    expect(text).toContain('警告：')
    expect(text).toContain('本地处理观测：候选重试')
  })
})
