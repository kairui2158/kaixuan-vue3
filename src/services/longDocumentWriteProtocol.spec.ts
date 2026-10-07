import { describe, expect, it } from 'vitest'
import { buildLongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import {
  buildLongDocumentWriteDirective,
  buildLongDocumentWriteRejectionMessage,
  describeLongDocumentWriteProtocol,
  resolveLongDocumentWriteOperations,
} from './longDocumentWriteProtocol'

describe('longDocumentWriteProtocol', () => {
  it('disables editor commands for final-draft plans', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '全文重写整篇大纲，统一编号',
      content: `# 第一卷\n\n${'雨'.repeat(12_000)}`,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
    })

    expect(plan.mode).toBe('final-draft')
    expect(resolveLongDocumentWriteOperations(plan)).toEqual([])
    expect(buildLongDocumentWriteDirective(plan)).toBe(
      '终稿生成模式：直接输出完整终稿正文，禁止提交编辑命令或调用写入工具；应用会在终稿完成后写入编辑器。',
    )
    expect(buildLongDocumentWriteRejectionMessage(plan)).toContain('终稿生成模式')
    expect(describeLongDocumentWriteProtocol(plan)).not.toContain('reorder_sections')
  })

  it('keeps targeted edits on the ordinary direct command protocol', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '修改第一卷里的一句话',
      content: '第一卷\n\n短内容',
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
    })

    expect(plan.mode).toBe('direct')
    expect(resolveLongDocumentWriteOperations(plan).length).toBeGreaterThan(0)
    expect(buildLongDocumentWriteDirective(plan)).toContain('受限编辑命令')
  })

  it('disables write operations and requires a prose answer for discussion plans', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '解释一下这段设定为什么要这样修改',
      content: `# 第一卷\n\n${'雨'.repeat(12_000)}`,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
      intent: 'discuss',
    })

    expect(plan.operation).toBe('discussion')
    expect(resolveLongDocumentWriteOperations(plan)).toEqual([])
    expect(buildLongDocumentWriteDirective(plan)).toContain('停止调用工具')
    expect(buildLongDocumentWriteDirective(plan)).toContain('直接基于已读内容回答')
    expect(buildLongDocumentWriteRejectionMessage(plan)).toContain('当前执行计划为讨论模式')
    expect(describeLongDocumentWriteProtocol(plan)).not.toContain('当前允许的写入操作：')
  })

  it('keeps compound cleanup staged and still forbids whole-document replacement', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '三处重复项删掉，再统一标题层级、编号和标点',
      content: `# 第一卷\n\n${'雨'.repeat(12_000)}\n\n# 第一卷\n\n${'雨'.repeat(12_000)}`,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
    })

    expect(plan.operation).toBe('deduplicate_and_normalize')
    expect(resolveLongDocumentWriteOperations(plan)).toEqual(['delete', 'replace_match', 'rewrite'])
    expect(buildLongDocumentWriteDirective(plan)).toContain('先只读确认重复项')
    expect(buildLongDocumentWriteDirective(plan)).toContain('禁止整篇 replace_document')
    expect(buildLongDocumentWriteDirective(plan)).toContain('必须覆盖全部计划段落')
    expect(buildLongDocumentWriteDirective(plan)).toContain('normalize-segment-')
    expect(buildLongDocumentWriteDirective(plan)).toContain('禁止输出“任务完成”总结')
    expect(buildLongDocumentWriteDirective(plan)).toContain('计划批次数量是')
    expect(buildLongDocumentWriteDirective(plan)).toContain('物理请求轮次为')
    expect(buildLongDocumentWriteDirective(plan)).toContain('禁止无依据地把标题层级改深或改浅')
    expect(buildLongDocumentWriteDirective(plan)).toContain('半角标点（, . ; : ! ?）必须统一为对应全角')
  })

  it('keeps compound restructure and cleanup executable instead of a dead-end plan', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档形式重构大纲，删除重复项，统一标题层级、编号和标点，调整错误段落的归位',
      content: `# 根标题\n\n## 第一卷\n\n${'雨'.repeat(12_000)}\n\n## 第二卷\n\n${'雨'.repeat(12_000)}`,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
      intent: 'edit',
    })

    expect(plan.operation).toBe('restructure_and_cleanup')
    expect(plan.segments[0]).toMatchObject({
      segmentId: 'structure-repair',
      writeStrategy: 'structure_repair',
      expectedChange: 'restructure',
    })
    expect(resolveLongDocumentWriteOperations(plan)).toEqual([
      'move',
      'insert',
      'delete',
      'replace_match',
      'rewrite',
    ])
    expect(buildLongDocumentWriteDirective(plan)).toContain('用 move 把误归位标题与段落移动到正确层级')
    expect(buildLongDocumentWriteDirective(plan)).toContain('用 insert 为无标题正文补标题')
    expect(buildLongDocumentWriteDirective(plan)).toContain('再只读确认重复项')
    expect(buildLongDocumentWriteDirective(plan)).toContain('禁止整篇 replace_document')
  })

  it('binds the same post-authorization rules to native tool guidance', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '重构整篇大纲并清理重复与格式',
      content: `# 根标题\n\n## 第一卷\n\n${'雨'.repeat(12_000)}\n\n## 第二卷\n\n${'雨'.repeat(12_000)}`,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
      intent: 'edit',
    })

    const directive = buildLongDocumentWriteDirective(plan)
    expect(directive).toContain('写入授权后禁止输出【修改预览】')
    expect(directive).toContain('禁止再次请求用户确认')
    expect(directive).toContain('必须调用 editor.write')
    expect(directive).toContain('必须停止调用工具并说明')
  })

  it('keeps the allowed operation set aligned with every planned write strategy', () => {
    const cases = [
      {
        name: 'multi-root restructure',
        requestText: '重新排序整篇大纲的卷顺序',
        content: '# 第一卷\n\n甲\n\n# 第二卷\n\n乙',
        intent: 'edit' as const,
      },
      {
        name: 'single-root structure repair',
        requestText: '按照Word文档的形式重构大纲，不要缩减内容',
        content: `# 根标题\n\n## 第一卷\n\n${'雨'.repeat(12_000)}`,
        intent: 'edit' as const,
      },
      {
        name: 'normalize',
        requestText: '全文统一标点、编号和标题层级',
        content: `# 第一卷\n\n${'雨'.repeat(12_000)}`,
        intent: 'edit' as const,
      },
      {
        name: 'deduplicate',
        requestText: '只删除大纲里的重复项',
        content: `# 第一卷\n\n${'雨'.repeat(12_000)}`,
        intent: 'edit' as const,
      },
      {
        name: 'compound restructure and cleanup',
        requestText: '按照Word文档形式重构大纲，删除重复项，统一标题层级、编号和标点',
        content: `# 根标题\n\n## 第一卷\n\n${'雨'.repeat(12_000)}`,
        intent: 'edit' as const,
      },
    ]
    const requiredOperationsByWriteStrategy: Record<string, readonly string[]> = {
      delete: ['delete'],
      structure_repair: ['move', 'insert'],
      reorder_sections: ['reorder_sections'],
      replace_match: ['replace_match'],
      rewrite: ['rewrite'],
    }

    for (const item of cases) {
      const plan = buildLongDocumentExecutionPlan({
        requestText: item.requestText,
        content: item.content,
        contextWindowTokens: 128_000,
        maxOutputTokens: 8_192,
        intent: item.intent,
      })
      const allowed = resolveLongDocumentWriteOperations(plan)

      expect(plan.mode, item.name).toBe('edit-task')
      expect(plan.segments.length, item.name).toBeGreaterThan(0)
      for (const segment of plan.segments) {
        const required = requiredOperationsByWriteStrategy[segment.writeStrategy]
        expect(required, `${item.name}: ${segment.writeStrategy}`).toBeDefined()
        for (const operation of required ?? []) {
          expect(allowed, `${item.name}: ${segment.segmentId} requires ${operation}`).toContain(operation)
        }
      }
    }
  })
})
