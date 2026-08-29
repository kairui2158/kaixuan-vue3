import { describe, expect, it } from 'vitest'
import { parseGenerationResult } from './generationResult'

describe('parseGenerationResult', () => {
  it('keeps ordinary prose unchanged', () => {
    const result = parseGenerationResult('她说：“[别走]。”')
    expect(result.body).toBe('她说：“[别走]。”')
    expect(result.metadata).toEqual({})
  })

  it('separates metadata from a JSON envelope', () => {
    const result = parseGenerationResult(JSON.stringify({
      body: '夜雨落在窗沿。',
      metadata: { sourceRefs: ['E-01'], coveredItems: ['伏笔-1'] }
    }))
    expect(result.body).toBe('夜雨落在窗沿。')
    expect(result.metadata.sourceRefs).toEqual(['E-01'])
    expect(result.body).not.toContain('sourceRefs')
  })

  it('accepts a fenced JSON envelope', () => {
    const result = parseGenerationResult('```json\n{"body":"正文","metadata":{"status":"success"}}\n```')
    expect(result.body).toBe('正文')
    expect(result.metadata.status).toBe('success')
  })

  it('removes thinking tags from the body only', () => {
    const result = parseGenerationResult(JSON.stringify({
      body: '开门。<thinking>内部推理</thinking>转身。',
      metadata: { reports: ['保留在元数据'] }
    }))
    expect(result.body).toBe('开门。转身。')
    expect(result.metadata.reports).toEqual(['保留在元数据'])
  })

  it('treats invalid envelopes as legacy plain text', () => {
    const result = parseGenerationResult('{"body": 42, "metadata": {"status":"success"}}')
    expect(result.body).toContain('"body": 42')
    expect(result.metadata).toEqual({})
  })
})
