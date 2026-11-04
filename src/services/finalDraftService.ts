import { mergeContinuationText, type ContinuationSnapshot } from './continuation'
import type { AiService, CallAiParams, CallAiResult } from './aiService'
import type { LongDocumentExecutionOperation } from './longDocumentExecutionPlanner'
import { parseOutlineStructure } from './outlineStructure'
import {
  SKILL_GUIDANCE_PROTOCOL_GUARD,
  sanitizeSkillGuidance,
} from './skillGuidanceSanitizer'

const SEGMENT_SEAM_MAX_OVERLAP_CHARS = 8000
const SEGMENT_SEAM_MIN_OVERLAP_CHARS = 120
const DUPLICATE_BLOCK_CHARS = 320
const DUPLICATE_BLOCK_SMALL_CHARS = 160

export type FinalDraftStatus =
  | 'planning'
  | 'generating'
  | 'interrupted'
  | 'awaiting_continuation'
  | 'writing'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'canceled'

export type FinalDraftDestination = 'home-editor' | 'outline-editor'

interface FinalDraftHeadingBoundary {
  firstHeading: string | null
  lastHeading: string | null
}

export interface FinalDraftProtectedRange {
  start: number
  end: number
  reason: string
}

export interface FinalDraftTask {
  taskId: string
  destination: FinalDraftDestination
  targetId: string
  instruction: string
  /** Execution-plan operation. Legacy checkpoints without it keep the conservative gate. */
  operation?: LongDocumentExecutionOperation
  skillGuidance?: string
  constraints: string[]
  /** Style snapshot metadata; old tasks keep V1 semantics when absent. */
  styleProfileVersion?: 1 | 2
  protectedRanges: FinalDraftProtectedRange[]
  sourceContent: string
  sourceSegments: FinalDraftSourceSegment[]
  segmentOrder: string[]
  activeSegmentIndex: number
  completedText: string
  accumulatedText: string
  continuationCount: number
  status: FinalDraftStatus
  finishReason?: string
  error?: string
  documentVersionBeforeWrite?: number
  sourceContentHash: string
  createdAt: number
  updatedAt: number
  lastTelemetry?: {
    tenSecondCharsPerSecond: number
    sixtySecondCharsPerSecond: number
    throughputStatus: 'streaming_active' | 'streaming_slow' | 'stalled'
    estimatedRemainingMs: number | null
  }
  lastStreamActivityAt?: number
}

export interface FinalDraftSourceSegment {
  segmentId: string
  start: number
  end: number
}

export interface FinalDraftTaskView {
  taskId: string
  destination: FinalDraftDestination
  targetId: string
  status: FinalDraftStatus
  operation?: LongDocumentExecutionOperation
  activeSegmentIndex: number
  segmentCount: number
  continuationCount: number
  sourceChars: number
  completedChars: number
  accumulatedChars: number
  sourceContentHash: string
  error?: string
  finishReason?: string
  lastTelemetry?: FinalDraftTask['lastTelemetry']
  lastStreamActivityAt?: number
  createdAt: number
  updatedAt: number
}

/**
 * Persistent chat messages must never retain document-sized task fields. The
 * runner keeps the authoritative live task and checkpoints hold recovery data.
 */
export function toFinalDraftTaskView(task: FinalDraftTask): FinalDraftTaskView {
  return {
    taskId: task.taskId,
    destination: task.destination,
    targetId: task.targetId,
    status: task.status,
    operation: task.operation,
    activeSegmentIndex: task.activeSegmentIndex,
    segmentCount: task.sourceSegments.length,
    continuationCount: task.continuationCount,
    sourceChars: task.sourceContent.length,
    completedChars: task.completedText.length,
    accumulatedChars: task.accumulatedText.length,
    sourceContentHash: task.sourceContentHash,
    error: task.error,
    finishReason: task.finishReason,
    lastTelemetry: task.lastTelemetry,
    lastStreamActivityAt: task.lastStreamActivityAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

/**
 * Pinia stores FinalDraftTask values as reactive proxies, which structuredClone
 * cannot clone. Tasks are persisted as JSON, so a JSON snapshot is both stable
 * and safe for retry handoff before the live task is aborted.
 */
export function snapshotFinalDraftTask(task: FinalDraftTask | undefined): FinalDraftTask | undefined {
  if (!task) return undefined
  return JSON.parse(JSON.stringify(task)) as FinalDraftTask
}

export interface FinalDraftDocumentState {
  targetId: string
  content: string
  documentVersion: number
  contentHash: string
}

export interface FinalDraftWriteResult {
  targetId: string
  documentVersion: number
  contentHash: string
}

export interface FinalDraftEditorAdapter {
  getDocumentState(): FinalDraftDocumentState | Promise<FinalDraftDocumentState>
  /** Adapters must pin the target captured at task creation; never write the currently active tab. */
  writeDocument(content: string): Promise<FinalDraftWriteResult>
  restoreDocument(content: string): Promise<FinalDraftWriteResult>
}

export interface FinalDraftGenerationOptions {
  signal?: AbortSignal
  cancelSignal?: AbortSignal
  /** Optional app-provided SKILL guidance; task.skillGuidance remains authoritative once set. */
  skillGuidance?: string
  /** The runner owns live streamed text; it supplies the partial text here before an interruption is reduced. */
  onSlowStreamInterrupted?: (partialText: string) => string | void
  onChunk?: (text: string) => void
  onReasoning?: (text: string) => void
  onUsage?: (usage: unknown) => void
  onPhysicalCall?: CallAiParams['onPhysicalCall']
  onProviderQueue?: CallAiParams['onProviderQueue']
  onTaskChange?: (task: FinalDraftTask) => void
  onTaskEvent?: (task: FinalDraftTask, event: FinalDraftEvent) => void
  /** When true, a restored partial segment continues from accumulatedText instead of restarting. */
  resumePartialSegment?: boolean
  onProgress?: (event: {
    taskId: string
    phase: 'generating' | 'awaiting_continuation' | 'writing' | 'completed'
    accumulatedChars: number
    continuationCount: number
    streamingChars: number
    lastStreamActivityAt: number
    activeSegmentIndex: number
    telemetry?: {
      tenSecondCharsPerSecond: number
      sixtySecondCharsPerSecond: number
      throughputStatus: 'streaming_active' | 'streaming_slow' | 'stalled'
      estimatedRemainingMs: number | null
    }
  }) => void
}

export interface FinalDraftValidationIssue {
  code:
    | 'empty_draft'
    | 'unfinished_draft'
    | 'paragraph_structure_lost'
    | 'leaf_body_integrity_lost'
    | 'heading_boundary_lost'
    | 'duplicate_seam'
    | 'duplicate_block'
    | 'tool_protocol_residue'
    | 'json_fence_residue'
    | 'refusal_text'
  message: string
}

export interface FinalDraftValidationResult {
  valid: boolean
  issues: FinalDraftValidationIssue[]
}

export type FinalDraftEvent =
  | { type: 'generation_started'; now: number }
  | { type: 'generation_completed'; finishReason?: string; now: number }
  | { type: 'continuation_started'; now: number }
  | { type: 'segment_order_started'; now: number }
  | { type: 'segment_order_planned'; segmentOrder: string[]; fallback: boolean; now: number }
  | { type: 'segment_started'; segmentId: string; now: number }
  | { type: 'segment_retry_started'; segmentId: string; reason: string; now: number }
  | {
    type: 'heading_boundary_repaired'
    segmentId: string
    missingHeadings: string[]
    repairedHeadings: string[]
    bodyProofs: string[]
    now: number
  }
  | { type: 'segment_user_retry_started'; segmentId: string; reason: string; now: number }
  | { type: 'segment_completed'; segmentId: string; now: number }
  | { type: 'draft_deduplicated'; removedBlocks: number; removedChars: number; now: number }
  | { type: 'write_started'; now: number }
  | { type: 'write_succeeded'; documentVersion: number; contentHash: string; now: number }
  | { type: 'write_failed'; error: string; now: number }
  | { type: 'task_failed'; error: string; now: number }
  | { type: 'task_rolled_back'; reason: string; now: number }
  | { type: 'task_canceled'; reason: string; now: number }
  | { type: 'task_interrupted'; error: string; now: number }

const FINAL_DRAFT_SYSTEM_PROMPT = [
  '你是终稿生成器。你的唯一任务是输出完整终稿正文。',
  '禁止输出说明、开场白、总结、计划、JSON、工具调用或编辑命令。',
  '保留原文的有效内容、语义和结构信息，并执行用户的整理、重排、重写或清理要求。',
  '逐段处理源文：每个源文段落在终稿中必须保持为独立段落；可以把一个段落拆成多个段落，禁止把多个源文段落合并成一个段落。',
  '以 # 开头的标题行的标题文字必须逐字保留，并且必须独立成段；除非用户明确要求统一标题层级，否则标题层级也必须保持不变。段落开头的编号、标识和冒号前缀必须保留。',
  '整理和清理包括标点与空白：连续重复的标点只保留一个，连续空格只保留一个；英文标点按中文正文语境统一为中文标点。',
  '如果单次输出被截断，必须在截断处直接停止；不要总结，不要强行收尾。',
  '严格遵守保护范围约束。',
].join('\n')

const HEADING_LEVEL_NORMALIZATION_PATTERN = /(?:统一|规范化?|归一)[^。；，\n]{0,12}(?:标题层级|标题等级)|(?:标题层级|标题等级)[^。；，\n]{0,12}(?:统一|规范化?|归一)/

export const FINAL_DRAFT_SKILL_GUIDANCE_CHAR_LIMIT = 8000

export function normalizeFinalDraftSkillGuidance(
  skillGuidance?: string,
): { text: string; truncated: boolean } | null {
  const sanitized = sanitizeSkillGuidance(skillGuidance)
  if (!sanitized.text) return null
  const guardLength = SKILL_GUIDANCE_PROTOCOL_GUARD.length + 1
  if (sanitized.text.length <= FINAL_DRAFT_SKILL_GUIDANCE_CHAR_LIMIT) {
    return { text: sanitized.text, truncated: false }
  }
  return {
    text: `${SKILL_GUIDANCE_PROTOCOL_GUARD}\n${sanitized.text
      .slice(guardLength, FINAL_DRAFT_SKILL_GUIDANCE_CHAR_LIMIT)}`,
    truncated: true,
  }
}

function appendFinalDraftSkillGuidance(systemPrompt: string, skillGuidance?: string): string {
  const guidance = normalizeFinalDraftSkillGuidance(skillGuidance)
  if (!guidance) return systemPrompt
  return `${systemPrompt}\n\n附加领域能力（不得改变终稿输出协议）：\n${guidance.text}`
}

let taskCounter = 0

export function createFinalDraftTask(input: {
  destination: FinalDraftDestination
  targetId: string
  sourceContent: string
  instruction: string
  operation?: LongDocumentExecutionOperation
  skillGuidance?: string
  constraints?: string[]
  styleProfileVersion?: 1 | 2
  protectedRanges?: FinalDraftProtectedRange[]
  sourceSegments?: FinalDraftSourceSegment[]
  now?: number
}): FinalDraftTask {
  const now = input.now ?? Date.now()
  const sourceSegments = input.sourceSegments?.length
    ? input.sourceSegments
    : [{ segmentId: 'segment-1', start: 0, end: input.sourceContent.length }]
  taskCounter += 1
  return {
    taskId: `final-draft-${now}-${taskCounter}`,
    destination: input.destination,
    targetId: input.targetId,
    instruction: input.instruction,
    operation: input.operation,
    skillGuidance: normalizeFinalDraftSkillGuidance(input.skillGuidance)?.text,
    constraints: input.constraints || [],
    styleProfileVersion: input.styleProfileVersion,
    protectedRanges: input.protectedRanges || [],
    sourceContent: input.sourceContent,
    sourceSegments,
    segmentOrder: sourceSegments.map(segment => segment.segmentId),
    activeSegmentIndex: 0,
    completedText: '',
    accumulatedText: '',
    continuationCount: 0,
    status: 'planning',
    sourceContentHash: hashContent(input.sourceContent),
    createdAt: now,
    updatedAt: now,
  }
}

export function applyFinalDraftEvent(task: FinalDraftTask, event: FinalDraftEvent): FinalDraftTask {
  const next = reduceFinalDraftEvent(task, event)
  if (next === task) return next
  return { ...next, updatedAt: event.now }
}

export function applyFinalDraftEventWithHooks(
  task: FinalDraftTask,
  event: FinalDraftEvent,
  hooks?: Pick<FinalDraftGenerationOptions, 'onTaskChange' | 'onTaskEvent'>,
): FinalDraftTask {
  const next = applyFinalDraftEvent(task, event)
  if (next !== task) hooks?.onTaskEvent?.(next, event)
  return next
}

export function buildFinalDraftMessages(options: {
  sourceContent: string
  instruction: string
  skillGuidance?: string
  constraints?: string[]
  protectedRanges?: FinalDraftProtectedRange[]
}): CallAiParams['messages'] {
  const constraints = [...(options.constraints || [])]
  if (options.protectedRanges?.length) {
    constraints.push(
      `保护范围（必须保留原样，禁止改写）：${
        options.protectedRanges
          .map(range => `${range.start}-${range.end}（${range.reason}）`)
          .join('；')
      }`,
    )
  }
  const constraintText = constraints.length ? `\n\n硬约束：\n${constraints.map(item => `- ${item}`).join('\n')}` : ''
  return [
    { role: 'system', content: appendFinalDraftSkillGuidance(FINAL_DRAFT_SYSTEM_PROMPT, options.skillGuidance) },
    {
      role: 'user',
      content: `终稿要求：${options.instruction}${constraintText}\n\n源文档：\n${options.sourceContent}`,
    },
  ]
}

export function buildFinalDraftSegmentMessages(
  task: FinalDraftTask,
  segment: FinalDraftSourceSegment,
  options: { tailContextChars?: number; structureRetry?: boolean; skillGuidance?: string } = {},
): CallAiParams['messages'] {
  const segmentContent = task.sourceContent.slice(segment.start, segment.end)
  const sourceBlockCount = countFinalDraftBlocks(segmentContent)
  const boundary = segmentHeadingBoundary(segmentContent)
  const boundaryText = boundary.firstHeading || boundary.lastHeading
    ? `\n\n本段标题边界：本段源文从“${boundary.firstHeading || '（无标题）'}”开始，到“${boundary.lastHeading || '（无标题）'}”结束。只允许输出本段源文包含的标题；衔接尾巴和其他分段中的标题一律禁止输出。`
    : ''
  const previousTail = task.completedText
    ? `\n\n已生成终稿的结尾（只用于衔接，不要重复）：\n${task.completedText.slice(-(options.tailContextChars ?? 6000))}`
    : ''
  const segmentMap = task.sourceSegments.length > 1
    ? `\n\n本次分段地图（按终稿顺序）：\n${task.segmentOrder
      .map((segmentId, index) => {
        const source = task.sourceSegments.find(item => item.segmentId === segmentId)
        return `${index + 1}. ${segmentId}（源文 ${source?.start ?? 0}-${source?.end ?? 0}）`
      })
      .join('\n')}`
    : ''
  const constraints = [...(task.constraints || [])]
  if (options.structureRetry) {
    constraints.push('结构重试：上一次输出丢失了标题行或段落结构。每个源文标题的标题文字必须逐字保留并独立成段；除非用户明确要求统一标题层级，否则标题层级也必须保持不变。每个段落开头的编号、标识和冒号前缀必须保留。')
  }
  const protectedRanges = protectedRangesForSegment(task, segment)
  if (protectedRanges.length) {
    constraints.push(
      `保护范围（必须保留原样，禁止改写）：${
        protectedRanges.map(range => `${range.start}-${range.end}（${range.reason}）`).join('；')
      }`,
    )
  }
  const constraintText = constraints.length ? `\n\n硬约束：\n${constraints.map(item => `- ${item}`).join('\n')}` : ''
  return [
    { role: 'system', content: appendFinalDraftSkillGuidance(FINAL_DRAFT_SYSTEM_PROMPT, options.skillGuidance) },
    {
      role: 'user',
      content: `终稿要求：${task.instruction}${constraintText}${segmentMap}${previousTail}${boundaryText}\n\n本次需要生成终稿的源文分段：\n${segmentContent}\n\n段落结构硬约束：本段源文共有 ${sourceBlockCount} 个段落。终稿至少输出 ${sourceBlockCount} 个段落；每个源文段落对应至少一个终稿段落，段落之间必须使用空行分隔，禁止把多个源文段落合并成一个段落。以 # 开头的标题行的标题文字必须逐字保留，并且必须独立成段；除非用户明确要求统一标题层级，否则标题层级也必须保持不变。每个段落开头的编号、标识和冒号前缀必须保留。`,
    },
  ]
}

export function buildFinalDraftContinuationMessages(
  task: FinalDraftTask,
  maxContextChars = 12000,
  skillGuidance?: string,
): CallAiParams['messages'] {
  const segment = activeSourceSegment(task)
  const recent = task.accumulatedText.slice(-maxContextChars)
  return [
    ...buildFinalDraftSegmentMessages(task, segment, { skillGuidance }),
    { role: 'assistant', content: recent },
    {
      role: 'user',
      content: '请从上次输出中断的位置继续生成终稿正文。不要重复已输出内容，不要总结，不要收尾，只输出后续正文。',
    },
  ]
}

export function validateFinalDraft(
  text: string,
  options: {
    finishReason?: string
    acceptTruncated?: boolean
    sourceContent?: string
    operation?: LongDocumentExecutionOperation
    instruction?: string
  } = {},
): FinalDraftValidationResult {
  const issues: FinalDraftValidationIssue[] = []
  const draft = text.trim()
  if (!draft) {
    issues.push({ code: 'empty_draft', message: '终稿为空，未执行写入。' })
  }
  if (options.finishReason === 'length' && !options.acceptTruncated) {
    issues.push({ code: 'unfinished_draft', message: '终稿仍处于截断状态，未执行写入。' })
  }
  const authorizedRewrite = options.operation === 'rewrite_segments'
    || options.operation === 'restructure'
    || options.operation === 'restructure_and_cleanup'
  const authorizedDeletion = options.operation === 'deduplicate'
    || options.operation === 'deduplicate_and_normalize'
  const authorizedHeadingLevelChange = authorizedRewrite
    && !authorizedDeletion
    && HEADING_LEVEL_NORMALIZATION_PATTERN.test(options.instruction || '')
  if (
    !authorizedRewrite && !authorizedDeletion &&
    options.sourceContent !== undefined &&
    countFinalDraftBlocks(text) < countFinalDraftBlocks(options.sourceContent)
  ) {
    const draftBlocks = countFinalDraftBlocks(text)
    const sourceBlocks = countFinalDraftBlocks(options.sourceContent)
    issues.push({
      code: 'paragraph_structure_lost',
      message: `终稿段落数量少于源文，疑似发生段落合并，未执行写入。（终稿 ${draftBlocks} 段 / 源文 ${sourceBlocks} 段）`,
    })
  }
  if (findDuplicatedSeam(text)) {
    issues.push({ code: 'duplicate_seam', message: '续写接缝存在大段重复，未执行写入。' })
  }
  if (hasDuplicatedBlock(text)) {
    issues.push({ code: 'duplicate_block', message: '终稿中部存在大段重复，未执行写入。' })
  }
  if (options.sourceContent !== undefined && hasMarkdownHeadings(options.sourceContent)) {
    const headingDifference = summarizeFinalDraftHeadingDifference(text, options.sourceContent, {
      allowHeadingLevelChange: authorizedHeadingLevelChange,
      allowDuplicateHeadingRemoval: authorizedDeletion,
    })
    const headingBoundaryLost = authorizedRewrite
      ? headingDifference.missingCount > 0
      : headingDifference.missingCount > 0 || headingDifference.addedCount > 0
    if (headingBoundaryLost) {
      issues.push({
        code: 'heading_boundary_lost',
        message: `终稿标题边界校验失败，未执行写入。（${headingDifference.summary}）`,
      })
    }
  }
  if (
    !authorizedRewrite
    && options.sourceContent !== undefined
    && hasMarkdownHeadings(options.sourceContent)
    && summarizeFinalDraftLeafBodyDifference(text, options.sourceContent, options.operation).length > 0
  ) {
    const summary = summarizeFinalDraftLeafBodyDifference(text, options.sourceContent, options.operation)
    issues.push({
      code: 'leaf_body_integrity_lost',
      message: `终稿叶子正文完整性校验失败，未执行写入。（${summary}）`,
    })
  }
  if (/(?:<tool_call>|<\/?tool_call>|```json\s|```json$)/i.test(draft)) {
    issues.push({ code: 'tool_protocol_residue', message: '终稿包含工具协议残留，未执行写入。' })
  }
  if (/^```(?:markdown|text)?\s*[\r\n]/i.test(draft)) {
    issues.push({ code: 'json_fence_residue', message: '终稿包含代码围栏残留，未执行写入。' })
  }
  if (containsFinalDraftRefusal(draft)) {
    issues.push({ code: 'refusal_text', message: '终稿包含模型拒绝或说明文本，未执行写入。' })
  }
  return { valid: issues.length === 0, issues }
}

function containsFinalDraftRefusal(text: string): boolean {
  const pattern = /(?:我无法|无法完成|作为AI|很抱歉|没有收到需要整理的源文内容|无法生成终稿)/
  if (pattern.test(text)) return true
  // A long draft can preserve narrative dialogue while still appending a short
  // meta-refusal block. Only short standalone blocks are treated as refusals.
  return text
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .some(block => block.length > 0 && block.length <= 200 && pattern.test(block))
}

function countFinalDraftBlocks(text: string): number {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean).length
}

function segmentHeadingBoundary(segmentContent: string): FinalDraftHeadingBoundary {
  const headings = segmentContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^#{1,6}\s+/.test(line))
  return {
    firstHeading: headings[0] ?? null,
    lastHeading: headings.length ? headings[headings.length - 1] : null,
  }
}

function hasMarkdownHeadings(text: string): boolean {
  return /^#{1,6}\s+/m.test(String(text || ''))
}

function headingMultiset(text: string): string[] {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^#{1,6}\s+/.test(line))
}

function headingIdentity(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').trim()
}

function summarizeFinalDraftHeadingDifference(
  draft: string,
  source: string,
  options: { allowHeadingLevelChange?: boolean; allowDuplicateHeadingRemoval?: boolean } = {},
): {
  summary: string
  missingCount: number
  addedCount: number
  missingHeadings: string[]
  addedHeadings: string[]
} {
  const expected = new Map<string, number>()
  for (const heading of headingMultiset(source)) {
    const key = options.allowHeadingLevelChange ? headingIdentity(heading) : heading
    expected.set(key, (expected.get(key) || 0) + 1)
  }
  const actual = new Map<string, number>()
  for (const heading of headingMultiset(draft)) {
    const key = options.allowHeadingLevelChange ? headingIdentity(heading) : heading
    actual.set(key, (actual.get(key) || 0) + 1)
  }
  let missingCount = 0
  let addedCount = 0
  const missingHeadings: string[] = []
  const addedHeadings: string[] = []
  for (const [heading, count] of expected) {
    const allowedRemovals = options.allowDuplicateHeadingRemoval ? Math.max(0, count - 1) : 0
    const deficit = Math.max(0, count - (actual.get(heading) || 0) - allowedRemovals)
    missingCount += deficit
    for (let index = 0; index < deficit; index += 1) missingHeadings.push(heading)
  }
  for (const [heading, count] of actual) {
    const surplus = Math.max(0, count - (expected.get(heading) || 0))
    addedCount += surplus
    for (let index = 0; index < surplus; index += 1) addedHeadings.push(heading)
  }
  const summary = missingCount || addedCount
    ? `源文标题 ${[...expected.values()].reduce((sum, count) => sum + count, 0)} / 终稿标题 ${
      [...actual.values()].reduce((sum, count) => sum + count, 0)
    }，缺失 ${missingCount}，新增 ${addedCount}`
    : '源文标题与终稿标题一致'
  return { summary, missingCount, addedCount, missingHeadings, addedHeadings }
}

interface FinalDraftHeadingRepair {
  text: string
  repairedHeadings: string[]
  bodyProofs: string[]
}

function normalizeTextWithMap(text: string): { normalized: string; indexes: number[] } {
  const normalized: string[] = []
  const indexes: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (/[\s\p{P}\p{S}]/u.test(char)) continue
    normalized.push(char)
    indexes.push(index)
  }
  return { normalized: normalized.join(''), indexes }
}

function repairMissingFinalDraftHeadings(
  draft: string,
  source: string,
  missingHeadings: string[],
  options: { allowHeadingLevelChange?: boolean } = {},
): FinalDraftHeadingRepair | null {
  if (missingHeadings.length === 0) return null
  const sourceLines = String(source || '').split(/\r?\n/)
  const headingIndexes = sourceLines
    .map((line, index) => (/^#{1,6}\s+/.test(line.trim()) ? index : -1))
    .filter(index => index >= 0)
  const sectionsByKey = new Map<string, Array<{ heading: string; body: string }>>()
  headingIndexes.forEach((headingIndex, ordinal) => {
    const nextHeadingIndex = headingIndexes[ordinal + 1] ?? sourceLines.length
    const heading = sourceLines[headingIndex].trim()
    const key = options.allowHeadingLevelChange ? headingIdentity(heading) : heading
    const body = sourceLines.slice(headingIndex + 1, nextHeadingIndex).join('\n').trim()
    const list = sectionsByKey.get(key) || []
    list.push({ heading, body })
    sectionsByKey.set(key, list)
  })

  const draftMap = normalizeTextWithMap(draft)
  const plannedRepairs: Array<{ rawIndex: number; heading: string; bodyProof: string }> = []
  for (const missingHeading of missingHeadings) {
    const sections = sectionsByKey.get(missingHeading)
    // Duplicate headings are ambiguous; leave them to the conservative retry path.
    if (!sections || sections.length !== 1) return null
    const section = sections[0]
    const paragraphs = section.body
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean)
    if (paragraphs.length === 0) return null
    const normalizedParagraphs = paragraphs.map(paragraph => normalizeTextWithMap(paragraph).normalized)
    const allBodiesSurvive = normalizedParagraphs.every(paragraph =>
      paragraph.length > 0 && draftMap.normalized.includes(paragraph))
    if (!allBodiesSurvive) return null

    const firstParagraph = normalizedParagraphs[0]
    const normalizedIndex = draftMap.normalized.indexOf(firstParagraph)
    if (normalizedIndex < 0) return null
    const rawIndex = draftMap.indexes[normalizedIndex] ?? -1
    if (rawIndex < 0) return null
    const prefix = draft.slice(0, rawIndex)
    const paragraphBreaks = [...prefix.matchAll(/\n[ \t]*\r?\n/g)]
    const lastBreak = paragraphBreaks[paragraphBreaks.length - 1]
    const insertAt = lastBreak ? (lastBreak.index ?? 0) + lastBreak[0].length : 0
    plannedRepairs.push({ rawIndex: insertAt, heading: section.heading, bodyProof: paragraphs[0] })
  }
  let text = draft
  for (const repair of [...plannedRepairs].sort((left, right) => right.rawIndex - left.rawIndex)) {
    text = `${text.slice(0, repair.rawIndex)}${repair.heading}\n\n${text.slice(repair.rawIndex)}`
  }
  return {
    text,
    repairedHeadings: plannedRepairs.map(repair => repair.heading),
    bodyProofs: plannedRepairs.map(repair => repair.bodyProof),
  }
}

function leafBodyMultiset(text: string): string[] {
  const lines = String(text || '').split(/\r?\n/)
  const headingIndexes = lines
    .map((line, index) => (/^#{1,6}\s+/.test(line.trim()) ? index : -1))
    .filter(index => index >= 0)
  const bodies: string[] = []
  headingIndexes.forEach((headingIndex, ordinal) => {
    const nextHeadingIndex = headingIndexes[ordinal + 1] ?? lines.length
    const body = lines.slice(headingIndex + 1, nextHeadingIndex).join('\n').trim()
    const paragraphs = body
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean)
    bodies.push(...paragraphs)
  })
  return bodies
}

function normalizeLeafBodyForIntegrity(text: string): string {
  return String(text || '').replace(/[\s\p{P}\p{S}]/gu, '')
}

function normalizeLeafBodyForDuplicateIntegrity(text: string): string {
  // Deduplication compares prose; paragraph identifiers only locate the duplicate.
  const withoutParagraphId = String(text || '')
    .replace(/^\s*\d+(?:[-.．、]\d+)*\s*[：:]\s*/u, '')
  return normalizeLeafBodyForIntegrity(withoutParagraphId)
}

function summarizeFinalDraftLeafBodyDifference(
  draft: string,
  source: string,
  operation?: LongDocumentExecutionOperation,
): string {
  const normalizeLeafBody = operation === 'deduplicate' || operation === 'deduplicate_and_normalize'
    ? normalizeLeafBodyForDuplicateIntegrity
    : normalizeLeafBodyForIntegrity
  const expected = new Map<string, number>()
  for (const body of leafBodyMultiset(source).map(normalizeLeafBody)) {
    expected.set(body, (expected.get(body) || 0) + 1)
  }
  const actual = new Map<string, number>()
  for (const body of leafBodyMultiset(draft).map(normalizeLeafBody)) {
    actual.set(body, (actual.get(body) || 0) + 1)
  }
  let missingCount = 0
  let addedCount = 0
  for (const [body, count] of expected) {
    const allowedRemovals = operation === 'deduplicate' || operation === 'deduplicate_and_normalize'
      ? Math.max(0, count - 1)
      : 0
    missingCount += Math.max(0, count - (actual.get(body) || 0) - allowedRemovals)
  }
  for (const [body, count] of actual) {
    addedCount += Math.max(0, count - (expected.get(body) || 0))
  }
  if (!missingCount && !addedCount) return ''
  return `源文叶子 ${[...expected.values()].reduce((sum, count) => sum + count, 0)} / 终稿叶子 ${
    [...actual.values()].reduce((sum, count) => sum + count, 0)
  }，缺失 ${missingCount}，新增 ${addedCount}`
}

export async function generateFinalDraft(
  deps: {
    aiService: Pick<AiService, 'callAi'>
    adapter: FinalDraftEditorAdapter
    task: FinalDraftTask
    sourceContent: string
  },
  options: FinalDraftGenerationOptions = {},
): Promise<FinalDraftTask> {
  let task = deps.task
  const guidance = normalizeFinalDraftSkillGuidance(task.skillGuidance)
  if (guidance && task.skillGuidance !== guidance.text) {
    task = { ...task, skillGuidance: guidance.text }
  }
  task = applyFinalDraftEventWithHooks(task, { type: 'generation_started', now: now() }, options)
  emitTask(task, options)
  try {
    if (hashContent(deps.sourceContent) !== task.sourceContentHash) {
      throw new Error('source_content_mismatch_at_generation_start')
    }
    task = await planSegmentOrderIfNeeded(deps.aiService, task, options)
    task = await runPendingSegments(deps.aiService, task, { ...options, skillGuidance: guidance?.text })
    if (task.status === 'awaiting_continuation') return task
    if (task.status !== 'generating') return task
    return await writeCompletedDraft(deps, task, options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isSlowStreamInterrupted(error)) {
      const liveText = options.onSlowStreamInterrupted?.(task.accumulatedText)
      if (typeof liveText === 'string' && liveText) {
        task = { ...task, accumulatedText: liveText }
      }
      task = applyFinalDraftEventWithHooks(task, { type: 'task_interrupted', error: message, now: now() }, options)
    } else if (isUserCanceled(error)) {
      task = applyFinalDraftEventWithHooks(task, { type: 'task_canceled', reason: message, now: now() }, options)
    } else {
      task = applyFinalDraftEventWithHooks(task, { type: 'task_failed', error: message, now: now() }, options)
    }
    emitTask(task, options)
    return task
  }
}

export async function continueFinalDraft(
  deps: {
    aiService: Pick<AiService, 'callAi'>
    adapter: FinalDraftEditorAdapter
    task: FinalDraftTask
  },
  options: FinalDraftGenerationOptions = {},
): Promise<FinalDraftTask> {
  if (deps.task.status !== 'awaiting_continuation' && deps.task.status !== 'interrupted') {
    throw new Error(`终稿任务当前状态不支持续生成：${deps.task.status}`)
  }
  let current = applyFinalDraftEventWithHooks(deps.task, { type: 'continuation_started', now: now() }, options)
  const guidance = normalizeFinalDraftSkillGuidance(current.skillGuidance)
  if (guidance && current.skillGuidance !== guidance.text) {
    current = { ...current, skillGuidance: guidance.text }
  }
  emitTask(current, options)
  try {
    const result = await requestFinalDraft(deps.aiService, {
      messages: buildFinalDraftContinuationMessages(current, undefined, guidance?.text),
      purpose: 'generate',
    }, options)
    current = updateTask(current, {
      accumulatedText: mergeContinuationText(
        current.accumulatedText,
        result.text || '',
        SEGMENT_SEAM_MAX_OVERLAP_CHARS,
      ),
      continuationCount: current.continuationCount + 1,
      finishReason: result.finishReason,
    })
    const continuationValidation = validateFinalDraft(normalizeFinalDraftParagraphSeparators(current.accumulatedText), {
      finishReason: current.finishReason,
      acceptTruncated: true,
      sourceContent: activeSegmentSource(current),
      operation: current.operation,
      instruction: current.instruction,
    })
    if (!continuationValidation.valid) {
      const failed = applyFinalDraftEventWithHooks(current, {
        type: 'task_failed',
        error: continuationValidation.issues.map(issue => issue.message).join(' '),
        now: now(),
      }, options)
      emitTask(failed, options)
      return failed
    }
    if (isTruncated(result.finishReason)) {
      current = applyFinalDraftEventWithHooks(current, {
        type: 'generation_completed',
        finishReason: result.finishReason,
        now: now(),
      }, options)
      emitTask(current, options)
      return current
    }
    current = completeActiveSegment(current, options)
    emitTask(current, options)
    current = await runPendingSegments(deps.aiService, current, { ...options, skillGuidance: guidance?.text })
    if (current.status === 'awaiting_continuation') return current
    if (current.status !== 'generating') return current
    return await writeCompletedDraft({ ...deps, task: current }, current, options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isSlowStreamInterrupted(error)) {
      const liveText = options.onSlowStreamInterrupted?.(current.accumulatedText)
      if (typeof liveText === 'string' && liveText) {
        current = { ...current, accumulatedText: liveText }
      }
      current = applyFinalDraftEventWithHooks(current, { type: 'task_interrupted', error: message, now: now() }, options)
    } else if (isUserCanceled(error)) {
      current = applyFinalDraftEventWithHooks(current, { type: 'task_canceled', reason: message, now: now() }, options)
    } else {
      current = applyFinalDraftEventWithHooks(current, { type: 'task_failed', error: message, now: now() }, options)
    }
    emitTask(current, options)
    return current
  }
}

export async function cancelFinalDraft(
  task: FinalDraftTask,
  reason = '用户取消',
  nowValue = Date.now(),
): Promise<FinalDraftTask> {
  return applyFinalDraftEventWithHooks(task, { type: 'task_canceled', reason, now: nowValue })
}

async function writeCompletedDraft(
  deps: {
    aiService: Pick<AiService, 'callAi'>
    adapter: FinalDraftEditorAdapter
    task: FinalDraftTask
    sourceContent?: string
  },
  task: FinalDraftTask,
  options: FinalDraftGenerationOptions,
): Promise<FinalDraftTask> {
  const draft = finalDraftText(task)
  let normalizedDraft = normalizeFinalDraftParagraphSeparators(draft)
  normalizedDraft = normalizeFinalDraftParagraphSeparators(
    cleanupAuthorizedDuplicateBlocks(task, normalizedDraft, options).text,
  )
  const validation = validateFinalDraft(normalizedDraft, {
    finishReason: task.finishReason,
    sourceContent: deps.sourceContent || task.sourceContent,
    operation: task.operation,
    instruction: task.instruction,
  })
  if (!validation.valid) {
    const failed = applyFinalDraftEventWithHooks(task, {
      type: 'task_failed',
      error: validation.issues.map(issue => issue.message).join(' '),
      now: now(),
    }, options)
    emitTask(failed, options)
    return failed
  }
  let writing = applyFinalDraftEventWithHooks(task, { type: 'write_started', now: now() }, options)
  emitTask(writing, options)
  const before = await deps.adapter.getDocumentState()
  if (before.targetId !== task.targetId) {
    const rolledBack = applyFinalDraftEventWithHooks(writing, {
      type: 'task_rolled_back',
      reason: `target_changed_before_write:${before.targetId}`,
      now: now(),
    }, options)
    emitTask(rolledBack, options)
    return rolledBack
  }
  if (hashContent(before.content) !== task.sourceContentHash) {
    const rolledBack = applyFinalDraftEventWithHooks(writing, {
      type: 'task_rolled_back',
      reason: 'source_document_changed_before_write',
      now: now(),
    }, options)
    emitTask(rolledBack, options)
    return rolledBack
  }
  try {
    const written = await deps.adapter.writeDocument(normalizedDraft)
    const completed = applyFinalDraftEventWithHooks(writing, {
      type: 'write_succeeded',
      documentVersion: written.documentVersion,
      contentHash: written.contentHash,
      now: now(),
    }, options)
    const finished = updateTask(completed, { documentVersionBeforeWrite: before.documentVersion })
    emitTask(finished, options)
    return finished
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    let next = applyFinalDraftEventWithHooks(writing, { type: 'write_failed', error: message, now: now() }, options)
    try {
      const restored = await deps.adapter.restoreDocument(before.content)
      if (restored.targetId !== task.targetId) throw new Error(`restore_target_mismatch:${restored.targetId}`)
      next = applyFinalDraftEventWithHooks(next, {
        type: 'task_rolled_back',
        reason: `write_failed_restored:${message}`,
        now: now(),
      }, options)
    } catch (restoreError) {
      const restoreMessage = restoreError instanceof Error ? restoreError.message : String(restoreError)
      next = applyFinalDraftEventWithHooks(next, {
        type: 'task_failed',
        error: `write_failed_restore_failed:${message}; restore_error=${restoreMessage}`,
        now: now(),
      }, options)
    }
    emitTask(next, options)
    return next
  }
}

async function planSegmentOrderIfNeeded(
  aiService: Pick<AiService, 'callAi'>,
  task: FinalDraftTask,
  options: FinalDraftGenerationOptions,
): Promise<FinalDraftTask> {
  const hasValidOrder = task.segmentOrder.length === task.sourceSegments.length
    && task.segmentOrder.every(id => task.sourceSegments.some(segment => segment.segmentId === id))
  const alreadyProgressed = task.activeSegmentIndex > 0 || task.completedText.length > 0
  if (
    task.sourceSegments.length <= 1
    || (hasValidOrder && alreadyProgressed)
    || task.segmentOrder.length !== task.sourceSegments.length
  ) {
    return applyFinalDraftEventWithHooks(task, {
      type: 'segment_order_planned',
      segmentOrder: task.sourceSegments.map(segment => segment.segmentId),
      fallback: true,
      now: now(),
    }, options)
  }
  const started = applyFinalDraftEventWithHooks(task, { type: 'segment_order_started', now: now() }, options)
  emitTask(started, options)
  const structure = parseOutlineStructure(task.sourceContent)
  const result = await requestFinalDraft(aiService, {
    messages: [
      { role: 'system', content: '你是终稿分段顺序规划器。只输出分段ID，每行一个，必须覆盖全部分段且不得重复。' },
      {
        role: 'user',
        content: `终稿要求：${task.instruction}\n\n源文结构地图：\n${structure.mapText}\n\n可选分段：\n${
          task.sourceSegments.map(segment => `${segment.segmentId}（${segment.start}-${segment.end}）`).join('\n')
        }`,
      },
    ],
    purpose: 'generate',
  }, { ...options, onChunk: undefined })
  const ids = (result.text || '')
    .split(/\r?\n/)
    .map(line => line.trim().replace(/^[-*\d.、\s]+/, ''))
    .filter(Boolean)
  const valid = new Set(task.sourceSegments.map(segment => segment.segmentId))
  const unique = [...new Set(ids)]
  const accepted = unique.length === task.sourceSegments.length && unique.every(id => valid.has(id))
  const planned = applyFinalDraftEventWithHooks(started, {
    type: 'segment_order_planned',
    segmentOrder: accepted ? unique : task.sourceSegments.map(segment => segment.segmentId),
    fallback: !accepted,
    now: now(),
  }, options)
  emitTask(planned, options)
  return planned
}

async function runPendingSegments(
  aiService: Pick<AiService, 'callAi'>,
  input: FinalDraftTask,
  options: FinalDraftGenerationOptions,
): Promise<FinalDraftTask> {
  let task = input
  let structureRetried = false
  while (task.activeSegmentIndex < task.sourceSegments.length) {
    const segment = activeSourceSegment(task)
    if (!task.accumulatedText) {
      task = applyFinalDraftEventWithHooks(task, { type: 'segment_started', segmentId: segment.segmentId, now: now() }, options)
      emitTask(task, options)
    }
    const hasPartialSegment = options.resumePartialSegment === true && task.accumulatedText.length > 0
    const result = await requestFinalDraft(aiService, {
      messages: hasPartialSegment
        ? buildFinalDraftContinuationMessages(task, undefined, options.skillGuidance)
        : buildFinalDraftSegmentMessages(task, segment, { skillGuidance: options.skillGuidance }),
      purpose: 'generate',
    }, options)
    task = updateTask(task, {
      accumulatedText: hasPartialSegment
        ? mergeContinuationText(task.accumulatedText, result.text || '', SEGMENT_SEAM_MAX_OVERLAP_CHARS)
        : result.text || '',
      finishReason: result.finishReason,
    })
    const segmentCleanup = cleanupAuthorizedDuplicateBlocks(
      task,
      normalizeFinalDraftParagraphSeparators(task.accumulatedText),
      options,
    )
    task = segmentCleanup.task
    const segmentValidation = validateFinalDraft(segmentCleanup.text, {
      finishReason: result.finishReason,
      acceptTruncated: true,
      sourceContent: activeSegmentSource(task),
      operation: task.operation,
      instruction: task.instruction,
    })
    let segmentText = segmentCleanup.text
    const headingIssue = segmentValidation.issues.find(issue => issue.code === 'heading_boundary_lost')
    if (headingIssue && !isTruncated(result.finishReason)) {
      const headingDifference = summarizeFinalDraftHeadingDifference(
        segmentText,
        activeSegmentSource(task),
        {
          allowHeadingLevelChange: authorizedHeadingLevelChange(task),
          allowDuplicateHeadingRemoval: isAuthorizedDuplicateCleanup(task.operation),
        },
      )
      const repair = headingDifference.addedHeadings.length === 0
        ? repairMissingFinalDraftHeadings(
          segmentText,
          activeSegmentSource(task),
          headingDifference.missingHeadings,
          { allowHeadingLevelChange: authorizedHeadingLevelChange(task) },
        )
        : null
      if (repair) {
        task = updateTask(task, { accumulatedText: repair.text })
        segmentText = repair.text
        task = applyFinalDraftEventWithHooks(task, {
          type: 'heading_boundary_repaired',
          segmentId: segment.segmentId,
          missingHeadings: headingDifference.missingHeadings,
          repairedHeadings: repair.repairedHeadings,
          bodyProofs: repair.bodyProofs,
          now: now(),
        }, options)
        emitTask(task, options)
      }
    }
    const effectiveValidation = segmentText === segmentCleanup.text
      ? segmentValidation
      : validateFinalDraft(segmentText, {
        finishReason: result.finishReason,
        acceptTruncated: true,
        sourceContent: activeSegmentSource(task),
        operation: task.operation,
        instruction: task.instruction,
      })
    const retryableStructureLoss = !effectiveValidation.valid
      && !isTruncated(result.finishReason)
      && (
        effectiveValidation.issues.some(issue => issue.code === 'paragraph_structure_lost')
          || effectiveValidation.issues.some(issue => issue.code === 'heading_boundary_lost')
      )
      && !structureRetried
    if (retryableStructureLoss) {
      structureRetried = true
      task = applyFinalDraftEventWithHooks(task, {
        type: 'segment_retry_started',
        segmentId: segment.segmentId,
        reason: effectiveValidation.issues.map(issue => issue.message).join(' '),
        now: now(),
      }, options)
      emitTask(task, options)
      const retryResult = await requestFinalDraft(aiService, {
        messages: buildFinalDraftSegmentMessages(task, segment, { structureRetry: true, skillGuidance: options.skillGuidance }),
        purpose: 'generate',
      }, options)
      task = updateTask(task, {
        accumulatedText: retryResult.text || '',
        finishReason: retryResult.finishReason,
      })
      const retryCleanup = cleanupAuthorizedDuplicateBlocks(
        task,
        normalizeFinalDraftParagraphSeparators(task.accumulatedText),
        options,
      )
      task = retryCleanup.task
      const retryValidation = validateFinalDraft(retryCleanup.text, {
        finishReason: retryResult.finishReason,
        acceptTruncated: true,
        sourceContent: activeSegmentSource(task),
        operation: task.operation,
        instruction: task.instruction,
      })
      if (!retryValidation.valid) {
        const failed = applyFinalDraftEventWithHooks(task, {
          type: 'task_failed',
          error: retryValidation.issues.map(issue => issue.message).join(' '),
          now: now(),
        }, options)
        emitTask(failed, options)
        return failed
      }
      if (isTruncated(retryResult.finishReason)) {
        task = applyFinalDraftEventWithHooks(task, {
          type: 'generation_completed',
          finishReason: retryResult.finishReason,
          now: now(),
        }, options)
        emitTask(task, options)
        return task
      }
    } else if (!effectiveValidation.valid) {
      const failed = applyFinalDraftEventWithHooks(task, {
        type: 'task_failed',
        error: effectiveValidation.issues.map(issue => issue.message).join(' '),
        now: now(),
      }, options)
      emitTask(failed, options)
      return failed
    }
    if (isTruncated(result.finishReason)) {
      task = applyFinalDraftEventWithHooks(task, {
        type: 'generation_completed',
        finishReason: result.finishReason,
        now: now(),
      }, options)
      emitTask(task, options)
      return task
    }
    task = completeActiveSegment(task, options)
    emitTask(task, options)
  }
  task = applyFinalDraftEventWithHooks(task, {
    type: 'generation_completed',
    finishReason: task.finishReason,
    now: now(),
  }, options)
  emitTask(task, options)
  return task
}

function completeActiveSegment(task: FinalDraftTask, options: FinalDraftGenerationOptions): FinalDraftTask {
  const segment = activeSourceSegment(task)
  return applyFinalDraftEventWithHooks(task, {
    type: 'segment_completed',
    segmentId: segment.segmentId,
    now: now(),
  }, options)
}

function cleanupAuthorizedDuplicateBlocks(
  task: FinalDraftTask,
  text: string,
  options: FinalDraftGenerationOptions,
): { task: FinalDraftTask; text: string } {
  if (!isAuthorizedDuplicateCleanup(task.operation)) return { task, text }
  const cleanup = removeAuthorizedDuplicateBlocks(text)
  if (!cleanup) return { task, text }
  const next = updateTask(task, { accumulatedText: cleanup.text })
  const deduplicated = applyFinalDraftEventWithHooks(next, {
    type: 'draft_deduplicated',
    removedBlocks: cleanup.removedBlocks,
    removedChars: cleanup.removedChars,
    now: now(),
  }, options)
  emitTask(deduplicated, options)
  return { task: deduplicated, text: cleanup.text }
}

export async function retryFinalDraftSegment(
  deps: {
    aiService: Pick<AiService, 'callAi'>
    adapter: FinalDraftEditorAdapter
    task: FinalDraftTask
  },
  options: FinalDraftGenerationOptions = {},
): Promise<FinalDraftTask> {
  if (
    deps.task.status !== 'generating'
    && deps.task.status !== 'awaiting_continuation'
    && deps.task.status !== 'interrupted'
  ) {
    throw new Error(`终稿任务当前状态不支持重试当前段：${deps.task.status}`)
  }
  const segment = activeSourceSegment(deps.task)
  const guidance = normalizeFinalDraftSkillGuidance(deps.task.skillGuidance)
  let current = applyFinalDraftEventWithHooks(deps.task, {
    type: 'segment_user_retry_started',
    segmentId: segment.segmentId,
    reason: '用户请求重试当前段',
    now: now(),
  }, options)
  emitTask(current, options)
  current = await planSegmentOrderIfNeeded(deps.aiService, current, options)
  try {
    current = await runPendingSegments(deps.aiService, current, { ...options, skillGuidance: guidance?.text })
    if (current.status === 'awaiting_continuation') return current
    if (current.status !== 'generating') return current
    return await writeCompletedDraft({ ...deps, task: current }, current, options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isSlowStreamInterrupted(error)) {
      const liveText = options.onSlowStreamInterrupted?.(current.accumulatedText)
      if (typeof liveText === 'string' && liveText) {
        current = { ...current, accumulatedText: liveText }
      }
      current = applyFinalDraftEventWithHooks(current, { type: 'task_interrupted', error: message, now: now() }, options)
    } else if (isUserCanceled(error)) {
      current = applyFinalDraftEventWithHooks(current, { type: 'task_canceled', reason: message, now: now() }, options)
    } else {
      current = applyFinalDraftEventWithHooks(current, { type: 'task_failed', error: message, now: now() }, options)
    }
    emitTask(current, options)
    return current
  }
}

function activeSourceSegment(task: FinalDraftTask): FinalDraftSourceSegment {
  const segmentId = task.segmentOrder[task.activeSegmentIndex]
  const segment = task.sourceSegments.find(item => item.segmentId === segmentId)
  if (!segment) throw new Error(`终稿分段不存在：${segmentId}`)
  return segment
}

function activeSegmentSource(task: FinalDraftTask): string {
  const segment = activeSourceSegment(task)
  return task.sourceContent.slice(segment.start, segment.end)
}

function finalDraftText(task: FinalDraftTask): string {
  return task.completedText || task.accumulatedText
}

export function normalizeFinalDraftParagraphSeparators(text: string): string {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function protectedRangesForSegment(
  task: FinalDraftTask,
  segment: FinalDraftSourceSegment,
): FinalDraftProtectedRange[] {
  return (task.protectedRanges || [])
    .filter(range => range.end > segment.start && range.start < segment.end)
    .map(range => ({
      start: Math.max(0, range.start - segment.start),
      end: Math.min(segment.end - segment.start, range.end - segment.start),
      reason: range.reason,
    }))
}

function joinSegmentText(existing: string, next: string): string {
  if (!existing) return next
  if (!next) return existing
  const duplicatedEnd = findSegmentSeamOverlapEnd(existing, next)
  const remainder = duplicatedEnd > 0 ? next.slice(duplicatedEnd) : next
  if (!remainder.trim()) return existing
  next = remainder
  if (/\n\s*$/.test(existing) || /^\s*\n/.test(next)) return `${existing}${next}`
  return `${existing}\n\n${next}`
}

function findSegmentSeamOverlapEnd(existing: string, next: string): number {
  const left = existing.slice(-SEGMENT_SEAM_MAX_OVERLAP_CHARS)
  const right = next.slice(0, SEGMENT_SEAM_MAX_OVERLAP_CHARS)
  if (left.length < SEGMENT_SEAM_MIN_OVERLAP_CHARS || right.length < SEGMENT_SEAM_MIN_OVERLAP_CHARS) return 0
  const normalizedLeft = normalizeWithIndexes(left)
  const normalizedRight = normalizeWithIndexes(right)
  const overlap = longestSuffixPrefixLength(normalizedRight.text, normalizedLeft.text)
  if (overlap < SEGMENT_SEAM_MIN_OVERLAP_CHARS) return 0
  const lastMatchedOriginalIndex = normalizedRight.indexes[overlap - 1]
  return lastMatchedOriginalIndex + 1
}

function normalizeWithIndexes(text: string): { text: string; indexes: number[] } {
  const chars: string[] = []
  const indexes: number[] = []
  let previousWasSpace = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (/\s/.test(char)) {
      if (previousWasSpace) continue
      chars.push(' ')
      indexes.push(index)
      previousWasSpace = true
    } else {
      chars.push(char)
      indexes.push(index)
      previousWasSpace = false
    }
  }
  return { text: chars.join(''), indexes }
}

function longestSuffixPrefixLength(prefixText: string, suffixText: string): number {
  const combined = `${prefixText}\u0000${suffixText}`
  const table = new Array<number>(combined.length).fill(0)
  for (let index = 1; index < combined.length; index += 1) {
    let length = table[index - 1]
    while (length > 0 && combined[index] !== combined[length]) length = table[length - 1]
    if (combined[index] === combined[length]) length += 1
    table[index] = length
  }
  return Math.min(table[combined.length - 1] ?? 0, prefixText.length, suffixText.length)
}

async function requestFinalDraft(
  aiService: Pick<AiService, 'callAi'>,
  request: {
    messages: CallAiParams['messages']
    purpose: CallAiParams['purpose']
  },
  options: FinalDraftGenerationOptions,
): Promise<CallAiResult> {
  return aiService.callAi({
    purpose: request.purpose,
    messages: request.messages,
    stream: true,
    signal: options.signal,
    cancelSignal: options.cancelSignal,
    tools: [],
    timeoutMs: null,
    slowStreamTolerant: true,
    retry: true,
    suppressToolProtocolStream: true,
    onChunk: options.onChunk,
    onReasoning: options.onReasoning,
    onUsage: options.onUsage,
    onPhysicalCall: options.onPhysicalCall,
    onProviderQueue: options.onProviderQueue,
    meta: { source: 'final-draft-service', providerSource: 'auxiliary' },
  })
}

function reduceFinalDraftEvent(task: FinalDraftTask, event: FinalDraftEvent): FinalDraftTask {
  switch (event.type) {
    case 'generation_started':
      return transition(task, ['planning', 'awaiting_continuation'], 'generating', {
        finishReason: undefined,
      })
    case 'generation_completed':
      if (isTruncated(event.finishReason)) {
        return transition(task, 'generating', 'awaiting_continuation', {
          finishReason: event.finishReason,
        })
      }
      return task
    case 'continuation_started':
      return transition(task, ['awaiting_continuation', 'interrupted'], 'generating', {})
    case 'segment_order_planned':
      return { ...task, segmentOrder: event.segmentOrder }
    case 'segment_started':
      return transition(task, 'generating', 'generating', {})
    case 'segment_retry_started':
      return { ...task }
    case 'heading_boundary_repaired':
      return { ...task, updatedAt: event.now }
    case 'segment_user_retry_started':
      return transition(task, ['generating', 'awaiting_continuation', 'interrupted'], 'generating', {
        accumulatedText: '',
        finishReason: undefined,
      })
    case 'segment_completed': {
      return {
        ...task,
        completedText: joinSegmentText(task.completedText, task.accumulatedText),
        accumulatedText: '',
        activeSegmentIndex: task.activeSegmentIndex + 1,
      }
    }
    case 'draft_deduplicated':
      return { ...task, updatedAt: event.now }
    case 'write_started':
      return transition(task, ['generating', 'awaiting_continuation'], 'writing', {})
    case 'write_succeeded':
      return transition(task, 'writing', 'completed', {})
    case 'write_failed':
      return transition(task, 'writing', 'failed', { error: event.error })
    case 'task_failed':
      return transition(task, task.status, 'failed', { error: event.error })
    case 'task_rolled_back':
      return transition(task, ['writing', 'failed', 'generating'], 'rolled_back', { error: event.reason })
    case 'task_canceled':
      return transition(task, task.status, 'canceled', {})
    case 'task_interrupted':
      return transition(task, ['generating', 'awaiting_continuation'], 'interrupted', { error: event.error })
    default:
      return task
  }
}

function transition(
  task: FinalDraftTask,
  from: FinalDraftStatus | FinalDraftStatus[],
  to: FinalDraftStatus,
  patch: Partial<FinalDraftTask>,
): FinalDraftTask {
  const allowedFrom = Array.isArray(from) ? from : [from]
  if (!allowedFrom.includes(task.status)) return task
  return { ...task, ...patch, status: to }
}

function updateTask(task: FinalDraftTask, patch: Partial<FinalDraftTask>): FinalDraftTask {
  return { ...task, ...patch, updatedAt: Date.now() }
}

function emitTask(task: FinalDraftTask, options: FinalDraftGenerationOptions) {
  options.onTaskChange?.(task)
  options.onProgress?.({
    taskId: task.taskId,
    phase: task.status === 'awaiting_continuation'
      ? 'awaiting_continuation'
      : task.status === 'writing'
        ? 'writing'
        : task.status === 'completed'
          ? 'completed'
          : 'generating',
    accumulatedChars: task.accumulatedText.length,
    continuationCount: task.continuationCount,
    streamingChars: 0,
    lastStreamActivityAt: task.updatedAt,
    activeSegmentIndex: task.activeSegmentIndex,
  })
}

export function describeFinalDraftEvent(event: FinalDraftEvent): {
  type: string
  label: string
  level: 'info' | 'warn' | 'error'
  payload: Record<string, unknown>
} {
  switch (event.type) {
    case 'generation_started':
      return { type: 'final-draft-generation-started', label: '终稿生成开始', level: 'info', payload: {} }
    case 'generation_completed':
      return {
        type: 'final-draft-generation-completed',
        label: '终稿生成阶段完成',
        level: 'info',
        payload: { finishReason: event.finishReason || null },
      }
    case 'continuation_started':
      return { type: 'final-draft-continuation-started', label: '终稿续生成开始', level: 'info', payload: {} }
    case 'segment_order_started':
      return { type: 'final-draft-segment-order-started', label: '终稿分段顺序规划开始', level: 'info', payload: {} }
    case 'segment_order_planned':
      return {
        type: 'final-draft-segment-order-planned',
        label: '终稿分段顺序已确定',
        level: event.fallback ? 'warn' : 'info',
        payload: { segmentOrder: event.segmentOrder, fallback: event.fallback },
      }
    case 'segment_started':
      return { type: 'final-draft-segment-started', label: `终稿分段开始：${event.segmentId}`, level: 'info', payload: { segmentId: event.segmentId } }
    case 'segment_retry_started':
      return {
        type: 'final-draft-segment-retry-started',
        label: `终稿分段结构重试：${event.segmentId}`,
        level: 'warn',
        payload: { segmentId: event.segmentId, reason: event.reason },
      }
    case 'heading_boundary_repaired':
      return {
        type: 'final-draft-heading-boundary-repaired',
        label: `终稿标题边界已本地修复：${event.segmentId}`,
        level: 'warn',
        payload: {
          segmentId: event.segmentId,
          missingHeadings: event.missingHeadings,
          repairedHeadings: event.repairedHeadings,
          bodyProofs: event.bodyProofs,
        },
      }
    case 'segment_user_retry_started':
      return {
        type: 'final-draft-segment-user-retry-started',
        label: `终稿分段用户重试：${event.segmentId}`,
        level: 'warn',
        payload: { segmentId: event.segmentId, reason: event.reason },
      }
    case 'segment_completed':
      return { type: 'final-draft-segment-completed', label: `终稿分段完成：${event.segmentId}`, level: 'info', payload: { segmentId: event.segmentId } }
    case 'draft_deduplicated':
      return {
        type: 'final-draft-draft-deduplicated',
        label: '终稿重复块已按授权清理',
        level: 'info',
        payload: { removedBlocks: event.removedBlocks, removedChars: event.removedChars },
      }
    case 'write_started':
      return { type: 'final-draft-write-started', label: '终稿写入开始', level: 'info', payload: {} }
    case 'write_succeeded':
      return {
        type: 'final-draft-write-succeeded',
        label: '终稿写入成功',
        level: 'info',
        payload: { documentVersion: event.documentVersion, contentHash: event.contentHash },
      }
    case 'write_failed':
      return { type: 'final-draft-write-failed', label: '终稿写入失败', level: 'error', payload: { error: event.error } }
    case 'task_failed':
      return { type: 'final-draft-task-failed', label: '终稿任务失败', level: 'error', payload: { error: event.error } }
    case 'task_rolled_back':
      return { type: 'final-draft-task-rolled-back', label: '终稿任务已回滚', level: 'warn', payload: { reason: event.reason } }
    case 'task_canceled':
      return { type: 'final-draft-task-canceled', label: '终稿任务已取消', level: 'warn', payload: { reason: event.reason } }
    case 'task_interrupted':
      return { type: 'final-draft-slow-stream-interrupted', label: '终稿慢流中断，等待用户选择', level: 'warn', payload: { error: event.error } }
    default:
      return { type: `final-draft-${String((event as { type: string }).type).replace(/_/g, '-')}`, label: '终稿任务事件', level: 'info', payload: {} }
  }
}

function isTruncated(finishReason?: string): boolean {
  return finishReason === 'length'
}

function isAuthorizedDuplicateCleanup(operation?: LongDocumentExecutionOperation): boolean {
  return operation === 'deduplicate'
    || operation === 'deduplicate_and_normalize'
    || operation === 'restructure_and_cleanup'
}

function authorizedHeadingLevelChange(task: FinalDraftTask): boolean {
  return task.operation !== 'deduplicate'
    && task.operation !== 'deduplicate_and_normalize'
    && HEADING_LEVEL_NORMALIZATION_PATTERN.test(task.instruction || '')
}

interface AuthorizedDuplicateCleanup {
  text: string
  removedBlocks: number
  removedChars: number
}

function removeAuthorizedDuplicateBlocks(text: string): AuthorizedDuplicateCleanup | null {
  let current = text
  let removedBlocks = 0
  let removedChars = 0
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const removal = removeNextAuthorizedDuplicateBlock(current, DUPLICATE_BLOCK_CHARS)
      ?? (current.replace(/\s+/g, ' ').trim().length >= DUPLICATE_BLOCK_SMALL_CHARS * 4
        ? removeNextAuthorizedDuplicateBlock(current, DUPLICATE_BLOCK_SMALL_CHARS)
        : null)
    if (!removal) break
    current = removal.text
    removedBlocks += 1
    removedChars += removal.removedChars
  }
  if (!removedBlocks) return null
  return { text: current, removedBlocks, removedChars }
}

function removeNextAuthorizedDuplicateBlock(
  text: string,
  blockChars: number,
): { text: string; removedChars: number } | null {
  const normalized: string[] = []
  const originalIndexes: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    if (/\s/.test(text[index])) {
      continue
    } else {
      normalized.push(text[index])
      originalIndexes.push(index)
    }
  }
  const match = findDuplicatedWindowRange(normalized, blockChars)
  if (!match) return null

  let { first, second, length } = match
  while (
    first > 0
    && second > 0
    && normalized[first - 1] === normalized[second - 1]
    && !crossesParagraphBoundary(text, originalIndexes[first - 1], originalIndexes[first])
    && !crossesParagraphBoundary(text, originalIndexes[second - 1], originalIndexes[second])
  ) {
    first -= 1
    second -= 1
  }
  while (
    first + length < normalized.length
    && second + length < normalized.length
    && normalized[first + length] === normalized[second + length]
    && !crossesParagraphBoundary(text, originalIndexes[first + length - 1], originalIndexes[first + length])
    && !crossesParagraphBoundary(text, originalIndexes[second + length - 1], originalIndexes[second + length])
  ) {
    length += 1
  }

  const originalStart = originalIndexes[second]
  const originalEnd = originalIndexes[second + length - 1] + 1
  const removal = paragraphAwareRemovalRange(text, originalStart, originalEnd)
  return {
    text: text.slice(0, removal.start) + text.slice(removal.end),
    removedChars: removal.end - removal.start,
  }
}

function paragraphAwareRemovalRange(
  text: string,
  duplicateStart: number,
  duplicateEnd: number,
): { start: number; end: number } {
  const parts = text.split(/(\n\s*\n)/)
  const paragraphs: Array<{ start: number; end: number }> = []
  const separators: Array<{ start: number; end: number }> = []
  let offset = 0
  parts.forEach(part => {
    if (!part) return
    if (/^\n\s*\n$/.test(part)) separators.push({ start: offset, end: offset + part.length })
    else paragraphs.push({ start: offset, end: offset + part.length })
    offset += part.length
  })

  const covered = paragraphs.filter(paragraph =>
    paragraph.start >= duplicateStart && paragraph.end <= duplicateEnd,
  )
  if (!covered.length) return { start: duplicateStart, end: duplicateEnd }

  const first = covered[0]
  const last = covered[covered.length - 1]
  const followingSeparator = separators.find(separator => separator.start === last.end)
  if (followingSeparator) return { start: first.start, end: followingSeparator.end }
  const precedingSeparator = separators
    .filter(separator => separator.end === first.start)
    .at(-1)
  if (precedingSeparator) return { start: precedingSeparator.start, end: last.end }
  return { start: first.start, end: last.end }
}

function crossesParagraphBoundary(text: string, beforeIndex: number, afterIndex: number): boolean {
  if (beforeIndex < 0 || afterIndex >= text.length || beforeIndex >= afterIndex) return true
  return /\n\s*\n/.test(text.slice(beforeIndex + 1, afterIndex))
}

function findDuplicatedWindowRange(
  normalized: string[],
  blockChars: number,
): { first: number; second: number; length: number } | null {
  if (normalized.length < blockChars * 2) return null
  const base = 131n
  const mod = 1_000_000_007n
  const highestWeight = base ** BigInt(blockChars) % mod
  let hash = 0n
  for (let index = 0; index < blockChars; index += 1) {
    hash = (hash * base + BigInt(normalized[index].charCodeAt(0))) % mod
  }
  const firstByHash = new Map<string, number>([[hash.toString(), 0]])
  for (let index = blockChars; index < normalized.length; index += 1) {
    const outgoing = BigInt(normalized[index - blockChars].charCodeAt(0)) * highestWeight % mod
    const incoming = BigInt(normalized[index].charCodeAt(0))
    hash = (hash * base + incoming + mod - outgoing) % mod
    const currentStart = index - blockChars + 1
    const first = firstByHash.get(hash.toString())
    if (
      first !== undefined
      && currentStart - first >= blockChars
      && windowsEqual(normalized, first, currentStart, blockChars)
    ) {
      return { first, second: currentStart, length: blockChars }
    }
    if (first === undefined) firstByHash.set(hash.toString(), currentStart)
  }
  return null
}

function windowsEqual(normalized: string[], left: number, right: number, length: number): boolean {
  for (let offset = 0; offset < length; offset += 1) {
    if (normalized[left + offset] !== normalized[right + offset]) return false
  }
  return true
}

function isUserCanceled(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function isSlowStreamInterrupted(error: unknown): boolean {
  return error instanceof Error && (error as { code?: string }).code === 'slow_stream_interrupted'
}

function findDuplicatedSeam(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length < 2000) return false
  const chunkSize = 120
  for (let size = 300; size >= chunkSize; size -= 20) {
    const seam = normalized.slice(-size)
    if (normalized.slice(0, -size).includes(seam)) return true
  }
  return false
}

function hasDuplicatedBlock(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (hasDuplicatedWindow(normalized, DUPLICATE_BLOCK_CHARS)) return true
  if (normalized.length < DUPLICATE_BLOCK_SMALL_CHARS * 4) return false
  return hasDuplicatedWindow(normalized, DUPLICATE_BLOCK_SMALL_CHARS)
}

function hasDuplicatedWindow(normalized: string, blockChars: number): boolean {
  if (normalized.length < blockChars * 2) return false
  const base = 131n
  const mod = 1_000_000_007n
  const highestWeight = base ** BigInt(blockChars) % mod
  let hash = 0n
  for (let index = 0; index < blockChars; index += 1) {
    hash = (hash * base + BigInt(normalized.charCodeAt(index))) % mod
  }
  const firstByHash = new Map<string, number>([[hash.toString(), 0]])
  for (let index = blockChars; index < normalized.length; index += 1) {
    const outgoing = BigInt(normalized.charCodeAt(index - blockChars)) * highestWeight % mod
    const incoming = BigInt(normalized.charCodeAt(index))
    hash = (hash * base + incoming + mod - outgoing) % mod
    const first = firstByHash.get(hash.toString())
    if (first !== undefined
      && index - first >= blockChars * 2
      && normalized.slice(first, first + blockChars) === normalized.slice(index, index + blockChars)) {
      return true
    }
    if (first === undefined) firstByHash.set(hash.toString(), index)
  }
  return false
}

function now(): number {
  return Date.now()
}

export function hashContent(content: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function toContinuationSnapshot(task: FinalDraftTask, options: {
  requestId: string
  projectId: string
  workspace: string
  purpose: ContinuationSnapshot['purpose']
  originalMessages: ContinuationSnapshot['originalMessages']
  now?: number
}): ContinuationSnapshot {
  const timestamp = options.now ?? Date.now()
  return {
    requestId: options.requestId,
    projectId: options.projectId,
    workspace: options.workspace,
    purpose: options.purpose,
    skillIds: [],
    agentIds: [],
    mode: 'single',
    originalMessages: options.originalMessages,
    accumulatedText: task.accumulatedText,
    continuationCount: task.continuationCount,
    status: 'possibly_truncated',
    finishReason: 'length',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
