import { describe, expect, it, vi } from 'vitest'
import { generateNames } from './namingService'
import * as aiService from './aiService'

describe('generateNames trace', () => {
  it('records API call lifecycle through the supplied trace', async () => {
    const provider = { id: 'p1', name: 'Provider 1', apiKey: 'k', selectedModel: 'm1', models: ['m1'] }
    const agent = { model: 'm1', temperature: 0.7, maxTokens: 1024 }
    const finish = vi.fn()
    const trace = {
      beginApiCall: vi.fn(() => 'call-1'),
      finishApiCall: finish
    }
    const callAi = vi.fn().mockResolvedValue({
      text: '[{"name":"青岚","meaning":"山间轻雾","usage":"仙侠角色"}]',
      finishReason: 'stop'
    })
    vi.spyOn(aiService, 'getAiService').mockResolvedValue({ callAi } as any)

    const result = await generateNames(
      { type: 'character', count: 1, context: '', style: '' },
      { providerStore: { activeGenerateProvider: provider }, agentStore: { activeAgent: agent } },
      undefined,
      undefined,
      trace
    )

    expect(result.validCount).toBe(1)
    expect(trace.beginApiCall).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'p1',
      providerName: 'Provider 1',
      model: 'm1',
      temperature: 0.7,
      maxTokens: 1024
    }))
    expect(finish).toHaveBeenCalledWith('call-1', expect.objectContaining({
      status: 'success',
      finishReason: 'stop'
    }))
  })

  it('marks the traced call failed when the provider call throws', async () => {
    const provider = { id: 'p1', name: 'Provider 1', apiKey: 'k', selectedModel: 'm1' }
    const finish = vi.fn()
    const trace = { beginApiCall: vi.fn(() => 'call-1'), finishApiCall: finish }
    vi.spyOn(aiService, 'getAiService').mockResolvedValue({
      callAi: vi.fn().mockRejectedValue({ kind: 'network', message: 'network down' })
    } as any)

    await expect(generateNames(
      { type: 'character', count: 1, context: '', style: '' },
      { providerStore: { activeGenerateProvider: provider }, agentStore: { activeAgent: null } },
      undefined,
      undefined,
      trace
    )).rejects.toMatchObject({ kind: 'network' })

    expect(finish).toHaveBeenCalledWith('call-1', expect.objectContaining({
      status: 'failed',
      error: 'network down'
    }))
  })
})
