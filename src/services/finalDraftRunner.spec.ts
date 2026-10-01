import { afterEach, describe, expect, it, vi } from 'vitest'
import { continueFinalDraftTask, resumeFinalDraftTask, retryFinalDraftSegmentTask, runFinalDraft } from './finalDraftRunner'
import { createFinalDraftTask, hashContent } from './finalDraftService'
import {
  createInMemoryFinalDraftCheckpointStore,
  finalDraftCheckpointId,
  saveFinalDraftCheckpoint,
} from './finalDraftCheckpoint'
import type { FinalDraftTraceHooks } from './finalDraftRunner'
import type { FinalDraftRunInput } from './finalDraftRunner'
import type { AiService, CallAiParams, CallAiResult } from './aiService'

function aiResult(overrides: Partial<CallAiResult> = {}): CallAiResult {
  return {
    text: '整理后的终稿正文。',
    reasoning: '',
    finishReason: 'stop',
    ...overrides,
  }
}

function createAdapter(content = '源文档') {
  const state = { content, documentVersion: 7 }
  const targetId = 'home-tab-1'
  return {
    adapter: {
      getDocumentState: async () => ({
        targetId,
        content: state.content,
        documentVersion: state.documentVersion,
        contentHash: hashContent(state.content),
      }),
      writeDocument: async (next: string) => {
        state.content = next
        state.documentVersion += 1
        return { targetId, documentVersion: state.documentVersion, contentHash: hashContent(next) }
      },
      restoreDocument: async (next: string) => {
        state.content = next
        state.documentVersion += 1
        return { targetId, documentVersion: state.documentVersion, contentHash: hashContent(next) }
      },
    },
    getContent: () => state.content,
  }
}

function createAi(results: CallAiResult[]) {
  let index = 0
  const callAi = vi.fn<(request: CallAiParams) => Promise<CallAiResult>>(async () => {
    const result = results[index]
    index += 1
    return result
  })
  return { aiService: { callAi } as Pick<AiService, 'callAi'>, callAi }
}

function createHooks() {
  let callSequence = 0
  const calls: Array<{ id: string | undefined; label: string }> = []
  const streams: Array<{ id: string | undefined; text: string }> = []
  const hooks: FinalDraftTraceHooks = {
    startApiCall: () => {
      callSequence += 1
      return `call-${callSequence}`
    },
    finishApiCall: (callId, result) => {
      calls.push({ id: callId, label: result.error || result.finishReason || result.status })
    },
    recordPhysicalCall: (callId, event) => {
      calls.push({ id: callId, label: `physical:${event.phase}` })
    },
    appendStream: text => {
      streams.push({ id: `call-${callSequence}`, text })
    },
    appendReasoning: () => {},
    addEvent: () => {},
  }
  return { hooks, calls, streams }
}

function createRecordingHooks() {
  const base = createHooks()
  const events: Array<{ type: string; payload?: unknown }> = []
  const hooks = {
    ...base.hooks,
    addEvent: (event: { type: string; payload?: unknown }) => events.push({ type: event.type, payload: event.payload }),
  }
  return { hooks, events, calls: base.calls }
}

describe('finalDraftRunner', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs a successful final draft and reports the finished task', async () => {
    const { adapter, getContent } = createAdapter()
    const { aiService, callAi } = createAi([aiResult({ text: '完整终稿。' })])
    const { hooks, calls } = createHooks()
    const task = await runFinalDraft({
      aiService,
      adapter: adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
    }, hooks)
    expect(task.status).toBe('completed')
    expect(getContent()).toBe('完整终稿。')
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(calls[0]).toEqual({ id: 'call-1', label: 'stop' })
    expect(task.completedText).toBe('完整终稿。')
  })

  it('emits chunk progress while a final draft streams', async () => {
    const { adapter, getContent } = createAdapter()
    const { aiService, callAi } = createAi([aiResult({ text: '完整终稿。' })])
    const originalCallAi = callAi.getMockImplementation()
    if (!originalCallAi) throw new Error('mock implementation missing')
    callAi.mockImplementation(async request => {
      request.onChunk?.('完整')
      request.onChunk?.('终稿。')
      return originalCallAi(request)
    })
    const { hooks } = createHooks()
    const progress: Array<Parameters<NonNullable<Parameters<typeof runFinalDraft>[0]['onProgress']>>[0]> = []
    const task = await runFinalDraft({
      aiService,
      adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      onProgress: event => progress.push(event),
    }, hooks)
    expect(progress.length).toBeGreaterThan(0)
    expect(task.status).toBe('completed')
    expect(getContent()).toBe('完整终稿。')
    const accumulatedChars = progress.map(event => event.accumulatedChars)
    expect(accumulatedChars).toContain(2)
    expect(accumulatedChars).toContain(5)
    expect(Math.max(...accumulatedChars)).toBeGreaterThan(0)
    const streamingEvents = progress.filter(event => event.telemetry !== undefined)
    expect(streamingEvents.length).toBeGreaterThan(0)
    expect(streamingEvents.at(-1)?.lastStreamActivityAt).toBeGreaterThan(0)
    expect(streamingEvents.at(-1)?.activeSegmentIndex).toBeDefined()
    expect(streamingEvents.at(-1)?.telemetry?.tenSecondCharsPerSecond).toBeGreaterThan(0)
    expect(streamingEvents.at(-1)?.telemetry?.throughputStatus).toBe('streaming_active')
    expect(streamingEvents.at(-1)?.telemetry?.estimatedRemainingMs).toBeGreaterThanOrEqual(0)
  })

  it('stops for continuation without writing the editor', async () => {
    const { adapter, getContent } = createAdapter()
    const { aiService } = createAi([aiResult({ text: '第一段', finishReason: 'length' })])
    const { hooks } = createHooks()
    const task = await runFinalDraft({
      aiService,
      adapter,
      destination: 'outline-editor',
      targetId: 'outline',
      sourceContent: '源文档',
      instruction: '全文重排',
    }, hooks)
    expect(task.status).toBe('awaiting_continuation')
    expect(getContent()).toBe('源文档')
    expect(task.accumulatedText).toBe('第一段')
  })

  it('continues a truncated draft and writes the merged result', async () => {
    const { adapter, getContent } = createAdapter()
    const { aiService } = createAi([
      aiResult({ text: '第一段', finishReason: 'length' }),
      aiResult({ text: '第一段第二段', finishReason: 'stop' }),
    ])
    const { hooks } = createHooks()
    const initial = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '第一段源文。\n\n第二段源文。',
      instruction: '全文重排',
    })
    const truncated = await runFinalDraft({
      aiService,
      adapter,
      destination: initial.destination,
      targetId: initial.targetId,
      sourceContent: '源文档',
      instruction: initial.instruction,
    }, hooks)
    const finished = await continueFinalDraftTask({
      aiService,
      adapter,
      task: truncated,
    }, hooks)
    expect(finished.status).toBe('completed')
    expect(finished.continuationCount).toBe(1)
    expect(getContent()).toBe('第一段第二段')
  })

  it('preserves the partial stream when a continuation is slow-stream interrupted', async () => {
    const { adapter, getContent } = createAdapter()
    const { aiService } = createAi([
      aiResult({ text: '第一段', finishReason: 'length' }),
    ])
    const { hooks } = createHooks()
    const truncated = await runFinalDraft({
      aiService,
      adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文重排',
    }, hooks)
    expect(truncated.status).toBe('awaiting_continuation')

    const interruptingCall = vi.fn<(request: CallAiParams) => Promise<CallAiResult>>(async request => {
      request.onChunk?.('追加部分')
      const error = new Error('slow stream interrupted') as Error & { code?: string }
      error.code = 'slow_stream_interrupted'
      throw error
    })
    const interruptingService = { callAi: interruptingCall } as Pick<AiService, 'callAi'>
    const changes: string[] = []
    const degradedStatuses: string[] = []
    const interrupted = await continueFinalDraftTask({
      aiService: interruptingService,
      adapter,
      task: truncated,
      onTaskChange: changed => changes.push(changed.accumulatedText),
    }, {
      ...hooks,
      addEvent: () => {},
      startApiCall: () => 'interrupt-call',
      finishApiCall: (callId, result) => {
        if (result.status === 'degraded') degradedStatuses.push(String(result.error))
      },
      appendStream: () => {},
      appendReasoning: () => {},
      recordPhysicalCall: () => {},
    } satisfies FinalDraftTraceHooks)

    expect(interrupted.status).toBe('interrupted')
    expect(interrupted.accumulatedText).toBe('第一段追加部分')
    expect(changes).toContain('第一段追加部分')
    expect(degradedStatuses).toEqual(['slow stream interrupted'])
    expect(getContent()).toBe('源文档')
  })

  it('forwards state-machine task events while keeping runner wrapper events separate', async () => {
    const { adapter, getContent } = createAdapter()
    const { aiService } = createAi([aiResult({ text: '完整终稿。' })])
    const { hooks } = createHooks()
    const events: string[] = []
    const task = await runFinalDraft({
      aiService,
      adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
      onTaskEvent: (_task, event) => events.push(event.type),
    }, hooks)
    expect(task.status).toBe('completed')
    expect(getContent()).toBe('完整终稿。')
    expect(events).toContain('generation_started')
    expect(events).toContain('write_started')
    expect(events).toContain('write_succeeded')
  })

  it('forwards segment retry events to the entry event bridge', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([
      aiResult({ text: '第一段终稿第二段终稿' }),
      aiResult({ text: '第一段终稿\n\n第二段终稿' }),
    ])
    const { hooks } = createHooks()
    const events: string[] = []
    const task = await runFinalDraft({
      aiService,
      adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      onTaskEvent: (_task, event) => events.push(event.type),
    }, hooks)
    expect(task.status).toBe('completed')
    expect(getContent()).toBe('第一段终稿\n\n第二段终稿')
    expect(events).toContain('segment_retry_started')
  })

  it('marks a physical API failure in finishApiCall and returns a failed task', async () => {
    const { adapter, getContent } = createAdapter()
    const callAi = vi.fn<(request: CallAiParams) => Promise<CallAiResult>>(async () => {
      throw new Error('provider unavailable')
    })
    const aiService = { callAi } as Pick<AiService, 'callAi'>
    const { hooks, calls } = createHooks()
    const task = await runFinalDraft({
      aiService,
      adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文整理',
    }, hooks)
    expect(task.status).toBe('failed')
    expect(task.error).toContain('provider unavailable')
    expect(getContent()).toBe('源文档')
    expect(calls.at(-1)).toEqual({ id: 'call-1', label: 'provider unavailable' })
  })

  it('keeps physical-call events isolated to the active call id', async () => {
    const { adapter } = createAdapter()
    const { aiService, callAi } = createAi([
      aiResult({ text: '第一段', finishReason: 'length' }),
      aiResult({ text: '第一段第二段', finishReason: 'stop' }),
    ])
    const { hooks, calls } = createHooks()
    const originalCallAi = callAi.getMockImplementation()
    if (!originalCallAi) throw new Error('mock implementation missing')
    callAi.mockImplementation(async request => {
      request.onPhysicalCall?.({
        physicalCallId: 'p1',
        attempt: 1,
        phase: 'normal',
        status: 'success',
        toolsEnabled: false,
        toolsDowngraded: false,
        requestMessages: [],
        responseText: '',
        streamText: '',
        reasoningText: '',
        durationMs: 1,
      } as Parameters<NonNullable<CallAiParams['onPhysicalCall']>>[0])
      return originalCallAi(request)
    })
    const truncated = await runFinalDraft({
      aiService,
      adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent: '源文档',
      instruction: '全文重排',
    }, hooks)
    await continueFinalDraftTask({ aiService, adapter, task: truncated }, hooks)
    const physicalEvents = calls.filter(item => item.label.startsWith('physical:'))
    expect(physicalEvents.map(item => item.id)).toEqual(['call-1', 'call-2'])
  })

  it('saves a checkpoint after each completed segment', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([
      aiResult({ text: 'segment-1\nsegment-2' }),
      aiResult({ text: '第一段终稿' }),
      aiResult({ text: '第二段终稿' }),
    ])
    const { hooks } = createHooks()
    const store = createInMemoryFinalDraftCheckpointStore()
    const task = await runFinalDraft({
      aiService,
      adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: sourceContent.indexOf('第二段') },
        { segmentId: 'segment-2', start: sourceContent.indexOf('第二段'), end: sourceContent.length },
      ],
      checkpointStore: store,
    }, hooks)
    expect(task.status).toBe('completed')
    expect(getContent()).toBe('第一段终稿\n\n第二段终稿')
    const saved = await store.loadCheckpoint(finalDraftCheckpointId(task.taskId))
    expect(saved.ok).toBe(true)
    if (!saved.ok) throw new Error('checkpoint missing')
    expect(saved.checkpoint.payload.activeSegmentIndex).toBe(2)
    expect(saved.checkpoint.payload.completedText).toBe('第一段终稿\n\n第二段终稿')
  })

  it('saves a partial-segment checkpoint from the heartbeat', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T02:00:00Z'))
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([
      aiResult({ text: '第二段终稿' }),
    ])
    const originalCallAi = callAi.getMockImplementation()
    if (!originalCallAi) throw new Error('mock implementation missing')
    let resolveCall: (() => void) | undefined
    callAi.mockImplementation(async request => {
      request.onChunk?.('第二段')
      await new Promise<void>(resolve => {
        resolveCall = resolve
      })
      return originalCallAi(request)
    })
    const store = createInMemoryFinalDraftCheckpointStore()
    const original = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: sourceContent.indexOf('第二段') },
        { segmentId: 'segment-2', start: sourceContent.indexOf('第二段'), end: sourceContent.length },
      ],
    })
    const interrupted = {
      ...original,
      status: 'generating' as const,
      activeSegmentIndex: 1,
      completedText: '第一段终稿',
    }
    await saveFinalDraftCheckpoint(interrupted, store)
    const { hooks } = createHooks()
    const runPromise = resumeFinalDraftTask({
      aiService,
      adapter,
      checkpointId: finalDraftCheckpointId(interrupted.taskId),
      sourceContent,
      checkpointStore: store,
    }, hooks)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(61_000)
    const saved = await store.loadCheckpoint(finalDraftCheckpointId(interrupted.taskId))
    expect(saved.ok).toBe(true)
    if (!saved.ok) throw new Error('checkpoint missing')
    expect(saved.checkpoint.payload.completedText).toBe('第一段终稿')
    expect(saved.checkpoint.payload.accumulatedText).toContain('第二段')
    resolveCall?.()
    const task = await runPromise
    expect(task.status).toBe('completed')
  })

  it('retries the current segment while preserving completed segments', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([aiResult({ text: '第二段终稿' })])
    const { hooks } = createHooks()
    const original = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: sourceContent.indexOf('第二段') },
        { segmentId: 'segment-2', start: sourceContent.indexOf('第二段'), end: sourceContent.length },
      ],
    })
    const stalled = {
      ...original,
      status: 'generating' as const,
      activeSegmentIndex: 1,
      completedText: '第一段终稿',
      accumulatedText: '第二段未完成',
    }
    const task = await retryFinalDraftSegmentTask({
      aiService,
      adapter,
      task: stalled,
      checkpointStore: createInMemoryFinalDraftCheckpointStore(),
    }, hooks)
    expect(task.status).toBe('completed')
    expect(task.completedText).toBe('第一段终稿\n\n第二段终稿')
    expect(getContent()).toBe('第一段终稿\n\n第二段终稿')
  })

  it('continues generation when checkpoint saving fails', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([
      aiResult({ text: 'segment-1\nsegment-2' }),
      aiResult({ text: '第一段终稿' }),
      aiResult({ text: '第二段终稿' }),
    ])
    const base = createHooks()
    const events: string[] = []
    const hooks = { ...base.hooks, addEvent: (event: { type: string }) => events.push(event.type) }
    const store = {
      ...createInMemoryFinalDraftCheckpointStore(),
      saveCheckpoint: vi.fn(async () => ({ ok: false as const, reason: 'browser' })),
    }
    const task = await runFinalDraft({
      aiService,
      adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: sourceContent.indexOf('第二段') },
        { segmentId: 'segment-2', start: 8, end: sourceContent.length },
      ],
      checkpointStore: store,
    }, hooks)
    if (task.status !== 'completed') throw new Error(task.error || 'resume failed')
    expect(task.status).toBe('completed')
    expect(getContent()).toBe('第一段终稿\n\n第二段终稿')
    expect(events).toContain('final-draft-checkpoint-save-failed')
  })

  it('resumes a checkpoint from the next segment without regenerating completed segments', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([
      aiResult({ text: '第二段终稿', finishReason: 'stop' }),
    ])
    const store = createInMemoryFinalDraftCheckpointStore()
    const original = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: sourceContent.indexOf('第二段') },
        { segmentId: 'segment-2', start: sourceContent.indexOf('第二段'), end: sourceContent.length },
      ],
    })
    const interrupted = {
      ...original,
      status: 'generating' as const,
      activeSegmentIndex: 1,
      completedText: '第一段终稿',
    }
    await saveFinalDraftCheckpoint(interrupted, store)
    const { hooks } = createHooks()
    const task = await resumeFinalDraftTask({
      aiService,
      adapter,
      checkpointId: finalDraftCheckpointId(interrupted.taskId),
      sourceContent,
      checkpointStore: store,
    }, hooks)
    expect(task.status).toBe('completed')
    expect(task.completedText).toBe('第一段终稿\n\n第二段终稿')
    expect(callAi).toHaveBeenCalledTimes(1)
    const request = callAi.mock.calls[0]?.[0] as { messages: Array<{ content: string }> }
    expect(request.messages.at(-1)?.content).toContain('第二段源文。')
    expect(getContent()).toBe('第一段终稿\n\n第二段终稿')
  })

  it('preserves the partial stream when a resumed segment is slow-stream interrupted', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([
      aiResult({ text: '第二段终稿', finishReason: 'length' }),
    ])
    const store = createInMemoryFinalDraftCheckpointStore()
    const original = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: sourceContent.indexOf('第二段') },
        { segmentId: 'segment-2', start: sourceContent.indexOf('第二段'), end: sourceContent.length },
      ],
    })
    const interrupted = {
      ...original,
      status: 'awaiting_continuation' as const,
      activeSegmentIndex: 1,
      completedText: '第一段终稿',
      accumulatedText: '第二段',
    }
    await saveFinalDraftCheckpoint(interrupted, store)

    const interruptingCall = vi.fn<(request: CallAiParams) => Promise<CallAiResult>>(async request => {
      request.onChunk?.('续写部分')
      const error = new Error('slow stream interrupted') as Error & { code?: string }
      error.code = 'slow_stream_interrupted'
      throw error
    })
    const interruptingService = { callAi: interruptingCall } as Pick<AiService, 'callAi'>
    const changes: string[] = []
    const { hooks } = createHooks()
    const task = await resumeFinalDraftTask({
      aiService: interruptingService,
      adapter,
      checkpointId: finalDraftCheckpointId(interrupted.taskId),
      sourceContent,
      checkpointStore: store,
      onTaskChange: changed => changes.push(changed.accumulatedText),
    }, hooks)

    expect(task.status).toBe('interrupted')
    expect(task.accumulatedText).toBe('第二段续写部分')
    expect(changes).toContain('第二段续写部分')
    expect(getContent()).toBe(sourceContent)
    expect(aiService.callAi).not.toHaveBeenCalled()
  })

  it('reports a stalled stream even when the provider sends no more chunks', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T02:00:00Z'))
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([
      aiResult({ text: '第一段终稿\n\n第二段终稿' }),
    ])
    const originalCallAi = callAi.getMockImplementation()
    if (!originalCallAi) throw new Error('mock implementation missing')
    let resolveFirstCall: (() => void) | undefined
    callAi.mockImplementation(async request => {
      request.onChunk?.('第一段')
      await new Promise<void>(resolve => {
        resolveFirstCall = resolve
      })
      return originalCallAi(request)
    })
    const { hooks } = createHooks()
    const events: string[] = []
    const traceHooks = {
      ...hooks,
      addEvent: (event: { type: string }) => events.push(event.type),
    }
    const progress: Array<Parameters<NonNullable<FinalDraftRunInput['onProgress']>>[0]> = []
    const runPromise = runFinalDraft({
      aiService,
      adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      onProgress: event => progress.push(event),
    }, traceHooks)
    await vi.advanceTimersByTimeAsync(0)
    expect(resolveFirstCall).toBeDefined()
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1_000)
    const stalled = progress.filter(event => event.telemetry?.throughputStatus === 'stalled')
    expect(stalled.length).toBeGreaterThan(0)
    expect(stalled.at(-1)?.streamingChars).toBe(3)
    expect(events).toContain('final-draft-throughput-stalled')
    resolveFirstCall?.()
    const task = await runPromise
    expect(task.status).toBe('completed')
    expect(events.filter(type => type === 'final-draft-throughput-stalled').length).toBeGreaterThan(0)
  })

  it('notifies task listeners when stream telemetry changes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T02:00:00Z'))
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([aiResult({ text: '第一段终稿\n\n第二段终稿' })])
    const originalCallAi = callAi.getMockImplementation()
    if (!originalCallAi) throw new Error('mock implementation missing')
    let resolveFirstCall: (() => void) | undefined
    callAi.mockImplementation(async request => {
      request.onChunk?.('第一段')
      await new Promise<void>(resolve => {
        resolveFirstCall = resolve
      })
      return originalCallAi(request)
    })
    const { hooks } = createHooks()
    const changed: Array<{ status?: string; telemetry?: string }> = []
    const runPromise = runFinalDraft({
      aiService,
      adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      onTaskChange: task => changed.push({
        status: task.status,
        telemetry: task.lastTelemetry?.throughputStatus,
      }),
    }, hooks)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1_000)
    expect(changed.some(task => task.telemetry === 'stalled')).toBe(true)
    resolveFirstCall?.()
    const task = await runPromise
    expect(task.status).toBe('completed')
  })

  it('passes a request-level provider override to the AI service', async () => {
    const sourceContent = '源文档'
    const { adapter } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([aiResult({ text: '终稿。' })])
    const { hooks } = createHooks()
    const task = await runFinalDraft({
      aiService,
      adapter,
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      model: 'fallback-model',
      providerId: 'provider-b',
    }, hooks)
    expect(task.status).toBe('completed')
    expect(callAi).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'provider-b',
    }))
  })

  it('records a provider switch and retries from the persisted active segment', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService, callAi } = createAi([aiResult({ text: '第二段终稿' })])
    const { hooks, events } = createRecordingHooks()
    const original = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: sourceContent.indexOf('第二段') },
        { segmentId: 'segment-2', start: sourceContent.indexOf('第二段'), end: sourceContent.length },
      ],
    })
    const stalled = {
      ...original,
      status: 'generating' as const,
      activeSegmentIndex: 1,
      completedText: '第一段终稿',
      accumulatedText: '第二段未完成',
      lastTelemetry: {
        tenSecondCharsPerSecond: 0,
        sixtySecondCharsPerSecond: 0,
        throughputStatus: 'stalled' as const,
        estimatedRemainingMs: null,
      },
    }
    const task = await retryFinalDraftSegmentTask({
      aiService,
      adapter,
      task: stalled,
      model: 'backup-model',
      providerId: 'provider-b',
      providerSwitch: {
        fromProviderId: 'provider-a',
        fromProviderName: 'Provider A',
        fromModel: 'slow-model',
        toProviderId: 'provider-b',
        toProviderName: 'Provider B',
        toModel: 'backup-model',
        beforeTelemetry: stalled.lastTelemetry,
      },
      checkpointStore: createInMemoryFinalDraftCheckpointStore(),
    }, hooks)
    expect(task.status).toBe('completed')
    expect(task.completedText).toBe('第一段终稿\n\n第二段终稿')
    expect(getContent()).toBe('第一段终稿\n\n第二段终稿')
    expect(callAi).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'provider-b',
    }))
    const switchEvent = events.find(event => event.type === 'final-draft-provider-switch')
    expect(switchEvent?.payload).toMatchObject({
      taskId: stalled.taskId,
      activeSegmentIndex: 1,
      beforeProviderId: 'provider-a',
      afterProviderId: 'provider-b',
      beforeModel: 'slow-model',
      afterModel: 'backup-model',
    })
  })

  it('saves a checkpoint on every segment advance while resuming', async () => {
    const sourceContent = '第一段源文。\n\n第二段源文。\n\n第三段源文。'
    const { adapter, getContent } = createAdapter(sourceContent)
    const { aiService } = createAi([
      aiResult({ text: '第二段终稿' }),
      aiResult({ text: '第三段终稿' }),
    ])
    const store = createInMemoryFinalDraftCheckpointStore()
    const original = createFinalDraftTask({
      destination: 'home-editor',
      targetId: 'home-tab-1',
      sourceContent,
      instruction: '全文整理',
      sourceSegments: [
        { segmentId: 'segment-1', start: 0, end: sourceContent.indexOf('第二段') },
        { segmentId: 'segment-2', start: sourceContent.indexOf('第二段'), end: sourceContent.indexOf('第三段') },
        { segmentId: 'segment-3', start: sourceContent.indexOf('第三段'), end: sourceContent.length },
      ],
    })
    const interrupted = {
      ...original,
      status: 'generating' as const,
      activeSegmentIndex: 1,
      completedText: '第一段终稿',
    }
    await saveFinalDraftCheckpoint(interrupted, store)
    const base = createHooks()
    const events: string[] = []
    const hooks = { ...base.hooks, addEvent: (event: { type: string }) => events.push(event.type) }
    const task = await resumeFinalDraftTask({
      aiService,
      adapter,
      checkpointId: finalDraftCheckpointId(interrupted.taskId),
      sourceContent,
      checkpointStore: store,
    }, hooks)
    expect(task.status).toBe('completed')
    expect(task.completedText).toBe('第一段终稿\n\n第二段终稿\n\n第三段终稿')
    expect(events.filter(type => type === 'final-draft-checkpoint-saved').length).toBeGreaterThan(0)
    const saved = await store.loadCheckpoint(finalDraftCheckpointId(task.taskId))
    expect(saved.ok).toBe(true)
    if (!saved.ok) throw new Error('checkpoint missing')
    expect(saved.checkpoint.payload.activeSegmentIndex).toBe(3)
    expect(getContent()).toBe('第一段终稿\n\n第二段终稿\n\n第三段终稿')
  })
})
