import type {
  RunTraceExportRequest,
  RunTraceExportResponse
} from './runTraceExportService'
import type { RunTrace } from '../stores/runTrace'
import { isProxy, toRaw } from 'vue'

type PendingExport = {
  resolve: (response: RunTraceExportResponse) => void
  timeout: ReturnType<typeof setTimeout>
}

let workerInstance: Worker | null = null
let workerFactory: (() => Worker) | null = null
let workerFailed = false
const pending = new Map<string, PendingExport>()
let requestSeed = 0
const RUN_TRACE_EXPORT_TIMEOUT_MS = 8_000

function createDefaultWorker(): Worker {
  return new Worker(new URL('../workers/runTraceExport.worker.ts', import.meta.url), { type: 'module' })
}

function ensureWorker(): Worker | null {
  if (workerFailed) return null
  if (workerInstance) return workerInstance
  try {
    const worker = workerFactory ? workerFactory() : createDefaultWorker()
    worker.onmessage = (event: MessageEvent<RunTraceExportResponse>) => {
      const response = event.data
      const entry = response?.id ? pending.get(response.id) : undefined
      if (!entry) return
      pending.delete(response.id)
      clearTimeout(entry.timeout)
      entry.resolve(response)
    }
    worker.onerror = () => {
      rejectAllPending('run trace export worker error')
    }
    workerInstance = worker
    return worker
  } catch {
    workerFailed = true
    return null
  }
}

function rejectAllPending(error: string) {
  pending.forEach(entry => {
    clearTimeout(entry.timeout)
    entry.resolve({ type: 'export-error', id: '', ok: false, error })
  })
  pending.clear()
}

function unwrapCloneable(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') return value
  const raw = isProxy(value) ? toRaw(value) : value
  if (raw === null || typeof raw !== 'object') return raw
  if (seen.has(raw)) return seen.get(raw)
  if (raw instanceof Date) return new Date(raw.getTime())
  if (raw instanceof Map) {
    const output = new Map()
    seen.set(raw, output)
    raw.forEach((item, key) => output.set(unwrapCloneable(key, seen), unwrapCloneable(item, seen)))
    return output
  }
  if (raw instanceof Set) {
    const output = new Set()
    seen.set(raw, output)
    raw.forEach(item => output.add(unwrapCloneable(item, seen)))
    return output
  }
  if (Array.isArray(raw)) {
    const output: unknown[] = []
    seen.set(raw, output)
    raw.forEach((item, index) => {
      output[index] = unwrapCloneable(item, seen)
    })
    return output
  }
  const output: Record<string, unknown> = {}
  seen.set(raw, output)
  for (const [key, item] of Object.entries(raw)) {
    if (key === '__v_raw' || key === '__v_isRef' || key === '__v_skip' || key === '__v_isShallow') continue
    output[key] = unwrapCloneable(item, seen)
  }
  return output
}

function makeCloneableRun(run: RunTrace): RunTrace {
  return unwrapCloneable(run, new WeakMap()) as RunTrace
}

function postExportRequest(
  request: Omit<RunTraceExportRequest, 'id'>,
  timeoutMs: number = RUN_TRACE_EXPORT_TIMEOUT_MS
): Promise<RunTraceExportResponse> {
  const worker = ensureWorker()
  if (!worker) {
    return Promise.resolve({
      type: 'export-error',
      id: '',
      ok: false,
      error: workerFactory ? 'run trace export worker disabled' : 'run trace export worker unavailable'
    })
  }
  requestSeed += 1
  const id = `run-trace-export-${Date.now()}-${requestSeed}`
  return new Promise(resolve => {
    const settleFailure = (error: string) => {
      const entry = pending.get(id)
      if (entry) {
        pending.delete(id)
        clearTimeout(entry.timeout)
      }
      resolve({ type: 'export-error', id, ok: false, error })
    }
    pending.set(id, {
      resolve,
      timeout: setTimeout(() => {
        pending.delete(id)
        resolve({ type: 'export-error', id, ok: false, error: 'run trace export worker timeout' })
      }, timeoutMs)
    })
    try {
      worker.postMessage({ ...request, id, run: makeCloneableRun(request.run) })
    } catch (error) {
      settleFailure(error instanceof Error ? error.message : String(error))
    }
  })
}

export async function exportRunTraceJsonInWorker(
  run: RunTrace,
  options: { timeoutMs?: number } = {}
): Promise<{ ok: true; run: Record<string, unknown> } | { ok: false; error: string }> {
  const response = await postExportRequest({ type: 'export-json', run }, options.timeoutMs)
  if (response.type === 'export-json-result') return { ok: true, run: response.run }
  return { ok: false, error: response.type === 'export-error' ? response.error : 'unknown run trace export response' }
}

export async function exportRunTraceTextInWorker(
  run: RunTrace,
  options: { timeoutMs?: number } = {}
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const response = await postExportRequest({ type: 'export-text', run }, options.timeoutMs)
  if (response.type === 'export-text-result') return { ok: true, text: response.text }
  return { ok: false, error: response.type === 'export-error' ? response.error : 'unknown run trace export response' }
}

export function setRunTraceExportWorkerFactoryForTests(factory: (() => Worker) | null): void {
  workerFactory = factory
  workerFailed = false
  workerInstance?.terminate()
  workerInstance = null
  rejectAllPending('run trace export worker reset')
}

export function resetRunTraceExportWorkerForTests(): void {
  setRunTraceExportWorkerFactoryForTests(null)
}
