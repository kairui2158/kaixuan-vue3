import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const { __testHooks } = await import('./api')

describe('providerNet stream activity classifier', () => {
  it('classifies complete OpenAI reasoning and content deltas line by line', () => {
    const classifier = __testHooks.createProviderStreamActivityClassifier()
    expect(classifier.push('data: {"choices":[{"delta":{"reasoning_content":"思考"}}]}\n'))
      .toBe('reasoning')
    expect(classifier.push('data: {"choices":[{"delta":{"content":"正文"}}]}\n'))
      .toBe('content')
    expect(classifier.push('data: {"choices":[{"delta":{"tool_calls":[]}}]}\n'))
      .toBe('tool')
  })

  it('buffers partial SSE lines instead of misclassifying them as transport', () => {
    const classifier = __testHooks.createProviderStreamActivityClassifier()
    const firstPart = 'data: {"choices":[{"delta":{"reasoning'
    const secondPart = '_content":"思考"}}]\ndata: [DONE]\n'
    expect(classifier.push(firstPart)).toBe('transport')
    expect(classifier.push(secondPart)).toBe('transport')
  })

  it('classifies a multi-line OpenAI chunk by its strongest complete delta', () => {
    const classifier = __testHooks.createProviderStreamActivityClassifier()
    const chunk = [
      'data: {"choices":[{"delta":{"reasoning_content":"思考"}}]}',
      'data: {"choices":[{"delta":{"content":"正文"}}]}',
      '',
    ].join('\n')
    expect(classifier.push(chunk)).toBe('content')
  })

  it('keeps non-SSE bytes as transport activity', () => {
    const classifier = __testHooks.createProviderStreamActivityClassifier()
    expect(classifier.push(': keep-alive\n')).toBe('transport')
  })
})
