import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { toCloneableSnapshot } from './cloneableSnapshot'

describe('toCloneableSnapshot', () => {
  it('converts reactive proxies into structured-cloneable snapshots', () => {
    const value = reactive({ providers: [{ id: 'provider-a', nested: { enabled: true } }] })

    const snapshot = toCloneableSnapshot(value)

    expect(() => structuredClone(snapshot)).not.toThrow()
    expect(snapshot).toEqual({ providers: [{ id: 'provider-a', nested: { enabled: true } }] })
  })

  it('falls back to a JSON snapshot when structuredClone rejects a value', () => {
    const value = { text: 'ok', listener: () => undefined }

    expect(() => structuredClone(value)).toThrow()
    expect(toCloneableSnapshot(value)).toEqual({ text: 'ok' })
  })
})
