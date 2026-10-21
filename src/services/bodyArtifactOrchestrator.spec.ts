import { describe, expect, it } from 'vitest'
import {
  generateBodyArtifact,
  planBodyArtifactExecution,
  recordBodyArtifactPostProcess
} from './bodyArtifactOrchestrator'
import type { BodyArtifactCallContext } from './bodyArtifactOrchestrator'

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
    expect(result.attempts[0].validationMs).toBeGreaterThanOrEqual(0)
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
    expect(result.attempts[0].validationMs).toBeGreaterThanOrEqual(0)
    expect(result.attempts[1].validationMs).toBeGreaterThanOrEqual(0)
  })

  it('fails after targeted repair and one full-chain fallback', async () => {
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
    expect(calls).toBe(3)
    expect(result.attempts).toHaveLength(3)
    expect(result.errors.some(error => error.includes('正文未通过验收'))).toBe(true)
    expect(result.attempts.some(attempt => attempt.validationMs !== undefined)).toBe(true)
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

  it('repairs a non-empty draft with a targeted repair request', async () => {
    const calls: Array<{ prompt: string; context: BodyArtifactCallContext | undefined }> = []
    const firstDraft = '旧稿唯一标记ABC'
    const result = await generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      callBodyApi: async (prompt, context) => {
        calls.push({ prompt, context })
        return calls.length === 1 ? firstDraft : '这是一段合格的正文。'
      }
    })

    expect(result.status).toBe('complete')
    expect(calls).toHaveLength(2)
    expect(calls[0].context?.repairScope).toBe('none')
    expect(calls[1].context?.repairScope).toBe('targeted')
    expect(calls[1].context?.previousBody).toBe(firstDraft)
    expect(calls[1].context?.errors).toContain('正文过短：7字，要求不低于8字')
    expect(calls[1].context?.targetWords).toBe(10)
    expect(calls[1].prompt).toContain('上一版正文未通过验收')
    expect(calls[1].prompt).toContain('旧稿全文不进入本次请求')
    expect(calls[1].prompt).toContain('上游权威产物重新生成正文')
    expect(calls[1].prompt).not.toContain('重新生成完整正文')
    expect(calls[1].prompt).not.toContain(firstDraft)
    expect(calls[1].prompt).not.toContain('【上一版正文】')
    expect(result.attempts[0].repairScope).toBe('none')
    expect(result.attempts[1].repairScope).toBe('targeted')
  })

  it('uses full chain repair for an empty draft', async () => {
    const calls: Array<{ prompt: string; context: BodyArtifactCallContext | undefined }> = []
    const result = await generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      callBodyApi: async (prompt, context) => {
        calls.push({ prompt, context })
        return calls.length === 1 ? '' : '这是一段合格的正文。'
      }
    })

    expect(result.status).toBe('complete')
    expect(calls[1].context?.repairScope).toBe('full_chain')
    expect(calls[1].context?.previousBody).toBe('')
    expect(calls[1].context?.errors).toContain('正文为空')
  })

  it('allows only one full-chain fallback after targeted repair fails', async () => {
    const calls: Array<BodyArtifactCallContext | undefined> = []
    const result = await generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      callBodyApi: async (_prompt, context) => {
        calls.push(context)
        return '短'
      }
    })

    expect(result.status).toBe('failed')
    expect(calls.map(context => context?.repairScope)).toEqual(['none', 'targeted', 'full_chain'])
    expect(result.attempts.map(attempt => attempt.repairScope)).toEqual(['none', 'targeted', 'full_chain'])
  })

  it('gives every attempt a stable id and passes it to the API', async () => {
    const ids: Array<string | undefined> = []
    const result = await generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      callBodyApi: async (_prompt, context) => {
        ids.push(context?.attemptId)
        return ids.length === 1 ? '短' : '这是一段合格的正文。'
      }
    })

    expect(result.status).toBe('complete')
    expect(ids[0]).toBe(result.attempts[0].attemptId)
    expect(ids[1]).toBe(result.attempts[1].attemptId)
    expect(ids[0]).toBeTruthy()
    expect(ids[1]).toBeTruthy()
    expect(ids[0]).not.toBe(ids[1])
  })

  it('does not regress to full-chain wording in targeted repair', async () => {
    const prompts: string[] = []
    const firstDraft = '旧稿唯一标记XYZ'
    await generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      callBodyApi: async prompt => {
        prompts.push(prompt)
        return prompts.length === 1 ? firstDraft : '这是一段合格的正文。'
      }
    })

    expect(prompts[1]).not.toContain('禁止整篇重写')
    expect(prompts[1]).not.toContain('【上一版正文】')
    expect(prompts[1]).not.toContain(firstDraft)
    expect(prompts[1]).toContain('只输出修复后的完整正文')
  })

  it('marks an attempt execution_invalid when its fingerprint proves zero physical requests', async () => {
    const result = await generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      callBodyApi: async () => ({
        text: '这是一段合格的正文。',
        fingerprint: {
          physicalRequests: 0,
          promptHash: 'prompt-hash',
          outputHash: 'output-hash',
          resumedFromBreakpoint: true
        }
      }) as any
    })

    expect(result.status).toBe('failed')
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0].status).toBe('execution_invalid')
    expect(result.attempts[0].metadata?.requestFingerprint).toMatchObject({ physicalRequests: 0 })
    expect(result.errors[0]).toContain('零物理请求')
  })
})

describe('planBodyArtifactExecution', () => {
  it('plans targeted repair from the declared generator step', () => {
    expect(planBodyArtifactExecution({
      repairScope: 'targeted',
      generatorStepIndex: 1,
      generatorDeclaredRole: 'generator',
      finalStepRole: 'polish',
      totalSteps: 3
    })).toEqual({
      topology: 'generator_step',
      startIndex: 1,
      targetRole: 'generator',
      reuseArtifacts: true,
      disableBreakpointReplay: true
    })
  })

  it('falls back to the penultimate generator for legacy 3-step chains', () => {
    expect(planBodyArtifactExecution({
      repairScope: 'targeted',
      generatorStepIndex: null,
      generatorDeclaredRole: 'generator',
      finalStepRole: 'polish',
      totalSteps: 3
    })).toMatchObject({ topology: 'generator_step', startIndex: 1, reuseArtifacts: true })
  })

  it('treats the compose single call as the unique generator step', () => {
    expect(planBodyArtifactExecution({
      repairScope: 'targeted',
      generatorStepIndex: 0,
      generatorDeclaredRole: 'generator',
      finalStepRole: 'polish',
      totalSteps: 1
    })).toEqual({
      topology: 'generator_step',
      startIndex: 0,
      targetRole: 'generator',
      reuseArtifacts: true,
      disableBreakpointReplay: true
    })
  })

  it('does not guess a targeted topology without a generator anchor', () => {
    expect(planBodyArtifactExecution({
      repairScope: 'targeted',
      generatorStepIndex: null,
      generatorDeclaredRole: null,
      finalStepRole: null,
      totalSteps: 3
    })).toEqual({
      topology: 'fresh_chain',
      startIndex: 0,
      targetRole: 'chain_start',
      reuseArtifacts: false,
      disableBreakpointReplay: true
    })
  })

  it('forces full-chain repair back to the chain start', () => {
    expect(planBodyArtifactExecution({
      repairScope: 'full_chain',
      generatorStepIndex: 1,
      generatorDeclaredRole: 'generator',
      finalStepRole: 'polish',
      totalSteps: 3
    })).toEqual({
      topology: 'fresh_chain',
      startIndex: 0,
      targetRole: 'chain_start',
      reuseArtifacts: false,
      disableBreakpointReplay: true
    })
  })

  it('passes the execution topology to every body API attempt', async () => {
    const contexts: Array<BodyArtifactCallContext | undefined> = []
    await generateBodyArtifact({
      contract,
      basePrompt: '生成第1章正文',
      generatorStepIndex: 1,
      generatorDeclaredRole: 'generator',
      finalStepRole: 'polish',
      totalSteps: 3,
      callBodyApi: async (_prompt, context) => {
        contexts.push(context)
        return contexts.length === 1 ? '短' : '这是一段合格的正文。'
      }
    })

    expect(contexts[0]?.executionPlan).toMatchObject({
      topology: 'fresh_chain',
      startIndex: 0,
      disableBreakpointReplay: true
    })
    expect(contexts[1]?.executionPlan).toMatchObject({
      topology: 'generator_step',
      startIndex: 1,
      reuseArtifacts: true,
      disableBreakpointReplay: true
    })
  })
})

describe('recordBodyArtifactPostProcess', () => {
  const attempt = {
    attemptId: 'ch-1-attempt-1-a',
    repairAttempt: 0,
    repairScope: 'none' as const,
    status: 'complete' as const,
    wordCount: 10,
    targetWords: 10,
    ratio: 1,
    errors: ['初始错误'],
    body: '正文',
  }

  it('appends post-process context to the last attempt', () => {
    const result = recordBodyArtifactPostProcess([attempt], {
      attemptId: attempt.attemptId,
      stage: 'hard_signal',
      processor: 'prose-hard-signal-net',
      success: true,
      wordCount: 12,
    })

    expect(result).toHaveLength(1)
    expect(result[0].repairScope).toBe('post_process')
    expect(result[0].metadata?.postProcesses).toEqual([{
      attemptId: attempt.attemptId,
      stage: 'hard_signal',
      processor: 'prose-hard-signal-net',
      success: true,
      wordCount: 12,
    }])
    expect(result[0].errors).toEqual(['初始错误'])
  })

  it('deduplicates errors from generation and post-process', () => {
    const result = recordBodyArtifactPostProcess([attempt], {
      attemptId: attempt.attemptId,
      stage: 'deai',
      processor: 'deai-detect',
      success: false,
      wordCount: 10,
      errors: ['降AI检测存在 1 项阻断问题', '初始错误'],
    })

    expect(result[0].errors).toEqual(['初始错误', '降AI检测存在 1 项阻断问题'])
  })

  it('keeps empty attempts unchanged instead of inventing a record', () => {
    expect(recordBodyArtifactPostProcess([], {
      attemptId: 'missing',
      stage: 'deai',
      processor: 'deai-detect',
      success: false,
      wordCount: 0,
    })).toEqual([])
  })

  it('keeps post-process word counts above the prose contract floor', () => {
    const context = {
      attemptId: attempt.attemptId,
      stage: 'deai' as const,
      processor: 'deai-hard-rules',
      success: true,
      wordCount: 8,
    }
    const result = recordBodyArtifactPostProcess([{
      ...attempt,
      wordCount: 10,
      body: '正文正文正文正文'
    }], context)

    expect(result[0].metadata?.postProcesses).toEqual([{
      ...context,
      errors: undefined
    }])
    expect(result[0].wordCount).toBe(10)
  })

  it('marks failed post-process attempts as invalid and keeps the contract error', () => {
    const result = recordBodyArtifactPostProcess([{
      ...attempt,
      wordCount: 10
    }], {
      attemptId: attempt.attemptId,
      stage: 'deai',
      processor: 'deai-hard-rules',
      success: false,
      wordCount: 0,
      errors: ['降AI后处理失败']
    })

    expect(result[0].status).toBe('execution_invalid')
    expect(result[0].errors).toContain('降AI后处理失败')
    expect(result[0].repairScope).toBe('post_process')
  })
})
