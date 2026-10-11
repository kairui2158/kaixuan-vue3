import { parseGenerationResult } from './generationResult'
import {
  isBodyArtifactContractInput,
  validateBodyArtifact,
  type BodyArtifactContract
} from './bodyArtifactContract'

export interface BodyArtifactAttempt {
  repairAttempt: number
  status: 'complete' | 'too_short' | 'too_long' | 'empty' | 'error'
  wordCount: number
  targetWords: number
  ratio: number
  errors: string[]
}

export interface GenerateBodyArtifactInput {
  contract: BodyArtifactContract
  basePrompt: string
  callBodyApi: (prompt: string) => Promise<string>
  shouldContinue?: () => boolean
  maxRepairAttempts?: number
  onAttempt?: (attempt: BodyArtifactAttempt) => void
}

export interface BodyArtifactResult {
  status: 'complete' | 'failed'
  body: string
  metadata: Record<string, unknown>
  attempts: BodyArtifactAttempt[]
  errors: string[]
}

function buildPrompt(input: {
  basePrompt: string
  repair: boolean
  errors?: string[]
}): string {
  if (!input.repair) return input.basePrompt
  return [
    input.basePrompt,
    '',
    '上一次正文未通过验收。错误如下：',
    ...(input.errors || []).map(error => `- ${error}`),
    '请重新生成完整正文，不要输出解释或元数据。'
  ].join('\n')
}

export async function generateBodyArtifact(
  input: GenerateBodyArtifactInput
): Promise<BodyArtifactResult> {
  const attempts: BodyArtifactAttempt[] = []
  const maxRepairs = Math.max(0, Math.round(Number(input.maxRepairAttempts ?? 3)))

  if (!isBodyArtifactContractInput(input.contract)) {
    return {
      status: 'failed',
      body: '',
      metadata: {},
      attempts,
      errors: ['无效正文契约：chapterId和targetWords必须有效']
    }
  }

  let repairAttempt = 0
  while (true) {
    if (input.shouldContinue && !input.shouldContinue()) {
      return {
        status: 'failed',
        body: '',
        metadata: {},
        attempts,
        errors: ['正文生成已被用户取消']
      }
    }

    const prompt = buildPrompt({
      basePrompt: input.basePrompt,
      repair: repairAttempt > 0,
      errors: repairAttempt === 0 ? [] : attempts.flatMap(attempt => attempt.errors)
    })

    let raw: string
    try {
      raw = await input.callBodyApi(prompt)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const attempt: BodyArtifactAttempt = {
        repairAttempt,
        status: 'error',
        wordCount: 0,
        targetWords: input.contract.targetWords,
        ratio: 0,
        errors: [message]
      }
      attempts.push(attempt)
      input.onAttempt?.(attempt)
      throw error
    }

    const generation = parseGenerationResult(raw)
    const validation = validateBodyArtifact(generation.body, input.contract)
    const attempt: BodyArtifactAttempt = {
      repairAttempt,
      status: validation.status === 'valid' ? 'complete' : validation.status,
      wordCount: validation.wordCount,
      targetWords: input.contract.targetWords,
      ratio: validation.ratio,
      errors: validation.errors
    }
    attempts.push(attempt)
    input.onAttempt?.(attempt)

    if (validation.valid) {
      return {
        status: 'complete',
        body: generation.body,
        metadata: generation.metadata,
        attempts,
        errors: []
      }
    }

    if (repairAttempt >= maxRepairs) break
    repairAttempt += 1
  }

  const last = attempts[attempts.length - 1]
  const errors = [
    ...new Set([
      `正文未通过验收：修复${repairAttempt}次后仍不合格`,
      ...attempts.flatMap(attempt => attempt.errors)
    ])
  ]
  return {
    status: 'failed',
    body: '',
    metadata: {},
    attempts,
    errors: last?.errors && last.errors.length ? errors : errors
  }
}
