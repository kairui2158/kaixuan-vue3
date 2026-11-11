import { describe, expect, it } from 'vitest'
import { classifyGenerationValidity, classifyRunOutcome } from './generationValidity'

describe('classifyGenerationValidity', () => {
  it('marks normal body output as usable', () => {
    expect(classifyGenerationValidity({
      text: '第一卷',
      finishReason: 'stop'
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('marks explicit length finish with body as truncated', () => {
    expect(classifyGenerationValidity({
      text: '部分正文',
      finishReason: 'max_tokens'
    })).toMatchObject({ kind: 'truncated', usable: true })
  })

  it('marks usage-at-limit with body as truncated without a threshold guess', () => {
    expect(classifyGenerationValidity({
      text: '部分正文',
      usage: { completion_tokens: 1000 },
      maxTokens: 1000
    })).toMatchObject({ kind: 'truncated', usable: true })
  })

  it('exempts a definitive stop finish from usage-at-limit truncation', () => {
    expect(classifyGenerationValidity({
      text: '完整正文。',
      finishReason: 'stop',
      usage: { completion_tokens: 1000 },
      maxTokens: 1000
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('subtracts reasoning tokens before comparing output usage to the limit', () => {
    expect(classifyGenerationValidity({
      text: '正文很完整。',
      finishReason: 'stop',
      usage: {
        completion_tokens: 1200,
        reasoningOutputTokens: 200
      },
      maxTokens: 1000
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('still infers truncation from usage-at-limit when the finish reason is unavailable', () => {
    expect(classifyGenerationValidity({
      text: '部分正文',
      usage: { completion_tokens: 1000 },
      maxTokens: 1000
    })).toMatchObject({ kind: 'truncated', usable: true })
  })

  it('marks reasoning-only length output as reasoning exhausted', () => {
    expect(classifyGenerationValidity({
      text: '',
      reasoning: '模型思考',
      finishReason: 'length',
      usage: { completion_tokens: 16384 },
      maxTokens: 16384
    })).toMatchObject({ kind: 'reasoning_exhausted', usable: false })
  })

  it('marks empty response without reasoning as empty', () => {
    expect(classifyGenerationValidity({
      text: '',
      reasoning: '',
      finishReason: 'stop'
    })).toMatchObject({ kind: 'empty', usable: false })
  })

  it('rejects nonempty placeholder prose when output usage is zero', () => {
    expect(classifyGenerationValidity({
      text: '上游模型响应失败，请重试。',
      usage: { completion_tokens: 0, total_tokens: 127240 },
      finishReason: 'stop'
    })).toMatchObject({
      kind: 'empty',
      usable: false,
      message: '供应商返回占位文本且输出 usage 为零，判定为假成功'
    })
  })

  it('keeps normal body output usable when output usage is reported', () => {
    expect(classifyGenerationValidity({
      text: '正文',
      usage: { completion_tokens: 5000, total_tokens: 6000 },
      finishReason: 'stop'
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('marks tool-call responses as usable without body text', () => {
    expect(classifyGenerationValidity({
      text: '',
      reasoning: '',
      finishReason: 'tool_calls',
      toolCalls: [{ name: 'editor.write' }]
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('keeps tool-call turns successful without body text', () => {
    expect(classifyRunOutcome({
      text: '',
      reasoning: '',
      finishReason: 'tool_calls',
      toolCalls: [{ name: 'editor.write' }]
    })).toEqual({ status: 'success' })
  })

  it('prioritizes cancellation over output state', () => {
    expect(classifyGenerationValidity({
      text: '部分正文',
      canceled: true
    })).toMatchObject({ kind: 'canceled', usable: false })
  })

  it('prioritizes errors over output state', () => {
    expect(classifyGenerationValidity({
      text: '',
      error: 'provider handshake failed'
    })).toMatchObject({ kind: 'error', usable: false })
  })

  it('does not infer truncation from usage below max tokens', () => {
    expect(classifyGenerationValidity({
      text: '正文',
      usage: { completion_tokens: 950 },
      maxTokens: 1000
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('uses the effective downgraded max tokens when classifying a response', () => {
    expect(classifyGenerationValidity({
      text: '部分正文',
      usage: { completion_tokens: 12000 },
      maxTokens: 12000
    })).toMatchObject({ kind: 'truncated', usable: true })

    expect(classifyGenerationValidity({
      text: '部分正文',
      usage: { completion_tokens: 12000 },
      maxTokens: 32000
    })).toMatchObject({ kind: 'usable', usable: true })
  })

  it('preserves blocked outcomes instead of collapsing them to success or failed', () => {
    expect(classifyRunOutcome({
      text: '当前卷内容',
      blocked: true,
      blockedReason: 'API 调用预算已用尽，等待用户追加'
    })).toEqual({
      status: 'blocked',
      error: 'API 调用预算已用尽，等待用户追加'
    })
  })
})

