import { describe, expect, it } from 'vitest'
import {
  computeViewportScroll,
  resolveScrollStrategy,
} from './editorViewport'

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
