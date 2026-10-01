import type { ChainRoutingResult, DetailedChainRoutingResult } from './chainIntentRouter.ts'

export type IntentCorpusAnnotation = 'confirmed' | 'inferred' | 'observed'

export type IntentCorpusSample = {
  id: string
  schemaVersion: 1
  capturedAt: number
  projectId: string
  projectName?: string
  workspace: 'outline-workbench' | 'home-editor' | 'pipeline' | 'unknown'
  runId: string
  turnId: string
  requestText: string
  routing?: RoutingShape
  annotation: IntentCorpusAnnotation
  annotationBasis?: string
  relatedTurnId: string
}

type IntentCorpusWorkspace = NonNullable<IntentCorpusSample['workspace']>

type PendingIntentCorpusInference = {
  capturedAt: number
  projectId?: string
  projectName?: string
  workspace: IntentCorpusWorkspace
  runId?: string | null
  requestText: string
  routing: RoutingShape
}

type QueuedCorpusSample = Omit<IntentCorpusSample, 'id' | 'schemaVersion'> & { id?: string }

type AppendInput = Omit<QueuedCorpusSample, 'projectId' | 'runId' | 'turnId' | 'relatedTurnId'> & {
  id?: string
  projectId?: string | null
  runId?: string | null
  turnId?: string | null
  relatedTurnId?: string | null
}

type RoutingShape =
  | (Omit<Extract<DetailedChainRoutingResult, { kind: 'matched' }>, 'diagnostics'> & { diagnostics?: unknown })
  | (Omit<Extract<DetailedChainRoutingResult, { kind: 'no_match' }>, 'diagnostics'> & { diagnostics?: unknown })
  | (Omit<Extract<DetailedChainRoutingResult, { kind: 'ambiguous' }>, 'diagnostics'> & { diagnostics?: unknown })
  | (Omit<DetailedChainRoutingResult, 'kind' | 'reason' | 'confidence' | 'diagnostics'> & {
      kind: 'matched'
      intent: 'analyze' | 'edit' | 'generate' | 'discuss'
      confidence: number
      reason: string
      diagnostics?: unknown
    })

let sequence = 0
const queue: QueuedCorpusSample[] = []
let flushPromise: Promise<void> | null = null
let dropCount = 0
const pendingInferenceByWorkspace = new Map<IntentCorpusWorkspace, PendingIntentCorpusInference>()
type SuppressionKey = `${IntentCorpusWorkspace}::${string}::${string}`
const suppressedObservedKeys = new Set<SuppressionKey>()

function normalizeCorpusInput(value: string): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, 2000)
}
const INFERENCE_MAX_AGE_MS = 10 * 60 * 1000

function newSampleId(): string {
  sequence = (sequence + 1) % 1000000
  return `icp-${Date.now().toString(36)}-${sequence}-${Math.random().toString(36).slice(2, 8)}`
}

function logDiag(
  level: 'info' | 'warn' | 'error',
  msg: string,
  detail?: Record<string, unknown>,
) {
  try {
    const logger = (globalThis as { DiagLogger?: { log: (level: string, cat: string, msg: string, detail?: unknown) => void } }).DiagLogger
    logger?.log(level, 'intent-corpus', msg, detail)
  } catch {
    // Corpus capture is observability only.
  }
}

type PersistResult = true | { failed: true } | false

async function persist(samples: QueuedCorpusSample[]): Promise<PersistResult> {
  if (samples.length === 0) return true
  const bridge = (globalThis as { window?: { electronAPI?: { intentCorpusAppend?: (payload: unknown) => Promise<{ success?: boolean; reason?: string }> } } }).window
  const append = bridge?.electronAPI?.intentCorpusAppend
  if (!append) {
    logDiag('warn', '意图语料写入失败', { reason: 'ipc-unavailable', count: samples.length })
    return false
  }
  const result = await append({ samples })
  if (!result?.success) {
    logDiag('warn', '意图语料写入失败', { reason: result?.reason || 'unknown', count: samples.length })
    return { failed: true }
  }
  return true
}

export function recordIntentRoutingSample(input: {
  projectId?: string | null
  projectName?: string
  workspace: 'outline-workbench' | 'home-editor' | 'pipeline'
  runId?: string | null
  turnId?: string | null
  requestText: string
  routing: RoutingShape
  annotation?: IntentCorpusAnnotation
  annotationBasis?: string
  relatedTurnId?: string
}): void {
  const suppressionKey = `${input.workspace}::${input.projectId || ''}::${normalizeCorpusInput(input.requestText)}` as SuppressionKey
  if (
    !input.annotation &&
    input.workspace !== 'pipeline' &&
    suppressedObservedKeys.has(suppressionKey)
  ) {
    suppressedObservedKeys.delete(suppressionKey)
    return
  }
  const routing = input.routing
  recordIntentCorpusSample({
    capturedAt: Date.now(),
    projectId: input.projectId || '',
    projectName: input.projectName,
    workspace: input.workspace,
    runId: input.runId || '',
    turnId: input.turnId || '',
    requestText: input.requestText,
    routing,
    annotation: input.annotation || 'observed',
    annotationBasis: input.annotationBasis,
    relatedTurnId: input.relatedTurnId || '',
  })
}

export function recordIntentRoutingConfirmation(input: {
  projectId?: string | null
  projectName?: string
  workspace: 'outline-workbench' | 'home-editor'
  runId?: string | null
  requestText: string
  intent: 'analyze' | 'edit' | 'generate' | 'discuss'
}): void {
  suppressedObservedKeys.add(`${input.workspace}::${input.projectId || ''}::${normalizeCorpusInput(input.requestText)}` as SuppressionKey)
  recordIntentRoutingSample({
    projectId: input.projectId,
    projectName: input.projectName,
    workspace: input.workspace,
    runId: input.runId,
    requestText: input.requestText,
    routing: {
      kind: 'matched',
      intent: input.intent,
      confidence: 1,
      reason: 'user-confirmed-recommendation',
    },
    annotation: 'confirmed',
    annotationBasis: 'fallback-bubble-continue',
  })
}

export function stageIntentCorpusInference(input: {
  projectId?: string | null
  projectName?: string
  workspace: 'outline-workbench' | 'home-editor'
  runId?: string | null
  requestText: string
  routing: RoutingShape
}): void {
  if (!input.requestText?.trim()) return
  pendingInferenceByWorkspace.set(input.workspace, {
    capturedAt: Date.now(),
    projectId: input.projectId || undefined,
    projectName: input.projectName,
    workspace: input.workspace,
    runId: input.runId,
    requestText: input.requestText,
    routing: input.routing,
  })
}

export function consumeIntentCorpusInference(input: {
  projectId?: string | null
  projectName?: string
  workspace: 'outline-workbench' | 'home-editor'
  runId?: string | null
  turnId?: string | null
  requestText: string
  routing: RoutingShape
}): boolean {
  const pending = pendingInferenceByWorkspace.get(input.workspace)
  pendingInferenceByWorkspace.delete(input.workspace)
  if (!pending) return false
  if (Date.now() - pending.capturedAt > INFERENCE_MAX_AGE_MS) return false
  if ((pending.projectId || '') !== (input.projectId || '')) return false
  if (input.routing.kind !== 'matched') return false
  recordIntentRoutingSample({
    projectId: pending.projectId,
    projectName: pending.projectName || input.projectName,
    workspace: input.workspace,
    runId: pending.runId,
    requestText: pending.requestText,
    routing: {
      kind: 'matched',
      intent: input.routing.intent,
      confidence: 1,
      reason: 'next-turn-inferred',
      diagnostics: pending.routing,
    },
    annotation: 'inferred',
    annotationBasis: `next-turn:${input.requestText.slice(0, 160)}`,
    relatedTurnId: input.turnId || undefined,
  })
  return true
}

export function recordIntentCorpusSample(input: AppendInput): void {
  try {
    if (!input.requestText?.trim()) return
    queue.push({
      ...input,
      projectId: input.projectId ?? '',
      runId: input.runId ?? '',
      turnId: input.turnId ?? '',
      relatedTurnId: input.relatedTurnId ?? '',
      requestText: input.requestText.slice(0, 2000),
    })
    if (queue.length > 500) {
      queue.splice(0, queue.length - 500)
      dropCount += 1
      logDiag('warn', '意图语料内存队列溢出，丢弃最旧样本', { dropCount })
    }
    void flushIntentCorpus()
  } catch (error) {
    logDiag('warn', '意图语料入队失败', {
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function flushIntentCorpus(): Promise<void> {
  if (flushPromise) return flushPromise
  flushPromise = (async () => {
    while (queue.length > 0) {
      const batch = queue.splice(0, 50)
      try {
        const result = await persist(batch.map((sample) => ({
          ...sample,
          id: sample.id || newSampleId(),
          schemaVersion: 1 as const,
        })))
        if (result === false) {
          queue.unshift(...batch)
          break
        }
        if (result !== true) {
          queue.unshift(...batch)
          break
        }
      } catch (error) {
        queue.unshift(...batch)
        logDiag('warn', '意图语料写入异常', {
          reason: error instanceof Error ? error.message : String(error),
          pending: queue.length,
        })
        break
      }
    }
  })().finally(() => {
    flushPromise = null
  })
  return flushPromise
}

export function intentCorpusQueueStats(): { pending: number; dropped: number } {
  return { pending: queue.length, dropped: dropCount }
}

export function resetIntentCorpusCollectorForTests(): void {
  queue.length = 0
  flushPromise = null
  dropCount = 0
  pendingInferenceByWorkspace.clear()
  suppressedObservedKeys.clear()
}

export function __testQueueCorpusSample(input: AppendInput): void {
  queue.push({
    ...input,
    projectId: input.projectId ?? '',
    runId: input.runId ?? '',
    turnId: input.turnId ?? '',
    relatedTurnId: input.relatedTurnId ?? '',
  })
  if (queue.length > 500) {
    queue.splice(0, queue.length - 500)
    dropCount += 1
    logDiag('warn', '意图语料内存队列溢出，丢弃最旧样本', { dropCount })
  }
}

export type IntentCorpusPackage = {
  schema: 'shenyi.intent-corpus-package'
  version: 1
  generatedAt: number
  scope: 'project' | 'global'
  projectId?: string
  sampleCount: number
  samples: IntentCorpusSample[]
}

export async function exportIntentCorpusPackage(input: {
  projectId?: string | null
  includeGlobal?: boolean
}): Promise<IntentCorpusPackage | null> {
  const bridge = (globalThis as { window?: { electronAPI?: { intentCorpusExportPackage?: (payload: unknown) => Promise<{ success?: boolean; reason?: string; package?: IntentCorpusPackage }> } } }).window
  const exportPackage = bridge?.electronAPI?.intentCorpusExportPackage
  if (!exportPackage) {
    logDiag('warn', '意图语料导出不可用', { reason: 'ipc-unavailable' })
    return null
  }
  const result = await exportPackage({
    projectId: input.projectId || '',
    includeGlobal: input.includeGlobal || false,
  })
  if (!result?.success || !result.package) {
    logDiag('warn', '意图语料导出失败', { reason: result?.reason || 'unknown' })
    return null
  }
  return result.package
}
