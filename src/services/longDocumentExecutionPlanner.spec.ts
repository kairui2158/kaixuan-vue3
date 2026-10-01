import { describe, expect, it } from 'vitest'
import {
  buildLongDocumentExecutionPlan,
  type LongDocumentExecutionPlannerInput,
  toLongDocumentOperationType,
} from './longDocumentExecutionPlanner'

function makeInput(overrides: Partial<LongDocumentExecutionPlannerInput> = {}): LongDocumentExecutionPlannerInput {
  return {
    requestText: '把整篇大纲重新整理排序，统一编号',
    content: '# 第一卷\n\n第一卷内容\n\n# 第二卷\n\n第二卷内容',
    contextWindowTokens: 128_000,
    maxOutputTokens: 8_192,
    ...overrides,
  }
}

describe('buildLongDocumentExecutionPlan', () => {
  it('classifies whole-document restructure as an atomic reorder operation', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      content: `# 第一卷\n\n${'雨'.repeat(12_000)}\n\n# 第二卷\n\n${'雨'.repeat(12_000)}`,
    }))

    expect(plan.operation).toBe('restructure')
    expect(plan.mode).toBe('final-draft')
    expect(plan.finalDraft).toBe(true)
    expect(plan.finalDraftPlan).toEqual({
      sourceChars: plan.totalChars,
      instruction: '把整篇大纲重新整理排序，统一编号',
      continuationEnabled: true,
      segmented: false,
      segments: [{ segmentId: 'segment-1', start: 0, end: plan.totalChars }],
    })
    expect(plan.segments).toEqual([])
    expect(plan.invariants).toEqual([])
  })

  it('keeps final-draft planning independent of document size', () => {
    const content = Array.from({ length: 240 }, (_, index) =>
      `# 第${index + 1}节\n\n${'雨'.repeat(1_000)}\n\n`).join('')

    const plan = buildLongDocumentExecutionPlan(makeInput({ content }))

    expect(plan.operation).toBe('restructure')
    expect(plan.mode).toBe('final-draft')
    expect(plan.segments).toEqual([])
    expect(plan.estimatedPhysicalRequests).toBe(1)
  })

  it('keeps a short targeted edit on the direct path while still producing a plan', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '修改第一卷里的一句话',
      content: '第一卷\n\n短内容',
    }))

    expect(plan.operation).toBe('targeted_edit')
    expect(plan.mode).toBe('direct')
    expect(plan.finalDraft).toBe(false)
    expect(plan.finalDraftPlan).toBeNull()
    expect(plan.segments[0].writeStrategy).toBe('replace_match')
    expect(plan.estimatedPhysicalRequests).toBe(1)
  })

  it('plans normalize work as final-draft generation instead of segment commands', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '整理整篇大纲的标点符号和格式',
      content: Array.from({ length: 12 }, (_, index) => `# 第${index + 1}卷\n\n${'雨'.repeat(2_000)}\n\n`).join(''),
      contextWindowTokens: 12_000,
    }))

    expect(plan.operation).toBe('normalize')
    expect(plan.mode).toBe('final-draft')
    expect(plan.finalDraft).toBe(true)
    expect(plan.segments).toEqual([])
    expect(plan.invariants).toEqual([])
  })

  it('plans duplicate removal as final-draft generation', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '删除大纲里重复的章节条目',
      content: `# 第一章\n\n${'重复内容'.repeat(2_000)}\n\n# 第一章\n\n${'重复内容'.repeat(2_000)}`,
    }))

    expect(plan.operation).toBe('deduplicate')
    expect(plan.mode).toBe('final-draft')
    expect(plan.finalDraft).toBe(true)
    expect(plan.segments).toEqual([])
  })

  it('keeps a whole-document rewrite on the final-draft path', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '全文重写为更精炼的大纲',
      content: Array.from({ length: 8 }, (_, index) => `# 第${index + 1}卷\n\n${'雨'.repeat(3_000)}\n\n`).join(''),
      contextWindowTokens: 12_000,
    }))

    expect(plan.operation).toBe('rewrite_segments')
    expect(plan.mode).toBe('final-draft')
    expect(plan.finalDraft).toBe(true)
    expect(plan.segments).toEqual([])
  })

  it('does not treat a missing window as an application cap and uses the unknown planning window', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      contextWindowTokens: null,
      maxOutputTokens: null,
      content: `${'雨'.repeat(100_000)}`,
    }))

    expect(plan.contextWindow.status).toBe('unknown')
    expect(plan.contextWindow.effectiveInputTokens).toBeGreaterThan(0)
    expect(plan.mode).toBe('final-draft')
  })

  it('segments a final draft when the document exceeds the effective window', () => {
    const content = Array.from({ length: 4 }, (_, index) => `# 第${index + 1}卷\n\n${'雨'.repeat(5_000)}\n\n`).join('')
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '整理整篇大纲的标点符号和格式',
      content,
      contextWindowTokens: 4_000,
      maxOutputTokens: 1_000,
    }))

    expect(plan.contextWindow.status).toBe('provider-declared')
    expect(plan.mode).toBe('final-draft')
    expect(plan.segments).toEqual([])
    expect(plan.finalDraftPlan?.segmented).toBe(true)
    expect((plan.finalDraftPlan?.segments.length ?? 0)).toBeGreaterThan(1)
    expect(plan.finalDraftPlan?.segments[0].start).toBe(0)
    expect(plan.finalDraftPlan?.segments.at(-1)?.end).toBe(plan.totalChars)
    for (let i = 1; i < plan.finalDraftPlan!.segments.length; i += 1) {
      expect(plan.finalDraftPlan!.segments[i].start).toBe(plan.finalDraftPlan!.segments[i - 1].end)
    }
    expect(plan.finalDraftPlan?.continuationEnabled).toBe(true)
  })

  it('uses line-based ranges for direct targeted-edit plans', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '修改第一卷里的一句话',
      content: '# 第一卷\n\n第一段\n\n# 第二卷\n\n第二段',
    }))

    expect(plan.mode).toBe('direct')
    expect(plan.segments[0].range.startLine).toBe(0)
    expect(plan.segments.at(-1)?.range.endLine).toBe(plan.totalChars)
    for (let i = 1; i < plan.segments.length; i += 1) {
      expect(plan.segments[i].range.startLine).toBe(plan.segments[i - 1].range.endLine)
    }
  })

  it('marks self-contradictory provider windows instead of planning on zero input', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      contextWindowTokens: 128_000,
      maxOutputTokens: 128_000,
      content: `${'雨'.repeat(74_841)}`,
    }))

    expect(plan.contextWindow.status).toBe('provider_configuration_conflict')
    expect(plan.contextWindow.effectiveInputTokens).toBeGreaterThan(0)
    expect(plan.decision).toBe('provider_configuration_conflict')
    expect(plan.mode).toBe('final-draft')
    expect(plan.segments).toEqual([])
  })

  it('keeps a conflict plan direct when the document fits the degraded planning window', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '修改第一卷里的一句话',
      contextWindowTokens: 128_000,
      maxOutputTokens: 128_000,
      content: '第一卷\n\n短内容',
    }))

    expect(plan.contextWindow.status).toBe('provider_configuration_conflict')
    expect(plan.decision).toBe('provider_configuration_conflict')
    expect(plan.mode).toBe('direct')
  })

  it('maps execution operations onto the legacy agent operation vocabulary', () => {
    expect(toLongDocumentOperationType('restructure')).toBe('whole-document-restructure')
    expect(toLongDocumentOperationType('rewrite_segments')).toBe('whole-document-replacement')
    expect(toLongDocumentOperationType('normalize')).toBe('large-scope-edit')
    expect(toLongDocumentOperationType('deduplicate')).toBe('large-scope-edit')
    expect(toLongDocumentOperationType('targeted_edit')).toBe('targeted-edit')
  })

  it('respects a session operation hint over single-sentence lexical fallback', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '继续执行刚才的任务',
      content: '段'.repeat(12_000),
      operationHint: 'whole-document-restructure',
    }))

    expect(plan.operation).toBe('restructure')
    expect(plan.mode).toBe('final-draft')
  })
})
