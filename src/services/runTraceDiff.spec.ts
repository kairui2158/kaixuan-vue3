import { describe, expect, it } from 'vitest'
import type { RunTrace, RunTraceApiCall } from '../stores/runTrace'
import {
  buildRunTraceDiff,
  buildRunTraceDiffExport,
  buildRunTraceDiffText,
  buildTextDiff
} from './runTraceDiff'

function makeRun(overrides: Partial<RunTrace> = {}): RunTrace {
  return {
    id: 'run-a',
    source: 'pipeline',
    sourceName: '生成流水线',
    mode: 'chain',
    skillNames: [],
    status: 'success',
    startedAt: 1,
    events: [],
    apiCalls: [],
    promptSnapshots: [],
    processingReports: [],
    payloads: [],
    ...overrides
  }
}

function makeCall(id: string, seq: number, overrides: Partial<RunTraceApiCall> = {}): RunTraceApiCall {
  return {
    id,
    seq,
    status: 'success',
    requestMessages: [{ role: 'user', content: '请求' }],
    responseText: '返回',
    streamText: '',
    reasoningText: '',
    startedAt: 1,
    ...overrides
  }
}

describe('runTraceDiff', () => {
  it('marks two identical runs as unchanged', () => {
    const run = makeRun()
    const result = buildRunTraceDiff(run, run)
    expect(result.overview.every(field => !field.changed)).toBe(true)
    expect(result.apiCalls).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('marks unmatched api calls as existing on one side only', () => {
    const a = makeRun({ id: 'a', apiCalls: [makeCall('a1', 1), makeCall('a2', 2)] })
    const b = makeRun({ id: 'b', apiCalls: [makeCall('b1', 1)] })
    const result = buildRunTraceDiff(a, b)
    expect(result.apiCalls[0].onlyIn).toBeUndefined()
    expect(result.apiCalls[1].onlyIn).toBe('A')
    expect(result.apiCalls[1].b).toBeNull()
  })

  it('compares api metadata fields', () => {
    const a = makeRun({ id: 'a', apiCalls: [makeCall('a1', 1, { model: 'model-a', durationMs: 100, status: 'success' })] })
    const b = makeRun({ id: 'b', apiCalls: [makeCall('b1', 1, { model: 'model-b', durationMs: 300, status: 'degraded' })] })
    const result = buildRunTraceDiff(a, b)
    const changed = result.apiCalls[0].fields.filter(field => field.changed).map(field => field.key)
    expect(changed).toContain('model')
    expect(changed).toContain('durationMs')
    expect(changed).toContain('status')
  })

  it('compares declared and actual tool surfaces separately', () => {
    const a = makeRun({ id: 'a', apiCalls: [makeCall('a1', 1, {
      toolSurface: [{ name: 'editor.write', policy: 'write' }],
      actualToolSurface: []
    })] })
    const b = makeRun({ id: 'b', apiCalls: [makeCall('b1', 1, {
      toolSurface: [{ name: 'editor.write', policy: 'write' }],
      actualToolSurface: [{ name: 'editor.write', policy: 'write' }]
    })] })
    const result = buildRunTraceDiff(a, b)
    expect(result.toolSurfaces[0].policyA).toBe('write')
    expect(result.toolSurfaces[0].policyB).toBe('write')
    expect(result.actualToolSurfaces[0].policyA).toBeUndefined()
    expect(result.actualToolSurfaces[0].policyB).toBe('write')
    expect(result.actualToolSurfaces[0].onlyIn).toBe('B')
  })

  it('compares request, response, stream and reasoning text', () => {
    const a = makeRun({ id: 'a', apiCalls: [makeCall('a1', 1, {
      requestMessages: [{ role: 'system', content: '旧系统词' }],
      responseText: '旧返回',
      streamText: '旧流式',
      reasoningText: '旧思考'
    })] })
    const b = makeRun({ id: 'b', apiCalls: [makeCall('b1', 1, {
      requestMessages: [{ role: 'system', content: '新系统词' }],
      responseText: '新返回',
      streamText: '新流式',
      reasoningText: '新思考'
    })] })
    const result = buildRunTraceDiff(a, b)
    expect(result.apiCalls[0].requestDiffs[0].diff.same).toBe(false)
    expect(result.apiCalls[0].responseDiff.same).toBe(false)
    expect(result.apiCalls[0].streamDiff.same).toBe(false)
    expect(result.apiCalls[0].reasoningDiff.same).toBe(false)
  })

  it('keeps missing prompt snapshots visible instead of inventing data', () => {
    const callA = makeCall('a1', 1)
    const callB = makeCall('b1', 1)
    const a = makeRun({
      id: 'a',
      apiCalls: [callA],
      promptSnapshots: [{
        id: 'snapshot-a',
        apiCallId: 'a1',
        builtAt: 1,
        contextBlocks: [],
        finalMessages: []
      }]
    })
    const b = makeRun({ id: 'b', apiCalls: [callB] })
    const result = buildRunTraceDiff(a, b)
    expect(result.promptSnapshots[0].a?.id).toBe('snapshot-a')
    expect(result.promptSnapshots[0].b).toBeNull()
    expect(result.promptSnapshots[0].onlyIn).toBe('A')
  })

  it('compares variables, context blocks and folder fingerprints', () => {
    const callA = makeCall('a1', 1)
    const callB = makeCall('b1', 1)
    const snapshotBase = { builtAt: 1, contextBlocks: [], finalMessages: [] }
    const a = makeRun({
      id: 'a',
      apiCalls: [callA],
      promptSnapshots: [{
        ...snapshotBase,
        id: 'snapshot-a',
        apiCallId: 'a1',
        variables: [{ key: 'chapterTitle', source: 'user', chars: 2, value: '旧标题' }],
        folderFingerprint: [{ file: 'SKILL.md', hash: 'old-hash', mtime: 1, bytes: 10 }]
      }]
    })
    const b = makeRun({
      id: 'b',
      apiCalls: [callB],
      promptSnapshots: [{
        ...snapshotBase,
        id: 'snapshot-b',
        apiCallId: 'b1',
        variables: [{ key: 'chapterTitle', source: 'user', chars: 2, value: '新标题' }],
        folderFingerprint: [{ file: 'SKILL.md', hash: 'new-hash', mtime: 2, bytes: 12 }]
      }]
    })
    const result = buildRunTraceDiff(a, b)
    expect(result.promptSnapshots[0].variableDiff.same).toBe(false)
    expect(result.promptSnapshots[0].fingerprintDiff.same).toBe(false)
    expect(result.promptSnapshots[0].contextDiff.same).toBe(true)
  })

  it('compares physical calls, tool calls and processing reports', () => {
    const callA = makeCall('a1', 1, {
      physicalCalls: [{
        id: 'p-a',
        seq: 1,
        phase: 'normal',
        status: 'success',
        requestMessages: [],
        responseText: '物理返回 A',
        streamText: '',
        startedAt: 1,
        durationMs: 10
      }],
      toolCalls: [{
        id: 't-a',
        name: 'editor.write',
        input: { text: 'A' },
        result: { ok: true },
        status: 'success',
        startedAt: 1,
        durationMs: 5
      }]
    })
    const callB = makeCall('b1', 1, {
      physicalCalls: [{
        id: 'p-b',
        seq: 1,
        phase: 'retry',
        status: 'degraded',
        requestMessages: [],
        responseText: '物理返回 B',
        streamText: '',
        startedAt: 1,
        durationMs: 20
      }],
      toolCalls: [{
        id: 't-b',
        name: 'editor.write',
        input: { text: 'B' },
        result: { ok: false },
        status: 'failed',
        startedAt: 1,
        durationMs: 9
      }]
    })
    const a = makeRun({ id: 'a', apiCalls: [callA], processingReports: [] })
    const b = makeRun({
      id: 'b',
      apiCalls: [callB],
      processingReports: [{
        id: 'r-b',
        apiCallId: 'b1',
        stage: 'post',
        processor: 'hard-rules',
        status: 'warning',
        startedAt: 1,
        ruleHits: [{ rule: 'cliche', count: 2 }],
        issues: [{ level: 'warning', code: 'changed', message: '命中规则', blocking: false }]
      }]
    })
    const result = buildRunTraceDiff(a, b)
    expect(result.physicalCalls[0].fields.find(field => field.key === 'phase')?.changed).toBe(true)
    expect(result.toolCalls[0].fields.find(field => field.key === 'status')?.changed).toBe(true)
    expect(result.processingReports[0].onlyIn).toBe('B')
    expect(result.processingReports[0].ruleHitsDiff.same).toBe(false)
  })

  it('degrades oversized text to stats mode without changing source text', () => {
    const longTextA = Array.from({ length: 40000 }, (_, index) => `line-a-${index}`).join('\n')
    const longTextB = Array.from({ length: 40001 }, (_, index) => `line-b-${index}`).join('\n')
    const diff = buildTextDiff(longTextA, longTextB)
    expect(diff.mode).toBe('stats')
    expect(diff.changes).toBeUndefined()
    expect(diff.stats.aLines).toBe(40000)
    expect(diff.stats.bLines).toBe(40001)
  })

  it('exports full source runs and masks sensitive values', () => {
    const secret = 'sk-1234567890abcdef'
    const a = makeRun({ id: 'a', apiCalls: [makeCall('a1', 1, {
      responseText: `返回 ${secret}`,
      requestMessages: [{ role: 'user', content: `api_key=${secret}` }]
    })] })
    const b = makeRun({ id: 'b', apiCalls: [makeCall('b1', 1, { responseText: '返回 B' })] })
    const result = buildRunTraceDiff(a, b)
    const exported = buildRunTraceDiffExport(result, value => value) as any
    expect(exported.runs.a.apiCalls[0].responseText).toContain(secret)

    const masked = buildRunTraceDiffExport(result, value => {
      if (typeof value === 'string') return value.replace(/sk-[A-Za-z0-9_-]{8,}/g, '***MASKED***')
      if (Array.isArray(value)) return value.map(item => maskedValue(item))
      if (value && typeof value === 'object') {
        const output: Record<string, unknown> = {}
        Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
          output[key] = maskedValue(item)
        })
        return output
      }
      return value
    }) as any
    expect(JSON.stringify(masked)).not.toContain(secret)
    expect(JSON.stringify(masked)).toContain('***MASKED***')
  })

  it('renders warnings, only-in labels and state divergence in text report', () => {
    const a = makeRun({
      id: 'a',
      source: 'outline',
      sourceName: '大纲工作台',
      status: 'running',
      stateHistory: [{ fromStatus: 'running', toStatus: 'success', recordedAt: 1 }]
    })
    const b = makeRun({
      id: 'b',
      stateHistory: [{ fromStatus: 'running', toStatus: 'degraded', reason: '产物降级', recordedAt: 1 }]
    })
    const text = buildRunTraceDiffText(buildRunTraceDiff(a, b))
    expect(text).toContain('来源不同')
    expect(text).toContain('临时快照')
    expect(text).toContain('状态历史首次分叉')
  })

  it('warns when payload integrity warnings exist', () => {
    const a = makeRun({ id: 'a', payloadIntegrityWarnings: ['hashMismatch'] })
    const b = makeRun({ id: 'b' })
    expect(buildRunTraceDiff(a, b).warnings.join('\n')).toContain('payload 完整性警告')
  })
})

function maskedValue(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/sk-[A-Za-z0-9_-]{8,}/g, '***MASKED***')
  if (Array.isArray(value)) return value.map(item => maskedValue(item))
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      output[key] = maskedValue(item)
    })
    return output
  }
  return value
}
