import { describe, expect, it } from 'vitest'
import {
  createProviderScheduler,
  ProviderSchedulerCanceledError,
} from './providerScheduler'

describe('providerScheduler', () => {
  it('caps acquisitions per provider and releases slots FIFO', async () => {
    const scheduler = createProviderScheduler({ maxConcurrencyPerProvider: 2 })
    const first = await scheduler.acquire({ providerId: 'p1' })
    const second = await scheduler.acquire({ providerId: 'p1' })

    let thirdResolved = false
    const third = scheduler.acquire({ providerId: 'p1' }).then(slot => {
      thirdResolved = true
      return slot
    })
    await Promise.resolve()
    expect(thirdResolved).toBe(false)

    first.release()
    const thirdSlot = await third
    expect(thirdResolved).toBe(true)
    expect(scheduler.snapshot().waitingCountByProvider).toEqual({})
    second.release()
    thirdSlot.release()
  })

  it('keeps provider limits independent', async () => {
    const scheduler = createProviderScheduler({ maxConcurrencyPerProvider: 1 })
    const first = await scheduler.acquire({ providerId: 'p1' })
    const second = await scheduler.acquire({ providerId: 'p2' })
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    first.release()
    second.release()
  })

  it('rejects a queued acquisition on abort without consuming a slot', async () => {
    const scheduler = createProviderScheduler({ maxConcurrencyPerProvider: 1 })
    const active = await scheduler.acquire({ providerId: 'p1' })
    const controller = new AbortController()

    const queued = scheduler.acquire({
      providerId: 'p1',
      signal: controller.signal,
    })
    await Promise.resolve()
    controller.abort()

    await expect(queued).rejects.toBeInstanceOf(ProviderSchedulerCanceledError)
    active.release()
    const next = await scheduler.acquire({ providerId: 'p1' })
    next.release()
  })

  it('emits queued, started, and canceled events with queue positions', async () => {
    const scheduler = createProviderScheduler({ maxConcurrencyPerProvider: 1 })
    const events: Array<{ status: string; position?: number; waiting?: number }> = []
    const active = await scheduler.acquire({ providerId: 'p1' })

    const controller = new AbortController()
    const queued = scheduler.acquire({
      providerId: 'p1',
      signal: controller.signal,
      onEvent: event => events.push(event),
    })
    await Promise.resolve()
    expect(events).toEqual([
      expect.objectContaining({ status: 'queued', providerId: 'p1', position: 1, waiting: 1 }),
    ])

    controller.abort()
    await expect(queued).rejects.toBeInstanceOf(ProviderSchedulerCanceledError)
    expect(events).toEqual([
      expect.objectContaining({ status: 'queued' }),
      expect.objectContaining({ status: 'canceled', providerId: 'p1' }),
    ])

    const started = scheduler.acquire({
      providerId: 'p1',
      onEvent: event => events.push(event),
    })
    await Promise.resolve()
    expect(events.at(-1)).toEqual(expect.objectContaining({ status: 'queued' }))
    active.release()
    const slot = await started
    expect(events.at(-1)).toEqual(expect.objectContaining({ status: 'started', providerId: 'p1' }))
    slot.release()
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const scheduler = createProviderScheduler({ maxConcurrencyPerProvider: 1 })
    const controller = new AbortController()
    controller.abort()
    await expect(scheduler.acquire({
      providerId: 'p1',
      signal: controller.signal,
    })).rejects.toBeInstanceOf(ProviderSchedulerCanceledError)
  })
})
