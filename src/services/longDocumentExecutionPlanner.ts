import { CONTEXT_BUDGET_DEFAULTS, estimateInputTokens } from './contextBudget'
import { type DocumentTransformOperation, transformDocument } from './documentTransformService'
import type { LongDocumentOperationType } from './longDocumentPolicy'
import { calculateLongDocumentPhysicalRequestBudget } from './longDocumentWriteProtocol'
import { parseOutlineStructure } from './outlineStructure'
import type { ActiveExecutionTaskStatus } from './activeExecutionTaskStore'

type PlannerIntent = 'analyze' | 'edit' | 'generate' | 'discuss' | 'auto'

export type LongDocumentExecutionOperation =
  | 'restructure'
  | 'restructure_and_cleanup'
  | 'normalize'
  | 'deduplicate'
  | 'deduplicate_and_normalize'
  | 'targeted_edit'
  | 'rewrite_segments'
  | 'discussion'

export type LongDocumentExecutionMode =
  | 'direct'
  | 'edit-task'
  | 'final-draft'
  | 'local-transform'
  | 'single-pass'

export type LongDocumentExecutionDecision =
  | 'fits'
  | 'needs_segmentation'
  | 'exceeds_provider'
  | 'provider_configuration_conflict'

export type LongDocumentExpectedChange =
  | 'none'
  | 'reorder'
  | 'restructure'
  | 'normalize'
  | 'remove_duplicate'
  | 'rewrite'

// Whole-document work stays on the EditTask path even when a huge provider
// window reports "fits": a single direct turn has no batch checkpoints and
// still hits the short-document hard deadline.
const WHOLE_DOCUMENT_EDIT_TASK_MIN_CHARS = 20_000

export function usesLongDocumentToolRuntime(plan: LongDocumentExecutionPlan): boolean {
  if (plan.mode === 'edit-task' || plan.mode === 'final-draft' || plan.mode === 'single-pass') return true
  // "fits" describes the provider window, not the amount of editor work. A
  // large document still needs the long-document watchdog and no fixed hard
  // deadline even when a targeted edit stays on the direct path.
  return plan.totalChars >= WHOLE_DOCUMENT_EDIT_TASK_MIN_CHARS
}

export type LongDocumentWriteStrategy =
  | 'move'
  | 'structure_repair'
  | 'reorder_sections'
  | 'replace_match'
  | 'rewrite'
  | 'delete'

export type LongDocumentInvariant =
  | 'leaf-body-multiset-unchanged'
  | 'normalize-changes-punctuation-whitespace-format-only'
  | 'planned-deletion-only'
  | 'authorized-rewrite'
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
  operationResolution: {
    source:
      | 'intent'
      | 'intent-fallback'
      | 'lexical'
      | 'active-task-continuation'
      | 'active-plan-continuation'
    intent?: PlannerIntent
    matched: LongDocumentOperationType | LongDocumentExecutionOperation
  }
  mode: LongDocumentExecutionMode
  segments: LongDocumentExecutionPlanSegment[]
  invariants: LongDocumentInvariant[]
  estimatedPhysicalRequests: number
  progressLabel: string
  finalDraft: boolean
  localTransformOperations: DocumentTransformOperation[] | null
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
  /** Routed dialogue intent; read-only intents override lexical fallback. */
  intent?: PlannerIntent
  /** True only for a routed confirmation of the awaiting plan, not for any new edit request. */
  activePlanConfirmation?: boolean
  /** Active compound task supplied by the workspace; continuation only, never a SKILL grant. */
  activeTask?: {
    taskId: string
    operation: LongDocumentExecutionOperation
    originalRequest: string
    status?: ActiveExecutionTaskStatus
    plan?: LongDocumentExecutionPlan
  }
}

export function resolveLocalTransformOperations(
  operation: LongDocumentExecutionOperation,
  requestText: string,
): DocumentTransformOperation[] | null {
  if (operation === 'normalize') {
    if (NORMALIZE_HEADING_PATTERN.test(requestText)) return null
    const operations: DocumentTransformOperation[] = []
    if (/(标点|符号)/.test(requestText)) operations.push('normalize_punctuation')
    if (/(空行|空白行)/.test(requestText)) operations.push('normalize_blank_lines')
    if (/编号/.test(requestText)) operations.push('normalize_numbering')
    if (WORD_FORMAT_RESTRUCTURE_PATTERN.test(requestText)) operations.push('word_layout_normalize')
    return operations.length ? operations : null
  }
  if (operation === 'restructure') return ['reorder_sections']
  if (operation === 'deduplicate') return ['remove_exact_duplicates']
  const collectCleanupOperations = (): DocumentTransformOperation[] => {
    const operations: DocumentTransformOperation[] = []
    if (/(标点|符号)/.test(requestText)) operations.push('normalize_punctuation')
    if (/(空行|空白行)/.test(requestText)) operations.push('normalize_blank_lines')
    if (/编号/.test(requestText)) operations.push('normalize_numbering')
    return operations
  }
  if (operation === 'deduplicate_and_normalize') {
    return ['remove_exact_duplicates', ...collectCleanupOperations()]
  }
  if (operation === 'restructure_and_cleanup') {
    return ['reorder_sections', ...collectCleanupOperations()]
  }
  if (operation === 'targeted_edit') return null
  if (operation === 'rewrite_segments') return null
  if (operation === 'discussion') return null
  if (WORD_FORMAT_RESTRUCTURE_PATTERN.test(requestText)) return ['word_layout_normalize']
  return null
}

export function isLocalTransformCandidate(
  operation: LongDocumentExecutionOperation,
  requestText: string,
): boolean {
  return resolveLocalTransformOperations(operation, requestText) !== null
}

export function canExecuteLocalTransform(input: {
  operation: LongDocumentExecutionOperation
  requestText: string
  content: string
}): boolean {
  const operations = resolveLocalTransformOperations(input.operation, input.requestText)
  if (!operations) return false
  const needsDeduplicate = hasDeduplicateIntent(input.requestText)
  if (needsDeduplicate && !operations.includes('remove_exact_duplicates')) return false
  if (needsDeduplicate) {
    // Similar-but-different repeats need model judgment. Local execution is
    // allowed only when exact duplicate sections actually exist.
    const deduplicateTrial = transformDocument({
      content: input.content,
      operations: ['remove_exact_duplicates'],
    })
    if (deduplicateTrial.outcome !== 'completed') return false
  }
  const trial = transformDocument({ content: input.content, operations })
  return trial.outcome === 'completed'
}

const RESTRUCTURE_PATTERN = /(重排|排序|重新整理排序|整理排序|统一编号|统一格式|调整顺序)/
const RESTRUCTURE_ALIAS_PATTERN = /(重构|重新组织|Word文档|word文档|WORD文档)/
const WORD_FORMAT_RESTRUCTURE_PATTERN = /(?:Word|word|WORD)文档(?:的)?(?:形式|格式|样式|排版|结构)/
const NORMALIZE_PATTERN = /(标点|格式整理|整理.*格式|符号|排版|空行|空白行|编号.*统一|统一.*编号|编号.*一致|一致.*编号)/
const DEDUPLICATE_PATTERN = /(重复项|重复的|重复内容|重复章节|去重|删.*重复|重复.*删)/
const DEDUPLICATE_NEGATED_CONTEXT_PATTERN = /(未|不|没(?:有)?|无|非)重复/g
const NORMALIZE_HEADING_PATTERN = /(标题层级|编号.*标点|标点.*编号)/
const REWRITE_PATTERN = /(全文重写|重写全文|整篇重写|重写整篇|全文替换|全部替换|一次性替换|替换成新版本|输出完整终稿|生成完整终稿)/
const TARGETED_EDIT_PATTERN = /(修改|删除|删掉|删了|划掉|移除|不要了|插入|替换|增加|新增|添加|追加|补一句|补一段|补上|帮我补|改写|微调|润色|移动|写入)/

function resolvePositiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

function classifyOperation(requestText: string): LongDocumentExecutionOperation {
  const text = requestText.trim()
  if (REWRITE_PATTERN.test(text)) return 'rewrite_segments'
  if (hasDeduplicateIntent(text)) return 'deduplicate'
  if (RESTRUCTURE_PATTERN.test(text)) return 'restructure'
  if (RESTRUCTURE_ALIAS_PATTERN.test(text)) return 'restructure'
  if (NORMALIZE_PATTERN.test(text)) return 'normalize'
  if (TARGETED_EDIT_PATTERN.test(text)) return 'targeted_edit'
  return 'discussion'
}

function hasCompoundCleanupIntent(text: string): boolean {
  // Numbering-only wording often describes structural ordering, not format
  // cleanup. Require an explicit cleanup dimension before the lexical path
  // grants compound-write semantics without a routed intent.
  return hasRestructureIntent(text)
    && (
      /(标点|符号|空行|空白行)/.test(text)
      || hasDeduplicateIntent(text)
    )
}

function isReadOnlyIntent(intent: PlannerIntent): boolean {
  return intent === 'discuss' || intent === 'analyze' || intent === 'auto'
}

function hasRestructureIntent(text: string): boolean {
  return RESTRUCTURE_PATTERN.test(text) || RESTRUCTURE_ALIAS_PATTERN.test(text)
}

function hasNormalizeIntent(text: string): boolean {
  return NORMALIZE_PATTERN.test(text)
    || NORMALIZE_HEADING_PATTERN.test(text)
    || WORD_FORMAT_RESTRUCTURE_PATTERN.test(text)
}

function hasDeduplicateIntent(text: string): boolean {
  // User constraints often mention duplicates only to exclude them ("未重复
  // 的段落不动"). Strip those clauses before deciding whether the request
  // actually asks for duplicate removal.
  return DEDUPLICATE_PATTERN.test(text.replace(DEDUPLICATE_NEGATED_CONTEXT_PATTERN, ''))
}

function hasContinuationSemantics(text: string): boolean {
  return /(符合我的要求|符合要求|分叉一|允许去重|不用出预览|直接写入|继续|上一轮|上一条|刚才)/.test(text)
}

function resolveOperation(
  input: LongDocumentExecutionPlannerInput,
): {
  operation: LongDocumentExecutionOperation
  resolution: LongDocumentExecutionPlan['operationResolution']
} {
  if (input.intent && isReadOnlyIntent(input.intent)) {
    return {
      operation: 'discussion',
      resolution: { source: 'intent', intent: input.intent, matched: 'discussion' },
    }
  }
  const intentRequiresWrite = input.intent === 'edit' || input.intent === 'generate'
  const classifiedForIntent = intentRequiresWrite
    ? classifyWritableOperation(input.requestText)
    : classifyOperation(input.requestText)
  if (
    intentRequiresWrite &&
    classifiedForIntent === 'rewrite_segments' &&
    hasRestructureIntent(input.requestText) &&
    (hasDeduplicateIntent(input.requestText) || hasNormalizeIntent(input.requestText))
  ) {
    return {
      operation: 'rewrite_segments',
      resolution: { source: 'intent', intent: input.intent, matched: 'rewrite_segments' },
    }
  }
  if (
    intentRequiresWrite &&
    hasRestructureIntent(input.requestText) &&
    (hasDeduplicateIntent(input.requestText) || hasNormalizeIntent(input.requestText))
  ) {
    return {
      operation: 'restructure_and_cleanup',
      resolution: { source: 'intent', intent: input.intent, matched: 'restructure_and_cleanup' },
    }
  }
  const classified = classifiedForIntent
  if (classified === 'restructure' && hasCompoundCleanupIntent(input.requestText)) {
    return {
      operation: 'restructure_and_cleanup',
      resolution: { source: 'lexical', matched: 'restructure_and_cleanup' },
    }
  }
  if (classified === 'deduplicate' && hasNormalizeIntent(input.requestText)) {
    return {
      operation: 'deduplicate_and_normalize',
      resolution: { source: 'intent', intent: input.intent, matched: 'deduplicate_and_normalize' },
    }
  }
  if (
    input.activeTask &&
    input.activeTask.operation !== 'discussion' &&
    input.activeTask.operation !== 'rewrite_segments' &&
    input.activeTask.status !== 'completed' &&
    input.activeTask.status !== 'failed' &&
    input.activeTask.status !== 'invalidated' &&
    input.activeTask.status !== 'narrowed' &&
    input.activeTask.status !== 'reset' &&
    hasContinuationSemantics(input.requestText)
  ) {
    const base = input.activeTask.operation
    const addDeduplicate = hasDeduplicateIntent(input.requestText)
    const addNormalize = hasNormalizeIntent(input.requestText)
    if (
      (base === 'restructure' || hasRestructureIntent(input.activeTask.originalRequest)) &&
      (addDeduplicate || addNormalize || hasNormalizeIntent(input.activeTask.originalRequest) || hasDeduplicateIntent(input.activeTask.originalRequest))
    ) {
      return {
        operation: 'restructure_and_cleanup',
        resolution: {
          source: 'active-task-continuation',
          intent: input.intent,
          matched: 'restructure_and_cleanup',
        },
      }
    }
    if (base === 'deduplicate' && addNormalize) {
      return {
        operation: 'deduplicate_and_normalize',
        resolution: {
          source: 'active-task-continuation',
          intent: input.intent,
          matched: 'deduplicate_and_normalize',
        },
      }
    }
  }
  if (intentRequiresWrite) {
    return {
      operation: classified,
      resolution: { source: 'intent', intent: input.intent, matched: classified },
    }
  }
  return {
    operation: classified,
    resolution: { source: 'lexical', matched: classified },
  }
}

function classifyWritableOperation(requestText: string): LongDocumentExecutionOperation {
  const classified = classifyOperation(requestText)
  // A routed write intent already carries the authority signal. Unknown
  // wording must stay targeted and retain the full edit operation set; mapping
  // it to normalize silently forbids deletes and inserts.
  return classified === 'discussion' ? 'targeted_edit' : classified
}

function resolveExecutionMode(input: {
  operation: LongDocumentExecutionOperation
  decision: LongDocumentExecutionDecision
  requestText: string
  content: string
}): LongDocumentExecutionMode {
  if (input.operation === 'discussion') return 'direct'
  if (input.operation === 'rewrite_segments') return 'final-draft'
  if (canExecuteLocalTransform(input)) return 'local-transform'
  if (
    input.operation !== 'targeted_edit' &&
    input.decision === 'fits'
  ) {
    return 'single-pass'
  }
  if (
    input.operation !== 'targeted_edit' &&
    input.content.length >= WHOLE_DOCUMENT_EDIT_TASK_MIN_CHARS
  ) {
    return 'edit-task'
  }
  if (input.operation === 'targeted_edit') {
    return input.decision === 'fits' || input.decision === 'provider_configuration_conflict'
      ? 'direct'
      : 'edit-task'
  }
  return 'edit-task'
}

function resolveInvariants(
  operation: LongDocumentExecutionOperation,
  segments: LongDocumentExecutionPlanSegment[],
): LongDocumentInvariant[] {
  // Structure repair intentionally turns untitled body lines into headings and
  // moves their content into the right section. The multiset invariant only
  // guards pure section reordering, so keeping it here rejects every repair.
  const hasStructureRepair = segments.some(segment => segment.writeStrategy === 'structure_repair')
  switch (operation) {
    case 'discussion':
      return []
    case 'restructure':
      return hasStructureRepair ? [] : ['leaf-body-multiset-unchanged']
    case 'restructure_and_cleanup':
      return [
        ...(hasStructureRepair
          ? []
          : ['leaf-body-multiset-unchanged'] as LongDocumentInvariant[]),
        'planned-deletion-only',
        'normalize-changes-punctuation-whitespace-format-only',
      ]
    case 'normalize':
      return ['normalize-changes-punctuation-whitespace-format-only']
    case 'deduplicate':
      return ['planned-deletion-only']
    case 'deduplicate_and_normalize':
      return ['planned-deletion-only', 'normalize-changes-punctuation-whitespace-format-only']
    case 'rewrite_segments':
      return ['authorized-rewrite']
    case 'targeted_edit':
    default:
      return []
  }
}

function hasSingleTopLevelStructure(content: string): boolean {
  return parseOutlineStructure(content).nodes.length <= 1
}

export function toLongDocumentOperationType(
  operation: LongDocumentExecutionOperation,
): LongDocumentOperationType {
  if (operation === 'discussion') return 'discussion'
  if (operation === 'rewrite_segments') return 'whole-document-replacement'
  if (operation === 'restructure') return 'whole-document-restructure'
  if (operation === 'restructure_and_cleanup') return 'whole-document-restructure'
  if (operation === 'normalize' || operation === 'deduplicate'
    || operation === 'deduplicate_and_normalize') return 'large-scope-edit'
  return 'targeted-edit'
}

export function calculateLocalTransformPhysicalRequests(): 0 {
  return 0
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
  if (input.mode === 'single-pass') return []
  if (input.mode === 'local-transform') return []
  if (input.operation === 'discussion') return []
  if (input.operation === 'deduplicate_and_normalize') {
    const normalizeSegments = buildSegments({
      operation: 'normalize',
      mode: input.mode,
      content: input.content,
      effectiveInputTokens: input.effectiveInputTokens,
    }).map(segment => ({
      ...segment,
      segmentId: `normalize-${segment.segmentId}`,
    }))
    return [{
      segmentId: 'structure-plan',
      range: { startLine: 0, endLine: input.content.length },
      readStrategy: 'outline-plus-slice',
      writeStrategy: 'delete',
      expectedChange: 'remove_duplicate',
      commandLimit: 10,
    }, ...normalizeSegments]
  }

  if (input.operation === 'restructure_and_cleanup') {
    const structureSegments = buildSegments({
      operation: 'restructure',
      mode: input.mode,
      content: input.content,
      effectiveInputTokens: input.effectiveInputTokens,
    })
    return [{
      ...structureSegments[0],
    }, ...buildSegments({
      operation: 'deduplicate_and_normalize',
      mode: input.mode,
      content: input.content,
      effectiveInputTokens: input.effectiveInputTokens,
    })]
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

  if (input.operation === 'restructure') {
    const topLevelNodes = parseOutlineStructure(input.content).nodes
    if (topLevelNodes.length <= 1) {
      return [{
        segmentId: 'structure-repair',
        range: { startLine: 0, endLine: input.content.length },
        readStrategy: 'outline-plus-slice',
        writeStrategy: 'structure_repair',
        expectedChange: 'restructure',
        commandLimit: 10,
      }]
    }
    return [{
      segmentId: 'structure-reorder',
      range: { startLine: 0, endLine: input.content.length },
      readStrategy: 'outline-plus-slice',
      writeStrategy: 'reorder_sections',
      expectedChange: 'reorder',
      commandLimit: 1,
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

  const writeStrategy: LongDocumentWriteStrategy = input.operation === 'normalize'
    ? 'replace_match'
    : 'rewrite'
  const expectedChange: LongDocumentExpectedChange = input.operation === 'normalize'
    ? 'normalize'
    : 'rewrite'
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
      writeStrategy,
      expectedChange,
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
      writeStrategy,
      expectedChange,
      commandLimit: 10,
    })
  }
  return segments
}

export function buildLongDocumentExecutionPlan(
  input: LongDocumentExecutionPlannerInput,
): LongDocumentExecutionPlan {
  if (
    (input.activeTask?.status === 'awaiting_user_plan' ||
      input.activeTask?.status === 'active') &&
    input.intent === 'edit' &&
    input.activePlanConfirmation === true &&
    input.activeTask.plan
  ) {
    return {
      ...input.activeTask.plan,
      operationResolution: {
        ...input.activeTask.plan.operationResolution,
        source: 'active-plan-continuation',
        intent: input.intent,
      },
    }
  }
  const { operation, resolution: operationResolution } = resolveOperation(input)
  const window = resolveWindow(input)
  const estimatedDocumentTokens = estimateInputTokens(input.content)
  const decision = resolveDecision({ window, estimatedDocumentTokens })
  const mode = resolveExecutionMode({
    operation,
    decision,
    requestText: input.requestText,
    content: input.content,
  })
  const finalDraft = mode === 'final-draft'
  const singlePass = mode === 'single-pass'
  const finalDraftSegments = finalDraft && decision !== 'fits' && decision !== 'provider_configuration_conflict'
    ? buildFinalDraftSegments({ content: input.content, effectiveInputTokens: window.effectiveInputTokens })
    : []
  const segments = mode === 'final-draft' || mode === 'local-transform' || mode === 'single-pass'
    ? []
    : buildSegments({
      operation,
      mode,
      content: input.content,
      effectiveInputTokens: window.effectiveInputTokens,
    })
  const invariants = mode === 'single-pass'
    ? resolveInvariants(
      operation,
      hasSingleTopLevelStructure(input.content)
        ? [{ segmentId: 'structure-repair', range: { startLine: 0, endLine: 0 }, readStrategy: 'full', writeStrategy: 'structure_repair', expectedChange: 'restructure', commandLimit: 1 }]
        : [],
    )
    : resolveInvariants(operation, segments)
  const operationLabels: Record<LongDocumentExecutionOperation, string> = {
    restructure: '结构重排',
    restructure_and_cleanup: '结构重排与整理',
    normalize: '格式整理',
    deduplicate: '重复删除',
    deduplicate_and_normalize: '重复删除与格式整理',
    targeted_edit: '局部修改',
    rewrite_segments: '终稿重写',
    discussion: '讨论',
  }
  const localTransformOperations = mode === 'local-transform'
    ? resolveLocalTransformOperations(operation, input.requestText)
    : null
  if (mode === 'local-transform' && !localTransformOperations) {
    // Defensive: a future operation must never silently fall back into
    // edit-task; route it to direct instead.
    return buildLongDocumentExecutionPlan({ ...input, requestText: '' })
  }
  return {
    planId: `long-document-${Date.now().toString(36)}`,
    operation,
    operationResolution,
    mode,
    segments,
    invariants,
    estimatedPhysicalRequests: mode === 'local-transform'
      ? 0
      : calculateLongDocumentPhysicalRequestBudget({
        mode,
        operation,
        segments,
      }),
    finalDraft,
    localTransformOperations,
    finalDraftPlan: finalDraft || singlePass ? {
      sourceChars: input.content.length,
      instruction: input.requestText,
      continuationEnabled: true,
      segmented: finalDraft ? finalDraftSegments.length > 1 : false,
      segments: finalDraft
        ? (finalDraftSegments.length
          ? finalDraftSegments
          : [{ segmentId: 'segment-1', start: 0, end: input.content.length }])
        : [{ segmentId: 'whole-document', start: 0, end: input.content.length }],
    } : null,
    progressLabel: mode === 'local-transform'
      ? `${operationLabels[operation]}：本地执行`
      : mode === 'single-pass'
      ? `${operationLabels[operation]}：一次成型`
      : finalDraft
      ? `${operationLabels[operation]}：生成中`
      : `${operationLabels[operation]}：0/${segments.length}`,
    totalChars: input.content.length,
    estimatedDocumentTokens,
    contextWindow: window,
    decision,
  }
}
