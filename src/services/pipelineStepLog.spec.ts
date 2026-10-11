import { describe, expect, it } from 'vitest'
import {
  buildPipelineChainWarningLine,
  coalescePipelineStepWarning
} from './pipelineStepLog'

describe('pipeline step warning visibility', () => {
  it('renders one warning line and coalesces repeats with a count', () => {
    const first = buildPipelineChainWarningLine({
      step: 2,
      skillIndex: 1,
      code: 'chain-dedupe',
      summary: '中间产物去重：剔除 128 字符'
    })
    expect(first).toBe('链式警告 2/2：中间产物去重：剔除 128 字符')

    const second = coalescePipelineStepWarning({
      line: first,
      code: 'chain-dedupe',
      state: { count: 1, lastLine: first }
    })
    expect(second).toEqual({
      count: 2,
      line: '链式警告 2/2：中间产物去重：剔除 128 字符（累计 2 次）'
    })

    const third = coalescePipelineStepWarning({
      line: second.line,
      code: 'chain-dedupe',
      state: { count: second.count, lastLine: second.line }
    })
    expect(third.count).toBe(3)
    expect(third.line).toContain('（累计 3 次）')
    expect(third.line.match(/（累计 \d+ 次）/g)).toHaveLength(1)
  })

  it('labels all five required chain warning families', () => {
    const codes = [
      'chain-handoff-contract-miss',
      'chain-dedupe',
      'chain-handoff-escalation',
      'chain-output-echo'
    ]
    for (const code of codes) {
      const line = buildPipelineChainWarningLine({
        step: 4,
        skillIndex: 0,
        code: code as any,
        summary: `${code} 摘要`
      })
      expect(line).toContain(`${code} 摘要`)
    }
  })
})

