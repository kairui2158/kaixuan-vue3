import { renderMarkdown } from '../utils/markdownService'

export type OutlineMarkdownRenderWarning = {
  messageId: string
  contentVersion: number
  reason: 'worker_unavailable' | 'worker_error' | 'worker_timeout' | 'worker_disabled'
  error?: string
}

export type OutlineMarkdownRenderInput = {
  messageId: string
  contentVersion: number
  text: string
  allowTables?: boolean
  onWarning?: (warning: OutlineMarkdownRenderWarning) => void
}

const WORKER_TIMEOUT_MS = 5000
const CACHE_LIMIT = 300
const cache = new Map<string, string>()
const pending = new Map<string, {
  resolve: (html: string) => void
  timer: number
}>()

let workerInstance: Worker | null = null
let workerFailed = false
let workerFactory: (() => Worker) | null = null
let requestSeq = 0

export function outlineMarkdownContentVersion(text: string): number {
  let hash = 2166136261
  const source = text || ''
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function cacheKey(input: OutlineMarkdownRenderInput): string {
  return `${input.messageId || 'unknown'}:${input.contentVersion}:${input.allowTables === false ? 'no-tables' : 'tables'}`
}

function renderFallback(input: OutlineMarkdownRenderInput, warning: OutlineMarkdownRenderWarning): string {
  input.onWarning?.(warning)
  return renderMarkdown(input.text || '', { allowTables: input.allowTables })
}

function createDefaultWorker(): Worker {
  return new Worker(new URL('../workers/outlineMarkdown.worker.ts', import.meta.url), { type: 'module' })
}

function ensureWorker(): Worker | null {
  if (workerFailed) return null
  if (workerInstance) return workerInstance
  const factory = workerFactory || createDefaultWorker
  try {
    const worker = factory()
    worker.onmessage = (event: MessageEvent<{ type?: string; id?: string; ok?: boolean; html?: string; error?: string }>) => {
      const response = event.data
      if (!response || response.type !== 'render-result' || !response.id) return
      const entry = pending.get(response.id)
      if (!entry) return
      pending.delete(response.id)
      window.clearTimeout(entry.timer)
      if (response.ok && typeof response.html === 'string') entry.resolve(response.html)
      else entry.resolve('')
    }
    worker.onerror = (event: ErrorEvent) => {
      workerFailed = true
      const error = event.message || 'markdown worker error'
      Array.from(pending.entries()).forEach(([id, entry]) => {
        pending.delete(id)
        window.clearTimeout(entry.timer)
        entry.resolve('')
      })
      void error
    }
    workerInstance = worker
    return worker
  } catch {
    workerFailed = true
    return null
  }
}

export async function renderOutlineMarkdown(input: OutlineMarkdownRenderInput): Promise<string> {
  const key = cacheKey(input)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  const worker = ensureWorker()
  if (!worker) {
    return renderFallback(input, {
      messageId: input.messageId,
      contentVersion: input.contentVersion,
      reason: workerFactory ? 'worker_disabled' : 'worker_unavailable',
    })
  }

  const requestId = `outline-md-${++requestSeq}`
  return await new Promise<string>(resolve => {
    const settle = (html: string): void => {
      if (pending.has(requestId)) {
        pending.delete(requestId)
        window.clearTimeout(timer)
      }
      resolve(html)
    }
    const timer = window.setTimeout(() => {
      const entry = pending.get(requestId)
      if (!entry) return
      pending.delete(requestId)
      entry.resolve('')
    }, WORKER_TIMEOUT_MS)
    pending.set(requestId, { resolve: settle, timer })
    try {
      worker.postMessage({
        type: 'render',
        id: requestId,
        messageId: input.messageId,
        contentVersion: input.contentVersion,
        text: input.text || '',
      })
    } catch (error) {
      pending.delete(requestId)
      window.clearTimeout(timer)
      settle(renderFallback(input, {
        messageId: input.messageId,
        contentVersion: input.contentVersion,
        reason: 'worker_error',
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }).then(html => {
    if (!html) {
      return renderFallback(input, {
        messageId: input.messageId,
        contentVersion: input.contentVersion,
        reason: 'worker_error',
      })
    }
    if (cache.size >= CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value
      if (oldestKey !== undefined) cache.delete(oldestKey)
    }
    cache.set(key, html)
    return html
  })
}

export function setOutlineMarkdownWorkerFactoryForTests(factory: (() => Worker) | null): void {
  workerFactory = factory
  workerFailed = false
  workerInstance?.terminate()
  workerInstance = null
  cache.clear()
  pending.forEach(entry => {
    window.clearTimeout(entry.timer)
    entry.resolve('')
  })
  pending.clear()
}

export function disposeOutlineMarkdownRenderService(): void {
  workerInstance?.terminate()
  workerInstance = null
  cache.clear()
}
