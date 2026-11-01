import { describe, expect, it, vi } from 'vitest'

const callAi = vi.fn().mockResolvedValue({ text: '{"entities":[],"relations":[],"events":[],"world":[],"foreshadowing":[]}' })
vi.mock('./aiService', () => ({
  getAiService: vi.fn(async () => ({ callAi }))
}))

import { unifiedMemoryAiCall } from './memoryExtractor'

describe('unifiedMemoryAiCall', () => {
  it('uses the shared JSON extraction contract', async () => {
    await unifiedMemoryAiCall('prompt', 'system')
    expect(callAi).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'generate',
      jsonMode: true,
      stream: false,
      retry: false,
      timeoutMs: 300_000,
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'prompt' }
      ]
    }))
  })

  it('forwards request composition observability when the pipeline provides it', async () => {
    const contextComposition = {
      layer: 'body',
      step: 4,
      stableSystemPrefix: 'system',
      stableUserPrefix: ''
    }
    await unifiedMemoryAiCall('prompt', 'system', {
      beginApiCall: () => '',
      finishApiCall: () => {},
      contextComposition
    })
    expect(callAi).toHaveBeenCalledWith(expect.objectContaining({ contextComposition }))
  })
})
