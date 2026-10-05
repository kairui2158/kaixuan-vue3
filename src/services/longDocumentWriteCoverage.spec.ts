import { describe, expect, it } from 'vitest'
import { buildLongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import {
  collectLongDocumentWriteCoverage,
  summarizeLongDocumentWriteCoverage,
} from './longDocumentWriteCoverage'

const content = `# 根标题\n\n${Array.from({ length: 800 }, (_, index) =>
  `第${index + 1}节：长文档部分写入终态抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复退去。`).join('\n\n')}`

const plan = buildLongDocumentExecutionPlan({
  requestText: '请整理全文标点符号',
  content,
  contextWindowTokens: 12_000,
  maxOutputTokens: 2_048,
  intent: 'edit',
})

function successfulWrite(coverage: unknown, name = 'editor.write') {
  return {
    call: { name },
    result: { ok: true, data: coverage },
  }
}

describe('longDocumentWriteCoverage', () => {
  it('does not let eight successful calls cover a multi-segment plan', () => {
    const records = Array.from({ length: 8 }, () => ({
      coverageTrusted: true,
      reason: 'undeclared_segment' as const,
      commands: [{ operation: 'replace_match', start: 0, end: 10 }],
    }))
    const toolResults = records.map(record => successfulWrite(record))
    const summary = summarizeLongDocumentWriteCoverage({
      plan,
      coverageRecords: collectLongDocumentWriteCoverage(toolResults),
      toolResults,
    })

    expect(summary.successfulWriteCount).toBe(8)
    expect(summary.trustedWriteCount).toBe(0)
    expect(summary.complete).toBe(false)
    expect(summary.missingSegments).toHaveLength(plan.segments.length)
  })

  it('counts a declared segment when the real command range intersects it', () => {
    const segment = plan.segments[0]
    const summary = summarizeLongDocumentWriteCoverage({
      plan,
      coverageRecords: [{
        coverageTrusted: true,
        reason: 'declared_segment',
        segmentId: segment.segmentId,
        commands: [{ operation: 'replace_match', start: segment.range.startLine + 1, end: segment.range.startLine + 20 }],
      }],
      toolResults: [successfulWrite({
        coverageTrusted: true,
        reason: 'declared_segment',
        segmentId: segment.segmentId,
        commands: [{ operation: 'replace_match', start: segment.range.startLine + 1, end: segment.range.startLine + 20 }],
      })],
    })

    expect(summary.trustedWriteCount).toBe(1)
    expect(summary.coveredSegments).toEqual([segment.segmentId])
    expect(summary.complete).toBe(false)
  })

  it('rejects an invalid segment id', () => {
    const record = {
      coverageTrusted: true,
      reason: 'declared_segment' as const,
      segmentId: 'segment-invalid',
      commands: [{ operation: 'replace_match', start: 0, end: 10 }],
    }
    const summary = summarizeLongDocumentWriteCoverage({
      plan,
      coverageRecords: [record],
      toolResults: [successfulWrite(record)],
    })

    expect(summary.trustedWriteCount).toBe(0)
    expect(summary.invalidRecords).toEqual([{ reason: 'invalid_segment_id', segmentId: 'segment-invalid' }])
    expect(summary.complete).toBe(false)
  })

  it('allows a single-segment plan without model-declared segment id', () => {
    const singleSegmentPlan = buildLongDocumentExecutionPlan({
      requestText: '请把第一句中的错误标点修正',
      content: '第一句,标点错误。',
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })
    const record = {
      coverageTrusted: true,
      reason: 'single_segment_plan' as const,
      commands: [{ operation: 'replace_match', start: 0, end: 5 }],
    }
    const summary = summarizeLongDocumentWriteCoverage({
      plan: singleSegmentPlan,
      coverageRecords: [record],
      toolResults: [successfulWrite(record)],
    })

    expect(summary.complete).toBe(true)
    expect(summary.trustedWriteCount).toBe(1)
  })
})
