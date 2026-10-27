export interface BodyWaitTimeoutInput {
  baseTimeoutMs: number
  observedPhysicalCalls: number
  perPhysicalCallBudgetMs: number
  maxTimeoutMs: number
  explicitTimeoutMs?: number
}

export function bodyWaitTimeoutMs(input: BodyWaitTimeoutInput): number
