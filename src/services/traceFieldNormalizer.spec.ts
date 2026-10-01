import { describe, expect, it } from 'vitest'
import {
  normalizeFinishReason,
  normalizeToolCallId,
  normalizeUsage,
} from './traceFieldNormalizer'

describe('normalizeUsage', () => {
  it('normalizes OpenAI-compatible usage', () => {
    expect(normalizeUsage('openai-compatible', {
      prompt_tokens: 12,
      completion_tokens: 7,
      total_tokens: 19,
    })).toEqual({
      inputTokens: 12,
      outputTokens: 7,
      totalTokens: 19,
    })
  })

  it('normalizes Anthropic cache usage', () => {
    expect(normalizeUsage('anthropic', {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: 10,
    })).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      cacheReadInputTokens: 80,
      cacheWriteInputTokens: 10,
    })
  })

  it('normalizes Gemini usage and nested OpenAI cache details', () => {
    expect(normalizeUsage('gemini', {
      promptTokenCount: 30,
      candidatesTokenCount: 5,
      totalTokenCount: 35,
      cachedContentTokenCount: 9,
    })).toEqual({
      inputTokens: 30,
      outputTokens: 5,
      totalTokens: 35,
      cacheReadInputTokens: 9,
    })

    expect(normalizeUsage('openai-compatible', {
      prompt_tokens: 50,
      completion_tokens: 10,
      promptTokensDetails: { cacheReadTokenCount: 15 },
      completion_tokens_details: { reasoning_tokens: 3 },
    })).toEqual({
      inputTokens: 50,
      outputTokens: 10,
      totalTokens: 60,
      cacheReadInputTokens: 15,
      reasoningOutputTokens: 3,
    })
  })

  it('does not invent usage values', () => {
    expect(normalizeUsage('deepseek', undefined)).toBeUndefined()
    expect(normalizeUsage('azure-openai', { prompt_tokens: 'bad' })).toBeUndefined()
  })
})

describe('normalizeFinishReason', () => {
  it('maps provider-specific values', () => {
    expect(normalizeFinishReason('openai-compatible', 'max_tokens')).toBe('length')
    expect(normalizeFinishReason('anthropic', 'tool_use')).toBe('tool_calls')
    expect(normalizeFinishReason('openai-compatible', 'tool_calls')).toBe('tool_calls')
    expect(normalizeFinishReason('azure-openai', 'tool_calls')).toBe('tool_calls')
    expect(normalizeFinishReason('gemini', 'STOP')).toBe('stop')
    expect(normalizeFinishReason('gemini', 'MAX_TOKENS')).toBe('length')
    expect(normalizeFinishReason('openai-compatible', 'content_filter')).toBe('content_filter')
    expect(normalizeFinishReason('openai-compatible', 'weird-gateway-value')).toBe('other')
    expect(normalizeFinishReason('openai-compatible', undefined)).toBeUndefined()
  })
})

describe('normalizeToolCallId', () => {
  it('keeps native ids', () => {
    expect(normalizeToolCallId('anthropic', 'toolu_123', 'ignored')).toEqual({
      id: 'toolu_123',
      fallback: false,
    })
  })

  it('creates deterministic fallbacks without changing native ids', () => {
    const first = normalizeToolCallId('anthropic', undefined, 'anthropic-0')
    const second = normalizeToolCallId('anthropic', undefined, 'anthropic-0')
    expect(first).toEqual({ id: 'anthropic-tool-anthropic-0', fallback: true })
    expect(second).toEqual(first)
    expect(normalizeToolCallId('gemini', undefined, 'gemini-1').id).toBe('gemini-tool-gemini-1')
    expect(normalizeToolCallId('openai-compatible', 'call_9', 'openai-1').id).toBe('call_9')
  })
})
