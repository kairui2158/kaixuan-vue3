import { describe, expect, it } from 'vitest'
import {
  validateDocumentTransform,
  transformDocument,
  type DocumentTransformOperation,
} from './documentTransformService'

function makeDocument(sectionCount: number, bodyLength: number): string {
  return Array.from({ length: sectionCount }, (_, index) => {
    const heading = index === 0 ? '# 第1节 起点' : `# 第${index + 1}节 节点${index + 1}`
    return `${heading}\n\n${'雨'.repeat(bodyLength)},继续;\n`
  }).join('\n')
}

function run(
  content: string,
  operations: readonly DocumentTransformOperation[],
) {
  return transformDocument({ content, operations })
}

const CLEANUP_OPERATIONS: readonly DocumentTransformOperation[] = [
  'normalize_punctuation',
  'normalize_blank_lines',
  'normalize_numbering',
]

describe('transformDocument', () => {
  it('normalizes punctuation, blank lines, and numbering locally', () => {
    const content = '# 第3节  开端\n\n\n\n寒潮来了,堤岸沉默;\n\n# 第1节 结尾\n\n旧稿收束:回声未散'
    const result = run(content, CLEANUP_OPERATIONS)

    expect(result.outcome).toBe('completed')
    expect(result.content).toBe(
      '# 第1节 开端\n\n寒潮来了，堤岸沉默；\n\n# 第2节 结尾\n\n旧稿收束：回声未散',
    )
    expect(result.validation.ok).toBe(true)
    expect(result.changedLineCount).toBeGreaterThan(0)
  })

  it('reorders top-level numbered sections without touching bodies', () => {
    const content = [
      '# 第2节 二节',
      '二节正文',
      '',
      '# 第1节 一节',
      '一节正文',
      '',
    ].join('\n')
    const result = run(content, ['reorder_sections'])

    expect(result.outcome).toBe('completed')
    expect(result.content).toBe([
      '# 第1节 一节',
      '一节正文',
      '',
      '# 第2节 二节',
      '二节正文',
      '',
    ].join('\n'))
    expect(result.validation.checks.bodyMultisetUnchanged).toBe(true)
  })

  it('removes only fully identical duplicate sections', () => {
    const content = [
      '# 第1节 一节',
      '同一正文',
      '',
      '# 第1节 一节',
      '同一正文',
      '',
      '# 第2节 二节',
      '独有正文',
      '',
    ].join('\n')
    const result = run(content, ['remove_exact_duplicates'])

    expect(result.outcome).toBe('completed')
    expect(result.content).toBe([
      '# 第1节 一节',
      '同一正文',
      '',
      '# 第2节 二节',
      '独有正文',
      '',
    ].join('\n'))
    expect(result.validation.checks.duplicateRemovalOnly).toBe(true)
  })

  it('falls back to the model when duplicate bodies differ', () => {
    const content = [
      '# 第1节 一节',
      '第一份正文',
      '',
      '# 第1节 一节',
      '相似但不同的正文',
      '',
    ].join('\n')
    const result = run(content, ['remove_exact_duplicates'])

    expect(result.outcome).toBe('no_change')
    expect(result.content).toBe(content)
  })

  it('rejects deletion of a unique body even when the target is shorter', () => {
    const content = [
      '# 第1节 一节',
      '唯一正文',
      '',
      '# 第2节 二节',
      '另一段唯一正文',
      '',
    ].join('\n')
    const target = [
      '# 第1节 一节',
      '唯一正文',
      '',
      '# 第2节 二节',
      '唯一正文',
      '',
    ].join('\n')

    const validation = validateDocumentTransform({
      content,
      output: target,
      operations: ['remove_exact_duplicates'],
    })

    expect(validation.ok).toBe(false)
    expect(validation.checks.bodyMultisetUnchanged).toBe(false)
    expect(validation.checks.duplicateRemovalOnly).toBe(false)
    expect(validation.problems).toContain('正文集合发生计划外变化')
  })

  it('allows removing only surplus duplicates', () => {
    const content = [
      '# 第1节 一节',
      '同一正文',
      '',
      '# 第2节 一节',
      '同一正文',
      '',
      '# 第3节 独有',
      '独有正文',
      '',
    ].join('\n')
    const target = [
      '# 第1节 一节',
      '同一正文',
      '',
      '# 第3节 独有',
      '独有正文',
      '',
    ].join('\n')

    const validation = validateDocumentTransform({
      content,
      output: target,
      operations: ['remove_exact_duplicates'],
    })

    expect(validation.ok).toBe(true)
    expect(validation.checks.bodyMultisetUnchanged).toBe(true)
    expect(validation.checks.duplicateRemovalOnly).toBe(true)
  })

  it('falls back to the model when reordering would lose or alter a body', () => {
    const content = [
      '游离前置正文',
      '# 第2节 二节',
      '二节正文',
      '',
      '# 第1节 一节',
      '一节正文',
      '',
    ].join('\n')
    const result = run(content, ['reorder_sections'])

    expect(result.outcome).toBe('no_change')
    expect(result.content).toBe(content)
  })

  it('never silently truncates the document', () => {
    const content = `${'前置'.repeat(30)}\n${'# 第1节 标题'.repeat(10)}\n${'正文'.repeat(20)}`
    const result = run(content, CLEANUP_OPERATIONS)

    expect(result.content.length).toBe(content.length)
    expect(result.outcome).toBe('no_change')
  })

  it('rejects unsupported or empty operations', () => {
    const content = '# 第1节 标题\n\n正文'
    const unsupported = run(content, ['semantic_rewrite' as DocumentTransformOperation])
    const empty = run(content, [])

    expect(unsupported.outcome).toBe('needs_model')
    expect(unsupported.reason).toBe('unsupported_operation')
    expect(empty.outcome).toBe('needs_model')
    expect(empty.reason).toBe('empty_operations')
  })

  it('handles 1k and 7.6k documents under the local performance budget', () => {
    for (const [sections, bodyLength] of [[10, 100], [20, 372]]) {
      const content = makeDocument(sections, bodyLength)
      const started = performance.now()
      const result = run(content, CLEANUP_OPERATIONS)
      const elapsed = performance.now() - started

      expect(result.outcome).toBe('completed')
      expect(elapsed).toBeLessThan(1000)
      expect(result.validation.ok).toBe(true)
    }
  })

  it('handles 100k documents under the local performance budget', () => {
    const content = makeDocument(200, 495)
    const started = performance.now()
    const result = run(content, CLEANUP_OPERATIONS)
    const elapsed = performance.now() - started

    expect(result.outcome).toBe('completed')
    expect(elapsed).toBeLessThan(3000)
  })

  it('handles 1M-character documents under the local performance budget', () => {
    const content = makeDocument(2000, 495)
    expect(content.length).toBeGreaterThan(1_000_000)
    const started = performance.now()
    const result = run(content, CLEANUP_OPERATIONS)
    const elapsed = performance.now() - started

    expect(result.outcome).toBe('completed')
    expect(result.validation.ok).toBe(true)
    expect(elapsed).toBeLessThan(3000)
  })
})
