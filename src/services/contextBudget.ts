export interface ContextBudgetProviderLike {
  contextWindowTokens?: number | string | null
}

export interface ContextBudgetMessageLike {
  role?: string
  content?: string | null
}

export type ContextBudgetDecision =
  | 'fits'
  | 'needs_segmentation'
  | 'exceeds_provider'
  | 'provider_configuration_conflict'

export interface ContextBudgetResult {
  decision: ContextBudgetDecision
  providerContextWindowTokens: number
  windowDeclared: boolean
  outputLimitDeclared: boolean
  estimatedInputTokens: number
  outputReserveTokens: number
  availableContextTokens: number | null
  reason: string
}

export interface UsageReconciliation {
  status: 'available' | 'unavailable'
  estimatedInputTokens: number
  actualInputTokens?: number
  driftRatio?: number
  correctedRatio?: number
}

export const CONTEXT_BUDGET_DEFAULTS = {
  /** WeKnora-style conservative Chinese estimate: about 1.7 chars/token. */
  chineseCharsPerToken: 1.7,
  /** Conservative English estimate: about 4 chars/token. */
  englishCharsPerToken: 4,
  /** Planning-only fallback for an undeclared input window. */
  unknownWindowTokens: 1_000_000,
  /** Planning-only reserve when no output limit is declared. */
  defaultOutputReserveTokens: 32_768,
  /** Keep 10% headroom so a fitting request cannot become a server-side truncation. */
  windowSafetyRatio: 0.9,
} as const

export interface ContextBudgetCalibrationKey {
  providerId?: string
  model?: string
}

interface CalibrationState {
  ratio: number
  samples: number
}

const DEFAULT_CALIBRATION_RATIO = 1
const MIN_CALIBRATION_RATIO = 0.65
const MAX_CALIBRATION_RATIO = 1.6
const CALIBRATION_SAMPLE_LIMIT = 20
const CALIBRATION_LEARNING_RATE = 0.2
const calibrationByProviderModel = new Map<string, CalibrationState>()

function calibrationKey(input: ContextBudgetCalibrationKey): string {
  return `${String(input.providerId || 'unknown').toLowerCase()}::${String(input.model || 'unknown').toLowerCase()}`
}

/**
 * Refines the estimate only. Safety ratios and output reserves stay fixed;
 * a calibrated estimate must never widen the effective planning budget.
 */
export function updateInputTokenCalibration(input: {
  providerId?: string
  model?: string
  usageReconciliation?: UsageReconciliation | null
}): number {
  const reconciliation = input.usageReconciliation
  if (!reconciliation || reconciliation.status !== 'available') return currentInputTokenCalibration(input)
  const correctedRatio = Number(reconciliation.correctedRatio)
  if (!Number.isFinite(correctedRatio) || correctedRatio <= 0) return currentInputTokenCalibration(input)
  // correctedRatio is actual/estimated. Use it directly: if actual usage is
  // lower than the estimate, the next estimate must shrink by the same ratio.
  const observedRatio = correctedRatio
  const boundedRatio = Math.min(MAX_CALIBRATION_RATIO, Math.max(MIN_CALIBRATION_RATIO, observedRatio))
  const key = calibrationKey(input)
  const state = calibrationByProviderModel.get(key) || { ratio: DEFAULT_CALIBRATION_RATIO, samples: 0 }
  const nextRatio = state.samples === 0
    ? boundedRatio
    : state.ratio * (1 - CALIBRATION_LEARNING_RATE) + boundedRatio * CALIBRATION_LEARNING_RATE
  const nextState = {
    ratio: Math.min(MAX_CALIBRATION_RATIO, Math.max(MIN_CALIBRATION_RATIO, nextRatio)),
    samples: Math.min(CALIBRATION_SAMPLE_LIMIT, state.samples + 1)
  }
  calibrationByProviderModel.set(key, nextState)
  return nextState.ratio
}

export function currentInputTokenCalibration(input: ContextBudgetCalibrationKey): number {
  return calibrationByProviderModel.get(calibrationKey(input))?.ratio ?? DEFAULT_CALIBRATION_RATIO
}

export function resetInputTokenCalibration(): void {
  calibrationByProviderModel.clear()
}

/**
 * Single planning budget shared by every caller. Keep this as the only
 * hand-written safety-ratio computation so planner, pipeline, and request
 * accounting cannot drift apart.
 */
export function resolvePlanningInputBudget(input: {
  contextWindowTokens: number | null
  maxOutputTokens?: number | null
}): number {
  const contextWindow = Number(input.contextWindowTokens)
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return 0
  const outputReserve = Number(input.maxOutputTokens)
  const effectiveOutputReserve = Number.isFinite(outputReserve) && outputReserve > 0
    ? Math.floor(outputReserve)
    : CONTEXT_BUDGET_DEFAULTS.defaultOutputReserveTokens
  return Math.max(
    0,
    Math.floor(contextWindow * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio) - effectiveOutputReserve,
  )
}

export function resolveContextWindowTokens(provider: ContextBudgetProviderLike): number {
  const raw = provider?.contextWindowTokens
  const value = typeof raw === 'string' ? Number(raw) : raw
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

export function estimateInputTokens(
  input: string | ContextBudgetMessageLike[] | null | undefined,
  calibration?: ContextBudgetCalibrationKey
): number {
  const text = typeof input === 'string'
    ? input
    : (input || []).map(message => String(message?.content ?? '')).join('\n')
  if (!text) return 0

  const chars = Array.from(text)
  let chineseCount = 0
  let otherCount = 0
  for (const char of chars) {
    const codePoint = char.codePointAt(0) || 0
    const isChinese = codePoint >= 0x3400 && codePoint <= 0x4dbf
      || codePoint >= 0x4e00 && codePoint <= 0x9fff
      || codePoint >= 0xf900 && codePoint <= 0xfaff
      || codePoint >= 0x20000 && codePoint <= 0x3fffd
    if (isChinese) chineseCount += 1
    else otherCount += 1
  }

  const tokens = chineseCount / CONTEXT_BUDGET_DEFAULTS.chineseCharsPerToken
    + otherCount / CONTEXT_BUDGET_DEFAULTS.englishCharsPerToken
  return Math.ceil(tokens * currentInputTokenCalibration(calibration || {}))
}

/**
 * Single source for pre-request planning when only the input window and an
 * optional explicit output limit are known. Returns null when the effective
 * window is unknown; callers must not invent one.
 */
export function resolveAvailableContextTokens(input: {
  contextWindowTokens: number | null
  maxOutputTokens?: number | null
}): number | null {
  const contextWindow = Number(input.contextWindowTokens)
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return null
  return resolvePlanningInputBudget(input)
}

export function resolveContextBudget(input: {
  provider: ContextBudgetProviderLike
  messages: ContextBudgetMessageLike[]
  maxOutputTokens?: number | null
  providerId?: string
  model?: string
}): ContextBudgetResult {
  const providerWindow = resolveContextWindowTokens(input.provider)
  const windowDeclared = providerWindow > 0
  const outputLimitDeclared = input.maxOutputTokens != null && input.maxOutputTokens > 0
  const contextWindow = windowDeclared
    ? providerWindow
    : CONTEXT_BUDGET_DEFAULTS.unknownWindowTokens
  const estimatedInputTokens = estimateInputTokens(input.messages, {
    providerId: input.providerId,
    model: input.model
  })
  const requestedOutput = input.maxOutputTokens == null || input.maxOutputTokens <= 0
    ? CONTEXT_BUDGET_DEFAULTS.defaultOutputReserveTokens
    : input.maxOutputTokens
  const maxOutput = Math.min(
    requestedOutput,
    Math.max(1, Math.floor(contextWindow * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio))
  )
  const availableContextTokens = Math.max(0, contextWindow - maxOutput)

  if (outputLimitDeclared && requestedOutput >= contextWindow) {
    return {
      decision: 'provider_configuration_conflict',
      providerContextWindowTokens: contextWindow,
      windowDeclared,
      outputLimitDeclared,
      estimatedInputTokens,
      outputReserveTokens: maxOutput,
      availableContextTokens: null,
      reason: `供应商输出上限吞没输入窗口：窗口 ${contextWindow}，输出保留区 ${maxOutput}`,
    }
  }

  if (estimatedInputTokens > contextWindow) {
    return {
      decision: 'exceeds_provider',
      providerContextWindowTokens: contextWindow,
      windowDeclared,
      outputLimitDeclared,
      estimatedInputTokens,
      outputReserveTokens: maxOutput,
      availableContextTokens,
      reason: `输入上下文已超过供应商窗口：估算 ${estimatedInputTokens} / 窗口 ${contextWindow}`,
    }
  }

  if (estimatedInputTokens > availableContextTokens) {
    return {
      decision: 'needs_segmentation',
      providerContextWindowTokens: contextWindow,
      windowDeclared,
      outputLimitDeclared,
      estimatedInputTokens,
      outputReserveTokens: maxOutput,
      availableContextTokens,
      reason: `需要分段：输入 ${estimatedInputTokens}，输出保留区 ${maxOutput}，可用上下文 ${availableContextTokens}`,
    }
  }

  return {
    decision: 'fits',
    providerContextWindowTokens: contextWindow,
      windowDeclared,
      outputLimitDeclared,
    estimatedInputTokens,
    outputReserveTokens: maxOutput,
    availableContextTokens,
    reason: `上下文可容纳：输入 ${estimatedInputTokens} / 可用 ${availableContextTokens}${windowDeclared ? '' : '（未声明窗口，按保守值处理）'}`,
  }
}

function readPromptTokens(usage: unknown): number | undefined {
  if (!usage || typeof usage !== 'object') return undefined
  const record = usage as Record<string, unknown>
  const raw = record.prompt_tokens ?? record.input_tokens ?? record.promptTokens ?? record.inputTokens
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined
}

export function buildUsageReconciliation(input: {
  estimatedInputTokens: number
  usage?: unknown
}): UsageReconciliation {
  const actualInputTokens = readPromptTokens(input.usage)
  if (actualInputTokens == null) {
    return {
      status: 'unavailable',
      estimatedInputTokens: input.estimatedInputTokens,
    }
  }
  const correctedRatio = input.estimatedInputTokens > 0 ? actualInputTokens / input.estimatedInputTokens : 1
  const driftRatio = correctedRatio - 1
  return {
    status: 'available',
    estimatedInputTokens: input.estimatedInputTokens,
    actualInputTokens,
    driftRatio,
    correctedRatio,
  }
}
