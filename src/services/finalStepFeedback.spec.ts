import { describe, expect, it } from 'vitest'
import { buildFinalStepFeedback } from './finalStepFeedback'

describe('buildFinalStepFeedback', () => {
  it('merges content contract, DEAI findings, and upstream anchors into one block', () => {
    const result = buildFinalStepFeedback({
      errors: ['FACT_LOCK缺字段：人物状态', '目标字数不足'],
      deaiFindings: [{ label: 'AI高频词', message: '“仿佛”密度超限' }],
      upstreamAnchors: ['S2 权威事实锚点'],
    })

    expect(result.sourceCounts).toEqual({
      content_contract: 2,
      deai: 1,
      upstream_anchor: 1,
    })
    expect(result.length).toBe(result.feedback.length)
    expect(result.feedback).toContain('【终步重试协议】')
    expect(result.feedback.indexOf('一、事实与账本约束')).toBeLessThan(result.feedback.indexOf('二、内容契约失败项'))
    expect(result.feedback.indexOf('二、内容契约失败项')).toBeLessThan(result.feedback.indexOf('三、降AI语言打磨项'))
    expect(result.feedback.indexOf('三、降AI语言打磨项')).toBeLessThan(result.feedback.indexOf('四、上游权威锚点'))
    expect(result.feedback).toContain('FACT_LOCK缺字段：人物状态')
    expect(result.feedback).toContain('AI高频词：“仿佛”密度超限')
    expect(result.feedback).toContain('信息无损的相邻短句合并')
  })

  it('supports standalone contract-only and DEAI-only regressions', () => {
    const contractOnly = buildFinalStepFeedback({ errors: ['FACT_LOCK缺字段：位置'] })
    expect(contractOnly.sourceCounts).toEqual({ content_contract: 1, deai: 0, upstream_anchor: 0 })
    expect(contractOnly.feedback).toContain('FACT_LOCK缺字段：位置')
    expect(contractOnly.feedback).not.toContain('三、降AI语言打磨项')

    const deaiOnly = buildFinalStepFeedback({
      errors: [],
      deaiFindings: [{ label: '禁用句式', message: '连续报告腔命中' }],
    })
    expect(deaiOnly.sourceCounts).toEqual({ content_contract: 0, deai: 1, upstream_anchor: 0 })
    expect(deaiOnly.feedback).toContain('禁用句式：连续报告腔命中')
    expect(deaiOnly.feedback).not.toContain('二、内容契约失败项')
  })

  it('bounds upstream anchors and never injects a candidate baseline', () => {
    const result = buildFinalStepFeedback({
      errors: ['FACT_LOCK缺字段：时间'],
      upstreamAnchors: ['锚点一', '', '锚点二', '锚点三', '锚点四'],
    })

    expect(result.sourceCounts.upstream_anchor).toBe(3)
    expect(result.feedback).toContain('锚点一')
    expect(result.feedback).toContain('锚点三')
    expect(result.feedback).not.toContain('锚点四')
    expect(result.feedback).not.toContain('上一版候选输出')
    expect(result.feedback).not.toContain('必须以它为基底')
    expect(result.feedback).not.toContain('只修正上述错误')
    expect(result.feedback).not.toContain('保留其余内容')
    expect(result.feedback).not.toContain('只修命中句')
  })

  it('adds the echo section only for echo-kind failures', () => {
    const normal = buildFinalStepFeedback({ errors: ['缺少 output 字段'] })
    expect(normal.feedback).not.toContain('五、回显修复')

    const echo = buildFinalStepFeedback({
      errors: ['终步回显校验失败：第 3/3 步输出与上一步输出高度重复。', 'failureKind: chain_output_echo']
    })
    expect(echo.feedback).toContain('五、回显修复')
    expect(echo.feedback).not.toContain('failureKind: chain_output_echo')
    expect(echo.sourceCounts.content_contract).toBe(2)
  })
})
