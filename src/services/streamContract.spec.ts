import { describe, expect, it } from 'vitest'
import {
  checksumStreamText,
  createStreamFrame,
  parseStreamFrames,
} from './streamContract'

const frame = (cursor: number, text: string, overrides: Partial<ReturnType<typeof createStreamFrame>> = {}) => ({
  ...createStreamFrame('stream-1', cursor, text),
  ...overrides,
})

describe('streamContract', () => {
  it('creates cursor-addressed frames with stable checksums', () => {
    const created = createStreamFrame('stream-1', 3, 'data: {}\n\n')
    expect(created).toMatchObject({
      streamId: 'stream-1',
      cursor: 3,
      transportEvent: 'chunk',
      text: 'data: {}\n\n',
    })
    expect(created.timestamp).toBeGreaterThan(0)
    expect(created.checksum).toBe(checksumStreamText('data: {}\n\n'))
  })

  it('parses OpenAI-compatible SSE frames into protocol deltas', () => {
    const result = parseStreamFrames([
      frame(1, 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'),
      frame(2, 'data: {"choices":[{"delta":{}}],"usage":{"total_tokens":7}}\n\n'),
      frame(3, 'data: [DONE]\n\n'),
    ], 'openai-compatible')

    expect(result.events.map(event => event.type)).toEqual(['delta', 'delta'])
    expect(result.events[0]).toMatchObject({ content: '你好', raw: { choices: [{ delta: { content: '你好' } }] } })
    expect(result.events[1]).toMatchObject({ usage: { total_tokens: 7 } })
    expect(result.state).toMatchObject({ cursor: 3, buffer: '', duplicateFrames: 0, invalidFrames: 0 })
  })

  it('deduplicates replayed frames by cursor after recovery', () => {
    const first = parseStreamFrames([
      frame(1, 'data: {"choices":[{"delta":{"content":"A"}}]}\n\n'),
      frame(2, 'data: {"choices":[{"delta":{"content":"B"}}]}\n\n'),
    ], 'openai-compatible')
    const replay = parseStreamFrames([
      frame(1, 'data: {"choices":[{"delta":{"content":"A"}}]}\n\n'),
      frame(2, 'data: {"choices":[{"delta":{"content":"B"}}]}\n\n'),
      frame(3, 'data: {"choices":[{"delta":{"content":"C"}}]}\n\n'),
    ], 'openai-compatible', first.state)

    expect(replay.events).toHaveLength(1)
    expect(replay.events[0]).toMatchObject({ content: 'C' })
    expect(replay.state.duplicateFrames).toBe(2)
    expect(replay.state.cursor).toBe(3)
  })

  it('rejects checksum-mismatched frames without consuming their cursor', () => {
    const result = parseStreamFrames([
      frame(1, 'data: {"choices":[{"delta":{"content":"A"}}]}\n\n', { checksum: 'bad' }),
      frame(1, 'data: {"choices":[{"delta":{"content":"A"}}]}\n\n'),
    ], 'openai-compatible')

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({ content: 'A' })
    expect(result.state.invalidFrames).toBe(1)
    expect(result.state.cursor).toBe(1)
  })

  it('preserves partial SSE lines across frames and honors the time slice', () => {
    const result = parseStreamFrames([
      frame(1, 'data: {"choices":[{"delta":{"conte'),
      frame(2, 'nt":"完整"}}]}\n\n'),
    ], 'openai-compatible')

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({ content: '完整' })
    expect(result.state.buffer).toBe('')

    const sliced = parseStreamFrames(
      Array.from({ length: 100 }, (_, index) => frame(index + 1, 'data: {"choices":[{"delta":{"content":"x"}}]}\n\n')),
      'openai-compatible',
      undefined,
      { maxDurationMs: 0 },
    )
    expect(sliced.state.pendingFrames.length).toBeGreaterThan(0)
    expect(sliced.state.pendingFrames.length).toBeLessThan(100)
  })

  it('parses Anthropic and Gemini stream shapes through the same contract', () => {
    const anthropic = parseStreamFrames([
      frame(1, 'data: {"type":"content_block_delta","delta":{"text":"A"}}\n\n'),
      frame(2, 'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":12}}\n\n'),
    ], 'anthropic')
    expect(anthropic.events[0]).toMatchObject({ content: 'A' })
    expect(anthropic.events[1]).toMatchObject({ finishReason: 'tool_use', usage: { output_tokens: 12 } })

    const gemini = parseStreamFrames([
      frame(1, 'data: {"candidates":[{"content":{"parts":[{"text":"B"}]}}],"usageMetadata":{"totalTokenCount":9}}\n\n'),
      frame(2, 'data: {"candidates":[{"finishReason":"STOP"}]}\n\n'),
    ], 'gemini')
    expect(gemini.events[0]).toMatchObject({ content: 'B', usage: { totalTokenCount: 9 } })
    expect(gemini.events[1]).toMatchObject({ content: null, finishReason: 'STOP' })
  })
})
