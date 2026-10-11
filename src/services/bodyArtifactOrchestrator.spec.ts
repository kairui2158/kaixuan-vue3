import { describe, expect, it } from 'vitest'
import { generateBodyArtifact } from './bodyArtifactOrchestrator'

const contract = { chapterId: 'ch-1', targetWords: 10 }

describe('generateBodyArtifact', () => {
  it('returns a valid body after the first response', async () => {
    const result = await generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      callBodyApi: async () => '这是一段合格的正文。'
    })

    expect(result.status).toBe('complete')
    expect(result.body).toBe('这是一段合格的正文。')
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0].status).toBe('complete')
  })

  it('retries an empty body and uses the repaired output', async () => {
    const calls: string[] = []
    const result = await generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      callBodyApi: async prompt => {
        calls.push(prompt)
        return calls.length === 1 ? '' : '这是一段合格的正文。'
      }
    })

    expect(result.status).toBe('complete')
    expect(result.body).toBe('这是一段合格的正文。')
    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('上一次正文未通过验收')
    expect(result.attempts[1].repairAttempt).toBe(1)
  })

  it('fails after the default three repair attempts', async () => {
    let calls = 0
    const result = await generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      callBodyApi: async () => {
        calls += 1
        return '短'
      }
    })

    expect(result.status).toBe('failed')
    expect(calls).toBe(4)
    expect(result.attempts).toHaveLength(4)
    expect(result.errors.some(error => error.includes('正文未通过验收'))).toBe(true)
  })

  it('stops before a retry when cancelled', async () => {
    let calls = 0
    let cancel = false
    const result = await generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      shouldContinue: () => !cancel,
      callBodyApi: async () => {
        calls += 1
        cancel = true
        return ''
      }
    })

    expect(result.status).toBe('failed')
    expect(calls).toBe(1)
    expect(result.errors).toContain('正文生成已被用户取消')
  })

  it('does not swallow API errors', async () => {
    const error = new Error('供应商连接失败')
    await expect(generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      callBodyApi: async () => {
        throw error
      }
    })).rejects.toBe(error)
  })

  it('rejects an invalid contract before calling the API', async () => {
    let calls = 0
    const result = await generateBodyArtifact({
      contract: { chapterId: '', targetWords: 10 },
      basePrompt: '生成第1章正文',
      callBodyApi: async () => {
        calls += 1
        return '这是一段合格的正文。'
      }
    })

    expect(result.status).toBe('failed')
    expect(calls).toBe(0)
    expect(result.errors).toEqual(['无效正文契约：chapterId和targetWords必须有效'])
  })
})
