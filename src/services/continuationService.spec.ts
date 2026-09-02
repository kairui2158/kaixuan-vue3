import { describe, expect, it, vi } from 'vitest'
import { buildContinuationMessages, continueSnapshot } from './continuationService'
import type { ContinuationSnapshot } from './continuation'

const snapshot: ContinuationSnapshot = {
  requestId: 'r1', projectId: 'p1', workspace: 'main', purpose: 'generate', providerId: 'p', model: 'm',
  skillIds: ['s1'], agentIds: ['a1'], mode: 'single', originalMessages: [{ role: 'user', content: '原始任务' }],
  accumulatedText: '已有正文', continuationCount: 0, status: 'possibly_truncated', createdAt: 1, updatedAt: 1
}
describe('continuation service', () => {
  it('keeps the original request context and adds a bounded continuation turn', () => {
    const messages = buildContinuationMessages(snapshot)
    expect(messages[0].content).toBe('原始任务')
    expect(messages.at(-1)?.content).toContain('不要重复')
  })
  it('reuses provider model and merges without duplicating overlap', async () => {
    const callAi = vi.fn().mockResolvedValue({ text: '文乙', reasoning: '', providerId: 'p', model: 'm' })
    const result = await continueSnapshot({ callAi }, { ...snapshot, accumulatedText: '文' })
    expect(callAi.mock.calls[0][0].model).toBe('m')
    expect(result.text).toBe('文乙')
  })
})
