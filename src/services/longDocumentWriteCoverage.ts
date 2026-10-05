import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import type { ToolResult } from './editorTools'

export interface LongDocumentWriteCoverageCommand {
  operation: string
  segmentId?: string
  start: number
  end: number
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
  segment: LongDocumentExecutionPlan['segments'][number],
  start: number,
  end: number,
): boolean {
  const segmentStart = segment.range.startLine
  const segmentEnd = segment.range.endLine
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
    .map(item => readCoverageRecord(item.result.data))
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
  const trustedRecords: LongDocumentWriteCoverageRecord[] = []
  const invalidRecords: Array<Pick<LongDocumentWriteCoverageRecord, 'reason' | 'segmentId'>> = []
  for (const record of input.coverageRecords) {
    const segment = record.segmentId
      ? segments.find(item => item.segmentId === record.segmentId)
      : undefined
    if (record.segmentId && !segment) {
      invalidRecords.push({ reason: 'invalid_segment_id', segmentId: record.segmentId })
      continue
    }
    const targetSegment = segment
      || (segments.length === 1 && record.reason === 'single_segment_plan' ? segments[0] : undefined)
    if (!targetSegment) {
      invalidRecords.push({ reason: 'undeclared_segment' })
      continue
    }
    const rangeMatches = record.commands.some(command =>
      (!command.segmentId || command.segmentId === targetSegment.segmentId)
      && segmentRangeMatches(targetSegment, command.start, command.end))
    if (!rangeMatches) {
      invalidRecords.push({ reason: 'range_mismatch', segmentId: targetSegment.segmentId })
      continue
    }
    covered.add(targetSegment.segmentId)
    trustedRecords.push(record)
  }

  return {
    complete: segments.every(segment => covered.has(segment.segmentId)),
    trusted: trustedRecords.length === successfulWriteCount,
    successfulWriteCount,
    trustedWriteCount: trustedRecords.length,
    coveredSegments: segments
      .filter(segment => covered.has(segment.segmentId))
      .map(segment => segment.segmentId),
    missingSegments: segments
      .filter(segment => !covered.has(segment.segmentId))
      .map(segment => segment.segmentId),
    ...(invalidRecords.length ? { invalidRecords } : {}),
  }
}
