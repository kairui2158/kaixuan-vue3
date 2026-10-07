import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTextareaViewport,
  computeViewportScroll,
  resolveScrollStrategy,
} from './editorViewport'
import {
  buildLocalMeasureText,
  computeTextareaLineWindow,
  countLinesInContent,
} from './editorVirtualization'

describe('editorViewport scroll strategies', () => {
  it('centers a target with the center strategy', () => {
    expect(computeViewportScroll({
      top: 500,
      height: 20,
      clientHeight: 200,
      scrollTop: 0,
      strategy: 'center',
    })).toBe(410)
  })

  it('aligns the target with the viewport start or end', () => {
    expect(computeViewportScroll({
      top: 500,
      height: 20,
      clientHeight: 200,
      scrollTop: 0,
      strategy: 'start',
    })).toBe(500)
    expect(computeViewportScroll({
      top: 500,
      height: 20,
      clientHeight: 200,
      scrollTop: 0,
      strategy: 'end',
    })).toBe(320)
  })

  it('keeps the current scroll when the target is already visible in nearest mode', () => {
    expect(computeViewportScroll({
      top: 120,
      height: 20,
      clientHeight: 200,
      scrollTop: 100,
      strategy: 'nearest',
    })).toBe(100)
  })

  it('centers an out-of-viewport target in nearest mode', () => {
    expect(computeViewportScroll({
      top: 500,
      height: 20,
      clientHeight: 200,
      scrollTop: 100,
      strategy: 'nearest',
    })).toBe(410)
  })

  it('resolves auto focus to nearest and named focus to its strategy', () => {
    expect(resolveScrollStrategy('auto')).toBe('nearest')
    expect(resolveScrollStrategy('start')).toBe('start')
    expect(resolveScrollStrategy('end')).toBe('end')
    expect(resolveScrollStrategy('center')).toBe('center')
  })
})

describe('editor viewport local measurement', () => {
  it('keeps the offset as a stable column and reports its logical line', () => {
    const result = buildLocalMeasureText({
      content: '第一行\n第二行\n第三行\n第四行',
      offset: 10,
      maxCharacters: 8,
    })

    expect(result).toMatchObject({ text: '第三', column: 2, line: 2 })
  })

  it('builds a bounded local measurement prefix for the target line', () => {
    const result = buildLocalMeasureText({
      content: '第一行\n第二行\n第三行\n第四行',
      offset: 10,
      maxCharacters: 8,
    })

    expect(result).toMatchObject({
      text: '第三',
      column: 2,
      line: 2,
    })
  })

  it('limits an extremely long line to the measured suffix and reports its column', () => {
    const longLine = '甲'.repeat(100)
    const result = buildLocalMeasureText({
      content: `${longLine}\n下一行`,
      offset: 90,
      maxCharacters: 10,
    })

    expect(result).toMatchObject({
      text: `${'甲'.repeat(5)}\n`,
      column: 5,
      line: 0,
    })
  })

  it('computes a textarea render window with buffered lines', () => {
    expect(computeTextareaLineWindow({
      textarea: { scrollTop: 100, clientHeight: 300, value: 'a\nb\nc\nd\ne\nf\ng' },
      lineHeight: 20,
      bufferRatio: 0.5,
    })).toEqual({ startLine: 0, endLine: 6 })
  })

  it('accepts a precomputed line count to avoid rescanning the document', () => {
    expect(computeTextareaLineWindow({
      textarea: { scrollTop: 100, clientHeight: 300, value: 'a\nb\nc\nd\ne\nf\ng' },
      lineHeight: 20,
      bufferRatio: 0.5,
      lineCount: countLinesInContent('a\nb\nc\nd\ne\nf\ng'),
    })).toEqual({ startLine: 0, endLine: 6 })
  })
})

describe('editor viewport write follow', () => {
  const originalWindow = globalThis.window
  const originalNode = globalThis.Node
  const originalDocument = globalThis.document
  let listeners: { scroll: Array<() => void> }
  let textarea: HTMLTextAreaElement
  let mirror: HTMLDivElement
  let mirrorText = ''
  let highlightLayer: HTMLDivElement

  const fireScroll = () => {
    for (const listener of listeners.scroll) listener()
  }

  beforeEach(() => {
    vi.useFakeTimers()
    listeners = { scroll: [] }
    textarea = {
      scrollTop: 0,
      clientHeight: 200,
      clientWidth: 500,
      value: `${'line\n'.repeat(100)}`,
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'scroll') listeners.scroll.push(listener)
      },
      removeEventListener: () => undefined,
      getSelection: () => null,
      setSelectionRange: () => undefined,
    } as unknown as HTMLTextAreaElement
    mirrorText = ''
    const styleStore = new Map<string, string>()
    const style = new Proxy({}, {
      get(_target, property) {
        if (property === 'setProperty') {
          return (name: string, value: string) => styleStore.set(name, value)
        }
        if (property === 'getPropertyValue') {
          return (name: string) => styleStore.get(String(name)) ?? ''
        }
        return styleStore.get(String(property)) ?? ''
      },
      set(_target, property, value) {
        styleStore.set(String(property), String(value))
        return true
      },
    })
    mirror = {
      get style() {
        return style as unknown as CSSStyleDeclaration
      },
      setAttribute: () => undefined,
      remove: () => undefined,
      get firstChild() {
        return mirrorText ? { nodeType: 3 } : null
      },
      get offsetHeight() {
        return 20
      },
      get offsetTop() {
        return 0
      },
      get offsetLeft() {
        return 0
      },
      getBoundingClientRect: () => ({ top: 0, left: 0 }),
      get textContent() {
        return mirrorText
      },
      set textContent(value: string) {
        mirrorText = value
      },
    } as unknown as HTMLDivElement
    const highlightStyleStore = new Map<string, string>()
    const highlightStyle = new Proxy({}, {
      get(_target, property) {
        return highlightStyleStore.get(String(property)) ?? ''
      },
      set(_target, property, value) {
        highlightStyleStore.set(String(property), String(value))
        return true
      },
    })
    highlightLayer = {
      className: '',
      get style() {
        return highlightStyle as unknown as CSSStyleDeclaration
      },
    } as unknown as HTMLDivElement
    ;(globalThis as any).Node = { TEXT_NODE: 3 }
    ;(globalThis as any).document = {
      createRange: () => ({
        selectNodeContents: () => undefined,
        collapse: () => undefined,
        getBoundingClientRect: () => ({ top: 0, left: 0, height: 0 }),
      }),
    }
    ;(globalThis as any).window = {
      getComputedStyle: () => new Proxy({}, { get: () => () => '' }),
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    ;(globalThis as any).window = originalWindow
    ;(globalThis as any).Node = originalNode
    ;(globalThis as any).document = originalDocument
  })

  it('keeps following consecutive programmatic writes without user takeover', () => {
    const viewport = createTextareaViewport({ textarea, mirror, highlightLayer })
    ;(textarea as any).clientHeight = 200

    viewport.followWriteProgress(950, 960)
    fireScroll()
    viewport.followWriteProgress(1150, 1160)
    fireScroll()

    expect(textarea.scrollTop).not.toBe(0)
    expect(textarea.scrollTop).toBeGreaterThanOrEqual(1000)
    expect(highlightLayer.className).toBe('editor-viewport-highlight-layer editor-viewport-active-line')
  })

  it('keeps the base highlight class for reveal and clears it when follow stops', () => {
    const viewport = createTextareaViewport({ textarea, mirror, highlightLayer })

    viewport.revealTarget({ start: 10, end: 20, highlightMs: 1000 })
    expect(highlightLayer.className).toBe('editor-viewport-highlight-layer editor-viewport-highlight')

    vi.advanceTimersByTime(1000)
    expect(highlightLayer.className).toBe('')

    viewport.followWriteProgress(950, 960)
    expect(highlightLayer.className).toBe('editor-viewport-highlight-layer editor-viewport-active-line')

    viewport.stopFollow()
    expect(highlightLayer.className).toBe('')
  })

  it('lets a user scroll take over and notify scroll listeners', () => {
    const viewport = createTextareaViewport({ textarea, mirror })
    ;(textarea as any).clientHeight = 200
    let scrollNotifications = 0
    viewport.onViewportScroll(() => {
      scrollNotifications += 1
    })

    viewport.followWriteProgress(950, 960)
    fireScroll()
    textarea.scrollTop = 0
    fireScroll()
    viewport.followWriteProgress(950, 960)

    expect(scrollNotifications).toBe(2)
    expect(textarea.scrollTop).toBe(0)
  })

  it('does not change the viewport when a programmatic target is already visible', () => {
    const viewport = createTextareaViewport({ textarea, mirror })
    ;(textarea as any).clientHeight = 200
    textarea.scrollTop = 0
    let scrollNotifications = 0
    viewport.onViewportScroll(() => {
      scrollNotifications += 1
    })

    viewport.followWriteProgress(10, 20)

    expect(textarea.scrollTop).toBe(0)
    expect(scrollNotifications).toBe(0)
  })
})
