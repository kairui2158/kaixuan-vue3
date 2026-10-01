import { CONTEXT_BUDGET_DEFAULTS, estimateInputTokens } from './contextBudget'
import type { LongDocumentOperationType } from './longDocumentPolicy'
import { parseOutlineStructure } from './outlineStructure'

export type LongDocumentExecutionOperation =
  | 'restructure'
  | 'normalize'
  | 'deduplicate'
  | 'targeted_edit'
  | 'rewrite_segments'

export type LongDocumentExecutionMode = 'direct' | 'edit-task' | 'final-draft'

export type LongDocumentExecutionDecision =
  | 'fits'
  | 'needs_segmentation'
  | 'exceeds_provider'
  | 'provider_configuration_conflict'

export type LongDocumentExpectedChange =
  | 'none'
  | 'reorder'
  | 'normalize'
  | 'remove_duplicate'
  | 'rewrite'

export type LongDocumentWriteStrategy =
  | 'move'
  | 'reorder_sections'
  | 'replace_match'
  | 'rewrite_segment'
  | 'delete'

export type LongDocumentInvariant =
  | 'leaf-body-multiset-unchanged'
  | 'normalize-changes-punctuation-whitespace-format-only'
  | 'authorized-command-hash-replay-only'
  | 'orphan-body-must-be-resolved'
  | 'segment-checkpoint-isolated'

export interface LongDocumentExecutionPlanSegment {
  segmentId: string
  range: { startLine: number; endLine: number }
  readStrategy: 'full' | 'slice' | 'outline-plus-slice'
  writeStrategy: LongDocumentWriteStrategy
  expectedChange: LongDocumentExpectedChange
  commandLimit: number
}

export interface LongDocumentExecutionPlannerWindow {
  status: 'provider-declared' | 'unknown' | 'provider_configuration_conflict'
  contextWindowTokens: number
  maxOutputTokens: number | null
  effectiveInputTokens: number
}

export interface LongDocumentExecutionPlan {
  planId: string
  operation: LongDocumentExecutionOperation
  mode: LongDocumentExecutionMode
  segments: LongDocumentExecutionPlanSegment[]
  invariants: LongDocumentInvariant[]
  estimatedPhysicalRequests: number
  progressLabel: string
  finalDraft: boolean
  finalDraftPlan: {
    sourceChars: number
    instruction: string
    continuationEnabled: true
    segmented: boolean
    segments: Array<{ segmentId: string; start: number; end: number }>
  } | null
  totalChars: number
  estimatedDocumentTokens: number
  contextWindow: LongDocumentExecutionPlannerWindow
  decision: LongDocumentExecutionDecision
}

export interface LongDocumentExecutionPlannerInput {
  requestText: string
  content: string
  contextWindowTokens?: number | null
  maxOutputTokens?: number | null
  /** Session-level operation carried over from the already routed workflow. */
  operationHint?: LongDocumentOperationType
}

const RESTRUCTURE_PATTERN = /(重排|排序|重新整理排序|整理排序|统一编号|统一格式|调整顺序)/
const NORMALIZE_PATTERN = /(标点|格式整理|整理.*格式|符号|排版)/
const DEDUPLICATE_PATTERN = /(重复|去重|删.*重复|重复.*删)/
const REWRITE_PATTERN = /(全文重写|重写全文|整篇重写|重写整篇|全文替换|全部替换)/
const TARGETED_EDIT_PATTERN = /(修改|删除|插入|替换|增加|添加|改写|微调|润色|移动)/

function resolvePositiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

function classifyOperation(requestText: string): LongDocumentExecutionOperation {
  const text = requestText.trim()
  if (REWRITE_PATTERN.test(text)) return 'rewrite_segments'
  if (DEDUPLICATE_PATTERN.test(text)) return 'deduplicate'
  if (RESTRUCTURE_PATTERN.test(text)) return 'restructure'
  if (NORMALIZE_PATTERN.test(text)) return 'normalize'
  if (TARGETED_EDIT_PATTERN.test(text)) return 'targeted_edit'
  return 'targeted_edit'
}

function resolveOperation(
  input: LongDocumentExecutionPlannerInput,
): LongDocumentExecutionOperation {
  if (input.operationHint === 'whole-document-restructure') return 'restructure'
  if (input.operationHint === 'whole-document-replacement') return 'rewrite_segments'
  if (input.operationHint === 'large-scope-edit') {
    return DEDUPLICATE_PATTERN.test(input.requestText) ? 'deduplicate' : 'normalize'
  }
  return classifyOperation(input.requestText)
}

export function toLongDocumentOperationType(
  operation: LongDocumentExecutionOperation,
): LongDocumentOperationType {
  if (operation === 'rewrite_segments') return 'whole-document-replacement'
  if (operation === 'restructure') return 'whole-document-restructure'
  if (operation === 'normalize' || operation === 'deduplicate') return 'large-scope-edit'
  return 'targeted-edit'
}

function resolveWindow(input: LongDocumentExecutionPlannerInput): LongDocumentExecutionPlannerWindow {
  const contextWindowTokens = resolvePositiveNumber(input.contextWindowTokens)
  const maxOutputTokens = resolvePositiveNumber(input.maxOutputTokens)
  if (contextWindowTokens == null) {
    return {
      status: 'unknown',
      contextWindowTokens: CONTEXT_BUDGET_DEFAULTS.unknownWindowTokens,
      maxOutputTokens,
      effectiveInputTokens: Math.floor(
        CONTEXT_BUDGET_DEFAULTS.unknownWindowTokens * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio,
      ),
    }
  }
  if (maxOutputTokens != null && maxOutputTokens >= contextWindowTokens * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio) {
    // A provider that declares an output reserve almost equal to the whole
    // window is self-contradictory. Keep planning possible, but surface the
    // conflict instead of silently routing on an effective input of zero.
    return {
      status: 'provider_configuration_conflict',
      contextWindowTokens,
      maxOutputTokens,
      effectiveInputTokens: Math.max(
        1,
        Math.floor(contextWindowTokens * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio),
      ),
    }
  }
  const effectiveInputTokens = Math.max(
    0,
    Math.floor(contextWindowTokens * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio)
      - (maxOutputTokens ?? CONTEXT_BUDGET_DEFAULTS.defaultOutputReserveTokens),
  )
  return {
    status: 'provider-declared',
    contextWindowTokens,
    maxOutputTokens,
    effectiveInputTokens,
  }
}

function resolveDecision(input: {
  window: LongDocumentExecutionPlannerWindow
  estimatedDocumentTokens: number
}): LongDocumentExecutionDecision {
  if (input.window.status === 'provider_configuration_conflict') {
    return 'provider_configuration_conflict'
  }
  if (input.estimatedDocumentTokens <= input.window.effectiveInputTokens) return 'fits'
  return input.estimatedDocumentTokens <= input.window.contextWindowTokens
    ? 'needs_segmentation'
    : 'exceeds_provider'
}

function collectLeafRanges(content: string): Array<{ start: number; end: number }> {
  const structure = parseOutlineStructure(content)
  const ranges: Array<{ start: number; end: number }> = []
  const walk = (nodes: typeof structure.nodes) => {
    for (const node of nodes) {
      if (node.children.length) walk(node.children)
      else ranges.push({ start: node.start, end: node.end })
    }
  }
  walk(structure.nodes)
  if (ranges.length) return ranges
  return [{ start: 0, end: content.length }]
}

function buildFinalDraftSegments(input: {
  content: string
  effectiveInputTokens: number
}): Array<{ segmentId: string; start: number; end: number }> {
  const ranges = collectLeafRanges(input.content)
  const segments: Array<{ segmentId: string; start: number; end: number }> = []
  let batchStart = 0
  let batchEnd = 0
  let batchTokens = 0
  const flush = () => {
    if (batchEnd <= batchStart) return
    segments.push({ segmentId: `segment-${segments.length + 1}`, start: batchStart, end: batchEnd })
    batchStart = batchEnd
    batchTokens = 0
  }
  for (const range of ranges) {
    const sectionTokens = estimateInputTokens(input.content.slice(range.start, range.end))
    if (sectionTokens <= input.effectiveInputTokens) {
      if (batchTokens > 0 && batchTokens + sectionTokens > input.effectiveInputTokens) flush()
      batchEnd = Math.max(batchEnd, range.end)
      batchTokens += sectionTokens
      continue
    }
    let cursor = range.start
    while (cursor < range.end) {
      const approximateMaxChars = Math.max(1, Math.floor(input.effectiveInputTokens * 1.7))
      const chunkEnd = Math.min(range.end, cursor + approximateMaxChars)
      if (batchTokens > 0 && cursor > batchStart) flush()
      batchEnd = chunkEnd
      batchTokens += estimateInputTokens(input.content.slice(cursor, chunkEnd))
      cursor = chunkEnd
    }
  }
  flush()
  if (!segments.length) segments.push({ segmentId: 'segment-1', start: 0, end: input.content.length })
  return segments
}

function buildSegments(input: {
  operation: LongDocumentExecutionOperation
  mode: LongDocumentExecutionMode
  content: string
  effectiveInputTokens: number
}): LongDocumentExecutionPlanSegment[] {
  if (input.operation === 'restructure') {
    return [{
      segmentId: 'structure-reorder',
      range: { startLine: 0, endLine: input.content.length },
      readStrategy: 'outline-plus-slice',
      writeStrategy: 'reorder_sections',
      expectedChange: 'reorder',
      commandLimit: 1,
    }]
  }

  if (input.operation === 'deduplicate') {
    return [{
      segmentId: 'structure-plan',
      range: { startLine: 0, endLine: input.content.length },
      readStrategy: 'outline-plus-slice',
      writeStrategy: 'delete',
      expectedChange: 'remove_duplicate',
      commandLimit: 10,
    }]
  }

  if (input.mode === 'direct') {
    return [{
      segmentId: 'targeted-edit',
      range: { startLine: 0, endLine: input.content.length },
      readStrategy: 'full',
      writeStrategy: 'replace_match',
      expectedChange: 'rewrite',
      commandLimit: 10,
    }]
  }

  const ranges = collectLeafRanges(input.content)
  const segments: LongDocumentExecutionPlanSegment[] = []
  let batchStart = 0
  let batchEnd = 0
  let batchTokens = 0
  let segmentIndex = 0
  const flush = () => {
    if (batchEnd <= batchStart) return
    segmentIndex += 1
    segments.push({
      segmentId: `segment-${segmentIndex}`,
      range: { startLine: batchStart, endLine: batchEnd },
      readStrategy: 'slice',
      writeStrategy: input.operation === 'normalize' ? 'rewrite_segment' : 'rewrite_segment',
      expectedChange: input.operation === 'normalize' ? 'normalize' : 'rewrite',
      commandLimit: 10,
    })
    batchStart = batchEnd
    batchTokens = 0
  }
  for (const range of ranges) {
    const sectionTokens = estimateInputTokens(input.content.slice(range.start, range.end))
    if (sectionTokens <= input.effectiveInputTokens) {
      if (batchTokens > 0 && batchTokens + sectionTokens > input.effectiveInputTokens) flush()
      batchEnd = Math.max(batchEnd, range.end)
      batchTokens += sectionTokens
      continue
    }
    let cursor = range.start
    while (cursor < range.end) {
      const remaining = range.end - cursor
      const approximateMaxChars = Math.max(1, Math.floor(input.effectiveInputTokens * 1.7))
      const chunkEnd = Math.min(range.end, cursor + approximateMaxChars)
      if (batchTokens > 0 && cursor > batchStart) flush()
      batchEnd = chunkEnd
      batchTokens += estimateInputTokens(input.content.slice(cursor, chunkEnd))
      cursor = chunkEnd
    }
  }
  flush()
  if (!segments.length) {
    segments.push({
      segmentId: 'segment-1',
      range: { startLine: 0, endLine: input.content.length },
      readStrategy: 'slice',
      writeStrategy: 'rewrite_segment',
      expectedChange: input.operation === 'normalize' ? 'normalize' : 'rewrite',
      commandLimit: 10,
    })
  }
  return segments
}

export function buildLongDocumentExecutionPlan(
  input: LongDocumentExecutionPlannerInput,
): LongDocumentExecutionPlan {
  const operation = resolveOperation(input)
  const window = resolveWindow(input)
  const estimatedDocumentTokens = estimateInputTokens(input.content)
  const decision = resolveDecision({ window, estimatedDocumentTokens })
  const finalDraft = operation !== 'targeted_edit'
  const mode: LongDocumentExecutionMode = finalDraft ? 'final-draft' : 'direct'
  const finalDraftSegments = finalDraft && decision !== 'fits' && decision !== 'provider_configuration_conflict'
    ? buildFinalDraftSegments({ content: input.content, effectiveInputTokens: window.effectiveInputTokens })
    : []
  const segments = mode === 'final-draft'
    ? []
    : buildSegments({
      operation,
      mode,
      content: input.content,
      effectiveInputTokens: window.effectiveInputTokens,
    })
  const invariants: LongDocumentInvariant[] = []
  const operationLabels: Record<LongDocumentExecutionOperation, string> = {
    restructure: '终稿重排',
    normalize: '终稿整理',
    deduplicate: '终稿去重',
    targeted_edit: '局部修改',
    rewrite_segments: '终稿重写',
  }
  return {
    planId: `long-document-${Date.now().toString(36)}`,
    operation,
    mode,
    segments,
    invariants,
    estimatedPhysicalRequests: mode === 'final-draft' ? 1 : mode === 'direct' ? 1 : segments.length,
    finalDraft,
    finalDraftPlan: finalDraft ? {
      sourceChars: input.content.length,
      instruction: input.requestText,
      continuationEnabled: true,
      segmented: finalDraftSegments.length > 1,
      segments: finalDraftSegments.length
        ? finalDraftSegments
        : [{ segmentId: 'segment-1', start: 0, end: input.content.length }],
    } : null,
    progressLabel: finalDraft
      ? `${operationLabels[operation]}：生成中`
      : `${operationLabels[operation]}：0/${segments.length}`,
    totalChars: input.content.length,
    estimatedDocumentTokens,
    contextWindow: window,
    decision,
  }
}
