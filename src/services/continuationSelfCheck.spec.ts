import { describe, expect, it } from 'vitest'
import { isContinuationSelfCheckText } from './continuationSelfCheck'

describe('continuation self-check', () => {
  it('recognizes the annotation marker', () => {
    expect(isContinuationSelfCheckText('【续写检查：已到达协议终点】')).toBe(true)
  })

  it('recognizes the protocol-end phrase pair', () => {
    expect(isContinuationSelfCheckText('已到达协议终点，无待续写内容。')).toBe(true)
  })

  it('does not treat ordinary continuation output as self-check', () => {
    expect(isContinuationSelfCheckText('他停下脚步，听见门后传来第二声敲击。')).toBe(false)
    expect(isContinuationSelfCheckText('')).toBe(false)
  })
})
