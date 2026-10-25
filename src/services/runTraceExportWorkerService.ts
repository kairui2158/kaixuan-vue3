import type {
  RunTraceExportRequest,
  RunTraceExportResponse
} from './runTraceExportService'
import type { RunTrace } from '../stores/runTrace'

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
    pending.set(id, {
      resolve,
      timeout: setTimeout(() => {
        pending.delete(id)
        resolve({ type: 'export-error', id, ok: false, error: 'run trace export worker timeout' })
      }, timeoutMs)
    })
    worker.postMessage({ ...request, id })
  })
}

export async function exportRunTraceJsonInWorker(
  run: RunTrace,
  options: { timeoutMs?: number } = {}
): Promise<Record<string, unknown> | null> {
  const response = await postExportRequest({ type: 'export-json', run }, options.timeoutMs)
  return response.type === 'export-json-result' ? response.run : null
}

export async function exportRunTraceTextInWorker(
  run: RunTrace,
  options: { timeoutMs?: number } = {}
): Promise<string | null> {
  const response = await postExportRequest({ type: 'export-text', run }, options.timeoutMs)
  return response.type === 'export-text-result' ? response.text : null
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
