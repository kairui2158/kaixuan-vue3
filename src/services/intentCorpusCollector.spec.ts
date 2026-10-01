import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeIntentCorpusInference,
  flushIntentCorpus,
  intentCorpusQueueStats,
  recordIntentCorpusSample,
  recordIntentRoutingConfirmation,
  resetIntentCorpusCollectorForTests,
  recordIntentRoutingSample,
  stageIntentCorpusInference,
  __testQueueCorpusSample,
} from './intentCorpusCollector.ts'

type AppendPayload = { samples: unknown[] }

describe('intent corpus collector', () => {
  beforeEach(() => {
    resetIntentCorpusCollectorForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('queues routing samples and drains them in batches', async () => {
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: true }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })

    recordIntentRoutingSample({
      workspace: 'outline-workbench',
      requestText: '第一卷的钩子想再聊聊',
      routing: {
        kind: 'matched',
        intent: 'discuss',
        confidence: 0.8,
        reason: 'test',
        diagnostics: { router: { decisionLayer: 'embedding' } },
      },
    })

    await flushIntentCorpus()
    expect(append).toHaveBeenCalledTimes(1)
    const payload = append.mock.calls[0][0] as AppendPayload
    expect(payload.samples).toHaveLength(1)
    expect((payload.samples[0] as { requestText: string }).requestText).toBe('第一卷的钩子想再聊聊')
    expect(intentCorpusQueueStats().pending).toBe(0)
  })

  it('records explicit fallback confirmation as confirmed', async () => {
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: true }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })

    recordIntentRoutingSample({
      workspace: 'home-editor',
      requestText: '这句要重写',
      routing: {
        kind: 'no_match',
        confidence: 0.2,
        reason: 'low-confidence',
        fallbackMode: 'await-user',
      },
      annotation: 'confirmed',
      annotationBasis: 'fallback-bubble-continue',
    })

    await flushIntentCorpus()
    const sample = (append.mock.calls[0][0] as AppendPayload).samples[0] as {
      annotation: string
      annotationBasis: string
    }
    expect(sample.annotation).toBe('confirmed')
    expect(sample.annotationBasis).toBe('fallback-bubble-continue')
  })

  it('fails open when corpus IPC is unavailable', async () => {
    vi.stubGlobal('window', { electronAPI: {} })

    expect(() => {
      recordIntentCorpusSample({
        capturedAt: Date.now(),
        workspace: 'pipeline',
        requestText: '观测样本',
        routing: undefined,
        annotation: 'observed',
      })
    }).not.toThrow()

    await expect(flushIntentCorpus()).resolves.toBeUndefined()
  })

  it('does not overwrite confirmation with the resumed observed sample', async () => {
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: true }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })

    recordIntentRoutingConfirmation({
      workspace: 'outline-workbench',
      requestText: '这句要重写',
      runId: 'run-confirm',
      intent: 'edit',
    })
    recordIntentRoutingSample({
      workspace: 'outline-workbench',
      runId: 'run-confirm',
      requestText: '这句要重写',
      routing: {
        kind: 'matched',
        intent: 'edit',
        confidence: 0.9,
        reason: 'next-turn',
      },
    })
    await flushIntentCorpus()

    const annotations = append.mock.calls.flatMap(
      call => ((call[0] as AppendPayload).samples as Array<{ annotation: string }>)
        .map(sample => sample.annotation),
    )
    expect(annotations).toEqual(['confirmed'])
  })

  it('keeps inferred ahead of an immediately queued observed duplicate', async () => {
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: true }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })

    stageIntentCorpusInference({
      workspace: 'home-editor',
      projectId: 'project-a',
      requestText: '开头我不太满意',
      routing: {
        kind: 'no_match',
        confidence: 0.2,
        reason: 'low-confidence',
        fallbackMode: 'await-user',
      },
    })
    const inferred = consumeIntentCorpusInference({
      workspace: 'home-editor',
      projectId: 'project-a',
      requestText: '把开头改成倒叙',
      runId: 'run-next-turn',
      turnId: 'turn-next-turn',
      routing: {
        kind: 'matched',
        intent: 'edit',
        confidence: 0.93,
        reason: 'keyword',
      },
    })
    expect(inferred).toBe(true)
    recordIntentRoutingSample({
      workspace: 'home-editor',
      projectId: 'project-a',
      runId: 'run-next-turn',
      turnId: 'turn-next-turn',
      requestText: '开头我不太满意',
      routing: {
        kind: 'no_match',
        confidence: 0.2,
        reason: 'low-confidence',
        fallbackMode: 'await-user',
      },
    })
    await flushIntentCorpus()

    const samples = append.mock.calls.flatMap(
      call => (call[0] as AppendPayload).samples as Array<{ requestText: string; annotation: string }>,
    )
    const duplicateAnnotations = samples
      .filter(sample => sample.requestText === '开头我不太满意')
      .map(sample => sample.annotation)
    expect(duplicateAnnotations).toEqual(['inferred', 'observed'])
  })

  it('infers intent from an explicit next-turn rewrite', async () => {
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: true }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })

    stageIntentCorpusInference({
      workspace: 'home-editor',
      projectId: 'project-a',
      requestText: '开头我不太满意',
      runId: 'run-low-confidence',
      routing: {
        kind: 'no_match',
        confidence: 0.2,
        reason: 'low-confidence',
        fallbackMode: 'await-user',
      },
    })
    const inferred = consumeIntentCorpusInference({
      workspace: 'home-editor',
      projectId: 'project-a',
      requestText: '把开头改成倒叙',
      runId: 'run-next-turn',
      turnId: 'turn-next-turn',
      routing: {
        kind: 'matched',
        intent: 'edit',
        confidence: 0.93,
        reason: 'keyword',
      },
    })
    expect(inferred).toBe(true)
    await flushIntentCorpus()

    const sample = (append.mock.calls[0][0] as AppendPayload).samples[0] as {
      requestText: string
      annotation: string
      annotationBasis: string
      relatedTurnId?: string
    }
    expect(sample.requestText).toBe('开头我不太满意')
    expect(sample.annotation).toBe('inferred')
    expect(sample.annotationBasis).toBe('next-turn:把开头改成倒叙')
    expect(sample.relatedTurnId).toBe('turn-next-turn')
  })

  it('drops stale inference evidence instead of inventing a label', async () => {
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: true }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })

    stageIntentCorpusInference({
      workspace: 'home-editor',
      requestText: '这段先聊聊',
      routing: {
        kind: 'no_match',
        confidence: 0.1,
        reason: 'no-keyword-overlap',
        fallbackMode: 'await-user',
      },
    })
    const inferred = consumeIntentCorpusInference({
      workspace: 'home-editor',
      requestText: '改成倒叙',
      routing: {
        kind: 'matched',
        intent: 'edit',
        confidence: 0.95,
        reason: 'keyword',
      },
    })
    expect(inferred).toBe(true)
    await flushIntentCorpus()

    const samples = (append.mock.calls[0][0] as AppendPayload).samples as Array<{ annotation: string }>
    expect(samples.filter(sample => sample.annotation === 'inferred')).toHaveLength(1)
  })

  it('keeps inference evidence workspace and project scoped', async () => {
    vi.stubGlobal('window', { electronAPI: {} })

    stageIntentCorpusInference({
      workspace: 'outline-workbench',
      projectId: 'project-a',
      requestText: '这段先聊聊',
      routing: {
        kind: 'no_match',
        confidence: 0.1,
        reason: 'low-confidence',
        fallbackMode: 'await-user',
      },
    })
    const inferred = consumeIntentCorpusInference({
      workspace: 'outline-workbench',
      projectId: 'project-b',
      requestText: '改成倒叙',
      routing: {
        kind: 'matched',
        intent: 'edit',
        confidence: 0.95,
        reason: 'keyword',
      },
    })
    expect(inferred).toBe(false)
  })

  it('does not suppress unrelated pipeline observations', async () => {
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: true }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })

    recordIntentRoutingConfirmation({
      workspace: 'home-editor',
      requestText: '重写这一段',
      intent: 'edit',
    })
    recordIntentRoutingSample({
      workspace: 'pipeline',
      requestText: '观测流水线路由',
      routing: {
        kind: 'matched',
        intent: 'generate',
        confidence: 0.9,
        reason: 'pipeline',
      },
    })
    await flushIntentCorpus()

    const annotations = append.mock.calls.flatMap(
      call => ((call[0] as AppendPayload).samples as Array<{ annotation: string }>)
        .map(sample => sample.annotation),
    )
    expect(annotations).toEqual(['confirmed', 'observed'])
  })

  it('suppresses only the confirmed fallback request, not the next unrelated sample', async () => {
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: true }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })

    recordIntentRoutingConfirmation({
      workspace: 'home-editor',
      projectId: 'project-a',
      requestText: '这句要重写',
      intent: 'edit',
    })
    recordIntentRoutingSample({
      workspace: 'home-editor',
      projectId: 'project-a',
      requestText: '先聊聊世界观',
      routing: {
        kind: 'matched',
        intent: 'discuss',
        confidence: 0.9,
        reason: 'keyword',
      },
    })
    recordIntentRoutingSample({
      workspace: 'home-editor',
      projectId: 'project-a',
      requestText: '这句要重写',
      routing: {
        kind: 'matched',
        intent: 'edit',
        confidence: 0.9,
        reason: 'resume',
      },
    })
    await flushIntentCorpus()

    const annotations = append.mock.calls.flatMap(
      call => (call[0] as AppendPayload).samples as Array<{ requestText: string; annotation: string }>,
    )
    expect(annotations.map(sample => [sample.requestText, sample.annotation])).toEqual([
      ['这句要重写', 'confirmed'],
      ['先聊聊世界观', 'observed'],
    ])
  })

  it('logs ipc-unavailable failures without dropping the batch permanently', async () => {
    vi.stubGlobal('window', { electronAPI: {} })
    const diagWarn = vi.fn()
    vi.stubGlobal('DiagLogger', { log: diagWarn })

    recordIntentCorpusSample({
      capturedAt: Date.now(),
      workspace: 'home-editor',
      requestText: 'IPC 未就绪时的样本',
      routing: undefined,
      annotation: 'observed',
    })
    await flushIntentCorpus()

    expect(diagWarn).toHaveBeenCalledWith(
      'warn',
      'intent-corpus',
      '意图语料写入失败',
      expect.objectContaining({ reason: 'ipc-unavailable', count: 1 }),
    )
    expect(intentCorpusQueueStats().pending).toBe(1)
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: true }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })
    await flushIntentCorpus()
    expect(append).toHaveBeenCalledTimes(1)
  })

  it('keeps pending samples when append fails once', async () => {
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: false, reason: 'disk full' }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })

    recordIntentCorpusSample({
      capturedAt: Date.now(),
      workspace: 'home-editor',
      requestText: '失败后保留',
      routing: undefined,
      annotation: 'observed',
    })
    await flushIntentCorpus()

    expect(append).toHaveBeenCalledTimes(1)
    expect(intentCorpusQueueStats().pending).toBe(1)
  })

  it('clamps oversized input before queueing', async () => {
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: true }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })
    const longText = '长'.repeat(2500)

    recordIntentCorpusSample({
      capturedAt: Date.now(),
      workspace: 'outline-workbench',
      requestText: longText,
      routing: undefined,
      annotation: 'observed',
    })
    await flushIntentCorpus()

    const samples = (append.mock.calls.at(-1)?.[0] as AppendPayload).samples as Array<{ requestText: string }>
    const sample = samples?.find(item => item.requestText.startsWith('长'))
    expect(sample).toBeDefined()
    if (!sample) return
    expect(sample.requestText).toHaveLength(2000)
  })

  it('caps the in-memory queue and keeps the newest overflow samples', async () => {
    let openAppendGate: (() => void) | undefined
    const appendGate = new Promise<void>(resolve => { openAppendGate = resolve })
    const append = vi.fn(async (_payload: AppendPayload) => {
      await appendGate
      return { success: true }
    })
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })

    for (let i = 0; i < 502; i += 1) {
      __testQueueCorpusSample({
        capturedAt: i + 1,
        workspace: 'pipeline',
        requestText: `排队样本 ${i}`,
        annotation: 'observed',
      })
    }
    openAppendGate?.()
    await flushIntentCorpus()

    const samples = append.mock.calls.flatMap(
      call => (call[0] as AppendPayload).samples as Array<{ requestText: string }>,
    )
    expect(samples).toHaveLength(500)
    expect(samples[0].requestText).toBe('排队样本 2')
    expect(samples.at(-1)?.requestText).toBe('排队样本 501')
    expect(intentCorpusQueueStats().dropped).toBe(2)
    expect(intentCorpusQueueStats().pending).toBe(0)
  })

  it('normalizes nullable identity fields before the IPC boundary', async () => {
    const append = vi.fn(async (_payload: AppendPayload) => ({ success: true }))
    vi.stubGlobal('window', { electronAPI: { intentCorpusAppend: append } })

    recordIntentCorpusSample({
      capturedAt: Date.now(),
      projectId: null,
      runId: null,
      turnId: null,
      relatedTurnId: null,
      workspace: 'home-editor',
      requestText: '字段归一化样本',
      routing: undefined,
      annotation: 'observed',
    })
    await flushIntentCorpus()

    const sample = (append.mock.calls[0][0] as AppendPayload).samples[0] as {
      projectId: unknown
      runId: unknown
      turnId: unknown
      relatedTurnId: unknown
    }
    expect(sample.projectId).toBe('')
    expect(sample.runId).toBe('')
    expect(sample.turnId).toBe('')
    expect(sample.relatedTurnId).toBe('')
  })
})
