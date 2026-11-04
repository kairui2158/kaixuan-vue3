import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import {
  exportRunTraceJsonInWorker,
  exportRunTraceTextInWorker,
  resetRunTraceExportWorkerForTests,
  setRunTraceExportWorkerFactoryForTests
} from './runTraceExportWorkerService'
import type { RunTrace } from '../stores/runTrace'
import { exportRunTraceToJson, exportRunTraceToText } from './runTraceExportService'

function makeRun(): RunTrace {
  return {
    id: 'run-worker',
    source: 'outline',
    sourceName: '大纲工作台',
    stepName: '大纲共创',
    mode: 'chat',
    status: 'running',
    sessionKind: 'chat',
    startedAt: 1,
    skillNames: [],
    events: [],
    turns: [],
    apiCalls: []
  } as RunTrace
}

function makeWorker() {
  const listeners: Array<(event: MessageEvent) => void> = []
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    postMessage: vi.fn((message: { id: string; type: string; run: RunTrace }) => {
      structuredClone(message)
      queueMicrotask(() => {
        const response = message.type === 'export-json'
          ? { type: 'export-json-result', id: message.id, ok: true, run: exportRunTraceToJson(message.run) }
          : { type: 'export-text-result', id: message.id, ok: true, text: exportRunTraceToText(message.run) }
        worker.onmessage?.({ data: response } as MessageEvent)
      })
    }),
    terminate: vi.fn()
  }
  return worker
}

describe('run trace export worker service', () => {
  afterEach(() => {
    resetRunTraceExportWorkerForTests()
    vi.restoreAllMocks()
  })

  it('serializes JSON and text in a worker without renderer-thread work', async () => {
    const worker = makeWorker()
    setRunTraceExportWorkerFactoryForTests(() => worker as unknown as Worker)
    const run = makeRun()

    const json = await exportRunTraceJsonInWorker(run)
    const text = await exportRunTraceTextInWorker(run)

    expect(json.ok && json.run.schemaVersion).toBe(22)
    expect(text.ok && text.text).toContain('===== 运行记录 =====')
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
  })

  it('returns a controlled error when the worker is unavailable or times out', async () => {
    const worker = {
      onmessage: null,
      onerror: null,
      postMessage: vi.fn(),
      terminate: vi.fn()
    }
    setRunTraceExportWorkerFactoryForTests(() => worker as unknown as Worker)

    const result = await exportRunTraceJsonInWorker(makeRun(), { timeoutMs: 20 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('run trace export worker timeout')
  })

  it('unwraps reactive runs before posting them to the worker', async () => {
    const worker = makeWorker()
    setRunTraceExportWorkerFactoryForTests(() => worker as unknown as Worker)
    const run = reactive(makeRun())

    const json = await exportRunTraceJsonInWorker(run)
    const text = await exportRunTraceTextInWorker(run)

    expect(json.ok).toBe(true)
    expect(text.ok).toBe(true)
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
  })

  it('returns a controlled error when worker postMessage throws DataCloneError', async () => {
    const error = new Error('DataCloneError: Failed to execute postMessage')
    const worker = {
      onmessage: null,
      onerror: null,
      postMessage: vi.fn(() => {
        throw error
      }),
      terminate: vi.fn()
    }
    setRunTraceExportWorkerFactoryForTests(() => worker as unknown as Worker)

    const json = await exportRunTraceJsonInWorker(makeRun(), { timeoutMs: 1_000 })

    expect(json.ok).toBe(false)
    if (!json.ok) expect(json.error).toBe(error.message)
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
  })
})
