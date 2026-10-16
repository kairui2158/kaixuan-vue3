import { describe, expect, it } from 'vitest'
import { parseStyleAnalysis } from './styleAnalysis'

describe('styleAnalysis', () => {
  it('parses structured outline analysis and refuses evidence-bound fields', () => {
    const report = parseStyleAnalysis(JSON.stringify({
      positioning: {
        coreTemperament: ['冷硬', '快节奏'],
        genreTags: ['末世高武'],
        oneLinePositioning: '用动作推进世界。',
      },
      styleTags: '冷硬, 快节奏',
      pacingParams: '速度:快节奏, 紧张度:4',
      positiveRules: ['每卷至少推进一个主线节点。'],
      voice: { protagonistSpeech: '伪造声口' },
      sentencePatterns: ['伪造句式'],
      prohibitions: ['伪造警戒线'],
    }))

    expect(report.ok).toBe(true)
    expect(report.draft?.positioning.oneLinePositioning).toBe('用动作推进世界。')
    expect(report.draft?.positiveRules).toHaveLength(1)
    expect(report.insufficientEvidenceFields).toEqual([
      'voice', 'sentencePatterns', 'sceneTemplates', 'dailyRules', 'prohibitions',
    ])
    expect(report.ignoredFields).toEqual(['voice', 'sentencePatterns', 'prohibitions'])
    expect(report.draft && 'voice' in report.draft).toBe(false)
  })

  it('rejects non-json output with an actionable error', () => {
    const report = parseStyleAnalysis('这不是 JSON')
    expect(report.ok).toBe(false)
    expect(report.errors).toContain('模型未返回可解析的 JSON 对象')
    expect(report.draft).toBeNull()
  })

  it('rejects an empty analysis instead of fabricating a draft', () => {
    const report = parseStyleAnalysis('{"styleTags":""}')
    expect(report.ok).toBe(false)
    expect(report.errors[0]).toContain('结构化分析结果为空')
  })
})
