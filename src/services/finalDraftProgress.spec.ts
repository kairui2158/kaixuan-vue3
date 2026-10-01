import { describe, expect, it } from 'vitest'
import { formatFinalDraftProgress } from './finalDraftProgress'

describe('formatFinalDraftProgress', () => {
  it('renders segment, character, throughput, status, and estimate text', () => {
    expect(formatFinalDraftProgress({
      action: '生成',
      segmentIndex: 17,
      segments: 20,
      completedChars: 818_912,
      streamingChars: 2_340,
      telemetry: {
        tenSecondCharsPerSecond: 3.4,
        sixtySecondCharsPerSecond: 2.8,
        throughputStatus: 'streaming_slow',
        estimatedRemainingMs: 540_000,
      },
    })).toBe(
      '正在生成终稿：分段 17/20 · 已输出 821252 字 · 本段 2340 字 · 3.4字/秒 · 低速流式 · 预计剩余 9分钟',
    )
  })

  it('renders the stalled state without inventing an estimate', () => {
    const text = formatFinalDraftProgress({
      action: '续生成',
      segmentIndex: 3,
      segments: 5,
      completedChars: 100,
      streamingChars: 40,
      telemetry: {
        tenSecondCharsPerSecond: 0,
        sixtySecondCharsPerSecond: 0,
        throughputStatus: 'stalled',
        estimatedRemainingMs: null,
      },
    })
    expect(text).toContain('正在续生成终稿')
    expect(text).toContain('流式停滞')
    expect(text).not.toContain('预计剩余')
  })
})
