import { describe, expect, it } from 'vitest'
import { slimContinuationMessages } from './continuationSlim'

describe('continuationSlim', () => {
  it('deduplicates repeated system sections', () => {
    const messages = [
      { role: 'system' as const, content: '[大纲结构地图]\n卷一\n卷二\n\n[当前焦点全文]\n这是全文内容。' },
      { role: 'system' as const, content: '[大纲结构地图]\n卷一\n卷二\n\n[当前焦点全文]\n这是全文内容。' },
      { role: 'user' as const, content: '帮我改一下大纲' },
    ]
    const result = slimContinuationMessages(messages)
    const mapCount = result
      .filter((m) => m.role === 'system')
      .filter((m) => String(m.content).includes('[大纲结构地图]'))
      .length
    expect(mapCount).toBe(1)
  })

  it('trims history to last 20 non-system messages', () => {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (let i = 0; i < 15; i++) {
      messages.push({ role: 'user' as const, content: 'msg-' + i })
      messages.push({ role: 'assistant' as const, content: 'reply-' + i })
    }
    const result = slimContinuationMessages(messages)
    const nonSystem = result.filter((m) => m.role !== 'system')
    expect(nonSystem.length).toBeLessThanOrEqual(20)
  })
  it('preserves short conversations unchanged', () => {
    const messages = [
      { role: 'system' as const, content: '你是小说创作助手。' },
      { role: 'user' as const, content: '帮我看看大纲。' },
    ]
    const result = slimContinuationMessages(messages)
    expect(result).toEqual(messages)
  })
  it('handles empty messages array', () => {
    expect(slimContinuationMessages([])).toEqual([])
  })
})
