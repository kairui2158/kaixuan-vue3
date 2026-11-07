import { parseGenerationResult } from './generationResult'
import type { StructuredSkillStepOutput } from './stepArtifactAcceptance'
import { resolveChapterNarrativeBlock } from './chapterEventDensity'
import {
  isBodyArtifactContractInput,
  validateBodyArtifact,
  type BodyArtifactContract
} from './bodyArtifactContract'

export interface BodyArtifactAttempt {
  attemptId: string
  repairAttempt: number
  repairScope: BodyArtifactRepairScope
  status: 'complete' | 'too_short' | 'too_long' | 'empty' | 'error' | 'execution_invalid'
  wordCount: number
  targetWords: number
  ratio: number
  errors: string[]
  /** Observability only; validation timing never changes retry decisions. */
  validationMs?: number
  body?: string
  metadata?: Record<string, unknown>
  traceAuditFields?: BodyArtifactTraceAuditFields
}

export type BodyArtifactPreviousBodySource =
  | 'none'
  | 'candidate_metadata_only'
  | 'not_reused'

export interface BodyArtifactTraceAuditFields {
  repairScope: BodyArtifactRepairScope
  previousBodySource: BodyArtifactPreviousBodySource
  degradationReason: string
}

export interface BodyArtifactDecisionPathEntry {
  attemptId: string
  repairAttempt: number
  repairScope: BodyArtifactRepairScope
  status: BodyArtifactAttempt['status']
  wordCount: number
  targetWords: number
  errors: string[]
}

export type BodyArtifactRepairScope = 'none' | 'targeted' | 'full_chain' | 'post_process'

export type BodyArtifactExecutionTopology =
  | 'fresh_chain'
  | 'generator_step'

export interface BodyArtifactExecutionPlan {
  topology: BodyArtifactExecutionTopology
  targetRole: 'chain_start' | 'generator'
  reuseArtifacts: boolean
  startIndex: number | null
  disableBreakpointReplay: boolean
}

export interface BodyArtifactCallContext {
  attemptId: string
  chapterId: string
  targetWords: number
  repairAttempt: number
  repairScope: BodyArtifactRepairScope
  previousBody: string
  previousWordCount: number
  errors: string[]
  executionPlan?: BodyArtifactExecutionPlan
}

export interface BodyArtifactRequestFingerprint {
  physicalRequests: number
  promptHash: string
  outputHash: string
  resumedFromBreakpoint: boolean
}

export interface BodyArtifactStructuredFailure {
  callerStatus: 'success' | 'degraded' | 'failed' | 'blocked'
  blockingGateFailed: boolean
  handoffNotReady: boolean
}

export function resolveBodyStructuredFailure(input: {
  output: string
  callerStatus: 'success' | 'degraded' | 'failed' | 'blocked'
  blockingGateFailed?: boolean
}): BodyArtifactStructuredFailure {
  return {
    callerStatus: input.callerStatus,
    blockingGateFailed: input.blockingGateFailed === true,
    handoffNotReady: input.callerStatus === 'blocked' &&
      resolveChapterNarrativeBlock(input.output)?.retryableInBodyLayer === true
  }
}

export type BodyArtifactCallResult = string | {
  text: string
  fingerprint: BodyArtifactRequestFingerprint
  structuredFailure?: BodyArtifactStructuredFailure
} | (StructuredSkillStepOutput & {
  text?: string
  fingerprint?: BodyArtifactRequestFingerprint
  structuredFailure?: BodyArtifactStructuredFailure
})

export interface GenerateBodyArtifactInput {
  contract: BodyArtifactContract
  basePrompt: string
  callBodyApi: (prompt: string, context: BodyArtifactCallContext) => Promise<BodyArtifactCallResult>
  /** 0-based chain index of the prose-generator skill, when the chain declares it. */
  generatorStepIndex?: number | null
  /** Folder chain-handoff role for the generator step, if declared. */
  generatorDeclaredRole?: 'generator' | null
  /** Role of the final chain skill, used when metadata is absent. */
  finalStepRole?: string | null
  /** Total chain skills; used to infer the penultimate generator fallback. */
  totalSteps?: number | null
  shouldContinue?: () => boolean
  maxRepairAttempts?: number
  onAttempt?: (attempt: BodyArtifactAttempt) => void
}

export interface BodyArtifactResult {
  status: 'complete' | 'failed'
  body: string
  metadata: {
    decisionPath?: BodyArtifactDecisionPathEntry[]
    terminalReason?: string
    [key: string]: unknown
  }
  attempts: BodyArtifactAttempt[]
  errors: string[]
}

export interface BodyArtifactPostProcessContext {
  attemptId: string
  stage: 'hard_signal' | 'deai'
  processor: string
  success: boolean
  wordCount: number
  errors?: string[]
}

export function recordBodyArtifactPostProcess(
  attempts: BodyArtifactAttempt[],
  context: BodyArtifactPostProcessContext
): BodyArtifactAttempt[] {
  const base = attempts[attempts.length - 1]
  if (!base) return attempts
  const errors = [...(base.errors || []), ...(context.errors || [])]
  const repairScope: BodyArtifactRepairScope = 'post_process'
  const nextStatus: BodyArtifactAttempt['status'] = context.success
    ? base.status
    : 'execution_invalid'
  return [
    ...attempts.slice(0, -1),
    {
      ...base,
      repairScope,
      status: nextStatus,
      errors: [...new Set(errors)],
      traceAuditFields: buildTraceAuditFields({
        repairScope,
        previousBody: base.body || '',
        degradationReason: context.success
          ? base.traceAuditFields?.degradationReason || 'none'
          : (context.errors?.[0] || 'post_process_failed')
      }),
      metadata: {
        ...(base.metadata || {}),
        postProcesses: [
          ...((base.metadata?.postProcesses as BodyArtifactPostProcessContext[]) || []),
          context
        ]
      }
    }
  ]
}

export function planBodyArtifactExecution(input: {
  repairScope: BodyArtifactRepairScope
  generatorStepIndex?: number | null
  generatorDeclaredRole?: 'generator' | null
  finalStepRole?: string | null
  totalSteps?: number | null
}): BodyArtifactExecutionPlan {
  const generatorIndexCandidate = input.generatorStepIndex ?? null
  const hasGeneratorIndex = generatorIndexCandidate !== null &&
    Number.isFinite(generatorIndexCandidate) && generatorIndexCandidate >= 0
  const generatorRole = input.generatorDeclaredRole === 'generator'
  const fallbackGeneratorIndex = input.finalStepRole === 'polish' &&
    Number.isFinite(Number(input.totalSteps)) && Number(input.totalSteps) > 2
    ? Number(input.totalSteps) - 2
    : null
  const resolvedGeneratorIndex = hasGeneratorIndex
    ? Math.floor(generatorIndexCandidate)
    : generatorRole && fallbackGeneratorIndex !== null
      ? fallbackGeneratorIndex
      : null
  if (input.repairScope === 'targeted' && resolvedGeneratorIndex !== null) {
    // Length contracts are enforced at the prose-generator step. Targeted
    // repair must reuse analysis, regenerate prose, then rerun polish.
    return {
      topology: 'generator_step',
      startIndex: resolvedGeneratorIndex,
      targetRole: 'generator',
      reuseArtifacts: true,
      disableBreakpointReplay: true
    }
  }
  return {
    topology: 'fresh_chain',
    startIndex: 0,
    targetRole: 'chain_start',
    reuseArtifacts: false,
    disableBreakpointReplay: input.repairScope !== 'none'
  }
}

function buildPrompt(input: {
  basePrompt: string
  repair: BodyArtifactRepairScope
  previousBody: string
  previousWordCount: number
  targetWords: number
  handoffNotReady?: boolean
  errors?: string[]
}): string {
  if (input.repair === 'none') return input.basePrompt
  if (input.repair === 'targeted') {
    return [
      input.basePrompt,
      '',
      '上一版正文未通过验收。请基于链上单独提供的上游权威产物重新生成正文，修复以下契约失败。',
      input.handoffNotReady
        ? `上一版结果是 SKILL 交接阻断消息，不是可用正文；目标字数：${input.targetWords}；旧稿全文不进入本次请求。`
        : `上一版正文字数：${input.previousWordCount}，目标字数：${input.targetWords}；旧稿全文不进入本次请求。`,
      '错误如下：',
      ...(input.errors || []).map(error => `- ${error}`),
      '',
      '要求：由正文生成步重新输出完整正文，再进入打磨步；只输出修复后的完整正文。'
    ].join('\n')
  }
  return [
    input.basePrompt,
    '',
    '上一次正文未通过验收。错误如下：',
    ...(input.errors || []).map(error => `- ${error}`),
    '该结果不适合作为定点修复基础。',
    '请重新生成完整正文，不要输出解释或元数据。'
  ].join('\n')
}

function createAttemptId(chapterId: string, repairAttempt: number): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${chapterId}-attempt-${repairAttempt + 1}-${random}`
}

function buildTraceAuditFields(input: {
  repairScope: BodyArtifactRepairScope
  previousBody: string
  degradationReason: string
}): BodyArtifactTraceAuditFields {
  return {
    repairScope: input.repairScope,
    previousBodySource: input.repairScope === 'none'
      ? 'none'
      : input.repairScope === 'targeted'
        ? 'candidate_metadata_only'
        : 'not_reused',
    degradationReason: input.degradationReason || 'unknown'
  }
}

function buildDecisionPath(
  attempts: BodyArtifactAttempt[],
  terminalReason: string
): { decisionPath: BodyArtifactDecisionPathEntry[]; terminalReason: string } {
  return {
    decisionPath: attempts.map(attempt => ({
      attemptId: attempt.attemptId,
      repairAttempt: attempt.repairAttempt,
      repairScope: attempt.repairScope,
      status: attempt.status,
      wordCount: attempt.wordCount,
      targetWords: attempt.targetWords,
      errors: attempt.errors
    })),
    terminalReason
  }
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
  let targetedRepairFailed = false
  while (true) {
    if (input.shouldContinue && !input.shouldContinue()) {
      const terminal = buildDecisionPath(attempts, 'cancelled')
      return {
        status: 'failed',
        body: '',
        metadata: terminal,
        attempts,
        errors: ['正文生成已被用户取消']
      }
    }

  const lastAttempt = attempts[attempts.length - 1]
  const structuredFailure = lastAttempt?.metadata?.structuredFailure as
    | BodyArtifactStructuredFailure
    | undefined
  const previousBody = lastAttempt?.body ?? ''
  const repairScope: BodyArtifactRepairScope = repairAttempt === 0
    ? 'none'
      : structuredFailure?.handoffNotReady
        ? 'targeted'
        : previousBody.trim().length === 0 || targetedRepairFailed
        ? 'full_chain'
        : 'targeted'
    const attemptId = createAttemptId(input.contract.chapterId, repairAttempt)
    const context: BodyArtifactCallContext = {
      attemptId,
      chapterId: input.contract.chapterId,
      targetWords: input.contract.targetWords,
      repairAttempt,
      repairScope,
      previousBody,
      previousWordCount: lastAttempt?.wordCount ?? 0,
      errors: lastAttempt?.errors ?? [],
      executionPlan: planBodyArtifactExecution({
        repairScope,
        generatorStepIndex: input.generatorStepIndex ?? null,
        generatorDeclaredRole: input.generatorDeclaredRole ?? null,
        finalStepRole: input.finalStepRole ?? null,
        totalSteps: input.totalSteps ?? null
      })
    }

    const prompt = buildPrompt({
      basePrompt: input.basePrompt,
      repair: repairScope,
      previousBody: context.previousBody,
      previousWordCount: context.previousWordCount,
      targetWords: input.contract.targetWords,
      handoffNotReady: structuredFailure?.handoffNotReady,
      errors: context.errors
    })

    let raw: string = ''
    let fingerprint: BodyArtifactRequestFingerprint | undefined
    let callerErrors: string[] = []
    let callStructuredFailure: BodyArtifactStructuredFailure | undefined
    try {
      const callResult = await input.callBodyApi(prompt, context)
      if (typeof callResult === 'string') {
        raw = callResult
      } else if ('output' in callResult) {
        raw = typeof callResult.output === 'string' ? callResult.output : String(callResult.output ?? '')
        callerErrors = (callResult.errors || []).filter(Boolean)
        fingerprint = callResult.fingerprint
        callStructuredFailure = callResult.structuredFailure ||
          resolveBodyStructuredFailure(callResult)
      } else if ('structuredFailure' in callResult && callResult.structuredFailure) {
        callStructuredFailure = callResult.structuredFailure
        raw = String(callResult.text ?? '')
      } else {
        raw = String(callResult.text ?? '')
        if ('errors' in callResult && Array.isArray(callResult.errors)) {
          callerErrors = callResult.errors.map(item => String(item)).filter(Boolean)
        }
        fingerprint = callResult.fingerprint
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const attempt: BodyArtifactAttempt = {
        attemptId,
        repairAttempt,
        repairScope,
        status: 'error',
        wordCount: 0,
        targetWords: input.contract.targetWords,
        ratio: 0,
        errors: [message],
        body: '',
        traceAuditFields: buildTraceAuditFields({
          repairScope,
          previousBody,
          degradationReason: message
        })
      }
      attempts.push(attempt)
      input.onAttempt?.(attempt)
      throw error
    }

    if (fingerprint && Number(fingerprint.physicalRequests) <= 0) {
      const zeroRequestError = '执行无效：本次 attempt 零物理请求，疑似被断点回放短路'
      const attempt: BodyArtifactAttempt = {
        attemptId,
        repairAttempt,
        repairScope,
        status: 'execution_invalid',
        wordCount: 0,
        targetWords: input.contract.targetWords,
        ratio: 0,
        errors: [zeroRequestError],
        body: '',
        traceAuditFields: buildTraceAuditFields({
          repairScope,
          previousBody,
          degradationReason: zeroRequestError
        }),
        metadata: { requestFingerprint: fingerprint }
      }
      attempts.push(attempt)
      input.onAttempt?.(attempt)
      return {
        status: 'failed',
        body: '',
        metadata: buildDecisionPath(attempts, 'zero_physical_requests'),
        attempts,
        errors: [zeroRequestError]
      }
    }

    const generation = parseGenerationResult(raw)
    if (callerErrors.length) {
      generation.metadata.degradedErrors = callerErrors
    }
    const validationStartedAt = Date.now()
    const validation = validateBodyArtifact(generation.body, input.contract)
    const validationMs = Math.max(0, Date.now() - validationStartedAt)
    const attempt: BodyArtifactAttempt = {
      attemptId,
      repairAttempt,
      repairScope,
      status: validation.status === 'valid' ? 'complete' : validation.status,
      wordCount: validation.wordCount,
      targetWords: input.contract.targetWords,
      ratio: validation.ratio,
      validationMs,
      errors: [...callerErrors, ...validation.errors],
      body: generation.body,
      traceAuditFields: buildTraceAuditFields({
        repairScope,
        previousBody,
        degradationReason: validation.valid ? 'none' : validation.errors[0] || 'unknown'
      }),
      ...((fingerprint || callStructuredFailure) ? {
        metadata: {
          ...(fingerprint ? { requestFingerprint: fingerprint } : {}),
          ...(callStructuredFailure ? { structuredFailure: callStructuredFailure } : {})
        }
      } : {})
    }
    attempts.push(attempt)
    input.onAttempt?.(attempt)

    if (validation.valid) {
      return {
        status: 'complete',
        body: generation.body,
        metadata: {
          ...generation.metadata,
          decisionPath: buildDecisionPath(attempts, 'contract_valid').decisionPath,
          terminalReason: 'contract_valid'
        },
        attempts,
        errors: []
      }
    }

    if (repairAttempt >= maxRepairs) break
    if (repairScope === 'targeted') targetedRepairFailed = true
    if (repairScope === 'full_chain') break
    repairAttempt += 1
  }

  const last = attempts[attempts.length - 1]
  const errors = [
    ...new Set([
      `正文未通过验收：${repairAttempt}次修复（含一次full_chain兜底）后仍不合格`,
      ...attempts.flatMap(attempt => attempt.errors)
    ])
  ]
  return {
    status: 'failed',
    body: '',
    metadata: buildDecisionPath(attempts, 'repair_exhausted'),
    attempts,
    errors: last?.errors && last.errors.length ? errors : errors
  }
}
