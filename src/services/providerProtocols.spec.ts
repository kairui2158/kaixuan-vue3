import { describe, expect, it } from 'vitest'

import {
  buildProviderHeaders,
  getProviderProtocol,
} from './providerProtocols'

describe('providerProtocols', () => {
  it('carries provider-specific credentials on chat requests', () => {
    expect(buildProviderHeaders('openai-compatible', 'openai-key')).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer openai-key',
    })
    expect(buildProviderHeaders('deepseek', 'deepseek-key')).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer deepseek-key',
    })
    expect(buildProviderHeaders('anthropic', 'anthropic-key')).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': 'anthropic-key',
      'anthropic-version': '2023-06-01',
    })
    expect(buildProviderHeaders('gemini', 'gemini-key')).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'gemini-key',
    })
    expect(buildProviderHeaders('azure-openai', 'azure-key')).toEqual({
      'Content-Type': 'application/json',
      'api-key': 'azure-key',
    })
  })

  it('treats an empty probe override as an explicit no-declaration request', () => {
    const protocol = getProviderProtocol('openai-compatible')
    const config = (params: { thinkingDisableParam?: string; thinkingDisableValue?: string; reasoning?: { mode: 'off' } }) =>
      protocol.buildRequestBody({
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        stream: false,
        temperature: 0.7,
        maxTokens: 256,
        ...params,
      } as any)

    expect(config({ thinkingDisableParam: '', thinkingDisableValue: '' })).not.toHaveProperty('thinking')
    expect(config({ thinkingDisableParam: '', thinkingDisableValue: '', reasoning: { mode: 'off' } }))
      .toHaveProperty('reasoning_effort', 'none')
    expect(config({ reasoning: { mode: 'off' } })).toHaveProperty('reasoning_effort', 'none')
  })

  it('keeps Gemini model-list authentication aligned with chat authentication', () => {
    const protocol = getProviderProtocol('gemini')

    expect(protocol.buildHeaders({ apiKey: 'gemini-key' })['x-goog-api-key']).toBe(
      protocol.buildModelsHeaders?.({ apiKey: 'gemini-key' })['x-goog-api-key']
    )
  })
})
