import { extractJsonArray } from './jsonExtraction'
import {
  validateSettingsArtifact,
  type SettingsExistingItem
} from './settingsArtifactContract'

export interface SettingsArtifactAttempt {
  repairAttempt: number
  status: 'complete' | 'rejected-all' | 'error'
  acceptedCount: number
  rejectedCount: number
  errors: string[]
  /** Observability only; validation timing never changes retry decisions. */
  validationMs?: number
}

export interface GenerateSettingsArtifactInput {
  basePrompt: string
  existing: SettingsExistingItem[]
  callSettingsApi: (prompt: string) => Promise<string>
  shouldContinue?: () => boolean
  maxRepairAttempts?: number
  onAttempt?: (attempt: SettingsArtifactAttempt) => void
}

export interface SettingsArtifactResult {
  status: 'complete' | 'failed'
  accepted: any[]
  rejected: any[]
  attempts: SettingsArtifactAttempt[]
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
    '上一次输出没有可接受的设定项。错误如下：',
    ...(input.errors || []).map(error => `- ${error}`),
    '请重新输出JSON数组，每项必须含name/category/attrsText字段；name不得为空或纯符号，attrsText不得为空。'
  ].join('\n')
}

export async function generateSettingsArtifact(
  input: GenerateSettingsArtifactInput
): Promise<SettingsArtifactResult> {
  const attempts: SettingsArtifactAttempt[] = []
  const maxRepairs = Math.max(0, Math.round(Number(input.maxRepairAttempts ?? 1)))
  let repairAttempt = 0

  while (true) {
    if (input.shouldContinue && !input.shouldContinue()) {
      return {
        status: 'failed',
        accepted: [],
        rejected: [],
        attempts,
        errors: ['设定生成已被用户取消']
      }
    }

    const prompt = buildPrompt({
      basePrompt: input.basePrompt,
      repair: repairAttempt > 0,
      errors: repairAttempt === 0 ? [] : attempts.flatMap(attempt => attempt.errors)
    })

    let raw: string
    try {
      raw = await input.callSettingsApi(prompt)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      attempts.push({
        repairAttempt,
        status: 'error',
        acceptedCount: 0,
        rejectedCount: 0,
        errors: [message]
      })
      input.onAttempt?.(attempts[attempts.length - 1])
      throw error
    }

    const parsed = extractJsonArray(raw) as any[]
    const validationStartedAt = Date.now()
    const validation = validateSettingsArtifact(parsed, input.existing)
    const validationMs = Math.max(0, Date.now() - validationStartedAt)
    const attempt: SettingsArtifactAttempt = {
      repairAttempt,
      status: validation.accepted.length > 0 ? 'complete' : 'rejected-all',
      acceptedCount: validation.accepted.length,
      rejectedCount: validation.rejected.length,
      validationMs,
      errors: [
        ...validation.rejected.map(item => item.reason),
        ...validation.errors
      ]
    }
    attempts.push(attempt)
    input.onAttempt?.(attempt)

    if (validation.accepted.length > 0) {
      return {
        status: 'complete',
        accepted: validation.accepted,
        rejected: validation.rejected,
        attempts,
        errors: validation.errors
      }
    }

    if (repairAttempt >= maxRepairs) break
    repairAttempt += 1
  }

  const errors = [
    ...new Set([
      `设定项没有可接受输出：修复${repairAttempt}次后仍无有效项`,
      ...attempts.flatMap(attempt => attempt.errors)
    ])
  ]
  return { status: 'failed', accepted: [], rejected: [], attempts, errors }
}
