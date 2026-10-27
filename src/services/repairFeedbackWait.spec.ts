import { describe, expect, it } from 'vitest'
import { bodyWaitTimeoutMs } from './repairFeedbackWait.js'

describe('bodyWaitTimeoutMs', () => {
  it('uses the base budget before any physical request is observed', () => {
    expect(bodyWaitTimeoutMs({
      baseTimeoutMs: 30 * 60_000,
      observedPhysicalCalls: 0,
      perPhysicalCallBudgetMs: 6 * 60_000,
      maxTimeoutMs: 90 * 60_000,
    })).toBe(30 * 60_000)
  })

  it('extends the budget for every observed physical request', () => {
    expect(bodyWaitTimeoutMs({
      baseTimeoutMs: 30 * 60_000,
      observedPhysicalCalls: 7,
      perPhysicalCallBudgetMs: 6 * 60_000,
      maxTimeoutMs: 90 * 60_000,
    })).toBe(72 * 60_000)
  })

  it('caps the dynamic budget so runaway retries cannot extend forever', () => {
    expect(bodyWaitTimeoutMs({
      baseTimeoutMs: 30 * 60_000,
      observedPhysicalCalls: 20,
      perPhysicalCallBudgetMs: 6 * 60_000,
      maxTimeoutMs: 90 * 60_000,
    })).toBe(90 * 60_000)
  })

  it('honors an explicit timeout override without dynamic extension', () => {
    expect(bodyWaitTimeoutMs({
      baseTimeoutMs: 30 * 60_000,
      observedPhysicalCalls: 8,
      perPhysicalCallBudgetMs: 6 * 60_000,
      maxTimeoutMs: 90 * 60_000,
      explicitTimeoutMs: 45 * 60_000,
    })).toBe(45 * 60_000)
  })
})
