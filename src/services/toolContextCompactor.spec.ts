import { describe, expect, it } from 'vitest'
import {
  compactToolContextMessages,
} from './toolContextCompactor'

function toolResult(id: string, content: unknown) {
  return { role: 'tool', toolCallId: id, content: JSON.stringify(content) }
}

function assistantToolCall(id: string, name: string) {
  return {
    role: 'assistant',
    content: '',
    toolCalls: [{ id, type: 'function', function: { name, arguments: '{}' } }],
  }
}

describe('compactToolContextMessages', () => {
  it('keeps the most recent two tool rounds intact', () => {
    const messages = [
      { role: 'user', content: 'request' },
      assistantToolCall('old', 'editor.read'),
      toolResult('old', { ok: true, data: { text: 'a'.repeat(1_000) } }),
      assistantToolCall('recent-1', 'editor.read'),
      toolResult('recent-1', { ok: true, data: { text: 'b'.repeat(1_000) } }),
      assistantToolCall('recent-2', 'editor.write'),
      toolResult('recent-2', { ok: true, data: { text: 'c'.repeat(1_000) } }),
    ]

    const result = compactToolContextMessages(messages)

    expect(result.compactedMessageCount).toBe(1)
    expect(result.messages[2].content?.length).toBeLessThan(
      messages[2].content?.length || 0,
    )
    expect(result.messages[4]).toEqual(messages[4])
    expect(result.messages[6]).toEqual(messages[6])
  })

  it('does not expand messages that are already small', () => {
    const messages = [
      { role: 'user', content: 'request' },
      assistantToolCall('old', 'editor.read'),
      toolResult('old', { ok: true }),
      assistantToolCall('recent-1', 'editor.read'),
      toolResult('recent-1', { ok: true }),
      assistantToolCall('recent-2', 'editor.read'),
      toolResult('recent-2', { ok: true }),
    ]

    const result = compactToolContextMessages(messages)

    expect(result.compactedMessageCount).toBe(0)
    expect(result.messages).toEqual(messages)
  })

  it('preserves provider-specific tool result shapes', () => {
    const anthropicMessages = [
      { role: 'user', content: 'request' },
      { role: 'assistant', anthropicContent: [{ type: 'tool_use', id: 'old', name: 'editor.read' }] },
      { role: 'user', anthropicContent: [{ type: 'tool_result', tool_use_id: 'old', content: 'x'.repeat(1_000) }] },
      { role: 'assistant', anthropicContent: [{ type: 'tool_use', id: 'recent-1', name: 'editor.read' }] },
      { role: 'user', anthropicContent: [{ type: 'tool_result', tool_use_id: 'recent-1', content: 'y'.repeat(1_000) }] },
      { role: 'assistant', anthropicContent: [{ type: 'tool_use', id: 'recent-2', name: 'editor.read' }] },
      { role: 'user', anthropicContent: [{ type: 'tool_result', tool_use_id: 'recent-2', content: 'z'.repeat(1_000) }] },
    ]

    const result = compactToolContextMessages(anthropicMessages)

    expect(result.messages.map(message => message.role)).toEqual(
      anthropicMessages.map(message => message.role),
    )
    expect(result.messages[2].anthropicContent).toEqual(
      anthropicMessages[2].anthropicContent,
    )
  })

  it('does not compact failed or write results', () => {
    const messages = [
      { role: 'user', content: 'request' },
      assistantToolCall('old-read', 'editor.read'),
      toolResult('old-read', { ok: true, data: { text: 'a'.repeat(1_000) } }),
      assistantToolCall('old-write', 'editor.write'),
      toolResult('old-write', { ok: true, data: { applied: 1 } }),
      assistantToolCall('old-failed', 'editor.read'),
      toolResult('old-failed', { ok: false, error: { code: 'x', message: 'y'.repeat(1_000) } }),
      assistantToolCall('recent-1', 'editor.read'),
      toolResult('recent-1', { ok: true, data: { text: 'b'.repeat(1_000) } }),
      assistantToolCall('recent-2', 'editor.read'),
      toolResult('recent-2', { ok: true, data: { text: 'c'.repeat(1_000) } }),
    ]

    const result = compactToolContextMessages(messages)

    expect(result.compactedMessageCount).toBe(1)
    expect(result.messages[4]).toEqual(messages[4])
    expect(result.messages[6]).toEqual(messages[6])
  })
})
