import { parseGenerationResult } from './generationResult'
import {
  countBodyWords,
  validateBodyArtifact,
  type BodyArtifactContract,
  type BodyArtifactValidation
} from './bodyArtifactContract'

export type StepArtifactCallerStatus = 'success' | 'degraded' | 'failed' | 'blocked'

export interface StepArtifactAcceptanceInput {
  rawOutput: string
  contract: BodyArtifactContract | null
  callerStatus: StepArtifactCallerStatus
  degradedErrors?: string[]
}

export interface StepArtifactAcceptanceResult {
  decision: 'accept' | 'reject'
  reason: 'no_contract' | 'contract_valid' | 'contract_failed' | 'caller_failed'
  callerStatus: StepArtifactCallerStatus
  stepIndex?: number
  extractedBody: string
  rawWordCount: number
  extractedWordCount: number
  metadataDelta: number
  validation: BodyArtifactValidation | null
  downstreamPayload: string | null
  errors: string[]
}

export interface StepArtifactEnvelope {
  rawOutput: string
  callerStatus: StepArtifactCallerStatus
  degradedErrors: string[]
}

export interface StepArtifactFlowInput {
  stepOutput: string
  stepIndex: number
  contract: BodyArtifactContract | null
}

export interface StepArtifactFlowResult {
  acceptance: StepArtifactAcceptanceResult
  continueChain: boolean
  downstreamPayload: string | null
  traceDetail: {
    stepIndex: number
    callerStatus: StepArtifactCallerStatus
    rawWordCount: number
    extractedWordCount: number
    metadataDelta: number
    decision: 'accept' | 'reject'
    reason: StepArtifactAcceptanceResult['reason']
    contract: {
      targetWords: number
      minWords: number | null
      maxWords: number | null
    }
    degradedErrors: string[]
    contractErrors: string[]
  }
  failure: {
    reason: 'degraded_plus_contract_failure' | 'contract_failure' | 'caller_failed'
    message: string
  } | null
}

export function makeStepArtifactEnvelope(input: {
  status: StepArtifactCallerStatus
  output: string
  errors?: string[]
}): string {
  return JSON.stringify({
    __shenyiStepArtifact: true,
    status: input.status,
    output: input.output,
    errors: input.errors || []
  })
}

export function parseStepArtifactEnvelope(stepOutput: string): StepArtifactEnvelope | null {
  const text = String(stepOutput || '')
  if (!text.startsWith('{"__shenyiStepArtifact"')) return null
  try {
    const value = JSON.parse(text) as Record<string, unknown>
    if (value?.__shenyiStepArtifact !== true) return null
    const status = value.status
    if (status !== 'success' && status !== 'degraded' && status !== 'failed' && status !== 'blocked') {
      return null
    }
    const rawOutput = String(value.output || '')
    return {
      rawOutput,
      callerStatus: status,
      degradedErrors: Array.isArray(value.errors)
        ? value.errors.map(item => String(item)).filter(Boolean)
        : []
    }
  } catch {
    return null
  }
}

export function resolveStepArtifactFlow(input: StepArtifactFlowInput): StepArtifactFlowResult {
  const envelope = parseStepArtifactEnvelope(input.stepOutput)
  const acceptance = acceptStepArtifact({
    rawOutput: envelope?.rawOutput ?? input.stepOutput,
    contract: input.contract,
    callerStatus: envelope?.callerStatus ?? 'success',
    degradedErrors: envelope?.degradedErrors
  })
  const result: StepArtifactAcceptanceResult = { ...acceptance, stepIndex: input.stepIndex }
  const rejected = result.decision === 'reject'
  type FailureReason = NonNullable<StepArtifactFlowResult['failure']>['reason']
  const failureReason: FailureReason = rejected
    ? result.reason === 'caller_failed'
      ? 'caller_failed'
      : result.callerStatus === 'degraded'
        ? 'degraded_plus_contract_failure'
        : 'contract_failure'
    : 'contract_failure'
  return {
    acceptance: result,
    continueChain: !rejected,
    downstreamPayload: result.downstreamPayload,
    traceDetail: {
      stepIndex: input.stepIndex,
      callerStatus: result.callerStatus,
      rawWordCount: result.rawWordCount,
      extractedWordCount: result.extractedWordCount,
      metadataDelta: result.metadataDelta,
      decision: result.decision,
      reason: result.reason,
      contract: {
        targetWords: Number(input.contract?.targetWords || 0),
        minWords: result.validation?.minWords ?? null,
        maxWords: result.validation?.maxWords ?? null
      },
      degradedErrors: result.callerStatus === 'degraded' ? (envelope?.degradedErrors || []) : [],
      contractErrors: result.validation?.errors || []
    },
    failure: rejected
      ? {
          reason: failureReason,
          message: `正文生成步骤验收失败（${failureReason}）：${result.errors.join('；')}`
        }
      : null
  }
}

export function acceptStepArtifact(input: StepArtifactAcceptanceInput): StepArtifactAcceptanceResult {
  const rawOutput = String(input.rawOutput || '')
  const rawWordCount = countBodyWords(rawOutput)
  const callerFailed = input.callerStatus === 'failed' || input.callerStatus === 'blocked'

  if (callerFailed) {
    return {
      decision: 'reject',
      reason: 'caller_failed',
      callerStatus: input.callerStatus,
      extractedBody: '',
      rawWordCount,
      extractedWordCount: 0,
      metadataDelta: rawWordCount,
      validation: null,
      downstreamPayload: null,
      errors: input.callerStatus === 'failed' ? ['SKILL 调用失败'] : ['SKILL 调用被阻断']
    }
  }

  if (!input.contract) {
    return {
      decision: 'accept',
      reason: 'no_contract',
      callerStatus: input.callerStatus,
      extractedBody: rawOutput,
      rawWordCount,
      extractedWordCount: rawWordCount,
      metadataDelta: 0,
      validation: null,
      downstreamPayload: rawOutput,
      errors: []
    }
  }

  const generation = parseGenerationResult(rawOutput)
  const extractedBody = generation.body
  const extractedWordCount = countBodyWords(extractedBody)
  const metadataDelta = Math.max(0, rawWordCount - extractedWordCount)
  const validation = validateBodyArtifact(extractedBody, input.contract)
  const degradedErrors = input.callerStatus === 'degraded'
    ? (input.degradedErrors || []).filter(Boolean)
    : []

  if (!validation.valid) {
    return {
      decision: 'reject',
      reason: 'contract_failed',
      callerStatus: input.callerStatus,
      extractedBody,
      rawWordCount,
      extractedWordCount,
      metadataDelta,
      validation,
      downstreamPayload: null,
      errors: [...degradedErrors, ...validation.errors]
    }
  }

  return {
    decision: 'accept',
    reason: 'contract_valid',
    callerStatus: input.callerStatus,
    extractedBody,
    rawWordCount,
    extractedWordCount,
    metadataDelta,
    validation,
    downstreamPayload: extractedBody,
    errors: degradedErrors
  }
}
