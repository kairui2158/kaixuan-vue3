import type { DialogueToolSet, DialogueWorkspace } from './dialogueFoundation'
import { validateDialogueToolSet } from './dialogueFoundation'
import type { EditorTargetSnapshot } from './editorTarget'
import { locateEditorFragment } from './editorEditLocator'
import type { EditorEditCommand } from './editorEditProtocol'
import { buildEditorWriteFailedDiagnostics } from './editorEditDiagnostics'
import {
  EDITOR_EDIT_PROTOCOL_VERSION,
  SUPPORTED_EDITOR_EDIT_PROTOCOL_VERSIONS,
  EDITOR_EDIT_OPERATIONS,
  EDITOR_EDIT_POSITIONS,
  doesEditorEditOperationRequireNonEmptyContent,
  doesEditorEditOperationRequireTarget,
  isEditorEditPositionAllowed,
  normalizeEditorEditOperation,
  normalizeEditorEditPosition,
} from './editorEditSemantics'
import { planEditorEditBatch } from './editorEditBatch'
import type {
  LongDocumentExecutionMode,
  LongDocumentExecutionPlan,
  LongDocumentExecutionPlanSegment,
  LongDocumentExecutionOperation,
  LongDocumentInvariant,
} from './longDocumentExecutionPlanner'
import {
  buildLongDocumentWriteRejectionMessage,
  resolveLongDocumentWriteOperations,
} from './longDocumentWriteProtocol'
import {
  buildEditorDocumentMap,
  createEditorDocumentMapTools,
  enhanceEditorSearchWithDocumentMap,
} from './editorDocumentMap'
import {
  buildSourceContaminationMarkers,
  SOURCE_CONTAMINATION_MARKER_MIN_CHARS,
  type SourceContaminationConversationMessage,
} from './sourceContaminationDetector'
import { parseOutlineStructure, type OutlineStructureNode } from './outlineStructure'
import { validateSkillInput, type JsonSchema } from './skillValidation'

export type AgentToolPolicy = 'read' | 'write'

export interface AgentToolContext {
  projectId: string
  workspace: 'main' | 'outline'
  targetId: string
  readableTargets?: string[]
  writableTarget?: string
  sessionId: string
  iteration: number
  abortSignal?: AbortSignal
}

export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: {
    code: string
    message: string
    retryable?: boolean
  }
}

export interface AgentToolDefinition {
  name: string
  description: string
  policy: AgentToolPolicy
  /** Control tools start requests, cancel runs, or manage lifecycle; read-only rounds reject them even when policy is read. */
  control?: boolean
  /**
   * Static execution policy. Built-in read tools are available without write
   * permission, editor.write requires permission, and external tools that do
   * not declare this field are disabled at the authorization boundary.
   */
  defaultToolPolicy?: 'allowedWithoutPermission' | 'allowedWithPermission' | 'disabled'
  /** Diagnostic-only risk label; it never participates in authorization. */
  riskLevel?: 'low' | 'medium' | 'high'
  /** External skills must mark ownership so built-in-name collisions are rejected safely. */
  origin?: 'built-in' | 'external'
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
  timeoutMs?: number
  execute(input: unknown, context: AgentToolContext): Promise<ToolResult>
}

export interface ToolCallEvent {
  toolName: string
  toolCallId?: string
  policy: AgentToolPolicy
  iteration: number
  input: unknown
  result: ToolResult
  durationMs: number
  protocolVersion?: number
  defaultToolPolicy?: AgentToolDefinition['defaultToolPolicy']
  riskLevel?: AgentToolDefinition['riskLevel']
}

export type ToolEventSink = (event: ToolCallEvent) => void

export interface EditorWriteContaminationDecision {
  type: 'write-contamination-rejected' | 'write-contamination-bypassed'
  payload: {
    decision: 'rejected' | 'user_provided'
    commandIndexes: number[]
    markerCount: number
    excerpt: string
  }
}

function collectWriteContamination(
  commands: EditorEditCommand[],
  conversationMarkers: SourceContaminationConversationMessage[] | undefined,
): { markers: ReturnType<typeof buildSourceContaminationMarkers>; commandIndexes: number[]; excerpt: string[] } {
  const markers = buildSourceContaminationMarkers(conversationMarkers || [])
  const commandIndexes: number[] = []
  const excerpt: string[] = []
  const normalizeFragment = (text: string) => text.replace(/\s+/g, '')
  for (const [index, command] of commands.entries()) {
    const fragments = [command.content, command.target, command.destination]
      .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    const normalizedFragments = fragments.map(normalizeFragment)
    const contaminated = normalizedFragments.some(fragment =>
      markers.some(marker =>
        marker.normalized.length >= SOURCE_CONTAMINATION_MARKER_MIN_CHARS
        && fragment.includes(marker.normalized)))
    if (contaminated) {
      commandIndexes.push(index)
      excerpt.push(...fragments.filter((fragment, fragmentIndex) =>
        markers.some(marker =>
          marker.normalized.length >= SOURCE_CONTAMINATION_MARKER_MIN_CHARS
          && normalizedFragments[fragmentIndex].includes(marker.normalized))))
    }
  }
  return { markers, commandIndexes, excerpt }
}

function isUserProvidedWriteContent(
  command: EditorEditCommand,
  userRequestText: string | undefined,
): boolean {
  if (!userRequestText) return false
  return [command.content, command.target, command.destination]
    .some(fragment => typeof fragment === 'string' && userRequestText.includes(fragment))
}

function guardEditorWriteContamination(
  commands: EditorEditCommand[],
  options: {
    conversationMarkers?: SourceContaminationConversationMessage[]
    userRequestText?: string
    onContaminationDecision?: (decision: EditorWriteContaminationDecision) => void
  },
): ToolResult | null {
  if (!options.conversationMarkers?.length) return null
  const contamination = collectWriteContamination(commands, options.conversationMarkers)
  if (!contamination.commandIndexes.length) return null
  const userProvidedIndexes = contamination.commandIndexes.filter(index =>
    isUserProvidedWriteContent(commands[index], options.userRequestText))
  const bypassed = contamination.commandIndexes.length === userProvidedIndexes.length
  options.onContaminationDecision?.({
    type: bypassed ? 'write-contamination-bypassed' : 'write-contamination-rejected',
    payload: {
      decision: bypassed ? 'user_provided' : 'rejected',
      commandIndexes: contamination.commandIndexes,
      markerCount: contamination.markers.length,
      excerpt: contamination.excerpt.join('\n').slice(0, 160),
    },
  })
  if (bypassed) return null
  return {
    ok: false,
    error: {
      code: 'conversation_contamination',
      message: '写入内容包含历史对话表述，已整批拒绝。请基于编辑器原文重新生成，不要把对话里的说明当成正文写入。',
      retryable: true,
    },
    data: {
      guard: {
        decision: 'rejected',
        commandIndexes: contamination.commandIndexes,
        markerCount: contamination.markers.length,
        repairPolicy: '请重新读取目标原文，并只提交用户明确要求写入的新内容。',
      },
    },
  }
}

function batchDetailFromPlan(
  plan: LongDocumentExecutionPlan | undefined,
): EditorWriteApplyInput['batchDetail'] {
  const segment = plan?.segments[0]
  if (!segment) return undefined
  const invariantResult = plan.invariants[0]
  return {
    segmentId: segment.segmentId,
    expectedChange: segment.expectedChange,
    range: segment.range,
    writeStrategy: segment.writeStrategy,
    ...(invariantResult ? { invariantResult } : {}),
  }
}

/**
 * Bind each EditTask batch to the planner segment that produced it. Callers
 * may preselect a segment; otherwise the first segment remains the documented
 * initial target.
 */
function batchDetailFromPlanForBatch(
  plan: LongDocumentExecutionPlan | undefined,
  input: Pick<EditorWriteApplyInput, 'batchDetail'> & Pick<EditorWriteApplyInput, 'commands'>,
): EditorWriteApplyInput['batchDetail'] {
  if (!plan) return input.batchDetail
  const inferredOperations = input.commands.map(command => inferPlannedOperationFromCommand(command))
  const primaryInferredOperation = inferredOperations.includes('structure_repair')
    ? 'structure_repair'
    : inferredOperations.includes('delete')
      ? 'delete'
      : inferredOperations[0]
  const inferredOperation = input.commands.length === 1 && input.commands[0].operation === 'reorder_sections'
    ? 'reorder_sections'
    : primaryInferredOperation || null
  const allowedSegmentStrategies: Record<'reorder_sections' | 'structure_repair' | 'delete' | 'normalize', string[]> = {
    reorder_sections: ['reorder_sections'],
    structure_repair: ['structure_repair'],
    delete: ['delete'],
    normalize: ['replace_match', 'rewrite'],
  }
  const matchingSegment = inferredOperation
    ? plan.segments.find(segment =>
      allowedSegmentStrategies[inferredOperation].includes(segment.writeStrategy))
    : undefined
  const segment = matchingSegment
    || plan.segments.find(item => item.segmentId === input.batchDetail?.segmentId)
    || plan.segments[0]
  if (!segment) return input.batchDetail
  const segmentInvariant = segment.writeStrategy === 'delete'
    ? plan.invariants.find(invariant => invariant === 'planned-deletion-only')
    : ['replace_match', 'rewrite'].includes(segment.writeStrategy)
      ? plan.invariants.find(invariant => invariant === 'normalize-changes-punctuation-whitespace-format-only')
      : undefined
  const invariantResult = segmentInvariant || input.batchDetail?.invariantResult || plan.invariants[0]
  return {
    segmentId: segment.segmentId,
    expectedChange: segment.expectedChange,
    range: segment.range,
    writeStrategy: segment.writeStrategy,
    ...(invariantResult ? { invariantResult } : {}),
  }
}

function segmentRangeIntersects(
  range: { start: number; end: number },
  segment: LongDocumentExecutionPlanSegment,
): boolean {
  return range.start < segment.range.endLine && range.end > segment.range.startLine
}

function inferCommandSegmentsForPlan(
  item: { command: EditorEditCommand; plan: { range: { start: number; end: number } } },
  plan: LongDocumentExecutionPlan,
): LongDocumentExecutionPlan['segments'][number][] {
  const commandSegments = plan.segments.filter(segment => segmentRangeIntersects(item.plan.range, segment))
  const inferredOperation = inferPlannedOperationFromCommand(item.command)
  const strategySegments = plan.segments.filter(segment =>
    isCommandStrategyMatch(item.command.operation, inferredOperation, segment.writeStrategy))
  const strategyMatchedRanges = commandSegments.filter(segment => strategySegments.includes(segment))
  return strategyMatchedRanges.length
    ? strategyMatchedRanges
    : commandSegments
}

type InferredPlannedOperation =
  | 'reorder_sections'
  | 'structure_repair'
  | 'delete'
  | 'normalize'

function inferPlannedOperationFromCommand(command: EditorEditCommand): InferredPlannedOperation {
  if (command.operation === 'reorder_sections') return 'reorder_sections'
  if (['move', 'insert'].includes(command.operation)) return 'structure_repair'
  if (command.operation === 'delete') return 'delete'
  if (command.operation === 'replace_match' || command.operation === 'rewrite') {
    return isHeadingLevelRepair(command) ? 'structure_repair' : 'normalize'
  }
  return 'normalize'
}

function isHeadingLevelRepair(command: EditorEditCommand): boolean {
  if (command.operation !== 'replace_match' && command.operation !== 'rewrite') return false
  const target = command.target?.trim()
  const content = command.content?.trim()
  if (!target || !content) return false
  const firstHeadingLine = (value: string) => {
    const line = value.split(/\r?\n/, 1)[0]?.trim() || ''
    return /^(#{1,6})\s*(.+)$/.exec(line)
  }
  const contentHeading = firstHeadingLine(content)
  if (!contentHeading) return false
  const targetHeading = firstHeadingLine(target)
  return targetHeading
    ? targetHeading[2].trim() === contentHeading[2].trim()
    : target === contentHeading[2].trim()
}

function isCommandStrategyMatch(
  operation: EditorEditCommand['operation'],
  inferredOperation: InferredPlannedOperation,
  writeStrategy: string,
): boolean {
  if (inferredOperation === 'reorder_sections') return writeStrategy === 'reorder_sections'
  if (inferredOperation === 'delete') return writeStrategy === 'delete'
  if (inferredOperation === 'structure_repair') {
    return ['move', 'insert', 'replace_match', 'rewrite'].includes(operation)
      && writeStrategy === 'structure_repair'
  }
  return ['replace_match', 'rewrite'].includes(operation)
    && ['replace_match', 'rewrite'].includes(writeStrategy)
}

function buildBatchCoverage(input: {
  plan: LongDocumentExecutionPlan | undefined
  batchId: string
  commands: EditorEditCommand[]
  batchDetail?: EditorWriteApplyInput['batchDetail']
  structureSegments?: Array<{ id: string; start: number; end: number }>
  items?: Array<{ command: EditorEditCommand; plan: { range: { start: number; end: number } } }>
}): NonNullable<EditorWriteApplyInput['coverage']> | undefined {
  if (!input.plan || input.plan.segments.length === 0) return undefined
  const inferredSegment = input.batchDetail?.segmentId
    ? input.plan.segments.find(segment => segment.segmentId === input.batchDetail?.segmentId)
    : undefined
  const declaredSegmentId = inferredSegment?.segmentId
    || (input.plan.segments.length > 1 ? undefined : input.plan.segments[0].segmentId)
  const coverageReason = input.plan.segments.length === 1
    ? (declaredSegmentId ? 'single_segment_plan' as const : 'declared_segment' as const)
    : 'declared_segment' as const
  const segment = declaredSegmentId
    ? input.plan.segments.find(item => item.segmentId === declaredSegmentId)
    : undefined
  const findSegmentsByRange = (range: { start: number; end: number }) =>
    input.plan!.segments.filter(item => segmentRangeIntersects(range, item))
  if (input.commands.length === 1 && input.commands[0].operation === 'reorder_sections' && input.structureSegments?.length) {
    const command = input.commands[0]
    const orderedIds = (command as EditorEditCommand & { order?: string[] }).order || []
    const orderedRanges: Array<{ start: number; end: number }> = []
    for (const id of orderedIds) {
      const range = input.structureSegments.find(item => item.id === id)
      if (range) orderedRanges.push({ start: range.start, end: range.end })
    }
    if (orderedRanges.length === input.structureSegments.length) {
      return {
        batchId: input.batchId,
        ...(segment ? {
          segmentId: segment.segmentId,
          expectedChange: segment.expectedChange,
          writeStrategy: segment.writeStrategy,
        } : {}),
        coverageTrusted: true,
        reason: coverageReason,
        commands: [{
          operation: command.operation,
          ...(segment ? { segmentId: segment.segmentId } : {}),
          start: input.structureSegments[0].start,
          end: input.structureSegments[input.structureSegments.length - 1].end,
          reorderedRanges: orderedRanges,
        }],
      }
    }
  }
  const commands = input.items
    ? input.items.map(item => {
      const commandSegments = inferCommandSegmentsForPlan(item, input.plan!)
      const declaredSegment = input.batchDetail?.segmentId
        ? input.plan!.segments.find(segment => segment.segmentId === input.batchDetail?.segmentId)
        : undefined
      const commandSegment = commandSegments.length === 1
        ? commandSegments[0]
        : commandSegments.find(segment => segment.segmentId === declaredSegment?.segmentId)
          || commandSegments.find(segment => segment.segmentId !== declaredSegment?.segmentId)
      return {
        operation: item.command.operation,
        ...(commandSegment ? { segmentId: commandSegment.segmentId } : {}),
        start: item.plan.range.start,
        end: item.plan.range.end,
      }
    })
    : input.commands.map(command => ({
      operation: command.operation,
      ...(segment ? { segmentId: segment.segmentId } : {}),
      start: 0,
      end: 0,
    }))
  return {
    batchId: input.batchId,
    ...(segment ? {
      segmentId: segment.segmentId,
      expectedChange: segment.expectedChange,
      writeStrategy: segment.writeStrategy,
    } : {}),
    coverageTrusted: Boolean(input.items && input.items.length === input.commands.length),
    reason: coverageReason,
    commands,
  }
}

function buildDirectWriteCoverage(input: {
  plan: LongDocumentExecutionPlan
  batchId: string
  items: Array<{ command: EditorEditCommand; plan: { range: { start: number; end: number } } }>
}): NonNullable<EditorWriteApplyInput['coverage']> {
  const range = input.items.reduce((total, item) => ({
    start: Math.min(total.start, item.plan.range.start),
    end: Math.max(total.end, item.plan.range.end),
  }), { start: Number.POSITIVE_INFINITY, end: Number.NEGATIVE_INFINITY })
  const rangeSegments = input.plan.segments.filter(segment =>
    segmentRangeIntersects(range, segment))
  // Direct writes are model-initiated and carry no batch declaration. A
  // single-segment plan is trusted as a whole; multi-segment plans are trusted
  // only when the actual changed range spans every planned segment.
  const trusted = input.plan.segments.length === 1
    || rangeSegments.length === input.plan.segments.length
  return {
    batchId: input.batchId,
    coverageTrusted: trusted,
    reason: trusted
      ? input.plan.segments.length === 1 ? 'single_segment_plan' : 'declared_segment'
      : 'undeclared_segment',
    commands: input.items.map(item => ({
      operation: item.command.operation,
      ...(trusted && input.plan.segments.length === 1
        ? { segmentId: input.plan.segments[0].segmentId }
        : {}),
      start: item.plan.range.start,
      end: item.plan.range.end,
    })),
  }
}

export type EditorWriteMode = 'direct'

export interface EditorWriteApplyInput {
  workspace: 'main' | 'outline'
  targetId: string
  batchId: string
  next: string
  original: string
  commands: EditorEditCommand[]
  batchDetail?: {
    segmentId: string
    expectedChange: string
    invariantResult?: string
    range?: { startLine: number; endLine: number }
    writeStrategy?: string
  }
  /** Structured execution-coverage record used by task completion checks. */
  coverage?: {
    batchId?: string
    documentVersion?: number
    contentHash?: string
    segmentId?: string
    expectedChange?: string
    writeStrategy?: string
    coverageTrusted: boolean
    reason?: 'single_segment_plan' | 'declared_segment' | 'undeclared_segment' | 'invalid_segment_id' | 'range_mismatch' | 'invalid_coverage'
    commands: Array<{
      operation: string
      segmentId?: string
      start: number
      end: number
      reorderedRanges?: Array<{ start: number; end: number }>
    }>
  }
  reason?: string
  /** Session-state authorization for long-document multi-batch workflows. */
  writeAuthorization?: LongDocumentWriteAuthorization
  reveal: {
    mode: 'stream' | 'instant'
    firstChange: boolean
  }
}

export interface LongDocumentWriteAuthorization {
  source: 'long-document-workflow'
  intent: 'edit' | 'generate'
  operation: LongDocumentExecutionOperation
  mode: LongDocumentExecutionMode
  reason?: string
}

export type EditorWriteApplier = (input: EditorWriteApplyInput) => Promise<
  | { ok: true; rollbackAvailable: boolean; documentVersion?: number; contentHash?: string }
  | { ok: false; code: string; message: string }
>

export interface EditorStructureIdentityReceipt {
  stableIds: string[]
  migratedIds: Array<{ from: string; to: string }>
  addedIds: string[]
  removedIds: string[]
}

function collectStructureIds(nodes: OutlineStructureNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    into.push(node.id)
    collectStructureIds(node.children, into)
  }
  return into
}

function collectStructureNodeIds(node: OutlineStructureNode, into: string[] = []): string[] {
  into.push(node.id)
  for (const child of node.children) collectStructureNodeIds(child, into)
  return into
}

export function buildStructureIdentityReceipt(original: string, next: string): EditorStructureIdentityReceipt {
  const beforeStructure = parseOutlineStructure(original)
  const afterStructure = parseOutlineStructure(next)
  const beforeIds = collectStructureIds(beforeStructure.nodes)
  const afterIds = collectStructureIds(afterStructure.nodes)
  const beforeSet = new Set(beforeIds)
  const afterSet = new Set(afterIds)
  return {
    stableIds: beforeIds.filter(id => afterSet.has(id)),
    migratedIds: afterIds
      .filter(id => id.includes('~') && beforeSet.has(id.split('~')[0]))
      .map(id => ({ from: id.split('~')[0], to: id })),
    addedIds: afterIds.filter(id => !beforeSet.has(id)),
    removedIds: beforeIds.filter(id => !afterSet.has(id)),
  }
}

export interface EditorWriteRetryCarrier {
  workspace: string
  targetId: string
  contentVersion: number
  commands: EditorEditCommand[]
  succeededIndexes: number[]
}

export interface EditorRevealTargetInput {
  fragment?: string
  paragraphIndex?: number
  anchor?: {
    volumeTitle?: string
    chapterTitle?: string
    sectionTitle?: string
  }
  range?: { start: number; end: number }
}

export type EditorRevealFocus = 'auto' | 'start' | 'end' | 'center'

export interface EditorRevealRequest {
  workspace: 'main' | 'outline'
  targetId: string
  start: number
  end: number
  focus: EditorRevealFocus
  highlightMs: number
  reason?: string
}

export type EditorRevealer = (request: EditorRevealRequest) => Promise<void>

const MAX_CONTEXT_WINDOW = 300
const MAX_SEARCH_RESULTS = 20
const MAX_SEARCH_PAGE_RESULTS = 50
const MAX_REVEAL_RANGE = 20000

interface RevealSuccess {
  ok: true
  start: number
  end: number
  line: number
  structurePath: string[]
  degraded: boolean
}

interface RevealFailure {
  ok: false
  code: string
  message: string
  retryable: boolean
  data?: unknown
}

function buildStructurePath(
  structure: ReturnType<typeof parseOutlineStructure>,
  start: number,
  end: number
): string[] {
  const path: string[] = []
  const walk = (nodes: OutlineStructureNode[]): boolean => {
    for (const node of nodes) {
      if (node.end <= start) continue
      if (node.start >= end) continue
      path.push(node.title)
      if (walk(node.children)) return true
      return true
    }
    return false
  }
  walk(structure.nodes)
  return path
}

function resolveRevealRange(target: EditorRevealTargetInput, content: string): RevealSuccess | RevealFailure {
  const hasFragment = typeof target.fragment === 'string' && target.fragment.trim().length > 0
  const hasParagraphIndex = typeof target.paragraphIndex === 'number' && Number.isFinite(target.paragraphIndex)
  const hasAnchor = !!target.anchor && [
    target.anchor.volumeTitle,
    target.anchor.chapterTitle,
    target.anchor.sectionTitle,
  ].some(title => typeof title === 'string' && title.trim().length > 0)
  const hasRange = !!target.range && Number.isFinite(target.range.start) && Number.isFinite(target.range.end)
  if ([hasFragment, hasParagraphIndex, hasAnchor, hasRange].filter(Boolean).length !== 1) {
    return {
      ok: false,
      code: 'invalid_input',
      message: 'target 必须且只能提供 fragment / paragraphIndex / anchor / range 之一',
      retryable: true,
    }
  }

  const structure = parseOutlineStructure(content)
  const toSuccess = (start: number, end: number, degraded = structure.degraded): RevealSuccess => ({
    ok: true,
    start,
    end,
    line: content.slice(0, start).split('\n').length,
    structurePath: buildStructurePath(structure, start, end),
    degraded,
  })

  if (hasFragment) {
    const located = locateEditorFragment({ content, fragment: target.fragment as string })
    if (located.ok) {
      return toSuccess(located.start, located.end)
    }
    if (located.reason === 'ambiguous_target') {
      return {
        ok: false,
        code: 'ambiguous_target',
        message: located.message,
        retryable: true,
        data: { matches: located.matches },
      }
    }
    if (located.reason === 'target_not_found' && located.candidates?.length) {
      return {
        ok: false,
        code: 'target_not_found',
        message: located.message,
        retryable: true,
        data: { candidates: located.candidates },
      }
    }
    return {
      ok: false,
      code: located.reason || 'target_not_found',
      message: located.message,
      retryable: true,
    }
  }

  if (hasParagraphIndex) {
    const index = target.paragraphIndex as number
    if (index < 0) {
      return { ok: false, code: 'invalid_input', message: 'paragraphIndex 不能为负数', retryable: true }
    }
    const paragraphs = content.split(/\n{2,}/)
    if (index >= paragraphs.length) {
      return {
        ok: false,
        code: 'target_not_found',
        message: `段落索引不存在：当前共 ${paragraphs.length} 段，合法范围 0-${paragraphs.length - 1}`,
        retryable: true,
      }
    }
    let cursor = 0
    for (let current = 0; current < index; current += 1) {
      cursor += paragraphs[current].length + 2
    }
    return toSuccess(cursor, cursor + paragraphs[index].length, true)
  }

  if (hasAnchor) {
    const anchor = target.anchor!
    const wanted = anchor.sectionTitle || anchor.chapterTitle || anchor.volumeTitle || ''
    const exact = content.indexOf(wanted)
    if (exact < 0) {
      return {
        ok: false,
        code: 'target_not_found',
        message: '结构锚点不存在；请改用候选锚点或先读取结构地图',
        retryable: true,
        data: { anchor },
      }
    }
    const nextBreak = content.indexOf('\n', exact + wanted.length)
    const end = nextBreak < 0 ? content.length : nextBreak
    return toSuccess(exact, end)
  }

  const range = target.range!
  const start = Math.max(0, Math.floor(range.start))
  const end = Math.min(content.length, Math.ceil(range.end))
  if (end <= start) {
    return { ok: false, code: 'invalid_input', message: 'range.end 必须大于 range.start', retryable: true }
  }
  if (end - start > MAX_REVEAL_RANGE) {
    return { ok: false, code: 'range_too_large', message: '定位范围不能超过 20000 字符', retryable: true }
  }
  return toSuccess(start, end)
}

function toolError(code: string, message: string, retryable = false): ToolResult {
  return { ok: false, error: { code, message, retryable } }
}

function collectStructureAnchors(content: string, fragment: string): Array<{
  sectionId: string
  sectionTitle: string
}> {
  const anchors: Array<{ sectionId: string; sectionTitle: string }> = []
  const walk = (nodes: OutlineStructureNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'volume' || node.kind === 'chapter' || node.kind === 'section' || node.kind === 'heading') {
        const nodeText = content.slice(node.start, node.end)
        if (!fragment || nodeText.includes(fragment) || node.summaryHead.includes(fragment)) {
          anchors.push({ sectionId: node.id, sectionTitle: node.title })
        }
      }
      walk(node.children)
    }
  }
  walk(parseOutlineStructure(content).nodes)
  return anchors
}

function locateErrorMessage(base: string, anchors: Array<{ sectionId: string; sectionTitle: string }>): string {
  if (!anchors.length) return base
  const anchorText = anchors.slice(0, 5)
    .map(anchor => `${anchor.sectionId} ${anchor.sectionTitle}`)
    .join(' | ')
  return `${base}；优先使用结构锚点缩小目标：${anchorText}`
}

function contextWindow(content: string, start: number, end: number): string {
  const from = Math.max(0, Math.floor((start + end) / 2) - MAX_CONTEXT_WINDOW / 2)
  const to = Math.min(content.length, from + MAX_CONTEXT_WINDOW)
  return content.slice(from, to)
}

function collectLeafBodyMultiset(content: string): string[] {
  const structure = parseOutlineStructure(content)
  const bodies: string[] = []
  const walk = (nodes: OutlineStructureNode[]) => {
    for (const node of nodes) {
      if (node.children.length) {
        walk(node.children)
      } else {
        bodies.push(content.slice(node.contentStart, node.end).trim())
      }
    }
  }
  walk(structure.nodes)
  return bodies.length ? bodies : [content.trim()]
}

function hasSameLeafBodyMultiset(before: string, after: string): boolean {
  const beforeBodies = collectLeafBodyMultiset(before)
  const afterBodies = collectLeafBodyMultiset(after)
  if (beforeBodies.length !== afterBodies.length) return false
  const counts = new Map<string, number>()
  for (const body of beforeBodies) counts.set(body, (counts.get(body) ?? 0) + 1)
  for (const body of afterBodies) {
    const count = counts.get(body)
    if (!count) return false
    counts.set(body, count - 1)
  }
  return true
}

function collectStructureSegments(content: string): Array<{
  id: string
  start: number
  end: number
}> {
  const structure = parseOutlineStructure(content)
  // Top-level nodes cover the whole document exactly once. Descending here
  // would make a parent segment overlap its children and duplicate content.
  return structure.nodes.map(node => ({ id: node.id, start: node.start, end: node.end }))
}


function findMatches(content: string, query: string, caseSensitive: boolean): Array<{ start: number; end: number }> {
  if (!query) return []
  const haystack = caseSensitive ? content : content.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const matches: Array<{ start: number; end: number }> = []
  let index = haystack.indexOf(needle)
  while (index >= 0 && matches.length <= MAX_SEARCH_RESULTS) {
    matches.push({ start: index, end: index + needle.length })
    index = haystack.indexOf(needle, index + 1)
  }
  return matches
}

export function createEditorTools(options: {
  getSnapshot: () => EditorTargetSnapshot | null
  getAllSnapshots?: () => EditorTargetSnapshot[]
  mode?: EditorWriteMode
  applyWrite?: EditorWriteApplier
  revealTarget?: EditorRevealer
  workspace?: DialogueWorkspace
  onFailedBatch?: (batch: EditorWriteRetryCarrier | null) => void
  takeFailedBatch?: () => EditorWriteRetryCarrier | null
  maxReadChars?: () => number
  executionPlan?: LongDocumentExecutionPlan
  writeAuthorization?: LongDocumentWriteAuthorization
  conversationMarkers?: SourceContaminationConversationMessage[]
  userRequestText?: string
  onContaminationDecision?: (decision: EditorWriteContaminationDecision) => void
}): AgentToolDefinition[] {
  const getState: AgentToolDefinition = {
    name: 'editor.get_state',
    description: '读取当前编辑目标摘要：目标、字数、选区、快照版本。不返回全文。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      const snapshot = options.getSnapshot()
      if (!snapshot) return toolError('target_missing', '当前没有可编辑目标')
      return {
        ok: true,
        data: {
          workspace: snapshot.workspace,
          targetId: snapshot.targetId,
          label: snapshot.label,
          contentLength: snapshot.content.length,
          contentPreview: snapshot.content.slice(0, 240),
          contentVersion: snapshot.contentVersion,
          selectionStart: snapshot.selectionStart,
          selectionEnd: snapshot.selectionEnd,
          hasSelection: snapshot.selectedText.length > 0,
          selectedTextPreview: snapshot.selectedText.slice(0, 240),
          mode: snapshot.mode,
        },
      }
    },
  }

  const search: AgentToolDefinition = {
    name: 'editor.search',
    description: '按关键词搜索编辑内容，返回少量位置和上下文窗口。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索文本' },
        caseSensitive: { type: 'boolean', description: '是否区分大小写，默认 false' },
        offset: { type: 'number', description: '命中分页偏移，默认 0' },
        limit: { type: 'number', description: '单次返回命中数量，默认 20，最大 50' },
      },
      required: ['query'],
    },
    async execute(input) {
      const snapshot = options.getSnapshot()
      if (!snapshot) return toolError('target_missing', '当前没有可编辑目标')
      const params = input as { query?: unknown; caseSensitive?: unknown; offset?: unknown; limit?: unknown }
      if (typeof params.query !== 'string' || !params.query.trim()) {
        return toolError('invalid_input', 'query 必须是非空字符串')
      }
      const caseSensitive = params.caseSensitive === true
      const offset = typeof params.offset === 'number' && Number.isFinite(params.offset) && params.offset >= 0
        ? Math.floor(params.offset)
        : 0
      const limit = typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 0
        ? Math.min(Math.floor(params.limit), MAX_SEARCH_PAGE_RESULTS)
        : MAX_SEARCH_RESULTS
      const result = enhanceEditorSearchWithDocumentMap({
        content: snapshot.content,
        map: buildEditorDocumentMap(snapshot.content),
        query: params.query,
        caseSensitive,
        offset,
        limit: Math.max(1, limit),
      })
      if (!result.ok) {
        return { ok: false, error: { code: result.error.code, message: result.error.message, retryable: true } }
      }
      return { ok: true, data: result.data }
    },
  }

  const locate: AgentToolDefinition = {
    name: 'editor.locate',
    description: '验证候选片段是否唯一存在，并返回位置。精确匹配失败时返回Top-3模糊候选。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: {
      type: 'object',
      properties: { fragment: { type: 'string', description: '从原文逐字复制的候选片段' } },
      required: ['fragment'],
    },
    async execute(input) {
      const snapshot = options.getSnapshot()
      if (!snapshot) return toolError('target_missing', '当前没有可编辑目标')
      const params = input as { fragment?: unknown }
      if (typeof params.fragment !== 'string' || !params.fragment) {
        return toolError('invalid_input', 'fragment 必须是非空字符串')
      }
      const located = locateEditorFragment({ content: snapshot.content, fragment: params.fragment })
      if (located.ok) {
        const match = { start: located.start, end: located.end }
        return {
          ok: true,
          data: {
            unique: true,
            fuzzy: false,
            normalized: located.normalized,
            start: match.start,
            end: match.end,
            context: located.context,
          },
        }
      }
      if (located.reason === 'ambiguous_target') {
        const anchors = collectStructureAnchors(snapshot.content, params.fragment)
        return toolError(
          'ambiguous_target',
          locateErrorMessage('片段出现多次，必须扩展片段使其唯一', anchors),
          true,
        )
      }
      if (located.reason === 'target_not_found' && located.candidates?.length) {
        return {
          ok: true,
          data: {
            unique: false,
            fuzzy: true,
            candidates: located.candidates,
            hint: '精确匹配失败，以下为相似度最高的候选位置，请选择一个并重新定位',
          },
        }
      }
      if (located.reason === 'target_not_found') {
        const anchors = collectStructureAnchors(snapshot.content, '')
        return toolError(
          'target_not_found',
          locateErrorMessage('片段不存在，请重新复制原文', anchors),
          true,
        )
      }
      return toolError('invalid_input', '定位请求无效，请提供非空原文片段')
    },
  }

  const writeEdits: AgentToolDefinition = {
    name: 'editor.write',
    description: '立即写入当前编辑器。提交 1-10 条受限编辑命令；允许操作由当前执行计划决定，应用执行唯一性、版本与锁定校验，通过后立即写入并返回结果；失败返回结构化错误供修正重试。',
    policy: 'write',
    defaultToolPolicy: 'allowedWithPermission',
    riskLevel: 'medium',
    inputSchema: {
      type: 'object',
      properties: {
        protocolVersion: {
          type: 'number',
          description: `编辑直写协议版本，当前为 ${EDITOR_EDIT_PROTOCOL_VERSION}；省略时按 v1 解析`,
        },
        commands: {
          type: 'array',
          description: '1-10 条受限编辑命令',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              operation: { type: 'string', enum: [...EDITOR_EDIT_OPERATIONS] },
              content: { type: 'string' },
              target: { type: 'string' },
              destination: { type: 'string', description: 'move 专用：目标位置的唯一原文片段' },
              destinationPosition: { type: 'string', enum: ['before', 'after'], description: 'move 专用：插入到 destination 之前或之后' },
              order: {
                type: 'array',
                description: 'reorder_sections 专用：当前编辑目标的完整有序顶层结构 ID 列表。不是 document_map 的全部层级 ID；集合必须与顶层结构完全一致',
                items: { type: 'string' },
              },
              position: { type: 'string', enum: [...EDITOR_EDIT_POSITIONS] },
              reason: { type: 'string' },
            },
            required: ['operation'],
          },
        },
        reveal: {
          type: 'object',
          description: '写入后的编辑器定位呈现配置',
          properties: {
            mode: { type: 'string', description: 'stream 或 instant' },
            firstChange: { type: 'boolean', description: '是否定位首处变更，默认 true' },
          },
        },
        reason: { type: 'string', description: '整批写入说明' },
      },
      required: ['commands'],
      additionalProperties: false,
    },
    async execute(input, context) {
      if (options.mode !== 'direct' || !options.applyWrite) {
        return toolError('not_available', '当前会话未启用直写模式')
      }
      const params = input as { commands?: unknown; reason?: unknown; reveal?: unknown }
      if (!Array.isArray(params.commands) || params.commands.length === 0) {
        return toolError('invalid_input', 'commands 必须是非空数组')
      }
      if (params.commands.length > 10) {
        return toolError('too_many_commands', '单批最多 10 条编辑命令')
      }
      const snapshot = options.getSnapshot()
      if (!snapshot) return toolError('target_missing', '当前没有可编辑目标')
      if (context.writableTarget && context.writableTarget !== context.targetId) {
        return toolError('write_target_mismatch', '写入目标与当前编辑目标不一致，禁止跨目标写入')
      }
      if (snapshot.workspace !== context.workspace || snapshot.targetId !== context.targetId) {
        return toolError('write_target_mismatch', '工具目标与当前编辑目标不一致，禁止跨目标写入')
      }

      const totalLength = params.commands.reduce((sum, command) => {
        const item = command as { content?: unknown; target?: unknown }
        return sum + (typeof item?.content === 'string' ? item.content.length : 0) +
          (typeof item?.target === 'string' ? item.target.length : 0)
      }, 0)
      if (totalLength > 60000) {
        return toolError('batch_too_large', '批次内容超过 60000 字符上限')
      }

      const rawCommands = params.commands as Array<Record<string, unknown>>
      const isRestructurePlan = options.executionPlan?.mode === 'edit-task' &&
        options.executionPlan.operation === 'restructure'
      if (
        isRestructurePlan &&
        rawCommands.some(rawCommand => normalizeEditorEditOperation(rawCommand.operation) === 'move') &&
        collectStructureSegments(snapshot.content).length > 10
      ) {
        return toolError(
          'reorder_requires_atomic_command',
          '当前结构节点数超过单批 move 命令上限，整篇重排必须提交单条 reorder_sections 命令，order 包含完整有序结构 ID 列表。',
          true,
        )
      }
      const allowedOperations = resolveLongDocumentWriteOperations(options.executionPlan)
      if (options.executionPlan?.mode === 'final-draft') {
        return toolError(
          'final_draft_mode_active',
          buildLongDocumentWriteRejectionMessage(options.executionPlan),
          true,
        )
      }
      const hasReplaceDocument = rawCommands.some(rawCommand =>
        normalizeEditorEditOperation(rawCommand.operation) === 'replace_document')
      if (
        hasReplaceDocument
        && options.executionPlan?.mode === 'edit-task'
      ) {
        return toolError(
          'document_too_large_for_whole_replacement',
          buildLongDocumentWriteRejectionMessage(options.executionPlan),
          true,
        )
      }
      const disallowedCommand = rawCommands.find(rawCommand => {
        const operation = normalizeEditorEditOperation(rawCommand.operation)
        return operation !== null && !allowedOperations.includes(operation)
      })
      if (disallowedCommand) {
        return toolError(
          'operation_not_allowed_by_execution_plan',
          buildLongDocumentWriteRejectionMessage(options.executionPlan),
          true,
        )
      }
      if (hasReplaceDocument && rawCommands.length !== 1) {
        return toolError('invalid_input', 'replace_document 必须单独成批；局部修改请改用受限编辑命令')
      }
      const hasReorderSections = rawCommands.some(rawCommand =>
        normalizeEditorEditOperation(rawCommand.operation) === 'reorder_sections')
      if (hasReorderSections && rawCommands.length !== 1) {
        return toolError('invalid_input', 'reorder_sections 必须单独成批；请提交完整有序结构 ID 列表')
      }
      const commands: EditorEditCommand[] = rawCommands.map(rawCommand => {
        const operation = normalizeEditorEditOperation(rawCommand.operation)
        const position = normalizeEditorEditPosition(rawCommand.position) || 'cursor'
        return {
          type: 'editor_edit' as const,
          version: 1 as const,
          operation: operation as EditorEditCommand['operation'],
          order: Array.isArray(rawCommand.order)
            && rawCommand.order.every(id => typeof id === 'string' && id.trim())
            && (
              normalizeEditorEditOperation(rawCommand.operation) === 'reorder_sections' ||
              new Set(rawCommand.order.map(id => String(id).trim())).size === rawCommand.order.length
            )
              ? rawCommand.order.map(id => String(id).trim())
              : undefined,
          content: typeof rawCommand.content === 'string' ? rawCommand.content : undefined,
          target: typeof rawCommand.target === 'string' ? rawCommand.target : undefined,
          destination: typeof rawCommand.destination === 'string' ? rawCommand.destination : undefined,
          destinationPosition: rawCommand.destinationPosition === 'before' || rawCommand.destinationPosition === 'after'
            ? rawCommand.destinationPosition
            : undefined,
          position,
          reason: typeof rawCommand.reason === 'string' ? rawCommand.reason : undefined,
          ...(!operation ? { __invalidOperation: rawCommand.operation } : {})
        }
      })

      for (const [index, command] of commands.entries()) {
        if (!command.operation) {
          return {
            ok: false,
            error: {
              code: 'invalid_input',
              message: `commands[${index}].operation 非法；合法值为 ${EDITOR_EDIT_OPERATIONS.join(' | ')}，旧别名 replace_section/rewrite_section 会自动迁移`,
              retryable: true,
            },
            data: buildEditorWriteFailedDiagnostics({
              version: 1,
              ok: false,
              commandCount: commands.length,
              succeededIndexes: commands.map((_, itemIndex) => itemIndex).filter(itemIndex => itemIndex !== index),
              failedItems: [{
                index,
                operation: 'rewrite',
                reason: 'invalid_command',
                message: `operation 非法：${String((command as { __invalidOperation?: unknown }).__invalidOperation ?? '（缺失）')}`,
                suggestion: 'check_operation'
              }],
              invalidValue: String((command as { __invalidOperation?: unknown }).__invalidOperation ?? '（缺失）'),
              validValues: [...EDITOR_EDIT_OPERATIONS],
              summary: `commands[${index}].operation 非法；合法值为 ${EDITOR_EDIT_OPERATIONS.join(' | ')}。批次原子执行，请整批重新提交。`
            }),
          }
        }
        if (doesEditorEditOperationRequireTarget(command.operation) && !command.target) {
          return toolError('invalid_input', `commands[${index}]：${command.operation} 必须携带 target`)
        }
        if (!doesEditorEditOperationRequireTarget(command.operation) && command.target) {
          return toolError('invalid_input', `commands[${index}]：${command.operation} 不允许携带 target，请改用 replace_match/delete/rewrite`)
        }
        if (
          command.operation !== 'replace_document' &&
          doesEditorEditOperationRequireNonEmptyContent(command.operation) &&
          !command.content?.trim()
        ) {
          return toolError('invalid_input', `commands[${index}]：${command.operation} 必须同时携带 target（原文）与 content（新文）；缺失 content 会被视为替换为空，已拒绝写入；若目的是删除原文，请使用 delete 操作`)
        }
        if (command.operation === 'move' && command.content !== undefined && !command.content.trim()) {
          return toolError('invalid_input', `commands[${index}]：move 的 content 可选，但提交时必须是非空追加文本；无需追加请删除 content 字段`)
        }
        if (command.operation === 'replace_document') {
          if (!command.content?.trim()) {
            return toolError('invalid_input', 'replace_document 必须携带完整整理后的全文 content')
          }
          if (command.destination || command.destinationPosition || command.position !== 'cursor') {
            return toolError('invalid_input', 'replace_document 不允许携带 target/destination/position')
          }
        }
        if (command.operation === 'move' && (!command.destination || !command.destinationPosition)) {
          return toolError('invalid_input', `commands[${index}]：move 必须携带唯一 destination 与 destinationPosition(before|after)`)
        }
        if (command.operation === 'reorder_sections') {
          const forbidden = [
            command.content !== undefined ? 'content' : null,
            command.target !== undefined ? 'target' : null,
            command.destination !== undefined ? 'destination' : null,
            command.destinationPosition !== undefined ? 'destinationPosition' : null,
          ].filter(Boolean)
          if (forbidden.length || !command.order?.length) {
            return toolError('invalid_input', `reorder_sections 仅允许 order 与 reason${forbidden.length ? `，禁止携带 ${forbidden.join('/')}` : '，order 必须是非空字符串数组'}`)
          }
        }
        if (command.operation !== 'move' && (command.destination || command.destinationPosition)) {
          return toolError('invalid_input', `commands[${index}]：${command.operation} 不允许携带 destination，destination 仅 move 可用`)
        }
        const position = command.position
        if (position && !isEditorEditPositionAllowed(command.operation, position)) {
          return toolError('invalid_input', `commands[${index}]：${command.operation} 不允许 position=${command.position}`)
        }
      }

      const contamination = guardEditorWriteContamination(commands, options)
      if (contamination) return contamination

      const batch = {
        type: 'editor_edit_batch' as const,
        version: 1 as const,
        target: {
          workspace: snapshot.workspace,
          targetId: snapshot.targetId,
          contentVersion: snapshot.contentVersion,
        },
        commands,
        reason: typeof params.reason === 'string' ? params.reason : undefined,
      }
      // A failed batch is never partially applied. Clear any stale retry
      // carrier, then validate the complete batch the model just submitted.
      options.takeFailedBatch?.()
      if (hasReorderSections) {
        const reorderCommand = commands[0] as EditorEditCommand & { order: string[] }
        const segments = collectStructureSegments(snapshot.content)
        const segmentIds = segments.map(segment => segment.id)
        const requestedIds = reorderCommand.order
        const segmentIdSet = new Set(segmentIds)
        const requestedSet = new Set(requestedIds)
        if (segmentIds.length !== requestedIds.length || requestedIds.some(id => !segmentIdSet.has(id)) || segmentIds.some(id => !requestedSet.has(id))) {
          const expectedTopLevelIds = segmentIds
          return {
            ok: false,
            error: {
              code: 'reorder_id_set_mismatch',
              message: `reorder_sections 的 order 必须与当前顶层结构 ID 集合完全一致（共 ${expectedTopLevelIds.length} 个）：${expectedTopLevelIds.join(' | ')}。document_map 返回的子节点 ID 不参与整篇重排；缺失 ${segmentIds.filter(id => !requestedSet.has(id)).slice(0, 5).join(' | ') || '无'}，多余 ${requestedIds.filter(id => !segmentIdSet.has(id)).slice(0, 5).join(' | ') || '无'}`,
              retryable: true,
            },
            data: {
              expectedTopLevelIds,
              repairPolicy: '请仅使用 expectedTopLevelIds 中的 ID 重新提交一次完整有序列表；不要混入子节点 ID，不要改写正文。',
            },
          }
        }
        const segmentById = new Map(segments.map(segment => [segment.id, segment]))
        const next = requestedIds
          .map(id => segmentById.get(id)!)
          .map(segment => snapshot.content.slice(segment.start, segment.end))
          .join('')
        if (
          options.executionPlan?.invariants.includes('leaf-body-multiset-unchanged') &&
          !hasSameLeafBodyMultiset(snapshot.content, next)
        ) {
          return toolError(
            'invariant_violation',
            '结构重排校验失败：叶子正文集合发生变化。reorder_sections 只能重排结构 ID，不能增删或改写正文。',
            true,
          )
        }
        const reveal = (params.reveal && typeof params.reveal === 'object' && !Array.isArray(params.reveal))
          ? params.reveal as { mode?: unknown; firstChange?: unknown }
          : {}
        const revealMode = reveal.mode === 'instant' ? 'instant' : 'stream'
        const reorderBatchId = `reorder-${Date.now().toString(36)}`
        const reorderBatchDetail = batchDetailFromPlanForBatch(options.executionPlan, {
          batchDetail: batchDetailFromPlan(options.executionPlan),
          commands: [reorderCommand],
        })
        const reorderCoverage = buildBatchCoverage({
          plan: options.executionPlan,
          batchId: reorderBatchId,
          commands: [reorderCommand],
          batchDetail: reorderBatchDetail,
          structureSegments: segments.map(segment => ({ id: segment.id, start: segment.start, end: segment.end })),
        })
        const applyInput = {
          workspace: snapshot.workspace,
          targetId: snapshot.targetId,
          batchId: reorderBatchId,
          next,
          original: snapshot.content,
        commands: [reorderCommand],
        writeAuthorization: options.writeAuthorization,
          coverage: reorderCoverage,
        batchDetail: reorderBatchDetail,
          reason: typeof params.reason === 'string' ? params.reason : undefined,
          reveal: {
            mode: revealMode,
            firstChange: reveal.firstChange !== false,
          },
        } satisfies EditorWriteApplyInput
        const applied = await options.applyWrite(applyInput)
        if (!applied.ok) {
          return toolError(applied.code || 'write_failed', applied.message || '编辑器写入失败，原文未修改', true)
        }
      return {
        ok: true,
        data: {
          status: 'written',
          batchId: reorderBatchId,
          structureIdentity: buildStructureIdentityReceipt(snapshot.content, next),
          repairPolicy: '该批次已按结构 ID 原子重排写入成功。结构 ID 已按语义稳定，未改写的节无需重新取 map；新增/删除/冲突消歧以 structureIdentity 回执为准。',
            commandCount: 1,
            writtenLength: next.length,
            reorderSections: requestedIds.length,
            reveal: { mode: revealMode, firstChange: reveal.firstChange !== false },
            rollbackAvailable: applied.rollbackAvailable,
            ...(reorderCoverage ? {
              coverage: {
                ...reorderCoverage,
                documentVersion: applied.documentVersion,
                contentHash: applied.contentHash,
              },
            } : {}),
          },
        }
      }
      const plan = planEditorEditBatch(batch, snapshot, { content: snapshot.content })
      if (!plan.ok) {
        options.onFailedBatch?.(null)
        const deleteAmbiguousItem = plan.diagnostics?.failedItems.find(item =>
          item.reason === 'ambiguous_target' && item.operation === 'delete')
        const deleteAmbiguousTarget = deleteAmbiguousItem?.target
        if (deleteAmbiguousTarget) {
          const sectionMatches: string[] = []
          const structure = parseOutlineStructure(snapshot.content)
          const collectMatches = (nodes: OutlineStructureNode[]): void => {
            for (const node of nodes) {
              if (node.kind === 'section' || node.kind === 'chapter' || node.kind === 'volume' || node.kind === 'heading') {
                if (snapshot.content.slice(node.start, node.end).includes(deleteAmbiguousTarget)) {
                  sectionMatches.push(node.title)
                }
              }
              collectMatches(node.children)
            }
          }
          collectMatches(structure.nodes)
          const matchingSections = sectionMatches.length
            ? sectionMatches
            : structure.nodes
              .map(node => ({ title: node.title, summaryHead: node.summaryHead }))
              .filter(item => item.summaryHead.includes(deleteAmbiguousTarget))
              .map(item => item.title)
          return toolError(
            'ambiguous_target',
            `commands[${deleteAmbiguousItem.index}]：删除目标出现多次，必须扩展 target 使其在全文唯一，或在 sectionTitle/chapterTitle/volumeTitle 中写明目标标题。候选章节：${matchingSections.slice(0, 5).join(' | ') || '未解析出候选'}`,
            true,
          )
        }
        return {
          ok: false,
          error: {
            code: plan.failureReason || 'invalid_command',
            message: plan.diagnostics?.summary || '编辑批次校验失败，原文未修改',
            retryable: true,
          },
          data: plan.diagnostics ? buildEditorWriteFailedDiagnostics(plan.diagnostics) : undefined,
        }
      }
      options.onFailedBatch?.(null)

      if (
        options.executionPlan?.invariants.includes('leaf-body-multiset-unchanged') &&
        !hasSameLeafBodyMultiset(snapshot.content, plan.next)
      ) {
        return toolError(
          'invariant_violation',
          '结构重排校验失败：叶子正文集合发生变化。重排只能移动标题及其整节内容，不能增删或改写正文。',
          true,
        )
      }

      const reveal = (params.reveal && typeof params.reveal === 'object' && !Array.isArray(params.reveal))
        ? params.reveal as { mode?: unknown; firstChange?: unknown }
        : {}
      const revealMode = reveal.mode === 'instant' ? 'instant' : 'stream'
      const batchCoverage = buildBatchCoverage({
        plan: options.executionPlan,
        batchId: plan.batchId,
        commands,
        batchDetail: batchDetailFromPlanForBatch(options.executionPlan, {
          batchDetail: batchDetailFromPlan(options.executionPlan),
          commands,
        }),
        items: plan.items,
      })
      const effectiveCoverage = options.executionPlan?.mode === 'direct'
        ? buildDirectWriteCoverage({
          plan: options.executionPlan,
          batchId: plan.batchId,
          items: plan.items,
        })
        : batchCoverage
      const applied = await options.applyWrite({
        workspace: snapshot.workspace,
        targetId: snapshot.targetId,
        batchId: plan.batchId,
        next: plan.next,
        original: plan.original,
        commands,
        writeAuthorization: options.writeAuthorization,
        coverage: effectiveCoverage,
        batchDetail: batchDetailFromPlanForBatch(options.executionPlan, {
          batchDetail: batchDetailFromPlan(options.executionPlan),
          commands,
        }),
        reason: typeof params.reason === 'string' ? params.reason : undefined,
        reveal: {
          mode: revealMode,
          firstChange: reveal.firstChange !== false,
        },
      })
      if (!applied.ok) {
        return toolError(applied.code || 'write_failed', applied.message || '编辑器写入失败，原文未修改', true)
      }

      return {
        ok: true,
        data: {
          status: 'written',
          batchId: plan.batchId,
          documentVersion: applied.documentVersion,
          contentHash: applied.contentHash,
          structureIdentity: buildStructureIdentityReceipt(snapshot.content, plan.next),
          repairPolicy: '该批次已写入成功，文档版本已变化。未改写的结构 ID 已保持稳定；仅当 structureIdentity 提示新增、删除或冲突消歧时才需要刷新 editor.document_map。后续修正请基于当前编辑器内容提交新命令，禁止重复提交本 batchId 的相同参数。',
          commandCount: commands.length,
          writtenLength: plan.next.length,
          reveal: { mode: revealMode, firstChange: reveal.firstChange !== false },
          rollbackAvailable: applied.rollbackAvailable,
          ...(effectiveCoverage ? {
            coverage: {
              ...effectiveCoverage,
              documentVersion: applied.documentVersion,
              contentHash: applied.contentHash,
            },
          } : {}),
        },
      }
    }
  }

  const revealTargetTool: AgentToolDefinition = {
    name: 'editor.reveal',
    description: '定位并高亮编辑器中的目标位置，不修改内容。用于回答写入位置、展示候选节点或写入前确认位置。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'object',
          description: '定位目标：fragment / paragraphIndex / anchor / range 四选一',
          properties: {
            fragment: { type: 'string', description: '原文唯一片段' },
            paragraphIndex: { type: 'number', description: '段落索引，从 0 开始' },
            anchor: {
              type: 'object',
              description: '结构锚点，支持卷/章/节标题',
              properties: {
                volumeTitle: { type: 'string' },
                chapterTitle: { type: 'string' },
                sectionTitle: { type: 'string' },
              },
            },
            range: {
              type: 'object',
              description: '精确字符范围',
              properties: {
                start: { type: 'number' },
                end: { type: 'number' },
              },
              required: ['start', 'end'],
            },
          },
        },
        focus: { type: 'string', description: 'auto / start / end / center，默认 auto' },
        highlightDuration: { type: 'number', description: '高亮毫秒数，默认 3000，最大 10000' },
        reason: { type: 'string', description: '定位说明' },
      },
      required: ['target'],
    },
    async execute(input, context) {
      if (!options.revealTarget) {
        return toolError('not_available', '当前会话未启用编辑器定位联动')
      }
      const snapshot = options.getSnapshot()
      if (!snapshot) return toolError('target_missing', '当前没有可编辑目标')
      if (snapshot.workspace !== context.workspace || snapshot.targetId !== context.targetId) {
        return toolError('target_mismatch', '定位目标与当前编辑目标不一致')
      }
      const params = input as {
        target?: EditorRevealTargetInput
        focus?: unknown
        highlightDuration?: unknown
        reason?: unknown
      }
      const target = params.target
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        return toolError('invalid_input', 'target 必须是定位对象')
      }

      const located = resolveRevealRange(target, snapshot.content)
      if (!located.ok) {
        return {
          ok: false,
          error: {
            code: located.code,
            message: located.message,
            retryable: located.retryable,
          },
          ...(located.data ? { data: located.data } : {}),
        }
      }

      const focus: EditorRevealFocus =
        params.focus === 'start' || params.focus === 'end' || params.focus === 'center'
          ? params.focus
          : 'auto'
      const highlightMs = typeof params.highlightDuration === 'number' && Number.isFinite(params.highlightDuration)
        ? Math.max(0, Math.min(10000, Math.floor(params.highlightDuration)))
        : 3000

      try {
        await options.revealTarget({
          workspace: snapshot.workspace,
          targetId: snapshot.targetId,
          start: located.start,
          end: located.end,
          focus,
          highlightMs,
          reason: typeof params.reason === 'string' ? params.reason : undefined,
        })
      } catch (error) {
        return toolError('reveal_failed', `编辑器定位失败：${(error as Error)?.message || String(error)}`, true)
      }

      return {
        ok: true,
        data: {
          status: 'revealed',
          start: located.start,
          end: located.end,
          line: located.line,
          structurePath: located.structurePath,
          degraded: located.degraded,
          context: contextWindow(snapshot.content, located.start, located.end),
        },
      }
    }
  }

  const multiGetState: AgentToolDefinition = {
    name: 'editor.multi_get_state',
    description: '获取多个编辑目标的摘要（最多 5 个）。用于跨目标读取上下文。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: {
      type: 'object',
      properties: {
        targetIds: {
          type: 'array',
          description: '目标 ID 列表，空数组则返回全部 tab',
          items: { type: 'string' },
        },
      },
    },
    async execute(input) {
      if (!options.getAllSnapshots) return toolError('not_available', '当前工作区不支持多目标读取')
      const allSnapshots = options.getAllSnapshots()
      const params = input as { targetIds?: unknown }
      let requestedIds: string[] = []
      if (Array.isArray(params.targetIds)) {
        requestedIds = (params.targetIds as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      }
      const filtered = requestedIds.length > 0
        ? allSnapshots.filter(s => requestedIds.includes(s.targetId))
        : allSnapshots
      const capped = filtered.slice(0, MAX_READABLE_TARGETS)
      if (capped.length === 0) return toolError('no_targets', '没有可读取的编辑目标')
      return {
        ok: true,
        data: {
          total: capped.length,
          truncated: filtered.length > MAX_READABLE_TARGETS,
          targets: capped.map(s => ({
            workspace: s.workspace,
            targetId: s.targetId,
            label: s.label,
            contentLength: s.content.length,
            contentPreview: s.content.slice(0, 240),
            mode: s.mode,
          })),
        },
      }
    },
  }

  const globalSearch: AgentToolDefinition = {
    name: 'editor.global_search',
    description: '跨所有编辑目标搜索关键词，返回每个目标中的匹配位置和上下文。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索文本' },
        caseSensitive: { type: 'boolean', description: '是否区分大小写，默认 false' },
      },
      required: ['query'],
    },
    async execute(input) {
      if (!options.getAllSnapshots) return toolError('not_available', '当前工作区不支持全局搜索')
      const params = input as { query?: unknown; caseSensitive?: unknown }
      if (typeof params.query !== 'string' || !params.query.trim()) {
        return toolError('invalid_input', 'query 必须是非空字符串')
      }
      const caseSensitive = params.caseSensitive === true
      const allSnapshots = options.getAllSnapshots()
      const results = allSnapshots.map(s => {
        const matches = findMatches(s.content, params.query as string, caseSensitive)
        return {
          targetId: s.targetId,
          label: s.label,
          workspace: s.workspace,
          matchCount: matches.length,
          matches: matches.slice(0, 5).map(m => ({
            start: m.start,
            end: m.end,
            context: contextWindow(s.content, m.start, m.end),
          })),
        }
      }).filter(r => r.matchCount > 0)
      return {
        ok: true,
        data: {
          totalTargets: results.length,
          totalMatches: results.reduce((sum, r) => sum + r.matchCount, 0),
          results: results.slice(0, MAX_READABLE_TARGETS),
        },
      }
    },
  }

  const workspaceSummary: AgentToolDefinition = {
    name: 'editor.workspace_summary',
    description: '获取整个工作区结构概览：所有打开的编辑目标列表及摘要。',
    policy: 'read',
    defaultToolPolicy: 'allowedWithoutPermission',
    riskLevel: 'low',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      if (!options.getAllSnapshots) return toolError('not_available', '当前工作区不支持多目标概览')
      const allSnapshots = options.getAllSnapshots()
      if (allSnapshots.length === 0) return toolError('no_targets', '工作区没有打开的编辑目标')
      return {
        ok: true,
        data: {
          totalTargets: allSnapshots.length,
          targets: allSnapshots.map(s => ({
            workspace: s.workspace,
            targetId: s.targetId,
            label: s.label,
            contentLength: s.content.length,
            mode: s.mode,
            hasSelection: s.selectedText.length > 0,
          })),
        },
      }
    },
  }

  const currentTarget = options.getSnapshot()
  const writeTools = options.mode === 'direct' ? [writeEdits] : []
  const readableTargets = options.getAllSnapshots
    ? [...new Set([currentTarget?.targetId, ...options.getAllSnapshots().map(item => item.targetId)].filter(Boolean))]
    : [currentTarget?.targetId].filter(Boolean)
  const declaredReadableTargets: string[] = readableTargets.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  return buildDialogueToolSet({
    workspace: options.workspace || 'main',
    tools: [
      getState,
      ...createEditorDocumentMapTools({
        getSnapshot: options.getSnapshot,
        maxReadChars: options.maxReadChars,
      }),
      search,
      locate,
      ...writeTools,
      revealTargetTool,
      multiGetState,
      globalSearch,
      workspaceSummary,
    ],
    readableTargets: declaredReadableTargets,
    writableTarget: currentTarget?.targetId || '',
  })
}

export function buildDialogueToolSet(input: {
  workspace: DialogueWorkspace
  tools: AgentToolDefinition[]
  readableTargets: string[]
  writableTarget: string
}): AgentToolDefinition[] {
  const toolSet: DialogueToolSet = {
    version: 1,
    workspace: input.workspace,
    tools: input.tools,
    readableTargets: input.readableTargets,
    writableTarget: input.writableTarget,
  }
  const validation = validateDialogueToolSet(toolSet)
  if (!validation.valid) {
    throw new Error(`编辑器工具集契约校验失败：${validation.errors.join('；')}`)
  }
  return validation.tools
}

const MAX_READABLE_TARGETS = 5

export function validateAgentToolInput(tool: AgentToolDefinition, input: unknown): ToolResult | null {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return toolError('invalid_input', '工具参数必须是对象')
  }
  if (tool.name === 'editor.write') {
    const requestedVersion = (input as { protocolVersion?: unknown }).protocolVersion
    if (requestedVersion !== undefined) {
      if (
        typeof requestedVersion !== 'number'
        || !Number.isInteger(requestedVersion)
        || !SUPPORTED_EDITOR_EDIT_PROTOCOL_VERSIONS.includes(requestedVersion)
      ) {
        return toolError(
          'unsupported_protocol_version',
          `不支持的编辑协议版本：${String(requestedVersion)}；当前支持 ${SUPPORTED_EDITOR_EDIT_PROTOCOL_VERSIONS.join(' | ')}`
        )
      }
    }
  }
  const structured = validateSkillInput(input, { inputSchema: tool.inputSchema as JsonSchema })
  const missingRequiredFields = (tool.inputSchema.required || []).filter(key => !(key in (input as Record<string, unknown>)))
  if (tool.name === 'editor.write' && missingRequiredFields.length > 0) {
    const key = missingRequiredFields[0]
    const hint = tool.name === 'editor.write' && key === 'commands'
      ? '请提交 1-10 条受限编辑命令，例如 {"commands":[{"operation":"replace_match","target":"唯一原文片段","content":"新文"}]}'
      : ''
    return {
      ok: false,
      error: {
        code: 'missing_field',
        message: `缺少必填参数：${key}${hint ? `。${hint}` : ''}`,
        retryable: true,
      },
    }
  }
  if (!structured.valid) {
    return {
      ok: false,
      error: {
        code: 'invalid_input',
        message: `工具参数校验失败：${structured.errors.join('；')}。请按错误信息修正后重试失败条目。`,
        retryable: true,
      },
      data: tool.name === 'editor.write' ? buildEditorWriteFailedDiagnostics({
        version: 1,
        ok: false,
        commandCount: Array.isArray((input as { commands?: unknown }).commands)
          ? ((input as { commands: unknown[] }).commands.length)
          : 0,
        succeededIndexes: [],
        failedItems: [],
        invalidValue: undefined,
        validValues: [...EDITOR_EDIT_OPERATIONS],
        summary: structured.errors.join('；')
      }) : undefined,
    }
  }
  return null
}

export function resolveEditorToolProtocolVersion(
  input: unknown,
): { version: number; defaulted: boolean } {
  const requested = (input as { protocolVersion?: unknown } | null | undefined)?.protocolVersion
  if (
    typeof requested === 'number'
    && Number.isInteger(requested)
    && SUPPORTED_EDITOR_EDIT_PROTOCOL_VERSIONS.includes(requested)
  ) {
    return { version: requested, defaulted: false }
  }
  return { version: EDITOR_EDIT_PROTOCOL_VERSION, defaulted: requested === undefined }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : (error as { name?: string } | null)?.name === 'AbortError'
}

export class ToolGateway {
  private tools = new Map<string, AgentToolDefinition>()
  private events: ToolEventSink[] = []

  register(tool: AgentToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  registerAll(tools: AgentToolDefinition[]): void {
    for (const tool of tools) this.register(tool)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  list(): AgentToolDefinition[] {
    return Array.from(this.tools.values())
  }

  onEvent(sink: ToolEventSink): void {
    this.events.push(sink)
  }

  private emit(event: ToolCallEvent): void {
    for (const sink of this.events) sink(event)
  }

  private validateInput(tool: AgentToolDefinition, input: unknown): ToolResult | null {
    return validateAgentToolInput(tool, input)
  }

  async execute(name: string, input: unknown, context: AgentToolContext): Promise<ToolResult> {
    const started = Date.now()
    const tool = this.tools.get(name)
    if (!tool) {
      const result = toolError('tool_not_found', `工具不存在：${name}`)
      this.emit({ toolName: name, policy: 'write', iteration: context.iteration, input, result, durationMs: 0, defaultToolPolicy: 'disabled' })
      return result
    }
    if (context.abortSignal?.aborted) {
      const result = toolError('canceled', '工具调用已被用户取消', true)
      this.emit({ toolName: name, policy: tool.policy, iteration: context.iteration, input, result, durationMs: 0, defaultToolPolicy: tool.defaultToolPolicy, riskLevel: tool.riskLevel })
      return result
    }
    const invalid = this.validateInput(tool, input)
    if (invalid) {
      this.emit({ toolName: name, policy: tool.policy, iteration: context.iteration, input, result: invalid, durationMs: Date.now() - started, defaultToolPolicy: tool.defaultToolPolicy, riskLevel: tool.riskLevel })
      return invalid
    }

    try {
      const result = await tool.execute(input, context)
      this.emit({ toolName: name, policy: tool.policy, iteration: context.iteration, input, result, durationMs: Date.now() - started, defaultToolPolicy: tool.defaultToolPolicy, riskLevel: tool.riskLevel })
      return result
    } catch (error) {
      const result = isAbortError(error)
        ? toolError('canceled', '工具调用已被用户取消', true)
        : toolError('tool_execution_failed', `工具执行失败：${(error as Error)?.message || String(error)}`)
      this.emit({ toolName: name, policy: tool.policy, iteration: context.iteration, input, result, durationMs: Date.now() - started, defaultToolPolicy: tool.defaultToolPolicy, riskLevel: tool.riskLevel })
      return result
    }
  }
}

