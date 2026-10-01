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
      requestText: '把整篇大纲重新整理排序，统一编号',
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
})
