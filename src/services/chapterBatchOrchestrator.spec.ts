import { describe, expect, it } from 'vitest'
import {
  buildChapterBatchPrompt,
  generateChapterBatch,
  type ChapterBatchAttempt
} from './chapterBatchOrchestrator'
import type { ChapterBatchContract } from './chapterGenerationContract'

const contract: ChapterBatchContract = {
  volumeId: 'vol-1',
  batchIndex: 0,
  expectedStart: 1,
  expectedEnd: 5,
  requestedCount: 5,
  totalChapters: 12
}

function chapters(titles: string[]) {
  return titles.map(title => ({ title, plot: `剧情：${title}` }))
}

function json(titles: string[]) {
  return JSON.stringify(chapters(titles))
}

describe('buildChapterBatchPrompt', () => {
  it('renders the initial generation prompt with history facts', () => {
    const prompt = buildChapterBatchPrompt({
      contract,
      repair: false,
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n第1章《第一章》'
    })

    expect(prompt).toContain('[卷纲] 第一卷')
    expect(prompt).toContain('[已生成章节标题清单]\n第1章《第一章》')
    expect(prompt).toContain('生成第1章到第5章，共5章')
    expect(prompt).toContain('输出JSON数组，每项含title/plot字段')
    expect(prompt).toContain('数组长度必须为5')
  })

  it('renders a repair prompt that only requests the missing range', () => {
    const prompt = buildChapterBatchPrompt({
      contract,
      repair: true,
      missingStart: 2,
      missingCount: 4,
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n暂无已生成章节'
    })

    expect(prompt).toContain('补充生成第2章到第5章，共4章')
    expect(prompt).toContain('只输出缺失章节')
    expect(prompt).toContain('数组长度必须为4')
  })

  it('renders the previous validation errors and forbidden titles in repair prompts', () => {
    const prompt = buildChapterBatchPrompt({
      contract,
      repair: true,
      missingStart: 2,
      missingCount: 4,
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n第1章《第一章》',
      repairErrors: ['章节标题与历史重复：「第一章」', '返回数量不足：期望5章，实际4章'],
      forbiddenTitles: ['第一章', '第二章']
    })

    expect(prompt).toContain('【上一次验收失败原因】')
    expect(prompt).toContain('章节标题与历史重复：「第一章」')
    expect(prompt).toContain('返回数量不足：期望5章，实际4章')
    expect(prompt).toContain('【禁止重复的已有标题】')
    expect(prompt).toContain('第一章、第二章')
  })
})

describe('generateChapterBatch', () => {
  it('returns complete when the first response fills the contract', async () => {
    const calls: string[] = []
    const result = await generateChapterBatch({
      contract,
      historyTitles: new Set<string>(),
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n暂无已生成章节',
      callChapterApi: async (prompt) => {
        calls.push(prompt)
        return json(['第一章', '第二章', '第三章', '第四章', '第五章'])
      }
    })

    expect(result.status).toBe('complete')
    expect(result.chapters).toEqual(chapters(['第一章', '第二章', '第三章', '第四章', '第五章']))
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0].status).toBe('complete')
    expect(result.attempts[0].repairAttempt).toBe(0)
    expect(result.attempts[0].validationMs).toBeGreaterThanOrEqual(0)
    expect(calls).toHaveLength(1)
  })

  it('requests only the missing range when the first response is short', async () => {
    const calls: string[] = []
    const result = await generateChapterBatch({
      contract,
      historyTitles: new Set<string>(),
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n暂无已生成章节',
      callChapterApi: async (prompt) => {
        calls.push(prompt)
        return calls.length === 1
          ? json(['第一章', '第二章', '第三章', '第四章'])
          : json(['第五章', '第六章'])
      }
    })

    expect(result.status).toBe('complete')
    expect(result.chapters).toEqual(chapters(['第一章', '第二章', '第三章', '第四章', '第五章']))
    expect(result.attempts).toHaveLength(2)
    expect(calls[1]).toContain('补充生成第5章到第5章，共1章')
    expect(result.attempts[1].repairAttempt).toBe(1)
    expect(result.attempts[1].missingStart).toBe(5)
    expect(result.attempts[1].missingCount).toBe(1)
    expect(result.attempts[0].validationMs).toBeUndefined()
    expect(result.attempts[1].validationMs).toBeGreaterThanOrEqual(0)
  })

  it('passes duplicate errors and forbidden titles into the chapter repair prompt', async () => {
    const calls: string[] = []
    const result = await generateChapterBatch({
      contract,
      historyTitles: new Set(['第一章']),
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n第1章《第一章》',
      callChapterApi: async (prompt) => {
        calls.push(prompt)
        return calls.length === 1
          ? json(['第一章', '第二章', '第三章', '第四章'])
          : json(['第五章', '第六章'])
      },
      maxRepairAttempts: 2
    })

    expect(result.status).toBe('complete')
    expect(calls[1]).toContain('【上一次验收失败原因】')
    expect(calls[1]).toContain('章节标题与历史重复：「第一章」')
    expect(calls[1]).toContain('【禁止重复的已有标题】')
    expect(calls[1]).toContain('第一章')
  })

  it('filters history duplicates and keeps repairing', async () => {
    const result = await generateChapterBatch({
      contract,
      historyTitles: new Set(['第一章']),
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n第1章《第一章》',
      callChapterApi: async (prompt) => {
        if (prompt.includes('数组长度必须为1')) {
          return json(['第一章替代'])
        }
        return json(['第一章', '第二章', '第三章', '第四章', '第五章'])
      }
    })

    expect(result.status).toBe('complete')
    expect(result.chapters.map(item => item.title)).toEqual([
      '第二章', '第三章', '第四章', '第五章', '第一章替代'
    ])
    expect(result.attempts[0].errors).toContain('章节标题与历史重复：「第一章」')
  })

  it('returns accepted partial chapters after repairs are exhausted', async () => {
    const result = await generateChapterBatch({
      contract,
      historyTitles: new Set<string>(),
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n暂无已生成章节',
      callChapterApi: async () => json(['第一章', '第二章', '第三章', '第四章'])
    })

    expect(result.status).toBe('incomplete')
    expect(result.chapters).toEqual(chapters(['第一章', '第二章', '第三章', '第四章']))
    expect(result.attempts).toHaveLength(4)
    expect(result.errors.some(item => item.includes('批次未能补齐'))).toBe(true)
    expect(result.errors.some(item => item.includes('期望第1章到第5章，共5章；最终只有4章'))).toBe(true)
  })

  it('does not run internal repairs when maxRepairAttempts is zero', async () => {
    const calls: string[] = []
    const result = await generateChapterBatch({
      contract,
      historyTitles: new Set<string>(),
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n暂无已生成章节',
      maxRepairAttempts: 0,
      callChapterApi: async (prompt) => {
        calls.push(prompt)
        return json(['第一章', '第二章', '第三章', '第四章'])
      }
    })

    expect(result.status).toBe('incomplete')
    expect(result.chapters).toEqual(chapters(['第一章', '第二章', '第三章', '第四章']))
    expect(calls).toHaveLength(1)
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0].repairAttempt).toBe(0)
    expect(result.errors.some(item => item.includes('批次未能补齐'))).toBe(true)
  })

  it('exposes JSON diagnostics instead of silently dropping malformed output', async () => {
    const result = await generateChapterBatch({
      contract,
      historyTitles: new Set<string>(),
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n暂无已生成章节',
      maxRepairAttempts: 0,
      callChapterApi: async () => '[{"title":"第一章","plot":"剧情'
    })

    expect(result.status).toBe('incomplete')
    expect(result.chapters).toEqual([])
    expect(result.errors.some(item => item.includes('输出JSON解析失败：truncated'))).toBe(true)
    expect(result.errors.some(item => item.includes('原始输出 26 字符'))).toBe(true)
  })

  it('does not swallow API errors and records them as attempts', async () => {
    const error = new Error('供应商连接失败')
    const result = await generateChapterBatch({
      contract,
      historyTitles: new Set<string>(),
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n暂无已生成章节',
      callChapterApi: async () => {
        throw error
      }
    }).catch((reason: unknown) => reason)

    expect(result).toBe(error)
  })

  it('stops repair attempts when the caller cancels generation', async () => {
    let calls = 0
    let cancel = false
    const result = await generateChapterBatch({
      contract,
      historyTitles: new Set<string>(),
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n暂无已生成章节',
      shouldContinue: () => !cancel,
      callChapterApi: async () => {
        calls += 1
        cancel = true
        return json(['第一章', '第二章', '第三章', '第四章'])
      }
    })

    expect(result.status).toBe('incomplete')
    expect(result.chapters).toEqual([])
    expect(calls).toBe(1)
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0].status).toBe('short')
    expect(result.errors).toContain('章节批次生成已被用户取消')
  })

  it('rejects an invalid contract before any API call', async () => {
    let calls = 0
    const result = await generateChapterBatch({
      contract: { ...contract, expectedStart: 3, expectedEnd: 5, requestedCount: 5 },
      historyTitles: new Set<string>(),
      basePrompt: '[卷纲] 第一卷',
      historyContext: '[已生成章节标题清单]\n暂无已生成章节',
      callChapterApi: async () => {
        calls += 1
        return json(['第一章'])
      }
    })

    expect(result.status).toBe('incomplete')
    expect(calls).toBe(0)
    expect(result.errors).toContain('无效批次契约：区间与数量不一致')
  })
})
