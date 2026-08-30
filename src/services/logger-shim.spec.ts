import { describe, it, expect, beforeAll } from 'vitest'

const diagWrites: any[][] = []
let shim: any

beforeAll(async () => {
  ;(globalThis as any).window = {
    addEventListener: () => {},
    electronAPI: {
      diagWrite: (batch: any[]) => { diagWrites.push(batch) },
    },
  }
  shim = (await import('./logger-shim.js')).default
})

function lastMsg(): string {
  const batch = diagWrites[diagWrites.length - 1]
  expect(batch).toBeTruthy()
  return batch[batch.length - 1].msg
}

describe('logger-shim error serialization', () => {
  it('serializes Error with name/message instead of "{}"', () => {
    shim.error('[Test] 失败:', new Error('boom'))
    const msg = lastMsg()
    expect(msg).toContain('Error: boom')
    expect(msg).not.toContain('{}')
  })

  it('serializes error stack when present', () => {
    shim.error('[Test]', new TypeError('bad type'))
    expect(lastMsg()).toContain('TypeError: bad type')
  })

  it('keeps plain objects as JSON', () => {
    shim.error('[Test]', { a: 1 })
    expect(lastMsg()).toContain('{"a":1}')
  })

  it('falls back to String() for values that stringify to "{}"', () => {
    shim.error('[Test]', function markerFn() {})
    const msg = lastMsg()
    expect(msg).toContain('markerFn')
    expect(msg).not.toBe('[Test] {}')
  })
})
