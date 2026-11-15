import { parseGenerationResult } from './generationResult'
import {
  detectChapterNarrativeVerdict,
  evaluateChapterEventIncrement,
  findChapterEventIncrementValue
} from './chapterEventDensity'
import type { GenerationMetadata } from './generationResult'
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
  blockingGateFailed?: boolean
  degradedErrors?: string[]
}

export interface StepArtifactAcceptanceResult {
  decision: 'accept' | 'reject'
  reason: 'no_contract' | 'no_contract_degraded' | 'contract_valid' | 'contract_failed' | 'caller_failed'
  callerStatus: StepArtifactCallerStatus
  blockingGateFailed: boolean
  stepIndex?: number
  extractedBody: string
  metadata: GenerationMetadata
  rawWordCount: number
  extractedWordCount: number
  metadataDelta: number
  validation: BodyArtifactValidation | null
  downstreamPayload: string | null
  errors: string[]
}

export interface StepArtifactStepCandidateAudit {
  attempt: number
  sourceResponseHash: string
}

export interface StructuredSkillStepOutput {
  output: string
  callerStatus: StepArtifactCallerStatus
  blockingGateFailed?: boolean
  errors: string[]
  stepCandidateAudit?: StepArtifactStepCandidateAudit | null
}

export interface FinalStepMetadataWarning {
  code: 'body-final-step-metadata-repaired' | 'body-final-step-fact-divergence' | 'generator-ledger-missing'
  message: string
}

export interface FinalStepMetadataFlowInput {
  finalMetadata: GenerationMetadata | null | undefined
  authoritativeGeneratorMetadata: GenerationMetadata | null | undefined
  finalBody: string
}

export interface FinalStepMetadataFlowResult {
  decision: 'pass' | 'backfilled' | 'divergence' | 'generator_ledger_missing'
  metadata: GenerationMetadata
  comparison: {
    matched: string[]
    missing_in_final: string[]
    conflicting: string[]
    conflictTypes?: Record<string, 'label_drift' | 'body_divergence'>
  }
  warnings: FinalStepMetadataWarning[]
}

export interface StepArtifactFlowInput {
  stepOutput: string | StructuredSkillStepOutput
  stepIndex: number
  contract: BodyArtifactContract | null
}

export interface StepArtifactFlowResult {
  acceptance: StepArtifactAcceptanceResult
  continueChain: boolean
  downstreamPayload: string | null
  metadata: GenerationMetadata
  traceDetail: {
    stepIndex: number
    callerStatus: StepArtifactCallerStatus
    rawWordCount: number
    extractedWordCount: number
    metadata: GenerationMetadata
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
    reason: 'degraded_plus_contract_failure' | 'contract_failure' | 'caller_failed' | 'no_contract_degraded'
    message: string
  } | null
  chapterEventIncrementAdvisory: ReturnType<typeof evaluateChapterEventIncrement>
  chapterNarrativeVerdict: ReturnType<typeof detectChapterNarrativeVerdict>
  traceAuditFields: {
    sourceCandidateIndex: number | null
    sourceResponseHash: string | null
    eventIncrement: string | null
  }
}

function parseStepArtifactCandidateAudit(stepOutput: string): StepArtifactStepCandidateAudit | null {
  const raw = String(stepOutput || '')
  const attemptMatch = /(?:^|\n)\s*(?:【)?\s*candidateAttempt\s*(?:】)?\s*[：:]\s*(\d+)/.exec(raw)
  const hashMatch = /(?:^|\n)\s*(?:【)?\s*candidateResponseHash\s*(?:】)?\s*[：:]\s*([A-Za-z0-9_]+)/.exec(raw)
  if (!attemptMatch || !hashMatch) return null
  return {
    attempt: Number(attemptMatch[1]),
    sourceResponseHash: hashMatch[1]
  }
}

function normalizeStepArtifactInput(stepOutput: string | StructuredSkillStepOutput): {
  rawOutput: string
  callerStatus: StepArtifactCallerStatus
  blockingGateFailed: boolean | undefined
  degradedErrors: string[] | undefined
  stepCandidateAudit: StepArtifactStepCandidateAudit | null
} {
  if (typeof stepOutput === 'string') {
    return {
      rawOutput: stepOutput,
      callerStatus: 'success',
      blockingGateFailed: undefined,
      degradedErrors: undefined,
      stepCandidateAudit: parseStepArtifactCandidateAudit(stepOutput)
    }
  }
  return {
    rawOutput: String(stepOutput.output || ''),
    callerStatus: stepOutput.callerStatus,
    blockingGateFailed: stepOutput.blockingGateFailed === true,
    degradedErrors: (stepOutput.errors || []).filter(Boolean),
    stepCandidateAudit: stepOutput.stepCandidateAudit || null
  }
}

export function resolveStepArtifactFlow(input: StepArtifactFlowInput): StepArtifactFlowResult {
  const normalized = normalizeStepArtifactInput(input.stepOutput)
  const stepCandidateAudit = normalized.stepCandidateAudit
  const acceptance = acceptStepArtifact({
    rawOutput: normalized.rawOutput,
    contract: input.contract,
    callerStatus: normalized.callerStatus,
    blockingGateFailed: normalized.blockingGateFailed,
    degradedErrors: normalized.degradedErrors
  })
  const result: StepArtifactAcceptanceResult = { ...acceptance, stepIndex: input.stepIndex }
  const rejected = result.decision === 'reject'
  type FailureReason = NonNullable<StepArtifactFlowResult['failure']>['reason']
  const failureReason: FailureReason = rejected
    ? result.reason === 'caller_failed'
      ? 'caller_failed'
      : result.reason === 'no_contract_degraded'
        ? 'no_contract_degraded'
        : result.callerStatus === 'degraded'
        ? 'degraded_plus_contract_failure'
        : 'contract_failure'
    : 'contract_failure'
  return {
    acceptance: result,
    continueChain: !rejected,
    downstreamPayload: result.downstreamPayload,
    metadata: rejected ? {} : result.metadata,
    traceDetail: {
      stepIndex: input.stepIndex,
      callerStatus: result.callerStatus,
      rawWordCount: result.rawWordCount,
      extractedWordCount: result.extractedWordCount,
      metadata: result.metadata,
      metadataDelta: result.metadataDelta,
      decision: result.decision,
      reason: result.reason,
      contract: {
        targetWords: Number(input.contract?.targetWords || 0),
        minWords: result.validation?.minWords ?? null,
        maxWords: result.validation?.maxWords ?? null
      },
      degradedErrors: result.callerStatus === 'degraded' ? (normalized.degradedErrors || []) : [],
      contractErrors: result.validation?.errors || []
    },
    failure: rejected
      ? {
          reason: failureReason,
          message: `正文生成步骤验收失败（${failureReason}）：${result.errors.join('；')}`
        }
      : null,
    chapterEventIncrementAdvisory: evaluateChapterEventIncrement(
      metadataSections(acceptance.metadata).join('\n')
    ),
    chapterNarrativeVerdict: detectChapterNarrativeVerdict(
      metadataSections(acceptance.metadata).join('\n')
    ),
    traceAuditFields: {
      sourceCandidateIndex: stepCandidateAudit?.attempt ?? null,
      sourceResponseHash: stepCandidateAudit?.sourceResponseHash ?? null,
      eventIncrement: findChapterEventIncrementValue(
        metadataSections(acceptance.metadata).join('\n')
      )
    }
  }
}

const FACT_LOCK_PATTERN = /FACT_LOCK[:：]\s*([^=\s]+)\s*=\s*([^\n\r]+)/g
const FACT_LOCK_BLOCK_HEADER_PATTERN = /(?:^|\n)\s*FACT_LOCK\s*[:：]\s*(?=\n|$)/g
const FACT_LOCK_INLINE_PATTERN = /FACT_LOCK[:：]\s*([^：:=\n\r]{1,32})\s*[:：]\s*([^；\n\r]+)/g
const RESERVED_FACT_LOCK_TAIL_KEYS = new Set(['NEW_FACT'])

function metadataSections(metadata: GenerationMetadata | null | undefined): string[] {
  return Array.isArray(metadata?.extractedMeta) ? metadata?.extractedMeta || [] : []
}

function extractFactLockEntries(metadata: GenerationMetadata | null | undefined): Map<string, string> {
  const entries = new Map<string, string>()
  const sections = metadataSections(metadata)
  for (const section of sections) {
    FACT_LOCK_PATTERN.lastIndex = 0
    let match = FACT_LOCK_PATTERN.exec(String(section || ''))
    while (match) {
      const [, key, value] = match
      const normalizedKey = String(key || '').trim()
      const normalizedValue = String(value || '').trim()
      if (normalizedKey && normalizedValue) entries.set(normalizedKey, normalizedValue)
      match = FACT_LOCK_PATTERN.exec(String(section || ''))
    }

    FACT_LOCK_INLINE_PATTERN.lastIndex = 0
    let inlineMatch = FACT_LOCK_INLINE_PATTERN.exec(String(section || ''))
    while (inlineMatch) {
      const [, key, value] = inlineMatch
      const normalizedKey = String(key || '').trim()
      const normalizedValue = String(value || '').trim()
      if (normalizedKey && normalizedValue) entries.set(normalizedKey, normalizedValue)
      const remainder = String(section || '').slice(inlineMatch.index + inlineMatch[0].length)
      for (const segment of remainder.split(/；/)) {
        const segmentMatch = /^([^：:=\n\r]{1,32})\s*[:：]\s*([^；\n\r]+)/.exec(segment.trim())
        if (!segmentMatch) continue
        const [, segmentKey, segmentValue] = segmentMatch
        const normalizedSegmentKey = String(segmentKey || '').trim()
        const normalizedSegmentValue = String(segmentValue || '').trim()
        if (
          normalizedSegmentKey &&
          normalizedSegmentValue &&
          !RESERVED_FACT_LOCK_TAIL_KEYS.has(normalizedSegmentKey)
        ) {
          entries.set(normalizedSegmentKey, normalizedSegmentValue)
        }
      }
      inlineMatch = FACT_LOCK_INLINE_PATTERN.exec(String(section || ''))
    }

    FACT_LOCK_BLOCK_HEADER_PATTERN.lastIndex = 0
    let headerMatch = FACT_LOCK_BLOCK_HEADER_PATTERN.exec(String(section || ''))
    while (headerMatch) {
      const headerEnd = headerMatch.index + headerMatch[0].length
      const tail = String(section || '').slice(
        String(section || '').charAt(headerEnd) === '\n' ? headerEnd + 1 : headerEnd
      )
      for (const rawLine of tail.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line) break
        if (RESERVED_FACT_LOCK_TAIL_KEYS.has(line.split(/[:：]/, 1)[0].trim())) break
        const lineMatch = /^([^：:=\n]{1,32})\s*[:：]\s*(.+)$/.exec(line)
        if (!lineMatch) break
        const [, key, value] = lineMatch
        const normalizedKey = String(key || '').trim()
        const normalizedValue = String(value || '').trim()
        if (normalizedKey && normalizedValue) entries.set(normalizedKey, normalizedValue)
      }
      headerMatch = FACT_LOCK_BLOCK_HEADER_PATTERN.exec(String(section || ''))
    }
  }
  return entries
}

function normalizeFactText(value: string): string {
  return String(value || '').replace(/[\s，。；、！？"'（）()【】\[\]]/g, '')
}

function hasGenerationLedger(metadata: GenerationMetadata | null | undefined): boolean {
  if (!metadata) return false
  if (Array.isArray(metadata.extractedMeta) && metadata.extractedMeta.length > 0) return true
  return ['sourceRefs', 'coveredItems', 'status', 'runId', 'reports'].some(field => {
    const value = metadata[field]
    return Array.isArray(value) ? value.length > 0 : value != null && value !== ''
  })
}

export function resolveFinalStepMetadataFlow(
  input: FinalStepMetadataFlowInput
): FinalStepMetadataFlowResult {
  const finalMetadata: GenerationMetadata = { ...(input.finalMetadata || {}) }
  const warnings: FinalStepMetadataWarning[] = []
  if (!input.authoritativeGeneratorMetadata) {
    return {
      decision: 'generator_ledger_missing',
      metadata: finalMetadata,
      comparison: { matched: [], missing_in_final: [], conflicting: [] },
      warnings: [{
        code: 'generator-ledger-missing',
        message: 'S2 权威账本缺失，终稿保留 S3 元数据，不伪造权威值。'
      }]
    }
  }

    const authoritative = extractFactLockEntries(input.authoritativeGeneratorMetadata)
  const final = extractFactLockEntries(input.finalMetadata)
  if (authoritative.size === 0) {
    return {
      decision: 'generator_ledger_missing',
      metadata: finalMetadata,
      comparison: { matched: [], missing_in_final: [], conflicting: [] },
      warnings: [{
        code: 'generator-ledger-missing',
        message: 'S2 权威账本存在但没有可对账的 FACT_LOCK，禁止空转通过。'
      }]
    }
  }
  const matched: string[] = []
  const missingInFinal: string[] = []
  const conflicting: string[] = []
  const conflictTypes: Record<string, 'label_drift' | 'body_divergence'> = {}
  const finalBodyNormalized = normalizeFactText(input.finalBody)

  for (const [key, authoritativeValue] of authoritative) {
    const entry = `${key}=${authoritativeValue}`
    const finalValue = final.get(key)
    if (finalValue !== undefined && finalValue === authoritativeValue) {
      matched.push(entry)
      continue
    }
    if (finalValue === undefined) missingInFinal.push(entry)
    else conflicting.push(`${key}: ${finalValue} -> ${authoritativeValue}`)
    const finalFactText = finalValue === undefined ? '' : normalizeFactText(finalValue)
    const bodyHasFact = finalBodyNormalized.includes(normalizeFactText(authoritativeValue))
      || (finalFactText && finalBodyNormalized.includes(finalFactText))
    const type = finalValue !== undefined && !bodyHasFact ? 'body_divergence' : 'label_drift'
    conflictTypes[key] = type
    if (type === 'body_divergence') {
      warnings.push({
        code: 'body-final-step-fact-divergence',
        message: `终稿事实与 S2 FACT_LOCK 分歧：${key}=${authoritativeValue}`
      })
    }
  }

  const hasDivergence = Object.values(conflictTypes).includes('body_divergence')
  if (!hasDivergence && (missingInFinal.length || conflicting.length)) {
    warnings.push({
      code: 'body-final-step-metadata-repaired',
      message: `终步元数据退化，已用 S2 权威账本回填：missing=${missingInFinal.length},conflicting=${conflicting.length}`
    })
  }

  let metadata = finalMetadata
  if (!hasDivergence && (missingInFinal.length || conflicting.length)) {
    const stripFinalFactLock = (section: string): string => {
      const keptLines: string[] = []
      let inFactBlock = false
      for (const rawLine of section.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (inFactBlock) {
          const isTailFact = line
            && !RESERVED_FACT_LOCK_TAIL_KEYS.has(line.split(/[:：]/, 1)[0].trim())
            && /^([^：:=\n]{1,32})\s*[:：]\s*(.+)$/.test(line)
          if (isTailFact) continue
          inFactBlock = false
        }
        if (/^\s*FACT_LOCK\s*[:：]\s*$/.test(line)) {
          inFactBlock = true
          continue
        }
        if (/^\s*FACT_LOCK[:：][^=\n]+=/.test(line)) continue
        keptLines.push(rawLine)
      }
      return keptLines.join('\n')
    }
    const repairedSections: string[] = []
    for (const section of Array.isArray(finalMetadata.extractedMeta) ? finalMetadata.extractedMeta : []) {
      const repaired = stripFinalFactLock(String(section))
      if (repaired.trim()) repairedSections.push(repaired)
    }
    const authoritativeSourceText = (input.authoritativeGeneratorMetadata?.extractedMeta || [])
      .join('\n')
    const authoritativeContractNumbers = {
      targetWords: Number(authoritativeSourceText.match(/目标字数[：:]([^\n]+)/)?.[1] || ''),
      minimumWords: Number(authoritativeSourceText.match(/生成下限[：:]([^\n]+)/)?.[1] || '')
    }
    for (const contractField of ['targetWords', 'minimumWords'] as const) {
      const authoritativeValue = authoritativeContractNumbers[contractField]
      if (!Number.isFinite(authoritativeValue) || authoritativeValue <= 0) continue
      ;(metadata as Record<string, unknown>)[contractField] = authoritativeValue
      const staleLabel = contractField === 'targetWords' ? '目标字数' : '生成下限'
      const replaced = repairedSections.map(section =>
        String(section).replace(
          new RegExp(`^${staleLabel}[：:].*$`, 'm'),
          `${staleLabel}：${authoritativeValue}`
        )
      )
      repairedSections.length = 0
      repairedSections.push(...replaced)
    }
    for (const [key, value] of authoritative) {
      const entry = `FACT_LOCK:${key}=${value}`
      const keyPattern = new RegExp(`^FACT_LOCK:${key}=(.*)$`, 'm')
      let replaced = false
      repairedSections.forEach((section, index) => {
        if (keyPattern.test(section)) {
          repairedSections[index] = section.replace(keyPattern, entry)
          replaced = true
        }
      })
      if (!replaced && !repairedSections.includes(entry)) repairedSections.push(entry)
    }
    metadata = {
      ...finalMetadata,
      extractedMeta: repairedSections,
      conflicts: conflicting.length ? conflicting : undefined
    } as GenerationMetadata
  }

  return {
    decision: hasDivergence ? 'divergence'
      : missingInFinal.length || conflicting.length ? 'backfilled' : 'pass',
    metadata,
    comparison: {
      matched,
      missing_in_final: missingInFinal,
      conflicting,
      conflictTypes
    },
    warnings
  }
}

export function acceptStepArtifact(input: StepArtifactAcceptanceInput): StepArtifactAcceptanceResult {
  const rawOutput = String(input.rawOutput || '')
  const rawWordCount = countBodyWords(rawOutput)
  const callerFailed = input.callerStatus === 'failed' || input.callerStatus === 'blocked'
  const degradedErrors = (input.degradedErrors || []).filter(Boolean)
  const blockingGateFailed = input.blockingGateFailed === true

  if (callerFailed) {
    const failedGeneration = parseGenerationResult(rawOutput)
    return {
      decision: 'reject',
      reason: 'caller_failed',
      callerStatus: input.callerStatus,
      blockingGateFailed,
      extractedBody: '',
      metadata: failedGeneration.metadata,
      rawWordCount,
      extractedWordCount: 0,
      metadataDelta: rawWordCount,
      validation: null,
      downstreamPayload: null,
      errors: input.callerStatus === 'failed' ? ['SKILL 调用失败'] : ['SKILL 调用被阻断']
    }
  }

  if (!input.contract) {
    const noContractGeneration = parseGenerationResult(rawOutput)
    if (input.callerStatus === 'degraded') {
      return {
      decision: 'reject',
      reason: 'no_contract_degraded',
      callerStatus: input.callerStatus,
      blockingGateFailed,
        extractedBody: '',
        metadata: noContractGeneration.metadata,
        rawWordCount,
        extractedWordCount: 0,
        metadataDelta: rawWordCount,
        validation: null,
        downstreamPayload: null,
        errors: [...degradedErrors, '降级输出未声明产物契约，无法验收']
      }
    }
    return {
      decision: 'accept',
      reason: 'no_contract',
      callerStatus: input.callerStatus,
      blockingGateFailed,
      extractedBody: rawOutput,
      metadata: noContractGeneration.metadata,
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
  if (input.callerStatus === 'degraded' && blockingGateFailed) {
    return {
      decision: 'reject',
      reason: 'contract_failed',
      callerStatus: input.callerStatus,
      blockingGateFailed,
      extractedBody,
      metadata: generation.metadata,
      rawWordCount,
      extractedWordCount,
      metadataDelta,
      validation,
      downstreamPayload: null,
      errors: [...degradedErrors, 'SKILL 阻断裁决未通过，禁止以降级候选进入下一层']
    }
  }
  if (!validation.valid) {
    return {
      decision: 'reject',
      reason: 'contract_failed',
      callerStatus: input.callerStatus,
      blockingGateFailed,
      extractedBody,
      metadata: generation.metadata,
      rawWordCount,
      extractedWordCount,
      metadataDelta,
      validation,
      downstreamPayload: null,
      errors: [...degradedErrors, ...validation.errors]
    }
  }

  if (input.callerStatus === 'degraded' && !hasGenerationLedger(generation.metadata)) {
    return {
      decision: 'reject',
      reason: 'contract_failed',
      callerStatus: input.callerStatus,
      blockingGateFailed,
      extractedBody,
      metadata: generation.metadata,
      rawWordCount,
      extractedWordCount,
      metadataDelta,
      validation,
      downstreamPayload: null,
      errors: [...degradedErrors, '降级候选缺少【正文交接】账本，禁止无权威元数据流转']
    }
  }

  return {
    decision: 'accept',
    reason: 'contract_valid',
    callerStatus: input.callerStatus,
    blockingGateFailed,
    extractedBody,
    metadata: generation.metadata,
    rawWordCount,
    extractedWordCount,
    metadataDelta,
    validation,
    downstreamPayload: extractedBody,
    errors: degradedErrors
  }
}
