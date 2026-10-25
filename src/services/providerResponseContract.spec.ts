import { describe, expect, it } from 'vitest'
import {
  classifyProviderSoftFailure,
  normalizeProviderResponse,
} from './providerResponseContract'

describe('normalizeProviderResponse', () => {
  it('normalizes stream and non-stream OpenAI success through the same fields', () => {
    const raw = {
      choices: [{ message: { content: '正文', reasoning_content: '思考' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    }
    const stream = normalizeProviderResponse(
      { ok: true, statusCode: 200, data: raw, stream: true },
      { protocolName: 'openai-compatible' }
    )
    const nonStream = normalizeProviderResponse(
      { ok: true, statusCode: 200, data: raw },
      { protocolName: 'openai-compatible' }
    )
    expect(stream).toMatchObject({ ok: true, kind: 'ok', transportKind: 'stream', text: '正文', reasoning: '思考', finishReason: 'stop' })
    expect(nonStream).toMatchObject({ ok: true, kind: 'ok', transportKind: 'non-stream', text: '正文', usage: raw.usage })
    expect(stream.usage).toEqual(nonStream.usage)
  })

  it('marks cancellation without fabricating provider text', () => {
    const result = normalizeProviderResponse(
      { ok: false, kind: 'canceled', message: '请求已取消' },
      { protocolName: 'openai-compatible' }
    )
    expect(result).toMatchObject({ ok: false, kind: 'canceled', canceled: true, text: '', reasoning: '' })
    expect(result.usage).toBeUndefined()
  })

  it('parses a successful raw body when parsed data is absent', () => {
    const result = normalizeProviderResponse(
      { ok: true, statusCode: 200, text: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }) },
      { protocolName: 'openai-compatible' }
    )
    expect(result).toMatchObject({ ok: true, kind: 'ok', text: 'ok', raw: { choices: [{ message: { content: 'ok' } }] } })
  })

  it('does not extract a provider body from a failed stream result', () => {
    const result = normalizeProviderResponse(
      { ok: false, kind: 'network', message: 'network reset', data: { choices: [{ delta: { content: '不该存在' } }] }, stream: true },
      { protocolName: 'openai-compatible' }
    )
    expect(result).toMatchObject({ ok: false, kind: 'network', text: '', reasoning: '' })
  })

  it('keeps auth failures and provider summaries stable across transports', () => {
    const stream = normalizeProviderResponse(
      { ok: false, kind: 'auth', statusCode: 402, message: '额度不足', providerErrorSummary: 'quota exhausted', stream: true },
      { protocolName: 'deepseek' }
    )
    const nonStream = normalizeProviderResponse(
      { ok: false, kind: 'auth', statusCode: 402, message: '额度不足', providerErrorSummary: 'quota exhausted' },
      { protocolName: 'deepseek' }
    )
    expect(stream).toMatchObject({ kind: 'auth', statusCode: 402, providerErrorSummary: 'quota exhausted' })
    expect(nonStream).toMatchObject({ kind: 'auth', statusCode: 402, providerErrorSummary: 'quota exhausted' })
  })

  it('classifies HTTP 200 soft errors through one contract path', () => {
    const stream = normalizeProviderResponse(
      {
        ok: true,
        statusCode: 200,
        data: { error: { message: '套餐额度已用完' } },
        stream: true,
      },
      { protocolName: 'openai-compatible' }
    )
    const nonStream = normalizeProviderResponse(
      {
        ok: true,
        statusCode: 200,
        data: { message: 'insufficient balance' },
      },
      { protocolName: 'openai-compatible' }
    )

    expect(classifyProviderSoftFailure(stream)).toMatchObject({
      softError: true,
      quota: true,
      abnormalZeroUsage: false,
    })
    expect(classifyProviderSoftFailure(nonStream)).toMatchObject({
      softError: true,
      quota: true,
      abnormalZeroUsage: false,
    })
  })

  it('does not classify a successful response as a soft failure', () => {
    const result = normalizeProviderResponse(
      {
        ok: true,
        statusCode: 200,
        data: {
          choices: [{ message: { content: '正文' } }],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        },
      },
      { protocolName: 'openai-compatible' }
    )

    expect(classifyProviderSoftFailure(result)).toEqual({
      softError: false,
      quota: false,
      abnormalZeroUsage: false,
    })
  })

  it('classifies stream-only abnormal zero usage without changing non-stream behavior', () => {
    const contract = normalizeProviderResponse(
      {
        ok: true,
        statusCode: 200,
        data: {
          choices: [],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 7 },
        },
        stream: true,
      },
      { protocolName: 'openai-compatible' }
    )

    expect(classifyProviderSoftFailure(contract)).toMatchObject({
      softError: true,
      quota: true,
      abnormalZeroUsage: true,
    })
  })
})
