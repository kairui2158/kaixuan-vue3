import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

describe('useModalQueue', () => {
  const originalWindow = globalThis.window
  const listeners = new Map<string, EventListener>()

  beforeEach(() => {
    listeners.clear()
    ;(globalThis as { window?: unknown }).window = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener)
      })
    }
    vi.resetModules()
  })

  it('opens, closes, and reports top modal', async () => {
    const mod = await import('./useModalQueue')
    const queue = mod.useModalQueue()
    expect(queue.modalStack.value).toHaveLength(0)

    queue.open('settings')
    queue.open('skill-import')
    expect(queue.isOpen('settings')).toBe(true)
    expect(queue.isOpen('skill-import')).toBe(true)
    expect(queue.topId.value).toBe('skill-import')
    expect(queue.getZIndex('skill-import')).toBeGreaterThan(queue.getZIndex('settings'))

    queue.close('settings')
    expect(queue.isOpen('settings')).toBe(false)
    expect(queue.topId.value).toBe('skill-import')
  })

  it('ignores duplicate open for the same id', async () => {
    const queue = (await import('./useModalQueue')).useModalQueue()
    queue.open('settings')
    const firstZ = queue.getZIndex('settings')
    queue.open('settings')

    expect(queue.modalStack.value).toHaveLength(1)
    expect(queue.getZIndex('settings')).toBe(firstZ)
  })

  it('closes only the closable top modal on Escape', async () => {
    const queue = (await import('./useModalQueue')).useModalQueue()
    queue.open('settings')
    queue.open('locked', false)

    queue.closeTop()
    expect(queue.isOpen('locked')).toBe(true)
    expect(queue.modalStack.value).toHaveLength(2)
  })

  it('keeps z-index monotonic after middle modal closes', async () => {
    const queue = (await import('./useModalQueue')).useModalQueue()
    queue.open('settings')
    queue.open('skill-import')
    queue.open('help')
    queue.close('skill-import')

    expect(queue.getZIndex('help')).toBeGreaterThan(queue.getZIndex('settings'))
  })

  it('binds Escape once and dispatches closeTop through the listener', async () => {
    const queue = (await import('./useModalQueue')).useModalQueue()
    queue.open('settings')

    const listener = listeners.get('keydown') as unknown as (event: { key: string }) => void
    listener({ key: 'Escape' })
    expect(queue.isOpen('settings')).toBe(false)

    listener({ key: 'Escape' })
    expect(queue.isOpen('settings')).toBe(false)
  })

  it('returns default z-index for unknown modal id', async () => {
    const queue = (await import('./useModalQueue')).useModalQueue()
    expect(queue.getZIndex('unknown')).toBe(3000)
  })

  it('keeps the global confirm dialog above every modal in the queue', async () => {
    const queue = (await import('./useModalQueue')).useModalQueue()
    queue.open('settings')
    queue.open('skill-import')
    queue.open('help')
    queue.open('outline-workspace')

    const confirmZ = queue.getZIndex('app-confirm')
    expect(confirmZ).toBe(9000)
    for (const id of ['settings', 'skill-import', 'help', 'outline-workspace']) {
      expect(confirmZ).toBeGreaterThan(queue.getZIndex(id))
    }
  })

  afterAll(() => {
    ;(globalThis as { window?: unknown }).window = originalWindow
  })
})
