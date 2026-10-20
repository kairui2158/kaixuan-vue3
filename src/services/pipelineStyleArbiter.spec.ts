import { describe, expect, it } from 'vitest'
import { arbitratePipelineStyle } from './pipelineStyleArbiter'

describe('pipelineStyleArbiter', () => {
  it('merges both style sources into one authoritative block', () => {
    const result = arbitratePipelineStyle({
      layer: 'body',
      profileStyleText: '风格标签：冷峻，克制\n节奏参数：中速',
      settingsStyleLines: ['风格 - 主题基调 - 都市夜感，信息密度高'],
      profile: {},
    })
    expect(result.text.startsWith('[风格指令]')).toBe(true)
    expect(result.text).toContain('风格标签：冷峻，克制')
    expect(result.text).toContain('风格 - 主题基调 - 都市夜感，信息密度高')
    expect(result.text).toContain('优先级：风格档案指令优先')
    expect(result.duplicateLineCount).toBe(0)
    expect(result.conflictLineCount).toBe(0)
  })

  it('deduplicates identical lines and marks semantic conflicts', () => {
    const result = arbitratePipelineStyle({
      layer: 'volume',
      profileStyleText: '风格标签：冷峻，克制',
      settingsStyleLines: ['冷峻，克制', '基调幽默，话痨'],
      profile: {},
    })
    expect(result.duplicateLineCount).toBe(1)
    expect(result.conflictLineCount).toBe(1)
    expect(result.lines.filter(line => line.includes('冷峻，克制'))).toHaveLength(1)
    expect(result.lines).toContain('基调幽默，话痨（主题基调；若与上方风格指令冲突，以风格指令为准）')
  })

  it('returns an empty block when neither source is present', () => {
    const result = arbitratePipelineStyle({
      layer: 'chapter',
      profileStyleText: '',
      settingsStyleLines: [],
      profile: {},
    })
    expect(result.text).toBe('')
    expect(result.sources).toEqual({ profileStyle: false, settingsStyle: false })
  })
})
