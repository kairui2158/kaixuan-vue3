import { describe, expect, it } from 'vitest'
import {
  buildLongDocumentExecutionPlan,
  type LongDocumentExecutionPlannerInput,
  toLongDocumentOperationType,
  usesLongDocumentToolRuntime,
} from './longDocumentExecutionPlanner'
import {
  buildLongDocumentWriteDirective,
  resolveLongDocumentWriteOperations,
} from './longDocumentWriteProtocol'

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
  it('routes deterministic format operations to local-transform', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '整理整篇文章，统一标点和空行',
      content: '# 第2节 二节\n\n二节正文,\n\n# 第1节 一节\n\n一节正文;',
    }))

    expect(plan.mode).toBe('local-transform')
    expect(plan.segments).toEqual([])
    expect(plan.estimatedPhysicalRequests).toBe(0)
    expect(plan.localTransformOperations).toEqual([
      'normalize_punctuation',
      'normalize_blank_lines',
    ])
  })

  it('keeps outline first-turn tidy wording on the deterministic compound path without intent', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '整理整篇文章：统一小节编号、清除多余空行、按编号重排，并保持所有正文内容不丢失。',
      content: [
        '# 第2节 二节',
        '二节正文,',
        '',
        '',
        '',
        '# 第1节 一节',
        '一节正文;',
        '',
      ].join('\n'),
    }))

    expect(plan.operation).toBe('restructure_and_cleanup')
    expect(plan.operationResolution).toEqual({
      source: 'lexical',
      matched: 'restructure_and_cleanup',
    })
    expect(plan.mode).toBe('local-transform')
    expect(plan.estimatedPhysicalRequests).toBe(0)
    expect(plan.localTransformOperations).toEqual([
      'reorder_sections',
      'normalize_blank_lines',
      'normalize_numbering',
    ])
  })

  it('keeps semantic restructuring requests on the model path', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '按剧情重要性重新梳理结构，重排章节顺序',
      content: '# 第2节 二节\n\n二节正文\n\n# 第1节 一节\n\n一节正文',
    }))

    expect(plan.operation).toBe('restructure')
    expect(plan.mode).not.toBe('local-transform')
    expect(plan.localTransformOperations).toBeNull()
  })

  it('keeps semantic normalize requests on the model path', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '整理标点，让语气和逻辑更通顺',
      content: '# 第1节 一节\n\n一节正文,',
    }))

    expect(plan.operation).toBe('normalize')
    expect(plan.mode).not.toBe('local-transform')
    expect(plan.localTransformOperations).toBeNull()
  })

  it('keeps semantic rewrite on the model path', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '全文重写，把故事改成悲剧结局',
      content: '# 第1节 标题\n\n正文',
    }))

    expect(plan.mode).toBe('final-draft')
    expect(plan.localTransformOperations).toBeNull()
  })
  it('plans whole-document restructure as an atomic EditTask reorder operation', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      content: `# 第一卷\n\n${'雨'.repeat(12_000)}\n\n# 第二卷\n\n${'雨'.repeat(12_000)}`,
      contextWindowTokens: 12_000,
      maxOutputTokens: 2_000,
    }))

    expect(plan.operation).toBe('restructure')
    expect(plan.mode).toBe('edit-task')
    expect(plan.finalDraft).toBe(false)
    expect(plan.finalDraftPlan).toBeNull()
    expect(plan.segments).toEqual([{
      segmentId: 'structure-reorder',
      range: { startLine: 0, endLine: plan.totalChars },
      readStrategy: 'outline-plus-slice',
      writeStrategy: 'reorder_sections',
      expectedChange: 'reorder',
      commandLimit: 1,
    }])
    expect(plan.invariants).toEqual(['leaf-body-multiset-unchanged'])
  })

  it('keeps EditTask restructure planning independent of document size', () => {
    const content = Array.from({ length: 240 }, (_, index) =>
      `# 第${index + 1}节\n\n${'雨'.repeat(1_000)}\n\n`).join('')

    const plan = buildLongDocumentExecutionPlan(makeInput({ content }))
    // The default window no longer forces EditTask when the full document
    // fits. Exercise the batched path through a small declared window.
    expect(plan.decision).not.toBe('fits')

    expect(plan.operation).toBe('restructure')
    expect(plan.mode).toBe('edit-task')
    expect(plan.segments).toHaveLength(1)
    expect(plan.segments[0].writeStrategy).toBe('reorder_sections')
    expect(plan.estimatedPhysicalRequests).toBe(24)
  })

  it('routes whole-document restructure to single-pass when a large window reports fits', () => {
    const content = Array.from({ length: 40 }, (_, index) =>
      `# 第${index + 1}节\n\n${'雨'.repeat(500)}\n\n`).join('')

    const plan = buildLongDocumentExecutionPlan(makeInput({
      content,
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 32_768,
    }))

    expect(plan.operation).toBe('restructure')
    expect(plan.decision).toBe('fits')
    expect(plan.mode).toBe('single-pass')
    expect(plan.segments).toEqual([])
    expect(plan.finalDraft).toBe(false)
    expect(plan.finalDraftPlan).toMatchObject({
      sourceChars: content.length,
      instruction: '把整篇大纲重新整理排序，统一编号',
      continuationEnabled: true,
      segmented: false,
      segments: [{ segmentId: 'whole-document', start: 0, end: content.length }],
    })
    expect(plan.progressLabel).toBe('结构重排：一次成型')
    expect(plan.progressLabel).not.toMatch(/\d+\/\d+/)
    expect(plan.estimatedPhysicalRequests).toBeLessThanOrEqual(4)
  })

  it('keeps whole-document restructure on EditTask when the full document does not fit', () => {
    const content = Array.from({ length: 40 }, (_, index) =>
      `# 第${index + 1}节\n\n${'雨'.repeat(5_000)}\n\n`).join('')

    const plan = buildLongDocumentExecutionPlan(makeInput({
      content,
      contextWindowTokens: 32_000,
      maxOutputTokens: 8_192,
    }))

    expect(plan.operation).toBe('restructure')
    expect(plan.decision).toBe('exceeds_provider')
    expect(plan.mode).toBe('edit-task')
    expect(plan.segments.length).toBeGreaterThan(0)
  })

  it('routes every whole-document cleanup operation to single-pass only when the full document fits', () => {
    const cases = [
      { requestText: '重新排序整篇大纲的卷顺序' },
      { requestText: '按照Word文档形式重构大纲，删除重复项，统一标题层级、编号和标点' },
      { requestText: '整理整篇大纲的标点符号和格式' },
      { requestText: '删除大纲里重复的章节条目' },
      { requestText: '先删除重复项，再统一标点和编号' },
    ]

    for (const item of cases) {
      const plan = buildLongDocumentExecutionPlan(makeInput({
        requestText: item.requestText,
        content: `# 根标题\n\n## 第一卷\n\n${'雨'.repeat(30_000)}`,
        contextWindowTokens: 1_000_000,
        maxOutputTokens: 32_768,
        intent: 'edit',
      }))

      expect(plan.mode, item.requestText).toBe('single-pass')
      expect(plan.segments, item.requestText).toEqual([])
      expect(plan.finalDraftPlan, item.requestText).toMatchObject({
        sourceChars: 30_000 + `# 根标题\n\n## 第一卷\n\n`.length,
        continuationEnabled: true,
        segmented: false,
      })
      expect(plan.decision, item.requestText).toBe('fits')
    }
  })

  it('keeps a large targeted edit on the long-document tool runtime even when the window fits', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '修改第 37 卷中的一句话',
      content: `# 根标题\n\n## 第37卷\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 32_768,
      intent: 'edit',
    }))

    expect(plan.operation).toBe('targeted_edit')
    expect(plan.decision).toBe('fits')
    expect(plan.mode).toBe('direct')
    expect(usesLongDocumentToolRuntime(plan)).toBe(true)
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
    expect(plan.estimatedPhysicalRequests).toBe(52)
  })

  it('plans normalize work as segmented EditTask commands instead of final-draft generation', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '整理整篇大纲的标点符号和格式',
      content: Array.from({ length: 12 }, (_, index) => `# 第${index + 1}卷\n\n${'雨'.repeat(2_000)}\n\n`).join(''),
      contextWindowTokens: 12_000,
    }))

    expect(plan.operation).toBe('normalize')
    expect(plan.mode).toBe('edit-task')
    expect(plan.finalDraft).toBe(false)
    expect(plan.finalDraftPlan).toBeNull()
    expect(plan.segments.length).toBeGreaterThan(1)
    expect(plan.invariants).toEqual(['normalize-changes-punctuation-whitespace-format-only'])
  })

  it('keeps pure blank-line and numbering cleanup on the normalize path', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '清除多余空行，统一小节编号，不要改变正文内容和章节顺序。',
      content: Array.from({ length: 12 }, (_, index) => `# 第${index + 1}卷\n\n${'雨'.repeat(2_000)}\n\n\n`).join(''),
      contextWindowTokens: 12_000,
    }))

    expect(plan.operation).toBe('normalize')
    expect(plan.mode).toBe('local-transform')
    expect(plan.localTransformOperations).toEqual(['normalize_blank_lines', 'normalize_numbering'])
    expect(plan.invariants).toEqual(['normalize-changes-punctuation-whitespace-format-only'])
  })

  it('plans duplicate removal as an EditTask deletion operation', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '删除大纲里重复的章节条目',
      content: `# 第一章\n\n${'重复内容'.repeat(2_000)}\n\n# 第一章\n\n${'重复内容'.repeat(2_000)}`,
      contextWindowTokens: 8_000,
      maxOutputTokens: 1_000,
    }))

    expect(plan.operation).toBe('deduplicate')
    expect(plan.mode).toBe('edit-task')
    expect(plan.finalDraft).toBe(false)
    expect(plan.finalDraftPlan).toBeNull()
    expect(plan.segments).toEqual([{
      segmentId: 'structure-plan',
      range: { startLine: 0, endLine: plan.totalChars },
      readStrategy: 'outline-plus-slice',
      writeStrategy: 'delete',
      expectedChange: 'remove_duplicate',
      commandLimit: 10,
    }])
    expect(plan.invariants).toEqual(['planned-deletion-only'])
    expect(plan.estimatedPhysicalRequests).toBe(24)
  })

  it('does not treat a normalize instruction that merely mentions duplicates as deletion work', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '整理整篇大纲的标点符号，未重复的游离段落保持不动',
      content: Array.from({ length: 12 }, (_, index) => `# 第${index + 1}卷\n\n${'雨'.repeat(2_000)}\n\n`).join(''),
      contextWindowTokens: 12_000,
    }))

    expect(plan.operation).toBe('normalize')
    expect(plan.mode).toBe('edit-task')
    expect(plan.segments[0].writeStrategy).toBe('replace_match')
    expect(plan.invariants).toEqual(['normalize-changes-punctuation-whitespace-format-only'])
  })

  it('plans compound duplicate cleanup and normalization as staged EditTask work', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '1，三处重复项，删 。 2，是在编辑器里统一标题层级、编号和标点',
      content: `# 第一卷\n\n${'雨'.repeat(12_000)}\n\n# 第一卷\n\n${'雨'.repeat(12_000)}`,
      contextWindowTokens: 8_000,
      maxOutputTokens: 1_000,
    }))

    expect(plan.operation).toBe('deduplicate_and_normalize')
    expect(plan.mode).toBe('edit-task')
    expect(plan.finalDraft).toBe(false)
    expect(plan.segments[0].writeStrategy).toBe('delete')
    expect(plan.segments.slice(1).every(segment => segment.writeStrategy === 'replace_match')).toBe(true)
    expect(plan.invariants).toEqual([
      'planned-deletion-only',
      'normalize-changes-punctuation-whitespace-format-only',
    ])
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
    expect(plan.invariants).toEqual(['authorized-rewrite'])
  })

  it('keeps an explicit whole-document final-draft delivery request on the final-draft path', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '请对当前编辑器全文进行整理排序，并统一格式。不要改写正文含义，输出完整终稿。',
      content: Array.from({ length: 8 }, (_, index) => `# 第${index + 1}卷\n\n${'雨'.repeat(3_000)}\n\n`).join(''),
      contextWindowTokens: 12_000,
      intent: 'edit',
    }))

    expect(plan.operation).toBe('rewrite_segments')
    expect(plan.mode).toBe('final-draft')
    expect(plan.finalDraft).toBe(true)
    expect(plan.segments).toEqual([])
    expect(plan.invariants).toEqual(['authorized-rewrite'])
  })

  it('does not treat a missing window as an application cap and uses the unknown planning window', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '全文重写为更精炼的大纲',
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
      requestText: '全文重写为更精炼的大纲',
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
      requestText: '全文重写为更精炼的大纲',
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

  it('keeps a routed edit intent writable for real customer restructure wording', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '按照Word文档的形式重构大纲，不要缩减内容',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
      contextWindowTokens: 32_000,
      maxOutputTokens: 4_000,
    }))

    expect(plan.operation).toBe('restructure_and_cleanup')
    expect(plan.mode).toBe('edit-task')
    expect(plan.operationResolution).toEqual({
      source: 'intent',
      intent: 'edit',
      matched: 'restructure_and_cleanup',
    })
    expect(plan.segments[0]).toMatchObject({
      segmentId: 'structure-repair',
      writeStrategy: 'structure_repair',
      expectedChange: 'restructure',
    })
  })

  it('keeps single-root restructure executable with structure repair commands', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '按照Word文档的形式重构大纲，不要缩减内容',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
      contextWindowTokens: 32_000,
      maxOutputTokens: 4_000,
    }))

    expect(resolveLongDocumentWriteOperations(plan)).toEqual([
      'move',
      'insert',
      'delete',
      'replace_match',
      'rewrite',
    ])
    expect(buildLongDocumentWriteDirective(plan)).toContain('复合重构请分三阶段执行')
    expect(plan.invariants).toEqual([
      'planned-deletion-only',
      'normalize-changes-punctuation-whitespace-format-only',
    ])
  })

  it('classifies explicit follow-up write instructions from the current sentence', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '把上一轮预览写入大纲',
      content: '段'.repeat(74_841),
      intent: 'edit',
    }))

    expect(plan.operation).toBe('targeted_edit')
    expect(plan.operationResolution).toEqual({
      source: 'intent',
      intent: 'edit',
      matched: 'targeted_edit',
    })
  })

  it('never degrades a routed edit intent to discussion', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '这一版结构帮我处理一下',
      content: '# 第一卷\n\n第一卷内容\n\n# 第二卷\n\n第二卷内容',
      intent: 'edit',
    }))

    expect(plan.operation).toBe('targeted_edit')
    expect(plan.operationResolution).toEqual({
      source: 'intent',
      intent: 'edit',
      matched: 'targeted_edit',
    })
    expect(plan.mode).toBe('direct')
    expect(resolveLongDocumentWriteOperations(plan)).toEqual([
      'insert',
      'replace_selection',
      'replace_match',
      'append',
      'delete',
      'move',
      'reorder_sections',
      'rewrite',
      'replace_document',
    ])
  })

  it('maps execution operations onto the legacy agent operation vocabulary', () => {
    expect(toLongDocumentOperationType('restructure')).toBe('whole-document-restructure')
    expect(toLongDocumentOperationType('rewrite_segments')).toBe('whole-document-replacement')
    expect(toLongDocumentOperationType('normalize')).toBe('large-scope-edit')
    expect(toLongDocumentOperationType('deduplicate')).toBe('large-scope-edit')
    expect(toLongDocumentOperationType('deduplicate_and_normalize')).toBe('large-scope-edit')
    expect(toLongDocumentOperationType('targeted_edit')).toBe('targeted-edit')
  })

  it('authorizes compound restructure, deduplication, and format cleanup as one staged plan', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '按照Word文档形式重构大纲，删除重复项，统一标题层级、编号和标点，调整错误段落的归位',
      content: '段'.repeat(74_841),
      intent: 'edit',
      contextWindowTokens: 32_000,
      maxOutputTokens: 4_000,
    }))

    expect(plan.operation).toBe('restructure_and_cleanup')
    expect(plan.mode).toBe('edit-task')
    expect(plan.invariants).toEqual([
      'planned-deletion-only',
      'normalize-changes-punctuation-whitespace-format-only',
    ])
    expect(plan.segments[0]).toMatchObject({
      segmentId: 'structure-repair',
      writeStrategy: 'structure_repair',
      expectedChange: 'restructure',
    })
    expect(plan.segments.some(segment => segment.segmentId === 'structure-plan')).toBe(true)
    expect(plan.segments.some(segment => segment.segmentId.startsWith('normalize-'))).toBe(true)
    expect(toLongDocumentOperationType(plan.operation)).toBe('whole-document-restructure')
  })

  it('keeps explicit restructure wording writable without a session hint', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '继续执行刚才的任务',
      content: '段'.repeat(12_000),
      intent: 'edit',
    }))

    expect(plan.operation).toBe('targeted_edit')
    expect(plan.operationResolution).toEqual({
      source: 'intent',
      intent: 'edit',
      matched: 'targeted_edit',
    })
    expect(plan.mode).toBe('direct')
  })

  it('classifies an end-of-document append request as targeted editing', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '请在文末追加 双入口对照：追加段。',
      content: '# 第一卷\n\n第一卷内容\n\n# 第二卷\n\n第二卷内容',
      intent: 'edit',
    }))

    expect(plan.operation).toBe('targeted_edit')
    expect(plan.operationResolution).toEqual({
      source: 'intent',
      intent: 'edit',
      matched: 'targeted_edit',
    })
    expect(plan.mode).toBe('direct')
  })

  it('classifies a casual append sentence as targeted editing', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '随便帮我在后面补一句 潮声压过礁石。',
      content: '# 第一卷\n\n第一卷内容\n\n# 第二卷\n\n第二卷内容',
      intent: 'edit',
    }))

    expect(plan.operation).toBe('targeted_edit')
    expect(plan.operationResolution).toEqual({
      source: 'intent',
      intent: 'edit',
      matched: 'targeted_edit',
    })
    expect(plan.mode).toBe('direct')
  })

  it('classifies casual deletion wording as targeted editing', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '刚才授权节点那一行我不要了 删掉',
      content: '# 第一卷\n\n第一卷内容\n\n第二轮明确授权后的新增卷纲节点。',
      intent: 'edit',
      activeTask: {
        taskId: 'active-normalize-task',
        operation: 'normalize',
        originalRequest: '全文统一标点符号',
      },
    }))

    expect(plan.operation).toBe('targeted_edit')
    expect(plan.operationResolution).toEqual({
      source: 'intent',
      intent: 'edit',
      matched: 'targeted_edit',
    })
    expect(plan.mode).toBe('direct')
    expect(resolveLongDocumentWriteOperations(plan)).toContain('delete')
  })

  it('replaces an awaiting-user plan when the next edit is a new request', () => {
    const originalPlan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
    }))

    const replacementPlan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '算了，只把第一卷标题改成风暴起点',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
      activeTask: {
        taskId: 'active-task-1',
        operation: originalPlan.operation,
        originalRequest: '把整篇大纲重新整理排序，统一标点和编号',
        status: 'awaiting_user_plan',
        plan: originalPlan,
      },
    }))

    expect(replacementPlan.planId).not.toBe(originalPlan.planId)
    expect(replacementPlan.operationResolution.source).not.toBe('active-plan-continuation')
  })

  it('classifies an explicit whole-document replacement request as final-draft work', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '请把整篇大纲一次性替换成新版本',
      content: Array.from({ length: 8 }, (_, index) => `# 第${index + 1}卷\n\n${'雨'.repeat(3_000)}\n\n`).join(''),
      intent: 'edit',
    }))

    expect(plan.operation).toBe('rewrite_segments')
    expect(plan.mode).toBe('final-draft')
    expect(plan.operationResolution).toEqual({
      source: 'intent',
      intent: 'edit',
      matched: 'rewrite_segments',
    })
  })

  it('starts a fresh targeted edit after a failed terminal task instead of extending it', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '继续执行刚才的任务，改成安全的新增内容',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(12_000)}`,
      intent: 'edit',
      activeTask: {
        taskId: 'terminal-task-1',
        operation: 'normalize',
        originalRequest: '全文统一标点符号',
        status: 'failed' as const,
      },
    }))

    expect(plan.operation).toBe('targeted_edit')
    expect(plan.operationResolution).toEqual({
      source: 'intent',
      intent: 'edit',
      matched: 'targeted_edit',
    })
    expect(plan.mode).toBe('direct')
    expect(plan.segments[0]).toMatchObject({
      writeStrategy: 'replace_match',
      expectedChange: 'rewrite',
    })
  })

  it('extends an active restructure task with a continuation that permits deduplication', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '符合我的要求，分叉一允许去重。不用出预览，直接写入',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
      activeTask: {
        taskId: 'active-task-1',
        operation: 'restructure',
        originalRequest: '按照Word文档的形式重构大纲，不要缩减内容',
      },
      contextWindowTokens: 32_000,
      maxOutputTokens: 4_000,
    }))

    expect(plan.operation).toBe('restructure_and_cleanup')
    expect(plan.operationResolution).toMatchObject({
      source: 'active-task-continuation',
      intent: 'edit',
      matched: 'restructure_and_cleanup',
    })
    expect(plan.mode).toBe('edit-task')
    expect(plan.invariants).toEqual([
      'planned-deletion-only',
      'normalize-changes-punctuation-whitespace-format-only',
    ])
  })

  it('classifies tidy requests with numbering, blank lines, and reordering as compound cleanup', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '整理整篇文章：统一小节编号、清除多余空行、按编号重排，并保持所有正文内容不丢失。',
      content: `# 根标题\n\n## 第1节\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
      contextWindowTokens: 32_000,
      maxOutputTokens: 4_000,
    }))

    expect(plan.operation).toBe('restructure_and_cleanup')
    expect(plan.operationResolution).toEqual({
      source: 'intent',
      intent: 'edit',
      matched: 'restructure_and_cleanup',
    })
    expect(plan.mode).toBe('edit-task')
    expect(plan.segments.some(segment => segment.writeStrategy === 'structure_repair' || segment.writeStrategy === 'reorder_sections')).toBe(true)
    expect(plan.segments.some(segment => segment.segmentId.startsWith('normalize-'))).toBe(true)
    expect(plan.invariants).toEqual([
      'planned-deletion-only',
      'normalize-changes-punctuation-whitespace-format-only',
    ])
  })

  it('carries requested cleanup items into compound local transformations', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '整理整篇文章：统一小节编号、清除多余空行、按编号重排，并保持所有正文内容不丢失。',
      content: [
        '# 第2节 二节',
        '二节正文,',
        '',
        '',
        '',
        '# 第1节 一节',
        '一节正文;',
        '',
      ].join('\n'),
      intent: 'edit',
    }))

    expect(plan.operation).toBe('restructure_and_cleanup')
    expect(plan.mode).toBe('local-transform')
    expect(plan.localTransformOperations).toEqual([
      'reorder_sections',
      'normalize_blank_lines',
      'normalize_numbering',
    ])
  })

  it('keeps an unambiguous narrowing request out of the active compound task', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '这一轮只去重，其他整理先不要做',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
      activeTask: {
        taskId: 'active-task-1',
        operation: 'restructure_and_cleanup',
        originalRequest: '按照Word文档的形式重构大纲，删除重复项并统一格式',
      },
      contextWindowTokens: 32_000,
      maxOutputTokens: 4_000,
    }))

    expect(plan.operation).toBe('deduplicate')
    expect(plan.operationResolution).toEqual({
      source: 'intent',
      intent: 'edit',
      matched: 'deduplicate',
    })
    expect(plan.mode).toBe('edit-task')
    expect(plan.invariants).toEqual(['planned-deletion-only'])
  })

  it('keeps a continuation answer from being treated as an unambiguous narrowing request', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '只去重，其他要求继续符合我的要求，直接写入',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
      activeTask: {
        taskId: 'active-task-1',
        operation: 'restructure_and_cleanup',
        originalRequest: '按照Word文档的形式重构大纲，删除重复项并统一格式',
      },
    }))

    expect(plan.operation).toBe('restructure_and_cleanup')
    expect(plan.operationResolution).toMatchObject({
      source: 'active-task-continuation',
      intent: 'edit',
    })
  })

  it('preserves the active task origin across a later generic continuation turn', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '继续完成剩下的整理，直接写入',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
      activeTask: {
        taskId: 'active-task-1',
        operation: 'restructure_and_cleanup',
        originalRequest: '按照Word文档格式重构整篇大纲，删除重复项并统一格式',
      },
    }))

    expect(plan.operation).toBe('restructure_and_cleanup')
    expect(plan.operationResolution).toMatchObject({
      source: 'active-task-continuation',
      intent: 'edit',
      matched: 'restructure_and_cleanup',
    })
  })

  it('reuses the stored plan when an awaiting-user plan is confirmed', () => {
    const originalPlan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
    }))

    const confirmedPlan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '开始执行',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
      activePlanConfirmation: true,
      activeTask: {
        taskId: 'active-task-1',
        operation: originalPlan.operation,
        originalRequest: '把整篇大纲重新整理排序，统一标点和编号',
        status: 'awaiting_user_plan',
        plan: originalPlan,
      },
    }))

    expect(confirmedPlan.planId).toBe(originalPlan.planId)
    expect(confirmedPlan.operation).toBe(originalPlan.operation)
    expect(confirmedPlan.mode).toBe(originalPlan.mode)
    expect(confirmedPlan.segments).toEqual(originalPlan.segments)
    expect(confirmedPlan.operationResolution.source).toBe('active-plan-continuation')
  })

  it('does not reuse an awaiting-user plan for a discussion turn', () => {
    const originalPlan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
    }))

    const discussionPlan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '这个方案要保留第二卷钩子，先解释一下利弊',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'discuss',
      activeTask: {
        taskId: 'active-task-1',
        operation: originalPlan.operation,
        originalRequest: '把整篇大纲重新整理排序，统一标点和编号',
        status: 'awaiting_user_plan',
        plan: originalPlan,
      },
    }))

    expect(discussionPlan.operation).toBe('discussion')
    expect(discussionPlan.mode).toBe('direct')
    expect(discussionPlan.operationResolution.source).not.toBe('active-plan-continuation')
  })

  it('reuses an active plan after an interrupted run when the user confirms it', () => {
    const originalPlan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
    }))

    const resumedPlan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '你按照方案写入',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      intent: 'edit',
      activePlanConfirmation: true,
      activeTask: {
        taskId: 'active-task-1',
        operation: originalPlan.operation,
        originalRequest: '把整篇大纲重新整理排序，统一标点和编号',
        status: 'active',
        plan: originalPlan,
      },
    }))

    expect(resumedPlan.planId).toBe(originalPlan.planId)
    expect(resumedPlan.invariants).toEqual(originalPlan.invariants)
    expect(resumedPlan.operationResolution.source).toBe('active-plan-continuation')
  })

  it('keeps routed discussion intent read-only even when the sentence mentions edit verbs', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '我想解释一下第一卷钩子为什么这样修改，你先帮我分析利弊',
      content: '段'.repeat(12_000),
      intent: 'discuss',
    }))

    expect(plan.operation).toBe('discussion')
    expect(plan.mode).toBe('direct')
    expect(plan.segments).toEqual([])
    expect(plan.invariants).toEqual([])
    expect(toLongDocumentOperationType(plan.operation)).toBe('discussion')
  })

  it('keeps analyze and auto intents on the discussion path', () => {
    for (const intent of ['analyze', 'auto'] as const) {
      const plan = buildLongDocumentExecutionPlan(makeInput({
        requestText: '继续按照刚才的方向处理',
        content: '段'.repeat(12_000),
        intent,
      }))

      expect(plan.operation).toBe('discussion')
      expect(plan.mode).toBe('direct')
      expect(plan.segments).toEqual([])
      expect(plan.invariants).toEqual([])
    }
  })

  it('defaults unknown long-document requests to discussion instead of targeted edit', () => {
    const plan = buildLongDocumentExecutionPlan(makeInput({
      requestText: '这一段设定后面还有呼应吗',
      content: '段'.repeat(12_000),
    }))

    expect(plan.operation).toBe('discussion')
    expect(plan.mode).toBe('direct')
    expect(plan.segments).toEqual([])
    expect(plan.invariants).toEqual([])
  })
})
