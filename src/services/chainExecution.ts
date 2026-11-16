import { buildVolumeOutlineScaffold } from './volumeGeneration'
import { parseGenerationResult } from './generationResult'
import {
  locatePromptBlock,
  FULL_OUTLINE_BLOCK_END_HEADERS,
  FULL_OUTLINE_BLOCK_HEADERS,
} from './promptBlockProtocol'

export interface ChainPromptInput {
  initialPrompt: string
  previousOutput: string
  memoryPrompt?: string
  isFirst: boolean
  templateOwnsPreviousOutput?: boolean
  delivery?: 'template_variable' | 'context_block' | 'inline_block'
  upstreamMetadata?: Record<string, unknown> | null
  metadataMode?: 'summary' | 'final_step_ledger'
  chainStepMark?: string
}

export interface ChainUpstreamPromptInput {
  prompt: string
  isPrimaryConsumer: boolean
  requiresFullUpstream?: boolean
}

export interface ChainUpstreamPromptResult {
  prompt: string
  slimmed: boolean
  originalLength: number
  outlineLength: number
  scaffoldCandidateLength?: number
  reason:
    | 'primary_consumer'
    | 'declared_full_context_slimmed'
    | 'scaffold_not_smaller'
    | 'declared_full_context_no_outline'
    | 'outline_block_absent'
    | 'slimmed'
}

export interface BodyContractStepInput {
  step: number
  stepIndex: number
  totalSteps: number
  declaredRole?: string | null
}

/** The prose word contract belongs to the generator step, not the base package. */
export function bodyGeneratorContractSentence(targetWords: unknown): string {
  if (!Number(targetWords)) return ''
  const { targetWords: target, minWords: min, maxWords: max } = resolveProseWordContract({ targetWords })
  return `请生成本章节正文，目标约${target}净字数（不低于${min}字，不超过${max}字）。输出现役 LHC JSON 信封：正文本体放进 body；交接账本放进 metadata.extractedMeta[0]。`
}

export const MEMORY_PROMPT_HEADER = "[相关记忆]"
const PREVIOUS_OUTPUT_HEADER = "--- 上一步 SKILL 完整输出 ---"
const UPSTREAM_METADATA_HEADER = "--- 上一步结构化交接 ---"
const FINAL_STEP_METADATA_HEADER = "--- 上一步结构化交接（终步账本） ---"
const UPSTREAM_METADATA_MARKER = /【(?:来源覆盖|状态变化|交接清单|交接状态|正文交接|输出末尾元数据)】/g

export function formatMemoryPrompt(memoryContext: unknown): string {
  const text = memoryContext == null ? "" : String(memoryContext).trim()
  return text ? "\n\n" + MEMORY_PROMPT_HEADER + "\n" + text : ""
}

/** Appends memory once; callers that already embed it (body step) keep their original block. */
export function appendMemoryPromptOnce(prompt: string, memoryContext: unknown): string {
  if (!prompt || !prompt.includes(MEMORY_PROMPT_HEADER)) {
    return prompt + formatMemoryPrompt(memoryContext)
  }
  return prompt
}

/**
 * Removes whole blocks a prior chain step echoed back: the memory block and
 * previous-output headers. The next step re-injects the canonical versions, so
 * keeping them in `previousOutput` makes the same bytes appear twice.
 */
export function dedupeChainIntermediateOutput(output: string): string {
  let text = output || ''
  let changed = true
  while (changed) {
    changed = false
    const memoryStart = text.indexOf(MEMORY_PROMPT_HEADER)
    const previousStart = text.indexOf(PREVIOUS_OUTPUT_HEADER)
    const starts = [memoryStart, previousStart].filter(index => index >= 0)
    if (!starts.length) break
    const start = Math.min(...starts)
    const headerLength = start === memoryStart ? MEMORY_PROMPT_HEADER.length : PREVIOUS_OUTPUT_HEADER.length
    const nextMemory = text.indexOf(MEMORY_PROMPT_HEADER, start + headerLength)
    const nextPrevious = text.indexOf(PREVIOUS_OUTPUT_HEADER, start + headerLength)
    const boundary = [nextMemory, nextPrevious].filter(index => index >= 0).sort((a, b) => a - b)[0]
    text = boundary > start
      ? text.slice(0, start) + text.slice(boundary)
      : text.slice(0, start)
    changed = true
  }
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

/** Builds the user message passed to one chain skill. */
export function buildChainSkillPrompt(input: ChainPromptInput): string {
  if (input.isFirst) return input.initialPrompt
  const chainStepMark = input.chainStepMark || ''
  if (chainStepMark && input.initialPrompt && !input.initialPrompt.includes(chainStepMark)) {
    return chainStepMark + '\n\n' + buildChainSkillPrompt({ ...input, chainStepMark: undefined })
  }
  const delivery = input.delivery ||
    (input.templateOwnsPreviousOutput ? 'template_variable' : 'context_block')
  const ownerNote = delivery === 'template_variable'
    ? "当前 SKILL 模板已引用上一步输出；请勿在回复中复述该输入。"
    : delivery === 'inline_block'
      ? "上一步输出在下方独立块中提供。"
    : "上一步输出由上下文块单独提供。"
  let prompt = input.initialPrompt + "\n\n"
    + "请基于单独提供的“上一步 SKILL 完整输出”执行当前 SKILL，只输出当前步骤的定稿产物。\n"
    + "不要原样回显、概括或拼接上一步输出；如需引用，只保留当前步骤必需的最小片段。\n"
    + ownerNote
  const previousOutput = dedupeChainIntermediateOutput(input.previousOutput)
  if (delivery === 'inline_block' && previousOutput) {
    prompt += `\n\n${PREVIOUS_OUTPUT_HEADER}\n${previousOutput}`
  }
  const upstreamMetadata = formatUpstreamMetadata(input.upstreamMetadata, input.metadataMode)
  if (upstreamMetadata) {
    const header = input.metadataMode === 'final_step_ledger'
      ? FINAL_STEP_METADATA_HEADER
      : UPSTREAM_METADATA_HEADER
    prompt += `\n\n${header}\n${upstreamMetadata}`
  }
  const memoryPrompt = input.memoryPrompt && !prompt.includes(MEMORY_PROMPT_HEADER)
    ? input.memoryPrompt
    : ""
  return prompt + memoryPrompt
}

export function formatUpstreamMetadata(
  metadata: Record<string, unknown> | null | undefined,
  mode: 'summary' | 'final_step_ledger' = 'summary'
): string {
  const entries = Object.entries(metadata || {}).filter(([, value]) =>
    value !== undefined && value !== null && String(value).trim() !== ''
  )
  if (!entries.length) return ''
  if (mode === 'final_step_ledger') return formatFinalStepLedger(entries)
  return entries.slice(0, 16).map(([key, value]) => {
    return `- ${key}: ${summarizeUpstreamMetadataValue(key, value)}`
  }).join('\n')
}

const FINAL_STEP_LEDGER_SECTION_LIMIT = 4000
const FINAL_STEP_LEDGER_TOTAL_LIMIT = 12000

function formatFinalStepLedger(entries: Array<[string, unknown]>): string {
  const lines: string[] = []
  let total = 0
  let truncatedSections = 0
  let truncatedChars = 0
  for (const [key, value] of entries.slice(0, 16)) {
    if (total >= FINAL_STEP_LEDGER_TOTAL_LIMIT) break
    let text: string
    if (key === 'extractedMeta' && Array.isArray(value)) {
      text = value.map(item => sanitizeFinalStepLedgerText(item)).filter(Boolean)
        .map((item, index) => formatFinalStepExtractedMeta(item, index))
        .join('\n')
    } else {
      text = `- ${key}: ${sanitizeFinalStepLedgerText(value)}`
    }
    if (!text) continue
    if (text.length > FINAL_STEP_LEDGER_SECTION_LIMIT) {
      truncatedSections += 1
      truncatedChars += text.length - FINAL_STEP_LEDGER_SECTION_LIMIT
      text = text.slice(0, FINAL_STEP_LEDGER_SECTION_LIMIT)
    }
    const remaining = FINAL_STEP_LEDGER_TOTAL_LIMIT - total
    if (text.length > remaining) {
      truncatedSections += 1
      truncatedChars += text.length - remaining
      text = text.slice(0, remaining)
    }
    lines.push(text)
    total += text.length
  }
  const suffix = truncatedSections
    ? `\nledger_limit: truncated=true,truncatedSections=${truncatedSections},truncatedChars=${truncatedChars}`
    : ''
  return lines.join('\n') + suffix
}

function formatFinalStepExtractedMeta(item: string, index: number): string {
  const body = /(?:^|\n)\s*【正文交接】\s*(?:\n|$)/.test(item)
    ? item
      .replace(/(?:^|\n)\s*【正文交接】\s*(?=\n)/, '\n')
      .replace(/\n\s*【正文交接结束】\s*(?:\n|$)/, '\n')
      .trim()
    : item.trim()
  return `【正文交接】\nextractedMeta[${index}]\n${body}\n【正文交接结束】`
}

function sanitizeFinalStepLedgerText(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function summarizeUpstreamMetadataValue(key: string, value: unknown): string {
  if (key === 'extractedMeta' && Array.isArray(value)) {
    const totalChars = value.reduce((sum, item) => sum + String(item ?? '').length, 0)
    return `count=${value.length},totalChars=${totalChars}`
  }
  if (Array.isArray(value)) {
    if (!value.length) return 'count=0'
    const preview = value.slice(0, 8)
      .map(item => sanitizeUpstreamMetadataText(item))
      .filter(Boolean)
      .join(', ')
    return `count=${value.length}${preview ? `,preview=${preview}` : ''}`
  }
  if (value && typeof value === 'object') {
    return `fields=${Object.keys(value as Record<string, unknown>).length}`
  }
  return sanitizeUpstreamMetadataText(value)
}

function sanitizeUpstreamMetadataText(value: unknown): string {
  const text = String(value ?? '')
    .replace(UPSTREAM_METADATA_MARKER, '[metadata-section]')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 160 ? `${text.slice(0, 157)}...` : text
}

/**
 * Deterministic upstream-context slimming for chain steps.
 *
 * The first executed step (including breakpoint resume) is the primary
 * consumer and always receives the original prompt. Later steps receive the
 * outline structure scaffold instead of the outline full text unless the
 * skill explicitly declares that it requires the full upstream context.
 */
export function slimChainUpstreamPrompt(input: ChainUpstreamPromptInput): ChainUpstreamPromptResult {
  const prompt = input.prompt || ''
  const result = {
    prompt,
    slimmed: false,
    originalLength: prompt.length,
    outlineLength: 0,
    reason: 'primary_consumer' as const,
  }
  if (!prompt) return result
  if (input.isPrimaryConsumer) return result
  const block = locatePromptBlock(prompt, FULL_OUTLINE_BLOCK_HEADERS, FULL_OUTLINE_BLOCK_END_HEADERS)
  const noOutlineReason = input.requiresFullUpstream
    ? 'declared_full_context_no_outline'
    : 'outline_block_absent'
  if (!block) return { ...result, reason: noOutlineReason }
  if (!block.content) {
    return { ...result, reason: noOutlineReason }
  }

  const scaffold = buildVolumeOutlineScaffold(block.content)
  const scaffoldPrompt =
    prompt.slice(0, block.start) + block.header + '\n' + scaffold + prompt.slice(block.end)
  if (scaffoldPrompt.length >= prompt.length) {
    return {
      prompt,
      slimmed: false,
      originalLength: prompt.length,
      outlineLength: block.content.length,
      reason: 'scaffold_not_smaller',
      scaffoldCandidateLength: scaffoldPrompt.length,
    }
  }
  return {
    prompt: scaffoldPrompt,
    slimmed: true,
    originalLength: prompt.length,
    outlineLength: block.content.length,
    reason: input.requiresFullUpstream ? 'declared_full_context_slimmed' : 'slimmed',
  }
}

/** Whether a resolved template already consumes the previous chain output. */
export function templateReferencesPreviousOutput(template: string): boolean {
  return /\{\{\s*(?:previousOutput|prevResponse|previousSkillOutput)\s*\}\}/
    .test(template || '')
}

export interface ChainEchoDiagnostic {
  code: 'chain-output-echo'
  level: 'warning'
  message: string
  echoRatio: number
  previousLength: number
}

/** Heuristic echo detector for SKILL debugging; never blocks generation. */
export function detectChainOutputEcho(
  previousOutput: string | undefined,
  output: string,
): ChainEchoDiagnostic | null {
  const previous = (previousOutput || '').trim()
  const current = (output || '').trim()
  if (previous.length < 200 || current.length < 200) return null
  const normalizedPrevious = normalizeChainText(previous)
  const normalizedCurrent = normalizeChainText(current)
  if (!normalizedPrevious) return null
  let best = 0
  for (let index = 0; index + 160 <= normalizedCurrent.length; index += 80) {
    const window = normalizedCurrent.slice(index, index + 160)
    if (normalizedPrevious.includes(window)) best = Math.max(best, 1)
    if (best) break
  }
  if (!best) return null
  const overlap = countChainOverlap(normalizedPrevious, normalizedCurrent)
  const echoRatio = overlap / Math.max(1, normalizedCurrent.length)
  if (echoRatio < 0.25) return null
  return {
    code: 'chain-output-echo',
    level: 'warning',
    message: `当前步骤输出与上一步输入有约 ${Math.round(echoRatio * 100)}% 重叠，可能正在滚雪球；请让 SKILL 只输出本步骤定稿产物。`,
    echoRatio,
    previousLength: previous.length,
  }
}

/** Repair is reserved for the final chain step; intermediate steps only warn. */
export function shouldRepairChainEcho(
  stepIndex: number,
  totalSteps: number,
  echoRatio: number,
  options?: {
    finalStepRole?: 'polish' | 'generator'
    identicalOutput?: boolean
  }
): boolean {
  if (totalSteps <= 1) return false
  if (stepIndex !== totalSteps - 1) return false
  if (options?.identicalOutput) return true
  if (options?.finalStepRole === 'polish') return false
  return Number.isFinite(echoRatio) && echoRatio >= 0.85
}

export function getChainEchoWarningLevel(
  stepIndex: number,
  totalSteps: number,
  options?: {
    finalStepRole?: 'polish' | 'generator'
  }
): 'warning' | 'info' | null {
  if (totalSteps <= 1 || stepIndex < 0 || stepIndex >= totalSteps) return null
  if (stepIndex !== totalSteps - 1) return 'warning'
  return options?.finalStepRole === 'generator' ? 'warning' : 'info'
}

function normalizeChainText(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

function countChainOverlap(previous: string, current: string): number {
  const chunkSize = 80
  const chunks = Math.ceil(current.length / chunkSize)
  let overlap = 0
  for (let index = 0; index < chunks; index += 1) {
    const chunk = current.slice(index * chunkSize, (index + 1) * chunkSize)
    if (chunk && previous.includes(chunk)) overlap += chunk.length
  }
  return overlap
}


export function buildChainSkillSequence<T>(skills: T[]): T[] {
  return skills.slice()
}

/**
 * Structural gate for resuming a body chain at or after its generator step.
 * This checks delivery shape only: quality remains owned by SKILL verdicts.
 */
export function isGeneratorEnvelopeArtifact(output: string): boolean {
  const trimmed = String(output || '').trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  let envelope: unknown
  try {
    envelope = JSON.parse(candidate)
  } catch {
    return false
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return false
  const parsed = parseGenerationResult(output)
  return parsed.body.trim().length > 0 &&
    Array.isArray(parsed.metadata.extractedMeta) &&
    parsed.metadata.extractedMeta.length > 0
}

/**
 * Body length contracts belong to the prose-generation step, not every chain
 * step. The legacy 3-skill chain is analysis -> generation -> polish; until
 * folder SKILL meta can declare `chainHandoff.role`, the penultimate step is
 * the deterministic application-side selector.
 */
export function isBodyContractStep(input: BodyContractStepInput): boolean {
  if (input.step !== 4 || input.totalSteps <= 1) return false
  if (input.declaredRole) {
    return input.declaredRole === 'generator'
  }
  return input.stepIndex === input.totalSteps - 2
}

export type FinalStepRoleResolution =
  | { role: 'polish'; mode: 'final_step_ledger'; reason: 'declared' | 'inferred'; generatorStepIndex: number }
  | { role: 'generator'; mode: 'summary'; reason: 'declared'; generatorStepIndex: number }
  | { role: null; mode: 'summary'; reason: 'unresolved'; generatorStepIndex: number | null }

export function resolveFinalStepEchoRole(
  resolution: FinalStepRoleResolution | null | undefined
): 'polish' | 'generator' | null {
  return resolution?.role ?? null
}

/**
 * Terminal-step role is a chain-level fact, not a per-template guess. Explicit
 * declarations win; otherwise the final step is polish only when the chain has
 * exactly one distinct generator step before it.
 */
export function resolveFinalStepRole(input: {
  step: number
  stepIndex: number
  totalSteps: number
  declaredRole: string | null
  generatorStepIndexes: number[]
}): FinalStepRoleResolution {
  const normalized = input.declaredRole?.trim() || null
  const distinctGeneratorIndexes = Array.from(new Set(input.generatorStepIndexes))

  if (input.step !== 4 || input.totalSteps <= 1 || input.stepIndex !== input.totalSteps - 1) {
    return { role: null, mode: 'summary', reason: 'unresolved', generatorStepIndex: null }
  }
  if (normalized === 'generator') {
    return { role: 'generator', mode: 'summary', reason: 'declared', generatorStepIndex: input.stepIndex }
  }
  if (normalized === 'polish') {
    return { role: 'polish', mode: 'final_step_ledger', reason: 'declared', generatorStepIndex: distinctGeneratorIndexes[0] ?? null }
  }
  if (distinctGeneratorIndexes.length === 1 && distinctGeneratorIndexes[0] < input.stepIndex) {
    return {
      role: 'polish',
      mode: 'final_step_ledger',
      reason: 'inferred',
      generatorStepIndex: distinctGeneratorIndexes[0]
    }
  }
  return { role: null, mode: 'summary', reason: 'unresolved', generatorStepIndex: distinctGeneratorIndexes.length === 1 ? distinctGeneratorIndexes[0] : null }
}

export type ResolvedBodyGeneratorStep = {
  index: number | null
  role: 'generator' | null
  source: 'meta' | 'fallback' | 'compose' | 'previous_state' | 'unresolved'
}

type BodyGeneratorTemplateLike = {
  id?: string
  skill?: { meta?: unknown } | null
  meta?: unknown
}

/**
 * Single source for "which chain step owns the body contract". Folder meta
 * declaration wins; otherwise the deterministic penultimate-step selector from
 * the legacy 3-skill chain applies. Chains with 2 or fewer steps have no
 * safe inference and stay unresolved so callers can surface a configuration
 * error instead of guessing.
 */
export function resolveBodyGeneratorStepIndex(
  templates: BodyGeneratorTemplateLike[]
): ResolvedBodyGeneratorStep {
  const totalSteps = templates.length
  const declaredIndex = templates.findIndex(template => {
    const skillMeta = template.skill?.meta
    const meta = (skillMeta && typeof skillMeta === 'object' ? skillMeta : null)
      || (template.meta && typeof template.meta === 'object' ? template.meta : null)
    const role = (meta as { chainHandoff?: { role?: unknown } } | null)?.chainHandoff?.role
    return role === 'generator'
  })
  if (declaredIndex > 0) {
    return { index: declaredIndex, role: 'generator', source: 'meta' }
  }
  if (totalSteps > 2) {
    return { index: totalSteps - 2, role: 'generator', source: 'fallback' }
  }
  return { index: null, role: null, source: 'unresolved' }
}

/**
 * Restores the per-run generator index at every attempt start. The per-attempt
 * state clear must never erase the chain-level fact; the previous value is
 * trusted only when it still matches the resolved chain truth.
 */
export function resolveAttemptStartGeneratorIndex(input: {
  chainTotalSteps?: number
  composeArtifactActive: boolean
  previousState: number | null
  templates?: BodyGeneratorTemplateLike[]
}): ResolvedBodyGeneratorStep {
  if (input.composeArtifactActive) {
    return { index: 0, role: 'generator', source: 'compose' }
  }
  const resolvedTemplates = input.templates ?? Array.from(
    { length: Math.max(0, input.chainTotalSteps ?? 0) },
    (_, i) => ({ id: `step-${i}` })
  )
  const resolved = resolveBodyGeneratorStepIndex(resolvedTemplates)
  if (resolved.index !== null && input.previousState !== null && input.previousState === resolved.index) {
    return { ...resolved, source: 'previous_state' }
  }
  return resolved
}

/**
 * Backward-compatible shape-only lookup for non-body callers. Body-chain
 * callers pass real templates so a declared folder role is never erased.
 */
export function resolveAttemptStartGeneratorIndexByShape(input: {
  chainTotalSteps: number
  composeArtifactActive: boolean
  previousState: number | null
}): ResolvedBodyGeneratorStep {
  const templates = Array.from(
    { length: Math.max(0, input.chainTotalSteps) },
    (_, i) => ({ id: `step-${i}` })
  )
  const resolved = resolveAttemptStartGeneratorIndex({ ...input, templates })
  return resolved.index === null ? resolved : { ...resolved, role: null }
}
import { resolveProseWordContract } from './proseWordContract'
