import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

describe('useModalQueue', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const listeners = new Map<string, EventListener>()

  beforeEach(() => {
    listeners.clear()
    ;(globalThis as { window?: unknown }).window = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener)
      }),
    }
    ;(globalThis as { document?: unknown }).document = undefined
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

  it('focuses the first modal control and returns focus to the trigger', async () => {
    const trigger = focusElement()
    const control = focusElement()
    const dialog = focusElement([control])
    mockDocument(trigger, dialog)

    const queue = (await import('./useModalQueue')).useModalQueue()
    queue.open('settings')
    await flushMicrotasks()
    expect(control.focus).toHaveBeenCalledWith({ preventScroll: true })

    queue.close('settings')
    await flushMicrotasks()
    expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('wraps Tab focus inside the top modal', async () => {
    const first = focusElement()
    const last = focusElement()
    const dialog = focusElement([first, last])
    mockDocument(first, dialog)

    const queue = (await import('./useModalQueue')).useModalQueue()
    queue.open('settings')
    const listener = listeners.get('keydown') as unknown as (event: KeyboardEvent) => void
    const event = { key: 'Tab', preventDefault: vi.fn(), shiftKey: true }
    listener(event as unknown as KeyboardEvent)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(last.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('returns focus to the parent control when a nested modal closes', async () => {
    const parentControl = focusElement()
    const nestedTrigger = focusElement()
    const nestedControl = focusElement()
    const parentDialog = focusElement([parentControl, nestedTrigger])
    const nestedDialog = focusElement([nestedControl])
    mockDocument(parentControl, parentDialog, {
      element: nestedDialog,
      activeElement: nestedControl,
      trigger: nestedTrigger,
    })

    const queue = (await import('./useModalQueue')).useModalQueue()
    queue.open('settings')
    setDocumentActiveElement(nestedTrigger)
    queue.open('nested')
    await flushMicrotasks()
    setDocumentActiveElement(nestedControl)

    queue.close('nested')
    await flushMicrotasks()
    expect(nestedTrigger.focus).toHaveBeenCalledWith({ preventScroll: true })
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
    ;(globalThis as { document?: unknown }).document = originalDocument
  })

  function focusElement(children: HTMLElement[] = [], tabIndex = -1) {
    const element = {
      tabIndex,
      children,
      focus: vi.fn(),
      hasAttribute: vi.fn(() => false),
      contains: vi.fn((candidate: unknown) => children.includes(candidate as HTMLElement)),
      querySelector: vi.fn(() => children[0] ?? null),
      querySelectorAll: vi.fn(() => (children.length > 0 ? children : [element as unknown as HTMLElement])),
    }
    return element as unknown as HTMLElement
  }

  function mockDocument(activeElement: HTMLElement, dialog: HTMLElement, nested?: {
    element: HTMLElement
    activeElement: HTMLElement
    trigger: HTMLElement
  }) {
    const dialogs: Record<string, HTMLElement> = { settings: dialog }
    if (nested) dialogs.nested = nested.element
    ;(globalThis as { document?: unknown }).document = {
      activeElement,
      getElementById: (id: string) => dialogs[id] ?? null,
      querySelector: vi.fn(() => null),
      contains: vi.fn(() => true),
    }
  }

  function setDocumentActiveElement(element: HTMLElement) {
    ;(globalThis.document as { activeElement?: HTMLElement | null }).activeElement = element
  }

  async function flushMicrotasks() {
    await Promise.resolve()
    await Promise.resolve()
  }
})
