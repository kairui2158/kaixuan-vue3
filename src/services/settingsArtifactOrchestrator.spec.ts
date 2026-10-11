import { describe, expect, it } from 'vitest'
import { generateSettingsArtifact } from './settingsArtifactOrchestrator'

function item(name: string, overrides: Record<string, unknown> = {}) {
  return { name, category: '角色', attrsText: `${name}设定`, ...overrides }
}

describe('generateSettingsArtifact', () => {
  it('returns the accepted list after a valid first response', async () => {
    const result = await generateSettingsArtifact({
      existing: [],
      callSettingsApi: async () => JSON.stringify([item('林舟')]),
      basePrompt: '[已确认大纲] 全书'
    })

    expect(result.status).toBe('complete')
    expect(result.accepted.map(entry => entry.name)).toEqual(['林舟'])
    expect(result.rejected).toEqual([])
    expect(result.attempts).toHaveLength(1)
  })

  it('records rejected items while keeping the valid ones', async () => {
    const result = await generateSettingsArtifact({
      existing: [],
      callSettingsApi: async () => JSON.stringify([
        item('林舟'),
        item('', { attrsText: '无名字' }),
        item('空壳', { attrsText: '' })
      ]),
      basePrompt: '[已确认大纲] 全书'
    })

    expect(result.status).toBe('complete')
    expect(result.accepted.map(entry => entry.name)).toEqual(['林舟'])
    expect(result.rejected.map(entry => entry.reason)).toEqual(['名称为空', '内容为空'])
    expect(result.attempts).toHaveLength(1)
  })

  it('retries once when the first response has no acceptable items', async () => {
    const calls: string[] = []
    const result = await generateSettingsArtifact({
      existing: [],
      basePrompt: '[已确认大纲] 全书',
      callSettingsApi: async prompt => {
        calls.push(prompt)
        return calls.length === 1
          ? JSON.stringify([item('', { attrsText: '无名字' })])
          : JSON.stringify([item('青岚城', { category: '地点' })])
      }
    })

    expect(result.status).toBe('complete')
    expect(result.accepted.map(entry => entry.name)).toEqual(['青岚城'])
    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('上一次输出没有可接受的设定项')
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[1].repairAttempt).toBe(1)
  })

  it('returns failed without items after the repair response is still invalid', async () => {
    const result = await generateSettingsArtifact({
      existing: [],
      callSettingsApi: async () => 'not json',
      basePrompt: '[已确认大纲] 全书'
    })

    expect(result.status).toBe('failed')
    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([])
    expect(result.attempts).toHaveLength(2)
    expect(result.errors.some(entry => entry.includes('设定项没有可接受输出'))).toBe(true)
  })

  it('stops before a retry when the caller cancels', async () => {
    let calls = 0
    let cancel = false
    const result = await generateSettingsArtifact({
      existing: [],
      shouldContinue: () => !cancel,
      basePrompt: '[已确认大纲] 全书',
      callSettingsApi: async () => {
        calls += 1
        cancel = true
        return 'not json'
      }
    })

    expect(result.status).toBe('failed')
    expect(calls).toBe(1)
    expect(result.errors).toContain('设定生成已被用户取消')
  })

  it('does not swallow API errors', async () => {
    const error = new Error('供应商连接失败')
    await expect(generateSettingsArtifact({
      existing: [],
      basePrompt: '[已确认大纲] 全书',
      callSettingsApi: async () => {
        throw error
      }
    })).rejects.toBe(error)
  })
})
