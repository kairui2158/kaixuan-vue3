import { buildVolumeOutlineScaffold } from './volumeGeneration'

export interface ChainPromptInput {
  initialPrompt: string
  previousOutput: string
  memoryPrompt?: string
  isFirst: boolean
  templateOwnsPreviousOutput?: boolean
  delivery?: 'template_variable' | 'context_block' | 'inline_block'
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
  reason: 'primary_consumer' | 'declared_full_context' | 'outline_block_absent' | 'slimmed'
}

export interface BodyContractStepInput {
  step: number
  stepIndex: number
  totalSteps: number
  declaredRole?: string | null
}

export const MEMORY_PROMPT_HEADER = "[相关记忆]"
const PREVIOUS_OUTPUT_HEADER = "--- 上一步 SKILL 完整输出 ---"
const OUTLINE_HEADER = "[大纲]"
const OUTLINE_END_HEADERS = ["[设定]", "[绑定设定]", "[卷数]"]

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
  const memoryPrompt = input.memoryPrompt && !prompt.includes(MEMORY_PROMPT_HEADER)
    ? input.memoryPrompt
    : ""
  return prompt + memoryPrompt
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
  if (input.requiresFullUpstream) {
    return { ...result, reason: 'declared_full_context' }
  }

  const headerStart = prompt.indexOf(OUTLINE_HEADER)
  if (headerStart < 0) return { ...result, reason: 'outline_block_absent' }
  const contentStart = headerStart + OUTLINE_HEADER.length
  let end = -1
  for (const nextHeader of OUTLINE_END_HEADERS) {
    const index = prompt.indexOf(nextHeader, contentStart)
    if (index >= 0 && (end < 0 || index < end)) end = index
  }
  if (end < 0) return { ...result, reason: 'outline_block_absent' }
  const outline = prompt.slice(contentStart, end).trim()
  result.outlineLength = outline.length
  if (!outline) return { ...result, reason: 'outline_block_absent' }

  const scaffold = buildVolumeOutlineScaffold(outline)
  const replaced = prompt.slice(0, headerStart) + OUTLINE_HEADER + '\n' + scaffold + prompt.slice(end)
  return {
    prompt: replaced,
    slimmed: true,
    originalLength: prompt.length,
    outlineLength: outline.length,
    reason: 'slimmed',
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
 * Body length contracts belong to the prose-generation step, not every chain
 * step. The legacy 3-skill chain is analysis -> generation -> polish; until
 * folder SKILL meta can declare `chainHandoff.role`, the penultimate step is
 * the deterministic application-side selector.
 */
export function isBodyContractStep(input: BodyContractStepInput): boolean {
  if (input.step !== 4 || input.totalSteps <= 1) return false
  if (input.declaredRole === 'generator' || input.declaredRole === 'polish') {
    return input.declaredRole === 'generator'
  }
  return input.stepIndex === input.totalSteps - 2
}
