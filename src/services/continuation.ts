import type { ProviderPurpose, CallAiParams } from './aiService'

export type ContinuationStatus =
  | 'none'
  | 'generating'
  | 'completed'
  | 'possibly_truncated'
  | 'interrupted'
  | 'failed'
  | 'user_stopped'
  | 'continuing'

export type FinishReason =
  | 'stop'
  | 'length'
  | 'tool_calls'
  | 'content_filter'
  | 'network_error'
  | 'timeout'
  | 'canceled'
  | 'unknown'

export interface ContinuationSnapshot {
  requestId: string
  projectId: string
  workspace: string
  purpose: ProviderPurpose
  providerId?: string
  model?: string
  skillIds: string[]
  agentIds: string[]
  mode: 'single' | 'chain' | 'compose' | 'split-merge' | 'multi-step'
  originalMessages: CallAiParams['messages']
  accumulatedText: string
  continuationCount: number
  status: ContinuationStatus
  finishReason?: FinishReason
  currentStep?: number
  inputVersion?: string
  createdAt: number
  updatedAt: number
}

export function canContinue(snapshot: Pick<ContinuationSnapshot, 'status' | 'accumulatedText'>): boolean {
  return Boolean(snapshot.accumulatedText.trim()) && (
    snapshot.status === 'possibly_truncated' ||
    snapshot.status === 'interrupted' ||
    snapshot.status === 'user_stopped'
  )
}

export function mergeContinuationText(existing: string, next: string): string {
  const left = existing || ''
  const right = next || ''
  if (!left) return right
  if (!right) return left
  const maxOverlap = Math.min(left.length, right.length, 2000)
  for (let size = maxOverlap; size >= 1; size -= 1) {
    if (left.slice(-size) === right.slice(0, size)) return left + right.slice(size)
  }
  return left + right
}

export function continuationStatusFor(reason: FinishReason | undefined, hasText: boolean): ContinuationStatus {
  if (reason === 'length') return hasText ? 'possibly_truncated' : 'failed'
  if (reason === 'timeout' || reason === 'network_error') return hasText ? 'interrupted' : 'failed'
  if (reason === 'canceled') return hasText ? 'user_stopped' : 'failed'
  if (reason === 'stop') return 'completed'
  return 'failed'
}
