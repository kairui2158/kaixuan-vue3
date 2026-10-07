import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import type { ToolResult } from './editorTools'

export interface LongDocumentWriteCoverageCommand {
  operation: string
  segmentId?: string
  start: number
  end: number
  reorderedRanges?: Array<{ start: number; end: number }>
}

export interface LongDocumentWriteCoverageRecord {
  batchId?: string
  documentVersion?: number
  contentHash?: string
  segmentId?: string
  expectedChange?: string
  writeStrategy?: string
  coverageTrusted: boolean
  reason?: 'single_segment_plan' | 'declared_segment' | 'undeclared_segment' | 'invalid_segment_id' | 'range_mismatch' | 'invalid_coverage'
  commands: LongDocumentWriteCoverageCommand[]
}

export interface LongDocumentWriteCoverageSummary {
  complete: boolean
  trusted: boolean
  successfulWriteCount: number
  trustedWriteCount: number
  coveredSegments: string[]
  missingSegments: string[]
  invalidRecords?: Array<Pick<LongDocumentWriteCoverageRecord, 'reason' | 'segmentId'>>
}

function readCoverageRecord(value: unknown): LongDocumentWriteCoverageRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<LongDocumentWriteCoverageRecord>
  const commands = Array.isArray(record.commands) ? record.commands : []
  const normalizedCommands = commands
    .map(command => {
      if (!command || typeof command !== 'object') return null
      const candidate = command as Partial<LongDocumentWriteCoverageCommand>
      if (typeof candidate.operation !== 'string' || !candidate.operation) return null
      if (typeof candidate.start !== 'number' || !Number.isFinite(candidate.start)
        || typeof candidate.end !== 'number' || !Number.isFinite(candidate.end)) return null
      if (candidate.start < 0 || candidate.end < candidate.start) return null
      return {
        operation: candidate.operation,
        ...(typeof candidate.segmentId === 'string' && candidate.segmentId
          ? { segmentId: candidate.segmentId }
          : {}),
        start: candidate.start,
        end: candidate.end,
        ...(Array.isArray(candidate.reorderedRanges)
          && candidate.reorderedRanges.every(range => range
            && typeof range.start === 'number'
            && Number.isFinite(range.start)
            && typeof range.end === 'number'
            && Number.isFinite(range.end)
            && range.end >= range.start)
          ? { reorderedRanges: candidate.reorderedRanges }
          : {}),
      }
    })
    .filter((command): command is LongDocumentWriteCoverageCommand => command !== null)
  if (record.coverageTrusted !== true || normalizedCommands.length === 0) return null
  if (normalizedCommands.length !== commands.length) return null
  return {
    batchId: typeof record.batchId === 'string' ? record.batchId : undefined,
    documentVersion: typeof record.documentVersion === 'number' ? record.documentVersion : undefined,
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : undefined,
    segmentId: typeof record.segmentId === 'string' ? record.segmentId : undefined,
    expectedChange: typeof record.expectedChange === 'string' ? record.expectedChange : undefined,
    writeStrategy: typeof record.writeStrategy === 'string' ? record.writeStrategy : undefined,
    coverageTrusted: true,
    reason: record.reason,
    commands: normalizedCommands,
  }
}

function segmentRangeMatches(
  record: LongDocumentWriteCoverageCommand,
  segment: LongDocumentExecutionPlan['segments'][number],
): boolean {
  if (record.operation === 'reorder_sections' && record.reorderedRanges?.length) {
    return record.reorderedRanges.some(range =>
      record.start < range.end && record.end > range.start)
  }
  const start = record.start
  const end = record.end
  const segmentStart = segment.range.startLine
  const segmentEnd = segment.range.endLine
  // Append coverage starts at the old document boundary; count that boundary
  // as part of the planned segment so an authorized append can complete.
  if (record.operation === 'append') {
    return start <= segmentEnd && end > segmentStart
  }
  return start < segmentEnd && end > segmentStart
}

function countSuccessfulWrites(toolResults: Array<{ call: { name: string }; result: ToolResult }> | undefined): number {
  return (toolResults || []).filter(item =>
    item.result.ok && String(item.call.name).startsWith('editor.write')).length
}

export function collectLongDocumentWriteCoverage(
  toolResults: Array<{ call: { name: string }; result: ToolResult }> | undefined,
): LongDocumentWriteCoverageRecord[] {
  return (toolResults || [])
    .filter(item => item.result.ok && String(item.call.name).startsWith('editor.write'))
    .map(item => {
      // editor.write returns coverage as a nested field of its success data.
      // Accepting the whole data object is only a legacy compatibility path.
      const data = item.result.data as { coverage?: unknown } | undefined
      return readCoverageRecord(data?.coverage ?? item.result.data)
    })
    .filter((record): record is LongDocumentWriteCoverageRecord => record !== null)
}

export function summarizeLongDocumentWriteCoverage(input: {
  plan: LongDocumentExecutionPlan
  coverageRecords: LongDocumentWriteCoverageRecord[]
  toolResults?: Array<{ call: { name: string }; result: ToolResult }>
}): LongDocumentWriteCoverageSummary {
  const successfulWriteCount = input.toolResults
    ? countSuccessfulWrites(input.toolResults)
    : input.coverageRecords.length
  const segments = input.plan.segments
  if (!segments.length) {
    return {
      complete: successfulWriteCount > 0,
      trusted: true,
      successfulWriteCount,
      trustedWriteCount: successfulWriteCount,
      coveredSegments: [],
      missingSegments: [],
    }
  }

  const covered = new Set<string>()
  const invalidRecords: Array<Pick<LongDocumentWriteCoverageRecord, 'reason' | 'segmentId'>> = []
  let trustedWriteCount = 0
  for (const record of input.coverageRecords) {
    const recordDeclaredSegments = new Set(
      record.commands.flatMap(command => (command.segmentId ? [command.segmentId] : [])),
    )
    if (record.segmentId && !segments.some(segment => segment.segmentId === record.segmentId)) {
      invalidRecords.push({ reason: 'invalid_segment_id', segmentId: record.segmentId })
      continue
    }
    if (record.segmentId) recordDeclaredSegments.add(record.segmentId)
    for (const segmentId of recordDeclaredSegments) {
      if (!segments.some(segment => segment.segmentId === segmentId)) {
        invalidRecords.push({ reason: 'invalid_segment_id', segmentId })
      }
    }
    if (invalidRecords.some(item => item.reason === 'invalid_segment_id'
      && (item.segmentId === record.segmentId || recordDeclaredSegments.has(item.segmentId || '')))) continue

    let candidates: typeof segments
    if (record.segmentId) {
      candidates = segments.filter(item => item.segmentId === record.segmentId)
    } else if (recordDeclaredSegments.size > 0) {
      candidates = segments.filter(item => recordDeclaredSegments.has(item.segmentId))
    } else if (segments.length === 1 && record.reason === 'single_segment_plan') {
      candidates = segments.filter(segment => record.commands.some(command =>
        (!command.segmentId || command.segmentId === segment.segmentId)
        && segmentRangeMatches(command, segment)))
    } else {
      const rangeMatched = segments.filter(segment =>
        record.commands.some(command => segmentRangeMatches(command, segment)))
      // Undeclared partial writes must never satisfy a multi-segment plan.
      // Only a command spanning the whole plan may be credited as a fallback.
      candidates = rangeMatched.length === segments.length ? segments : []
    }
    if (record.segmentId) {
      const segment = segments.find(item => item.segmentId === record.segmentId)
      if (!segment) {
        invalidRecords.push({ reason: 'invalid_segment_id', segmentId: record.segmentId })
        continue
      }
      recordDeclaredSegments.add(segment.segmentId)
    }
    for (const segmentId of recordDeclaredSegments) {
      if (!segments.some(segment => segment.segmentId === segmentId)) {
        invalidRecords.push({ reason: 'invalid_segment_id', segmentId })
      }
    }
    if (candidates.length === 0) {
      invalidRecords.push({ reason: 'undeclared_segment' })
      continue
    }
    const rangeMatchedSegments = candidates.filter(segment => record.commands.some(command =>
      (!command.segmentId || command.segmentId === segment.segmentId)
      && segmentRangeMatches(command, segment)))
    const commandDeclaredSegments = recordDeclaredSegments
    const unmatchedDeclaredSegments = [...commandDeclaredSegments].filter(segmentId =>
      !rangeMatchedSegments.some(segment => segment.segmentId === segmentId))
    if (unmatchedDeclaredSegments.length > 0) {
      invalidRecords.push(...unmatchedDeclaredSegments.map(segmentId => ({
        reason: 'range_mismatch' as const,
        segmentId,
      })))
      continue
    }
    if (candidates.length > 0 && rangeMatchedSegments.length === 0) {
      invalidRecords.push({ reason: 'undeclared_segment' })
      continue
    }
    if (candidates.length === 0) {
      invalidRecords.push({ reason: 'undeclared_segment' })
      continue
    }
    // A command range may cross several planned segments. Credit each one,
    // but count the batch once so trustedWriteCount stays a write count.
    for (const segment of rangeMatchedSegments) covered.add(segment.segmentId)
    if (rangeMatchedSegments.length > 0) trustedWriteCount += 1
  }

  return {
    complete: segments.every(segment => covered.has(segment.segmentId)),
    trusted: trustedWriteCount === successfulWriteCount,
    successfulWriteCount,
    trustedWriteCount,
    coveredSegments: segments
      .filter(segment => covered.has(segment.segmentId))
      .map(segment => segment.segmentId),
    missingSegments: segments
      .filter(segment => !covered.has(segment.segmentId))
      .map(segment => segment.segmentId),
    ...(invalidRecords.length ? { invalidRecords } : {}),
  }
}
