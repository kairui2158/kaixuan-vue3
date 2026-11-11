import { describe, expect, it } from 'vitest'
import { createApiCallBudget } from './apiCallBudget'

describe('apiCallBudget', () => {
  it('rejects further consumption when the budget has not been extended', () => {
    const budget = createApiCallBudget(1)
    expect(budget.tryConsume('chain-step-0')).toMatchObject({ status: 'allowed', used: 1, limit: 1 })
    const blocked = budget.tryConsume('chain-step-1')
    expect(blocked).toMatchObject({ status: 'blocked', used: 1, limit: 1 })
    expect(blocked.reason).toContain('chain-step-1')
  })

  it('keeps consumed calls when extending and records each attempt', () => {
    const budget = createApiCallBudget(2)

    expect(budget.tryConsume('chain-step-0')).toMatchObject({ status: 'allowed', used: 1, limit: 2 })
    expect(budget.tryConsume('chain-step-1')).toMatchObject({ status: 'allowed', used: 2, limit: 2 })
    expect(budget.tryConsume('chain-step-2')).toMatchObject({ status: 'blocked', used: 2, limit: 2 })

    expect(budget.extend(4)).toEqual({ used: 2, limit: 6, extensions: 1 })
    expect(budget.tryConsume('chain-step-2')).toMatchObject({ status: 'allowed', used: 3, limit: 6 })
    expect(budget.snapshot()).toMatchObject({
      used: 3,
      limit: 6,
      entries: [
        { step: 'chain-step-0', used: 1, limit: 2 },
        { step: 'chain-step-1', used: 2, limit: 2 },
        { step: 'chain-step-2', used: 2, limit: 2 },
        { step: 'chain-step-2', used: 3, limit: 6 },
      ],
    })
  })

  it('charges physical retries against the same ledger and blocks at the shared limit', () => {
    const budget = createApiCallBudget(2)

    expect(budget.tryConsume('chain-step-0')).toMatchObject({ status: 'allowed', used: 1, limit: 2 })
    expect(budget.consumePhysicalRetry('chain-step-0:physical')).toMatchObject({
      status: 'allowed',
      used: 2,
      limit: 2
    })
    expect(budget.consumePhysicalRetry('chain-step-0:physical')).toMatchObject({
      status: 'blocked',
      used: 2,
      limit: 2
    })
    expect(budget.tryConsume('chain-step-1')).toMatchObject({ status: 'blocked', used: 2, limit: 2 })
    expect(budget.snapshot()).toMatchObject({
      used: 2,
      limit: 2,
      entries: [
        { step: 'chain-step-0', used: 1, limit: 2 },
        { step: 'chain-step-0:physical', used: 2, limit: 2 },
        { step: 'chain-step-0:physical', used: 2, limit: 2 },
        { step: 'chain-step-1', used: 2, limit: 2 },
      ],
    })
  })

  it('covers four chain steps with four physical calls under a shared budget of 16', () => {
    const budget = createApiCallBudget(16)
    const steps = ['s1', 's2', 's3', 's4']

    for (const step of steps) {
      expect(budget.tryConsume(step)).toMatchObject({ status: 'allowed', used: expect.any(Number) })
      for (let physicalCall = 1; physicalCall <= 3; physicalCall += 1) {
        expect(budget.consumePhysicalRetry(`${step}:physical-${physicalCall}`))
          .toMatchObject({ status: 'allowed', used: expect.any(Number) })
      }
    }

    expect(budget.tryConsume('overflow')).toMatchObject({
      status: 'blocked',
      used: 16,
      limit: 16,
      reason: expect.stringContaining('overflow'),
    })
    expect(budget.consumePhysicalRetry('overflow:physical')).toMatchObject({
      status: 'blocked',
      used: 16,
      limit: 16,
      reason: expect.stringContaining('overflow:physical'),
    })
    expect(budget.snapshot()).toMatchObject({ used: 16, limit: 16 })
    expect(budget.snapshot().entries).toHaveLength(18)
  })
})
