import { describe, expect, it } from 'vitest'
import {
  buildVolumeBatchPrompt,
  buildVolumeBatchPromptWithAudit,
  generateVolumeBatch
} from './volumeBatchOrchestrator'
import type { VolumeGenerationContract } from './volumeGenerationContract'

const contract: VolumeGenerationContract = {
  mode: 'auto',
  expectedCount: 3,
  existingCount: 0,
  totalPlannedVolumes: 3
}

function volume(name: string) {
  return {
    name,
    outline: `${name}卷纲`,
    summary: `${name}摘要`,
    allocatedWords: 100000
  }
}

function json(names: string[]) {
  return JSON.stringify(names.map(volume))
}

describe('buildVolumeBatchPrompt', () => {
  it('renders a one-volume request for chain folder skills', () => {
    const prompt = buildVolumeBatchPrompt({
      contract,
      repair: false,
      missingStart: 2,
      missingCount: 2,
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n第1卷《第一卷》',
      requestPolicy: 'single-volume'
    })

    expect(prompt).toContain('[大纲] 全书大纲')
    expect(prompt).toContain('第1卷《第一卷》')
    expect(prompt).toContain('本次只生成第2卷')
    expect(prompt).toContain('全书计划到第3卷')
    expect(prompt).toContain('数组长度必须为1')
    expect(prompt).not.toContain('数组长度必须为2')
  })

  it('suppresses history context already present in the base prompt and reports the audit', () => {
    const historyContext = '[已生成卷事实清单]\n第1卷《第一卷》'
    const basePrompt = `[大纲] 全书大纲\n\n${historyContext}`
    const baseWithAudit = (overrides: Record<string, unknown> = {}) =>
      buildVolumeBatchPromptWithAudit({
        contract,
        repair: false,
        basePrompt,
        historyContext,
        ...overrides
      })

    const batch = baseWithAudit()
    expect(batch.audit.duplicateHistoryContextSuppressed).toBe(true)
    expect(batch.prompt.match(/\[已生成卷事实清单\]/g)).toHaveLength(1)

    const singleVolume = baseWithAudit({ requestPolicy: 'single-volume', missingStart: 2, missingCount: 2 })
    expect(singleVolume.audit.duplicateHistoryContextSuppressed).toBe(true)
    expect(singleVolume.prompt.match(/\[已生成卷事实清单\]/g)).toHaveLength(1)
    expect(singleVolume.prompt).toContain('本次只生成第2卷')

    const repair = baseWithAudit({
      contract: { ...contract, mode: 'single', expectedCount: 1, existingCount: 1 },
      repair: true,
      missingStart: 2,
      missingCount: 1,
      repairErrors: ['卷名与历史重复：「第一卷」'],
      forbiddenVolumeNames: ['第一卷']
    })
    expect(repair.audit.duplicateHistoryContextSuppressed).toBe(true)
    expect(repair.prompt.match(/\[已生成卷事实清单\]/g)).toHaveLength(1)
    expect(repair.prompt).toContain('【上一次验收失败原因】')
    expect(repair.prompt).toContain('【禁止重复的已有卷名】')
  })

  it('renders the initial prompt with history facts and exact count', () => {
    const prompt = buildVolumeBatchPrompt({
      contract,
      repair: false,
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n暂无已生成卷'
    })

    expect(prompt).toContain('[大纲] 全书大纲')
    expect(prompt).toContain('[已生成卷事实清单]\n暂无已生成卷')
    expect(prompt).toContain('生成3卷的卷纲')
    expect(prompt).toContain('数组长度必须为3')
  })

  it('renders a repair prompt that requests only the missing range', () => {
    const prompt = buildVolumeBatchPrompt({
      contract: { ...contract, mode: 'single', expectedCount: 1, existingCount: 2 },
      repair: true,
      missingStart: 3,
      missingCount: 1,
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n第1卷《第一卷》'
    })

    expect(prompt).toContain('补充生成第3卷到第3卷，共1卷')
    expect(prompt).toContain('只输出缺失卷')
    expect(prompt).toContain('数组长度必须为1')
  })

  it('renders the previous validation errors and forbidden volume names in repair prompts', () => {
    const prompt = buildVolumeBatchPrompt({
      contract: { ...contract, mode: 'single', expectedCount: 1, existingCount: 2 },
      repair: true,
      missingStart: 3,
      missingCount: 1,
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n第1卷《第一卷》',
      repairErrors: ['卷名与历史重复：「第一卷」'],
      forbiddenVolumeNames: ['第一卷', '第二卷']
    })

    expect(prompt).toContain('【上一次验收失败原因】')
    expect(prompt).toContain('卷名与历史重复：「第一卷」')
    expect(prompt).toContain('【禁止重复的已有卷名】')
    expect(prompt).toContain('第一卷、第二卷')
  })
})

describe('generateVolumeBatch', () => {
  it('reports prompt audit for every batch and single-volume request', async () => {
    const audits: Array<{ duplicateHistoryContextSuppressed: boolean }> = []
    const result = await generateVolumeBatch({
      contract,
      historyVolumes: [],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n暂无已生成卷',
      requestPolicy: 'single-volume',
      onPromptBuilt: (_prompt, audit) => audits.push({ ...audit }),
      callVolumeApi: async () => json(['第一卷', '第二卷', '第三卷'])
    })

    expect(result.status).toBe('complete')
    expect(audits).toHaveLength(1)
    expect(audits.every(audit => !audit.duplicateHistoryContextSuppressed)).toBe(true)
  })

  it('uses one-volume requests with rolling history for single-volume policy', async () => {
    const calls: string[] = []
    const responses = [json(['第一卷']), json(['第二卷']), json(['第三卷'])]
    const result = await generateVolumeBatch({
      contract,
      historyVolumes: [],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n暂无已生成卷',
      requestPolicy: 'single-volume',
      callVolumeApi: async prompt => {
        calls.push(prompt)
        return responses[calls.length - 1]
      }
    })

    expect(result.status).toBe('complete')
    expect(result.volumes.map(item => item.name)).toEqual(['第一卷', '第二卷', '第三卷'])
    expect(calls).toHaveLength(3)
    expect(calls[0]).toContain('本次只生成第1卷')
    expect(calls[0]).toContain('数组长度必须为1')
    expect(calls[1]).toContain('第1卷《第一卷》')
    expect(calls[1]).toContain('本次只生成第2卷')
    expect(calls[2]).toContain('第2卷《第二卷》')
    expect(calls[2]).toContain('本次只生成第3卷')
  })

  it('stops single-volume policy only after repeated no-progress calls', async () => {
    const result = await generateVolumeBatch({
      contract,
      historyVolumes: [],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n暂无已生成卷',
      requestPolicy: 'single-volume',
      callVolumeApi: async () => json(['第一卷'])
    })

    expect(result.status).toBe('incomplete')
    expect(result.attempts).toHaveLength(5)
    expect(result.errors.some(item => item.includes('期望3卷；最终只有1卷'))).toBe(true)
  })

  it('recovers from a duplicate first volume under single-volume policy', async () => {
    const calls: string[] = []
    const responses = [json(['第一卷']), json(['第一卷']), json(['第二卷']), json(['第三卷'])]
    const result = await generateVolumeBatch({
      contract,
      historyVolumes: [],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n暂无已生成卷',
      requestPolicy: 'single-volume',
      callVolumeApi: async prompt => {
        calls.push(prompt)
        return responses[calls.length - 1]
      }
    })

    expect(result.status).toBe('complete')
    expect(result.volumes.map(item => item.name)).toEqual(['第一卷', '第二卷', '第三卷'])
    expect(calls).toHaveLength(4)
    expect(result.attempts[1].errors).toContain('卷名与历史重复：「第一卷」')
    expect(calls[1]).toContain('第1卷《第一卷》')
    expect(calls[1]).toContain('本次只生成第2卷')
  })

  it('returns complete when the first response fills the contract', async () => {
    const calls: string[] = []
    const result = await generateVolumeBatch({
      contract,
      historyVolumes: [],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n暂无已生成卷',
      callVolumeApi: async prompt => {
        calls.push(prompt)
        return json(['第一卷', '第二卷', '第三卷'])
      }
    })

    expect(result.status).toBe('complete')
    expect(result.volumes.map(item => item.name)).toEqual(['第一卷', '第二卷', '第三卷'])
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0].status).toBe('complete')
    expect(result.attempts[0].validationMs).toBeGreaterThanOrEqual(0)
    expect(calls).toHaveLength(1)
  })

  it('repairs a short auto batch with only the missing volumes', async () => {
    const calls: string[] = []
    const result = await generateVolumeBatch({
      contract,
      historyVolumes: [],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n暂无已生成卷',
      callVolumeApi: async prompt => {
        calls.push(prompt)
        return calls.length === 1 ? json(['第一卷', '第二卷']) : json(['第三卷'])
      }
    })

    expect(result.status).toBe('complete')
    expect(result.volumes.map(item => item.name)).toEqual(['第一卷', '第二卷', '第三卷'])
    expect(calls[1]).toContain('补充生成第3卷到第3卷，共1卷')
    expect(result.attempts[1].repairAttempt).toBe(1)
    expect(result.attempts[0].validationMs).toBeUndefined()
    expect(result.attempts[1].validationMs).toBeGreaterThanOrEqual(0)
  })

  it('passes duplicate errors and forbidden volume names into the repair prompt', async () => {
    const calls: string[] = []
    const result = await generateVolumeBatch({
      contract,
      historyVolumes: [volume('第一卷')],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n第1卷《第一卷》',
      callVolumeApi: async prompt => {
        calls.push(prompt)
        return calls.length === 1 ? json(['第一卷', '第二卷']) : json(['第三卷', '第四卷'])
      },
      maxRepairAttempts: 2
    })

    expect(result.status).toBe('complete')
    expect(calls[1]).toContain('【上一次验收失败原因】')
    expect(calls[1]).toContain('卷名与历史重复：「第一卷」')
    expect(calls[1]).toContain('【禁止重复的已有卷名】')
    expect(calls[1]).toContain('第一卷')
  })

  it('truncates extra volumes in single and continue modes and records the reason', async () => {
    const result = await generateVolumeBatch({
      contract: { ...contract, mode: 'single', expectedCount: 1, existingCount: 2 },
      historyVolumes: [volume('第一卷'), volume('第二卷')],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n第2卷《第二卷》',
      callVolumeApi: async () => json(['第三卷', '多余卷'])
    })

    expect(result.status).toBe('complete')
    expect(result.volumes.map(item => item.name)).toEqual(['第三卷'])
    expect(result.attempts[0].errors).toContain('single 模式返回 2 卷，已截取 1 卷')
  })

  it('filters history duplicate names and keeps repairing', async () => {
    const result = await generateVolumeBatch({
      contract,
      historyVolumes: [volume('第一卷')],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n第1卷《第一卷》',
      callVolumeApi: async prompt => {
        if (prompt.includes('数组长度必须为2')) {
          return json(['替代卷', '第三卷'])
        }
        return json(['第一卷', '第二卷'])
      }
    })

    expect(result.status).toBe('complete')
    expect(result.volumes.map(item => item.name)).toEqual(['第二卷', '替代卷', '第三卷'])
    expect(result.attempts[0].errors).toContain('卷名与历史重复：「第一卷」')
  })

  it('returns incomplete without partial volumes after repairs are exhausted', async () => {
    const result = await generateVolumeBatch({
      contract,
      historyVolumes: [],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n暂无已生成卷',
      callVolumeApi: async () => json(['第一卷', '第二卷'])
    })

    expect(result.status).toBe('incomplete')
    expect(result.volumes).toEqual([])
    expect(result.attempts).toHaveLength(4)
    expect(result.errors.some(item => item.includes('批次未能补齐'))).toBe(true)
    expect(result.errors.some(item => item.includes('期望3卷；最终只有2卷'))).toBe(true)
  })

  it('does not swallow API errors', async () => {
    const error = new Error('供应商连接失败')
    await expect(generateVolumeBatch({
      contract,
      historyVolumes: [],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n暂无已生成卷',
      callVolumeApi: async () => {
        throw error
      }
    })).rejects.toBe(error)
  })

  it('stops repair attempts when the caller cancels generation', async () => {
    let calls = 0
    let cancel = false
    const result = await generateVolumeBatch({
      contract,
      historyVolumes: [],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n暂无已生成卷',
      shouldContinue: () => !cancel,
      callVolumeApi: async () => {
        calls += 1
        cancel = true
        return json(['第一卷', '第二卷'])
      }
    })

    expect(result.status).toBe('incomplete')
    expect(result.volumes).toEqual([])
    expect(calls).toBe(1)
    expect(result.errors).toContain('卷纲批次生成已被用户取消')
  })

  it('rejects an invalid contract before any API call', async () => {
    let calls = 0
    const result = await generateVolumeBatch({
      contract: { ...contract, expectedCount: 0 },
      historyVolumes: [],
      basePrompt: '[大纲] 全书大纲',
      historyContext: '[已生成卷事实清单]\n暂无已生成卷',
      callVolumeApi: async () => {
        calls += 1
        return json(['第一卷'])
      }
    })

    expect(result.status).toBe('incomplete')
    expect(calls).toBe(0)
    expect(result.errors).toContain('无效卷纲契约：期望卷数必须大于 0')
  })
})
