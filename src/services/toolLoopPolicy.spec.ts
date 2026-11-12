import { describe, expect, it } from 'vitest'
import { getToolLoopPolicy, normalizeToolIterations } from './toolLoopPolicy'

describe('toolLoopPolicy', () => {
  it('exposes one policy per tool-loop scenario', () => {
    expect(getToolLoopPolicy('direct')).toMatchObject({ maxToolIterations: 6, convergence: true })
    expect(getToolLoopPolicy('direct-tool-intensive')).toMatchObject({ maxToolIterations: 12, convergence: true })
    expect(getToolLoopPolicy('folder-chain')).toMatchObject({ maxToolIterations: 4, convergence: true })
    expect(getToolLoopPolicy('compatibility-json')).toMatchObject({ maxToolIterations: 1, convergence: false })
  })

  it('caps caller-requested iterations at the scenario ceiling', () => {
    expect(normalizeToolIterations('direct')).toBe(6)
    expect(normalizeToolIterations('direct', 99)).toBe(64)
    expect(normalizeToolIterations('direct-tool-intensive', 20)).toBe(20)
    expect(normalizeToolIterations('direct-tool-intensive', 21)).toBe(21)
    expect(normalizeToolIterations('direct-tool-intensive', 99)).toBe(64)
    expect(normalizeToolIterations('folder-chain', 2)).toBe(2)
    expect(normalizeToolIterations('compatibility-json', 3)).toBe(1)
  })

})
