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
  it('collects the production editor.write coverage nested under data.coverage', () => {
    const singleSegmentPlan = buildLongDocumentExecutionPlan({
      requestText: '请把第一段中的旧句改成新句',
      content: '第一段：旧句。\n第二段：验证正文。',
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })
    const record = {
      coverageTrusted: true,
      reason: 'single_segment_plan' as const,
      segmentId: 'targeted-edit',
      commands: [{
        operation: 'replace_match',
        segmentId: 'targeted-edit',
        start: 0,
        end: 7,
      }],
    }
    const toolResults = [{
      call: { name: 'editor.write' },
      result: {
        ok: true,
        data: {
          status: 'written',
          batchId: 'batch-1',
          coverage: record,
        },
      },
    }]
    const summary = summarizeLongDocumentWriteCoverage({
      plan: singleSegmentPlan,
      coverageRecords: collectLongDocumentWriteCoverage(toolResults),
      toolResults,
    })

    expect(summary.successfulWriteCount).toBe(1)
    expect(summary.trustedWriteCount).toBe(1)
    expect(summary.complete).toBe(true)
    expect(summary.invalidRecords).toBeUndefined()
  })

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

  it('credits a structure-repair segment without crediting unexecuted segments', () => {
    const restructurePlan = buildLongDocumentExecutionPlan({
      requestText: '重排全文结构并清理重复内容',
      content: '# 第一卷\n\n## 第1节 出发\n她在灯塔下看旧信。\n\n## 第2节 渡口\n同一句重复内容。\n',
      contextWindowTokens: 12_000,
      maxOutputTokens: 2_048,
      intent: 'edit',
    })
    const record = {
      coverageTrusted: true,
      reason: 'declared_segment' as const,
      segmentId: 'structure-repair',
      commands: [{
        operation: 'rewrite',
        segmentId: 'structure-repair',
        start: 0,
        end: 20,
      }],
    }
    const summary = summarizeLongDocumentWriteCoverage({
      plan: restructurePlan,
      coverageRecords: [record],
      toolResults: [successfulWrite(record)],
    })

    expect(restructurePlan.segments.map(segment => segment.segmentId)).toContain('structure-repair')
    expect(summary.coveredSegments).toEqual(['structure-repair'])
    expect(summary.missingSegments).not.toContain('structure-repair')
    expect(summary.complete).toBe(false)
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

  it('credits a batch with command-level segment declarations across segments', () => {
    const records = [{
      coverageTrusted: true,
      reason: 'declared_segment' as const,
      commands: plan.segments.map(segment => ({
        operation: 'replace_match',
        segmentId: segment.segmentId,
        start: segment.range.startLine,
        end: segment.range.endLine,
      })),
    }]
    const summary = summarizeLongDocumentWriteCoverage({
      plan,
      coverageRecords: records,
      toolResults: records.map(record => successfulWrite(record)),
    })

    expect(summary.successfulWriteCount).toBe(1)
    expect(summary.trustedWriteCount).toBe(1)
    expect(summary.complete).toBe(true)
    expect(summary.coveredSegments).toEqual(plan.segments.map(segment => segment.segmentId))
    expect(summary.missingSegments).toEqual([])
    expect(summary.invalidRecords).toBeUndefined()
  })

  it('credits a single batch for commands that cover multiple planned segments', () => {
    const records = [{
      coverageTrusted: true,
      reason: 'declared_segment' as const,
      commands: plan.segments.map(segment => ({
        operation: 'replace_match',
        segmentId: segment.segmentId,
        start: segment.range.startLine + 1,
        end: segment.range.startLine + 20,
      })),
    }]
    const toolResults = records.map(record => successfulWrite(record))
    const summary = summarizeLongDocumentWriteCoverage({
      plan,
      coverageRecords: records,
      toolResults,
    })

    expect(summary.successfulWriteCount).toBe(1)
    expect(summary.trustedWriteCount).toBe(1)
    expect(summary.complete).toBe(true)
    expect(summary.coveredSegments).toEqual(plan.segments.map(segment => segment.segmentId))
    expect(summary.missingSegments).toEqual([])
    expect(summary.invalidRecords).toBeUndefined()
  })

  it('credits a whole-document command to every segment without inflating write count', () => {
    const first = plan.segments[0]
    const last = plan.segments[plan.segments.length - 1]
    const records = [{
      coverageTrusted: true,
      reason: 'undeclared_segment' as const,
      commands: [{
        operation: 'rewrite',
        start: first.range.startLine,
        end: last.range.endLine,
      }],
    }]
    const summary = summarizeLongDocumentWriteCoverage({
      plan,
      coverageRecords: records,
      toolResults: records.map(record => successfulWrite(record)),
    })

    expect(summary.successfulWriteCount).toBe(1)
    expect(summary.trustedWriteCount).toBe(1)
    expect(summary.complete).toBe(true)
    expect(summary.coveredSegments).toEqual(plan.segments.map(segment => segment.segmentId))
  })

  it('trusts application-inferred coverage for operation-matching multi-segment batches', () => {
    const records = plan.segments.map((segment, index) => {
      const command = segment.writeStrategy === 'delete'
        ? { operation: 'delete', segmentId: segment.segmentId, start: segment.range.startLine, end: segment.range.endLine }
        : { operation: 'replace_match', segmentId: segment.segmentId, start: segment.range.startLine, end: segment.range.endLine }
      return {
        coverageTrusted: true,
        reason: 'declared_segment' as const,
        segmentId: segment.segmentId,
        commands: [command],
      }
    })
    const toolResults = records.map(record => successfulWrite(record))
    const summary = summarizeLongDocumentWriteCoverage({
      plan,
      coverageRecords: records,
      toolResults,
    })

    expect(summary.successfulWriteCount).toBe(records.length)
    expect(summary.trustedWriteCount).toBe(records.length)
    expect(summary.complete).toBe(true)
    expect(summary.missingSegments).toEqual([])
    expect(summary.invalidRecords).toBeUndefined()
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

  it('backfills single-segment plan coverage for a command shorter than the whole document', () => {
    const singleSegmentPlan = buildLongDocumentExecutionPlan({
      requestText: '请把第一段中的旧句改成新句',
      content: '第一段：旧句。\n第二段：验证正文。',
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })
    const record = {
      coverageTrusted: true,
      reason: 'single_segment_plan' as const,
      commands: [{ operation: 'replace_match', start: 0, end: 7 }],
    }
    const summary = summarizeLongDocumentWriteCoverage({
      plan: singleSegmentPlan,
      coverageRecords: [record],
      toolResults: [successfulWrite(record)],
    })

    expect(singleSegmentPlan.mode).toBe('direct')
    expect(singleSegmentPlan.segments).toHaveLength(1)
    expect(record.commands[0].end).toBeLessThan(singleSegmentPlan.segments[0].range.endLine)
    expect(summary.complete).toBe(true)
    expect(summary.trustedWriteCount).toBe(1)
    expect(summary.invalidRecords).toBeUndefined()
  })
})
